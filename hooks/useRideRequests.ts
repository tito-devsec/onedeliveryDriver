import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { get, post } from '../lib/api';
import { subscribe } from '../lib/socket';
import type { RideOffer } from '../types';

interface Options {
  online: boolean;
  busy: boolean; // on a delivery: no new offers
}

const nearestFirst = (a: RideOffer, b: RideOffer) =>
  (a.pickup_distance_km ?? 999) - (b.pickup_distance_km ?? 999);

// Deliveries the server offered to this driver. They arrive instantly over the socket
// ("ride:offer"), disappear when someone else takes them ("ride:closed"), and a poll
// every 15 s catches anything missed while the socket was down.
export function useRideRequests({ online, busy }: Options) {
  const [available, setAvailable] = useState<RideOffer[]>([]);
  const [incoming, setIncoming] = useState<RideOffer | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const incomingRef = useRef<RideOffer | null>(null);
  incomingRef.current = incoming;
  const active = online && !busy;

  const popUp = useCallback((offer: RideOffer) => {
    if (incomingRef.current || seenRef.current.has(offer.id)) return;
    setIncoming(offer);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  const fetchAvailable = useCallback(async () => {
    try {
      const res = await get<{ rides: RideOffer[] }>('/rides/driver/available');
      const list = (res.rides || []).sort(nearestFirst);
      setAvailable(list);
      const shown = incomingRef.current;
      if (shown && !list.some((r) => r.id === shown.id)) setIncoming(null);
      const next = list.find((r) => !seenRef.current.has(r.id));
      if (next) popUp(next);
    } catch {
      /* offline for a moment — the next poll retries */
    }
  }, [popUp]);

  useEffect(() => {
    if (!active) {
      setAvailable([]);
      setIncoming(null);
      return;
    }
    fetchAvailable();
    const t = setInterval(fetchAvailable, 15000);
    return () => clearInterval(t);
  }, [active, fetchAvailable]);

  useEffect(() => {
    if (!active) return;
    const offOffer = subscribe('ride:offer', (offer: RideOffer) => {
      setAvailable((list) => [offer, ...list.filter((r) => r.id !== offer.id)].sort(nearestFirst));
      popUp(offer);
    });
    const offClosed = subscribe('ride:closed', ({ rideId }: { rideId: string }) => {
      setAvailable((list) => list.filter((r) => r.id !== rideId));
      if (incomingRef.current?.id === rideId) setIncoming(null);
    });
    return () => {
      offOffer();
      offClosed();
    };
  }, [active, popUp]);

  const remove = (rideId: string) => {
    seenRef.current.add(rideId);
    setAvailable((list) => list.filter((r) => r.id !== rideId));
    if (incomingRef.current?.id === rideId) setIncoming(null);
  };

  const accept = useCallback(async (rideId: string) => {
    try {
      await post(`/rides/${rideId}/accept`, {});
    } finally {
      remove(rideId);
    }
  }, []);

  // "Decline": the server passes it straight to the next nearest driver
  const decline = useCallback((rideId: string) => {
    remove(rideId);
    post(`/rides/${rideId}/decline`, {}).catch(() => {});
  }, []);

  // Countdown ran out: close the pop-up but keep the offer in the list
  const dismiss = useCallback((rideId: string) => {
    seenRef.current.add(rideId);
    if (incomingRef.current?.id === rideId) setIncoming(null);
  }, []);

  const open = useCallback(
    (rideId: string) => {
      const offer = available.find((r) => r.id === rideId);
      if (offer) setIncoming(offer);
    },
    [available]
  );

  return { available, incoming, accept, decline, dismiss, open, refetch: fetchAvailable };
}
