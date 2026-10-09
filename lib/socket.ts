import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './storage';

const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL || 'http://10.0.2.2:4000';

type Handler = (...args: any[]) => void;

let socket: Socket | null = null;
// Listeners added with subscribe() survive a socket being replaced
const handlers = new Map<string, Set<Handler>>();
// Presence is replayed after every reconnect so the server always knows the driver is live
let online = false;
let lastFix: { lat: number; lng: number; heading?: number } | null = null;

export async function connectSocket(): Promise<Socket> {
  // Reuse a socket that is connected or still (re)connecting
  if (socket && (socket.connected || socket.active)) return socket;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  const s = io(SOCKET_URL, {
    transports: ['websocket'],
    // Read the token on every (re)connect so a refreshed token is used
    auth: (cb) => {
      getAccessToken()
        .then((token) => cb({ token }))
        .catch(() => cb({}));
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 15000,
  });
  socket = s;
  for (const [event, set] of handlers) for (const fn of set) s.on(event, fn);

  s.on('connect', () => {
    console.log('[socket] connected', s.id);
    if (online) s.emit('driver:online', lastFix || {});
  });
  s.on('connect_error', (e) => {
    console.log('[socket] error', e.message);
    // Refused by the server (e.g. expired token): try again shortly with a fresh one
    if (!s.active) {
      setTimeout(() => {
        if (socket === s) connectSocket().catch(() => {});
      }, 15000);
    }
  });
  s.on('disconnect', (r) => console.log('[socket] disconnected', r));

  return s;
}

export function getSocket(): Socket | null {
  return socket;
}

// Listen to a server event on the current and any future socket; returns an unsubscribe
export function subscribe(event: string, fn: Handler): () => void {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(fn);
  socket?.on(event, fn);
  return () => {
    set!.delete(fn);
    socket?.off(event, fn);
  };
}

export function disconnectSocket() {
  online = false;
  lastFix = null;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

// Driver helpers
export function emitDriverOnline(lat?: number, lng?: number, heading?: number) {
  online = true;
  if (lat && lng) lastFix = { lat, lng, heading };
  socket?.emit('driver:online', lastFix || {});
}
export function emitDriverOffline() {
  online = false;
  socket?.emit('driver:offline');
}
// Returns false when the socket is down, so the caller can send the fix over HTTPS
export function emitDriverLocation(payload: { lat: number; lng: number; heading?: number }): boolean {
  lastFix = payload;
  if (!socket?.connected) return false;
  socket.emit('driver:location', payload);
  return true;
}
