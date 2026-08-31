const mongoose = require('mongoose');
const { BSON } = require('mongodb');
const { EJSON } = BSON;
const { getIO } = require('../socket');

// Stamped into every file we write and checked before every restore, so a file
// from somewhere else cannot be poured into this database by accident.
const FORMAT = 'srf-backup-v1';

// Documents are inserted in chunks rather than one giant insertMany, to keep a
// restore of a large collection from building an oversized write batch.
const INSERT_CHUNK = 1000;

// Collections Mongo keeps for itself. Never backed up, never touched.
const isSystemCollection = (name) => name.startsWith('system.');

// insertMany throws on a duplicate key even with ordered:false — the documents
// that did not collide are written anyway, and insertedCount says how many.
//
// A restore is allowed to hit duplicates. A document can be gone by _id and yet
// back under a new one: delete a placement and put the same item in the same rak
// again and the unique {item, rak} index rejects the old row. Those are counted
// and stepped over, because losing the rest of the restore over one row the
// admin already has is far worse than skipping it. Anything that is not a
// duplicate is still a real failure and is rethrown.
const insertTolerant = async (collection, docs) => {
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
    const chunk = docs.slice(i, i + INSERT_CHUNK);

    try {
      const result = await collection.insertMany(chunk, { ordered: false });
      inserted += result.insertedCount;
    } catch (error) {
      const writeErrors = [].concat(error?.writeErrors || []);
      const allDuplicates = writeErrors.length > 0 &&
        writeErrors.every((e) => (e.err?.code ?? e.code) === 11000);

      if (!allDuplicates) throw error;

      inserted += error.result?.insertedCount || 0;
      skipped += writeErrors.length;
    }
  }

  return { inserted, skipped };
};

const getDb = () => {
  if (mongoose.connection.readyState !== 1) return null;
  return mongoose.connection.db;
};

const notConnected = (res) =>
  res.status(503).json({
    success: false,
    message: 'Database is not connected. Try again once the server reconnects.'
  });

// Every collection that actually holds data, in a stable order so two backups
// of the same database are diffable.
const listCollectionNames = async (db) => {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  return collections
    .map((c) => c.name)
    .filter((name) => !isSystemCollection(name))
    .sort();
};

// Storage size is a nice-to-have on the overview screen — a cluster that does
// not allow $collStats should not fail the whole request.
const collectionSize = async (db, name) => {
  try {
    const [stats] = await db
      .collection(name)
      .aggregate([{ $collStats: { storageStats: {} } }])
      .toArray();
    return stats?.storageStats?.size ?? null;
  } catch {
    return null;
  }
};

const collectionIndexes = async (db, name) => {
  try {
    return await db.collection(name).indexes();
  } catch {
    return [];
  }
};

// What the database holds right now — drives the overview panel and lets the
// admin sanity-check a restore report against the numbers they started with.
exports.getStats = async (req, res) => {
  try {
    const db = getDb();
    if (!db) return notConnected(res);

    const names = await listCollectionNames(db);

    const collections = await Promise.all(
      names.map(async (name) => ({
        name,
        count: await db.collection(name).countDocuments(),
        size: await collectionSize(db, name)
      }))
    );

    res.status(200).json({
      success: true,
      data: {
        database: db.databaseName,
        collections,
        totalCollections: collections.length,
        totalDocuments: collections.reduce((sum, c) => sum + c.count, 0),
        totalSize: collections.every((c) => c.size === null)
          ? null
          : collections.reduce((sum, c) => sum + (c.size || 0), 0)
      }
    });

  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Streams the whole database out as one Canonical Extended JSON file.
//
// It is streamed a document at a time rather than assembled in memory, so the
// size of the database does not decide whether the server survives the backup.
// The document counts are written at the *end*, once every document has really
// gone out, which is what makes them worth checking on the way back in.
exports.downloadBackup = async (req, res) => {
  const db = getDb();
  if (!db) return notConnected(res);

  const takenAt = new Date();
  const filename = `srf-backup-${takenAt.toISOString().replace(/[:.]/g, '-')}.json`;

  // The client goes away mid-download (cancelled, tab closed) — stop reading
  let aborted = false;
  res.on('close', () => { aborted = true; });

  // res.write() returns false once the socket buffer is full; waiting for the
  // drain is what keeps a big collection from piling up in memory. A socket
  // that dies while we are waiting never drains, so close and error have to
  // settle the promise too — otherwise the backup hangs holding an open cursor.
  const write = (chunk) => new Promise((resolve, reject) => {
    if (res.write(chunk)) return resolve();

    const settle = (error) => {
      res.off('drain', onDrain);
      res.off('close', onClose);
      res.off('error', onError);
      error ? reject(error) : resolve();
    };
    const onDrain = () => settle();
    const onClose = () => settle(new Error('Download cancelled by the client'));
    const onError = (error) => settle(error);

    res.once('drain', onDrain);
    res.once('close', onClose);
    res.once('error', onError);
  });

  try {
    const names = await listCollectionNames(db);

    const indexes = {};
    for (const name of names) indexes[name] = await collectionIndexes(db, name);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Backup-Filename', filename);
    res.setHeader('Access-Control-Expose-Headers', 'X-Backup-Filename');

    const meta = {
      format: FORMAT,
      database: db.databaseName,
      takenAt: takenAt.toISOString(),
      // Recorded for reference only: a restore refills collections rather than
      // dropping them, so the indexes on the server are left alone.
      indexes
    };

    await write(`{"meta":${JSON.stringify(meta)},"collections":{`);

    const counts = {};
    let firstCollection = true;

    for (const name of names) {
      if (aborted) throw new Error('Download cancelled by the client');

      await write(`${firstCollection ? '' : ','}${JSON.stringify(name)}:[`);
      firstCollection = false;

      const cursor = db.collection(name).find({});
      let written = 0;

      try {
        for await (const doc of cursor) {
          if (aborted) throw new Error('Download cancelled by the client');
          await write(`${written ? ',' : ''}${EJSON.stringify(doc, { relaxed: false })}`);
          written++;
        }
      } finally {
        await cursor.close().catch(() => {});
      }

      await write(']');
      counts[name] = written;
    }

    await write(`},"counts":${JSON.stringify(counts)}}`);
    res.end();

  } catch (error) {
    if (!aborted) console.error('Database backup error:', error);

    // Headers are already out and part of the body with them, so there is no
    // way to answer with a clean error. Killing the connection is deliberate:
    // it makes the browser fail the download instead of saving a half file.
    if (res.headersSent) return res.destroy();

    res.status(500).json({
      success: false,
      message: 'Could not build the backup. Check the server logs.'
    });
  }
};

// Reads a backup file back in.
//
//   replace  every collection in the file is emptied and refilled — an exact
//            rewind to the moment the backup was taken
//   merge    only documents whose _id is missing are inserted — puts back what
//            was deleted without touching anything added since
exports.restoreBackup = async (req, res) => {
  // Collections are rewritten one at a time, so a failure half-way leaves the
  // database part-old and part-new. The report is built outside the try so the
  // error response can still say exactly how far the restore got.
  const report = [];

  try {
    const db = getDb();
    if (!db) return notConnected(res);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No backup file was uploaded'
      });
    }

    const mode = req.body.mode === 'merge' ? 'merge' : 'replace';

    let backup;
    try {
      backup = EJSON.parse(req.file.buffer.toString('utf8'), { relaxed: false });
    } catch {
      // A truncated download lands here: the JSON simply does not close
      return res.status(400).json({
        success: false,
        message: 'This file is not readable as JSON. It may be truncated or corrupted — try downloading the backup again.'
      });
    }

    if (backup?.meta?.format !== FORMAT) {
      return res.status(400).json({
        success: false,
        message: 'This is not an SRF backup file.'
      });
    }

    const collections = backup.collections;
    if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
      return res.status(400).json({
        success: false,
        message: 'This backup has no collections in it.'
      });
    }

    const names = Object.keys(collections).filter((name) => !isSystemCollection(name));
    if (!names.length) {
      return res.status(400).json({
        success: false,
        message: 'This backup has no collections in it.'
      });
    }

    // The counts were written after the last document went out, so a file that
    // disagrees with them lost something on the way here. Refuse it rather than
    // restore a database that is quietly missing rows.
    const counts = backup.counts;
    if (!counts || typeof counts !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'This backup is incomplete — it has no document counts, which means it was cut off before it finished writing.'
      });
    }

    for (const name of names) {
      const docs = collections[name];
      if (!Array.isArray(docs)) {
        return res.status(400).json({
          success: false,
          message: `Collection "${name}" in this backup is malformed.`
        });
      }
      const expected = Number(counts[name]);
      if (!Number.isFinite(expected) || expected !== docs.length) {
        return res.status(400).json({
          success: false,
          message: `This backup is incomplete — "${name}" holds ${docs.length} document(s) but should hold ${counts[name]}. Download the backup again.`
        });
      }
    }

    for (const name of names) {
      const docs = collections[name];
      const collection = db.collection(name);
      const before = await collection.countDocuments();

      let toInsert = docs;

      if (mode === 'replace') {
        await collection.deleteMany({});
      } else {
        // Only what is genuinely gone. Anything added since the backup stays.
        const ids = docs.map((doc) => doc._id).filter((id) => id !== undefined);
        const present = new Set(
          (await collection.find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray())
            .map((doc) => String(doc._id))
        );
        toInsert = docs.filter((doc) => !present.has(String(doc._id)));
      }

      const { inserted, skipped } = await insertTolerant(collection, toInsert);

      report.push({
        name,
        before,
        inserted,
        skipped,
        after: await collection.countDocuments()
      });
    }

    // Every open admin and roller screen is now showing stale data
    const io = getIO();
    ['orders_updated', 'items_updated', 'customers_updated', 'vendors_updated',
      'cargo_updated', 'raks_updated', 'placements_updated']
      .forEach((event) => io.emit(event));

    const skipped = report.reduce((sum, row) => sum + row.skipped, 0);
    const done = mode === 'replace'
      ? 'Database restored from the backup.'
      : 'Missing documents restored from the backup.';

    res.status(200).json({
      success: true,
      message: skipped
        ? `${done} ${skipped} document(s) were skipped — the same record already exists under a different ID.`
        : done,
      data: {
        mode,
        takenAt: backup.meta.takenAt,
        sourceDatabase: backup.meta.database,
        collections: report
      }
    });

  } catch (error) {
    console.error('Database restore error:', error);

    // Anything already in the report was rewritten before the failure, so say
    // so rather than leaving the admin guessing which half of the database is
    // which. Re-running the same file finishes the job.
    res.status(500).json({
      success: false,
      message: report.length
        ? `The restore failed after ${report.length} collection(s). ${report.map((r) => r.name).join(', ')} were rewritten; the rest were not. Run the same file again to finish. (${error.message})`
        : `The restore failed before anything was changed. (${error.message})`,
      data: { completed: report }
    });
  }
};
