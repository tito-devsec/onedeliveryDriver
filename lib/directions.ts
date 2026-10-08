import { Linking, Platform } from 'react-native';
import type { LatLng } from '../types';

const DIRECTIONS_KEY = process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_KEY || '';

export interface RouteResult {
  coordinates: LatLng[];
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
}

// Decode a Google encoded polyline into [{latitude, longitude}]
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export async function fetchRoute(
  origin: LatLng,
  destination: LatLng,
  mode: 'driving' | 'two_wheeler' = 'driving'
): Promise<RouteResult | null> {
  if (!DIRECTIONS_KEY || DIRECTIONS_KEY.startsWith('YOUR_')) {
    // Fallback: straight line if no key configured
    return {
      coordinates: [origin, destination],
      distanceText: '',
      durationText: '',
      distanceMeters: 0,
      durationSeconds: 0,
    };
  }
  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving&key=${DIRECTIONS_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.routes?.length) {
      return { coordinates: [origin, destination], distanceText: '', durationText: '', distanceMeters: 0, durationSeconds: 0 };
    }
    const route = json.routes[0];
    const leg = route.legs[0];
    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      distanceText: leg.distance?.text || '',
      durationText: leg.duration?.text || '',
      distanceMeters: leg.distance?.value || 0,
      durationSeconds: leg.duration?.value || 0,
    };
  } catch {
    return { coordinates: [origin, destination], distanceText: '', durationText: '', distanceMeters: 0, durationSeconds: 0 };
  }
}

// Open native turn-by-turn navigation in Google / Apple Maps
export function openExternalNavigation(dest: LatLng, label?: string) {
  const latlng = `${dest.latitude},${dest.longitude}`;
  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${latlng}&dirflg=d`
      : `google.navigation:q=${latlng}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latlng}`)
  );
}
