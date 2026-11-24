const jwt = require('jsonwebtoken');

let io;

// Sockets of signed-in users who may see stock counts. Only this room gets
// the counts an order moves (see emitStockChanged); everyone else gets a bare
// "reload" signal, or nothing.
const STOCK_ROOM = 'stock:counts';
// Signed-in users who may not see stock counts (viewers without that
// permission) — stock moving is nothing to them, so they get no event at all
const NO_STOCK_ROOM = 'stock:hidden';

// One room per signed-in account, so its sockets can be found again when the
// admin changes its permissions or deletes it. A customer is one of a shop's
// several logins (userId), as in the session_revoked event.
const accountRoom = (role, id) => `account:${role}:${id}`;

// Required lazily: the models are not needed until a socket connects, and
// controllers that require this file load before them
const stockRoomFor = async (user) => {
  if (!user) return null;
  const { visibleStockFields } = require('./utils/permissions');
  return (await visibleStockFields(user)).quantity ? STOCK_ROOM : NO_STOCK_ROOM;
};

// The account behind a handshake's token — { auth: { token } }, or ?token=
// for clients that cannot send auth — or null. A token that is missing,
// invalid, expired or whose account is gone is no error: the socket still
// connects, as a guest that gets only bare signals. Older app builds and the
// staff panels connect that way.
const userFromHandshake = async (handshake) => {
  const token = handshake.auth?.token || handshake.query?.token;
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { isAccountActive } = require('./middleware/roleAuth');
    return (await isAccountActive(decoded)) ? decoded : null;
  } catch {
    return null;
  }
};

module.exports = {
  STOCK_ROOM,
  NO_STOCK_ROOM,

  init: (server) => {
    const { Server } = require('socket.io');
    io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      },
    });

    // Work out who is connecting before the connection is accepted, so the
    // socket is in its rooms before the first event can reach it
    io.use(async (socket, next) => {
      try {
        const user = await userFromHandshake(socket.handshake);
        socket.data.user = user;
        socket.data.stockRoom = await stockRoomFor(user);
      } catch (error) {
        console.error('Socket auth error:', error);
        socket.data.user = null;
        socket.data.stockRoom = null;
      }
      next();
    });

    io.on('connection', (socket) => {
      const { user, stockRoom } = socket.data;
      if (user) socket.join(accountRoom(user.role, user.userId || user.id));
      if (stockRoom) socket.join(stockRoom);

      console.log('Client connected:', socket.id, user ? `(${user.role})` : '(guest)');

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error('Socket.IO not initialized');
    }
    return io;
  },

  // An order moved stock: the new counts go only to those who may see them.
  // Guests get the bare event and reload over the API, which returns only
  // what each user may see. `changes` is [{ id, quantity }]; without it every
  // socket that cares gets the bare event.
  emitStockChanged: (changes) => {
    if (!io) throw new Error('Socket.IO not initialized');
    if (!changes) {
      io.except(NO_STOCK_ROOM).emit('items_updated');
      return;
    }
    io.to(STOCK_ROOM).emit('items_updated', { changes });
    io.except([STOCK_ROOM, NO_STOCK_ROOM]).emit('items_updated');
  },

  // An account's permissions changed: move its open sockets to the stock
  // room it now belongs in
  refreshStockAccess: async (role, id) => {
    if (!io) return;
    const sockets = await io.in(accountRoom(role, id)).fetchSockets();
    if (!sockets.length) return;
    const room = await stockRoomFor(sockets[0].data.user);
    for (const socket of sockets) {
      socket.leave(STOCK_ROOM);
      socket.leave(NO_STOCK_ROOM);
      if (room) socket.join(room);
      socket.data.stockRoom = room;
    }
  },

  // The admin took an account away: tell its apps to sign out, then cut its
  // sockets off so nothing more reaches them
  revokeSession: (role, id) => {
    if (!io) throw new Error('Socket.IO not initialized');
    io.emit('session_revoked', { role, id: String(id) });
    io.in(accountRoom(role, String(id))).disconnectSockets(true);
  },
};
