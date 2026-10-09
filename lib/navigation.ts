/**
 * Turn-by-turn guidance on the phone, from the leg route the server sends (polyline +
 * Google's steps): where the driver is along the route, the next manoeuvre and how far
 * away it is, the part of the route still ahead, and what to say out loud.
 */
import { distanceMeters } from './directions';
import type { LatLng, RouteStep } from '../types';

export interface RouteTrack {
  points: LatLng[];
  cum: number[]; // metres from the start of the route to each point
  total: number;
}

export interface Snap {
  along: number; // metres from the start of the route
  offRoute: number; // metres between the driver and the route
  index: number; // segment index (points[index] → points[index + 1])
  point: LatLng; // the closest point on the route
}

export interface Guidance {
  maneuver: string;
  text: string; // the instruction for the next manoeuvre
  distance: number; // metres to it
  arrive: boolean; // the next "manoeuvre" is the destination
  then: { maneuver: string; text: string } | null; // a second manoeuvre right after it
  stepKey: string; // identifies the manoeuvre (for voice prompts)
}

const M_PER_DEG = 111_320;

export function buildTrack(points: LatLng[]): RouteTrack {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distanceMeters(points[i - 1], points[i]));
  return { points, cum, total: cum[cum.length - 1] || 0 };
}

/**
 * The closest point of the route to `pos`. `hint` (the last `along`) keeps the snap from
 * jumping back to an earlier part of a route that passes the same street twice.
 */
export function snapToTrack(track: RouteTrack, pos: LatLng, hint?: number): Snap | null {
  const { points, cum } = track;
  if (points.length < 2) return null;
  const kx = M_PER_DEG * Math.cos((pos.latitude * Math.PI) / 180);
  const px = pos.longitude * kx;
  const py = pos.latitude * M_PER_DEG;
  let best: Snap | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i].longitude * kx, ay = points[i].latitude * M_PER_DEG;
    const bx = points[i + 1].longitude * kx, by = points[i + 1].latitude * M_PER_DEG;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    const along = cum[i] + t * (cum[i + 1] - cum[i]);
    const score = hint != null && along < hint - 60 ? d + 40 : d;
    if (score < bestScore) {
      bestScore = score;
      best = {
        along,
        offRoute: d,
        index: i,
        point: {
          latitude: points[i].latitude + t * (points[i + 1].latitude - points[i].latitude),
          longitude: points[i].longitude + t * (points[i + 1].longitude - points[i].longitude),
        },
      };
    }
  }
  return best;
}

// The part of the route still ahead of the driver
export function remainingLine(track: RouteTrack, snap: Snap): LatLng[] {
  return [snap.point, ...track.points.slice(snap.index + 1)];
}

const firstLine = (text: string) => (text || '').split('\n')[0].trim();

/**
 * Google's step i starts with its instruction ("Turn left onto …"), so while the driver
 * is on step i the next manoeuvre is step i+1's, at the end of step i. Step ends are
 * placed along the polyline by their cumulative distance (scaled to the polyline length).
 */
export function nextManeuver(steps: RouteStep[], track: RouteTrack, along: number, version: string | number = ''): Guidance | null {
  if (!steps.length || track.total <= 0) return null;
  const sum = steps.reduce((n, s) => n + (s.distanceMeters || 0), 0) || track.total;
  const scale = track.total / sum;
  let end = 0;
  for (let i = 0; i < steps.length; i++) {
    end += (steps[i].distanceMeters || 0) * scale;
    if (end > along + 5 || i === steps.length - 1) {
      const next = steps[i + 1];
      const distance = Math.max(0, end - along);
      if (!next) {
        return { maneuver: 'ARRIVE', text: '', distance: Math.max(0, track.total - along), arrive: true, then: null, stepKey: `${version}:arrive` };
      }
      const after = steps[i + 2];
      const then = after && next.distanceMeters < 250 ? { maneuver: after.maneuver, text: firstLine(after.text) } : !after && next.distanceMeters < 250 ? { maneuver: 'ARRIVE', text: '' } : null;
      return { maneuver: next.maneuver, text: firstLine(next.text), distance, arrive: false, then, stepKey: `${version}:${i + 1}` };
    }
  }
  return null;
}

// MaterialCommunityIcons name for a Routes API manoeuvre
export function maneuverIcon(maneuver: string): string {
  switch (maneuver) {
    case 'TURN_LEFT': return 'arrow-left-top-bold';
    case 'TURN_RIGHT': return 'arrow-right-top-bold';
    case 'TURN_SLIGHT_LEFT':
    case 'RAMP_LEFT':
    case 'FORK_LEFT': return 'arrow-top-left-thick';
    case 'TURN_SLIGHT_RIGHT':
    case 'RAMP_RIGHT':
    case 'FORK_RIGHT': return 'arrow-top-right-thick';
    case 'TURN_SHARP_LEFT': return 'arrow-bottom-left';
    case 'TURN_SHARP_RIGHT': return 'arrow-bottom-right';
    case 'UTURN_LEFT': return 'arrow-u-left-top-bold';
    case 'UTURN_RIGHT': return 'arrow-u-right-top-bold';
    case 'MERGE': return 'merge';
    case 'ROUNDABOUT_LEFT': return 'rotate-left';
    case 'ROUNDABOUT_RIGHT': return 'rotate-right';
    case 'FERRY':
    case 'FERRY_TRAIN': return 'ferry';
    case 'ARRIVE': return 'flag-checkered';
    default: return 'arrow-up-bold';
  }
}

// "200 m", "1.2 km" for the banner
export function bannerDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.max(10, Math.round(m / 10) * 10)} m`;
}

// "200 metres", "1.5 kilometres" for the voice
export function spokenDistance(m: number): string {
  if (m >= 1000) {
    const km = Math.round(m / 100) / 10;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} kilometre${km === 1 ? '' : 's'}`;
  }
  return `${m >= 200 ? Math.round(m / 100) * 100 : Math.max(10, Math.round(m / 10) * 10)} metres`;
}

// What to say for a manoeuvre ("Turn left onto Morogoro Road")
export function spokenInstruction(g: Guidance, destination: string): string {
  if (g.arrive) return `You will arrive at ${destination}`;
  return (g.text || 'Continue straight').replace(/\bRd\b/g, 'Road').replace(/\bSt\b/g, 'Street').replace(/\bAve\b/g, 'Avenue');
}
