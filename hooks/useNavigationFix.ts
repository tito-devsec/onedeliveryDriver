import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { getLastFix, onFix, type Fix } from '../lib/tracking';

// A position every second for the navigation screen (camera, vehicle, turn distances).
// Only the screen uses these; the location service keeps reporting to the server.
export function useNavigationFix(active = true): Fix | null {
  const [fix, setFix] = useState<Fix | null>(getLastFix());

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    const take = (f: Fix) => setFix((cur) => (!cur || f.timestamp >= cur.timestamp ? f : cur));

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
      if (status !== 'granted' || cancelled) return;
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const { latitude, longitude, heading, speed } = loc.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          take({
            latitude,
            longitude,
            heading: heading != null && heading >= 0 ? heading : -1,
            speed: speed ?? null,
            timestamp: loc.timestamp,
          });
        }
      ).catch(() => null);
      if (cancelled) s?.remove();
      else sub = s;
    })();
    const off = onFix(take); // the service's fixes too, until the watch starts

    return () => {
      cancelled = true;
      sub?.remove();
      off();
    };
  }, [active]);

  return fix;
}
