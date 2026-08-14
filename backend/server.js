const express = require('express');
const http = require('http');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
const socket = require('./socket');

require('dotenv').config();

app.use(cors());

const server = http.createServer(app);
socket.init(server);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));



app.use(express.json());

// Import routes
const adminAuthRoutes = require('./routes/adminAuth');
const salesmanRoutes = require('./routes/salesman');
const customerRoutes = require('./routes/customer');
const vendorRoutes = require('./routes/vendor');
const itemRoutes = require('./routes/item');
const cargoRoutes = require('./routes/cargo');
const orderRoutes = require('./routes/order');
const categoryRoutes = require('./routes/category');
const schemaRoutes = require('./routes/schema');
const rakRoutes = require('./routes/rak');
const rollerRoutes = require('./routes/roller');
const placementRoutes = require('./routes/placement');
const uploadRoutes = require('./routes/upload');
const Category = require('./models/Category');

// Use routes
app.use('/api/admin', adminAuthRoutes);
app.use('/api/salesman', salesmanRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/cargo', cargoRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/schemas', schemaRoutes);
app.use('/api/raks', rakRoutes);
app.use('/api/rollers', rollerRoutes);
app.use('/api/placements', placementRoutes);
app.use('/api/uploads', uploadRoutes);

async function seedCategories() {
  const defaults = ['0.8mm', '1mm', '3mm', '0.72mm'];
  for (const name of defaults) {
    await Category.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
  }
  console.log('Default categories seeded');
}

// Raks gained a `capacity` and placements gained a `quantity` after the first
// version shipped, where a rak simply held one item. Bring any rows created
// under the old rules up to the current shape.
async function migratePlacementCapacity() {
  const Rak = require('./models/Rak');
  const Placement = require('./models/Placement');

  // Drops the old unique-on-rak index that used to block a second item
  await Placement.syncIndexes();

  const raks = await Rak.updateMany(
    { capacity: { $exists: false } },
    { $set: { capacity: 1 } }
  );
  if (raks.modifiedCount) {
    console.warn(
      `Backfilled capacity=1 on ${raks.modifiedCount} rak(s) created before rak space existed — ` +
      'set their real space in Admin → Raks'
    );
  }

  const placements = await Placement.updateMany(
    { quantity: { $exists: false } },
    { $set: { quantity: 1 } }
  );
  if (placements.modifiedCount) {
    console.warn(`Backfilled quantity=1 on ${placements.modifiedCount} legacy placement(s)`);
  }
}

// Incentive points used to be allocated per item; they are now allocated per
// category. Rewrite any allocation still written the old way to the category
// its item belongs to — the highest rate wins when several items collapse into
// the same category.
async function migrateSchemaAllocations() {
  const Item = require('./models/Item');
  const schemas = mongoose.connection.collection('schemas');

  const legacy = await schemas.find({ 'pointsAllocations.item': { $exists: true } }).toArray();
  if (legacy.length === 0) return;

  const [items, categories] = await Promise.all([
    Item.find().select('category').lean(),
    Category.find().select('name').lean()
  ]);
  const categoryByItemId = new Map(items.map((i) => [String(i._id), i.category]));
  const categoryIdByName = new Map(categories.map((c) => [c.name, c._id]));

  let converted = 0;
  for (const schema of legacy) {
    const byCategoryId = new Map();
    for (const alloc of schema.pointsAllocations || []) {
      // Allocations already on the new shape are kept as they are
      const categoryId = alloc.category || categoryIdByName.get(categoryByItemId.get(String(alloc.item)));
      if (!categoryId) continue;
      const key = String(categoryId);
      const points = Number(alloc.points) || 0;
      if (!byCategoryId.has(key) || byCategoryId.get(key).points < points) {
        byCategoryId.set(key, {
          category: categoryId,
          categoryName: alloc.categoryName || categoryByItemId.get(String(alloc.item)) || '',
          points
        });
      }
    }

    await schemas.updateOne(
      { _id: schema._id },
      { $set: { pointsAllocations: [...byCategoryId.values()] } }
    );
    converted++;
  }

  console.warn(
    `Converted item-based incentive points to category-based on ${converted} schema(s). ` +
    'Items with no category were dropped — review them in Admin → Schema.'
  );
}

mongoose.connection.once('open', () => {
  seedCategories().catch(console.error);
  migratePlacementCapacity().catch(console.error);
  migrateSchemaAllocations().catch(console.error);
});

const port = process.env.PORT;

server.listen(port, () => {
    console.log(`Server is running on  http://localhost:${port}`);
    console.log('Socket.IO listening for connections');
});