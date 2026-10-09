import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { getLastFix, onFix, refreshFix } from '../lib/tracking';
import type { LatLng } from '../types';

// Live position for the screens. The fixes themselves come from the background
// location task in lib/tracking.ts, which also sends them to the server.
export function useDriverLocation() {
  const first = getLastFix();
  const [location, setLocation] = useState<LatLng | null>(
    first ? { latitude: first.latitude, longitude: first.longitude } : null
  );
  const [heading, setHeading] = useState(first?.heading ?? 0);
  const [speed, setSpeed] = useState<number | null>(first?.speed ?? null);

  useEffect(
    () =>
      onFix((f) => {
        setLocation({ latitude: f.latitude, longitude: f.longitude });
        setHeading(f.heading);
        setSpeed(f.speed);
      }),
    []
  );

  // Ask once for permission so the map can show where the driver is
  useEffect(() => {
    if (getLastFix()) return;
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => (status === 'granted' ? refreshFix(false) : null))
      .catch(() => {});
  }, []);

  const getCurrent = useCallback(async (): Promise<LatLng | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const f = await refreshFix(false);
    return f ? { latitude: f.latitude, longitude: f.longitude } : null;
  }, []);

  return { location, heading, speed, getCurrent };
}
