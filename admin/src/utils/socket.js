import { io } from 'socket.io-client';

// The REST base ends in /api; Socket.IO is served from the same origin's root
const SOCKET_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api')
  .replace(/\/api\/?$/, '');

let socket;

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000
    });
  }
  return socket;
};

export default getSocket;
