import { useEffect, useRef, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { put } from '../lib/api';
import { emitDriverLocation } from '../lib/socket';
import type { LatLng } from '../types';

interface Options {
  enabled: boolean; // only track when online
  rideId?: string; // attach to socket payload for live customer tracking
}

export function useDriverLocation({ enabled, rideId }: Options) {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState(0);
  const [permission, setPermission] = useState<boolean | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastPushRef = useRef(0);

  const requestPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';
    setPermission(granted);
    if (granted) {
      // Best-effort background permission (Android)
      Location.requestBackgroundPermissionsAsync().catch(() => {});
    }
    return granted;
  }, []);

  const getCurrent = useCallback(async (): Promise<LatLng | null> => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setLocation(coords);
      return coords;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) {
        watchRef.current?.remove();
        watchRef.current = null;
        return;
      }
      const granted = permission ?? (await requestPermission());
      if (!granted || cancelled) return;

      await getCurrent();

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 15,
        },
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const hd = pos.coords.heading ?? 0;
          setLocation({ latitude: lat, longitude: lng });
          if (hd >= 0) setHeading(hd);

          // Emit live to socket immediately (cheap)
          emitDriverLocation({ lat, lng, heading: hd, rideId });

          // Throttle DB write to ~ every 8s
          const now = Date.now();
          if (now - lastPushRef.current > 8000) {
            lastPushRef.current = now;
            put('/rides/driver/location', { lat, lng, heading: hd }).catch(
              () => {}
            );
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [enabled, rideId, permission, requestPermission, getCurrent]);

  return { location, heading, permission, requestPermission, getCurrent };
}
