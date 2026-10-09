/**
 * Driver location while online or on a delivery.
 *
 * A location foreground service (the Android notification "One Delivery Driver is
 * online") keeps GPS fixes coming while the driver navigates in Google Maps or the
 * screen is off, so the nearest-driver search and the customer's live map stay right.
 * The driver starts it from the app, so the normal "while using the app" location
 * permission is enough — no background-location permission is requested.
 *
 * Every fix goes to the server over the socket; over HTTPS at least every 30 s as a
 * heartbeat (every 10 s when the socket is down, e.g. in the background).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { put } from './api';
import { emitDriverLocation } from './socket';

export const LOCATION_TASK = 'onedelivery-driver-location';

const HEARTBEAT_MS = 30_000;
const NO_SOCKET_MS = 10_000;

export interface Fix {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number | null;
  timestamp: number;
}

let lastFix: Fix | null = null;
let lastHttp = 0;
const listeners = new Set<(f: Fix) => void>();

function handle(loc: Location.LocationObject, send: boolean) {
  const { latitude, longitude, heading, speed } = loc.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (lastFix && loc.timestamp < lastFix.timestamp) return; // out-of-order batch
  const fix: Fix = {
    latitude,
    longitude,
    // Heading is -1/null when standing still; keep the last direction then
    heading: heading != null && heading >= 0 ? heading : lastFix?.heading ?? 0,
    speed: speed ?? null,
    timestamp: loc.timestamp,
  };
  lastFix = fix;
  listeners.forEach((fn) => {
    try { fn(fix); } catch { /* a screen's listener must not stop tracking */ }
  });
  if (!send) return;

  const viaSocket = emitDriverLocation({ lat: latitude, lng: longitude, heading: fix.heading });
  const now = Date.now();
  if (now - lastHttp >= (viaSocket ? HEARTBEAT_MS : NO_SOCKET_MS)) {
    lastHttp = now;
    put('/rides/driver/location', { lat: latitude, lng: longitude, heading: fix.heading }).catch(() => {});
  }
}

// Must be defined when the JS bundle loads (imported from app/_layout.tsx)
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (locations?.length) handle(locations[locations.length - 1], true);
});

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

// Start sharing location (call while the app is on screen, e.g. when going live)
export async function startTracking(): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Allow location access so you can receive nearby deliveries and customers can follow you.');
  }
  if (await isTracking()) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 0, // a fix every 5 s even when parked: the server's freshness heartbeat
    deferredUpdatesInterval: 5000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'One Delivery Driver is online',
      notificationBody: 'Sharing your location for nearby deliveries and live tracking.',
      notificationColor: '#F97316',
      killServiceOnDestroy: true,
    },
  });
}

export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
}

// One-off position (also sent to the server when `send` is true)
export async function refreshFix(send = false): Promise<Fix | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    handle(loc, send);
    return lastFix;
  } catch {
    return lastFix;
  }
}

export function getLastFix(): Fix | null {
  return lastFix;
}

export function onFix(fn: (f: Fix) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
