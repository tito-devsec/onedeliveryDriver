import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './storage';

const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL || 'http://10.0.2.2:4000';

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  const token = await getAccessToken();

  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 15000,
  });

  socket.on('connect', () => console.log('[socket] connected', socket?.id));
  socket.on('connect_error', (e) => console.log('[socket] error', e.message));
  socket.on('disconnect', (r) => console.log('[socket] disconnected', r));

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

// Driver helpers
export function emitDriverOnline(lat: number, lng: number) {
  socket?.emit('driver:online', { lat, lng });
}
export function emitDriverOffline() {
  socket?.emit('driver:offline');
}
export function emitDriverLocation(payload: {
  lat: number;
  lng: number;
  heading?: number;
  rideId?: string;
}) {
  socket?.emit('driver:location', payload);
}
