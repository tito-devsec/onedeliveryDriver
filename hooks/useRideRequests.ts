import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { get, post } from '../lib/api';
import { subscribe } from '../lib/socket';
import type { RideOffer } from '../types';

interface Options {
  online: boolean;
  busy: boolean; // on a delivery: no new offers
  onAssigned?: (rideId: string) => void; // the customer accepted this driver's price
}

const DRIVER_SHARE = 0.85;

const nearestFirst = (a: RideOffer, b: RideOffer) =>
  (a.pickup_distance_km ?? 999) - (b.pickup_distance_km ?? 999);

// Deliveries the server offered to this driver. They arrive instantly over the socket
// ("ride:offer", again when the customer raises the price), disappear when someone else
// takes them or the customer picks another price ("ride:closed"), and a poll every 15 s
// catches anything missed while the socket was down. The driver accepts the customer's
// offer or answers with a price of their own; if the customer accepts that price the
// delivery is theirs ("ride:assigned").
export function useRideRequests({ online, busy, onAssigned }: Options) {
  const [available, setAvailable] = useState<RideOffer[]>([]);
  const [incoming, setIncoming] = useState<RideOffer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const incomingRef = useRef<RideOffer | null>(null);
  incomingRef.current = incoming;
  const availableRef = useRef<RideOffer[]>(available);
  availableRef.current = available;
  const assignedRef = useRef(onAssigned);
  assignedRef.current = onAssigned;
  const active = online && !busy;

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 6000);
  }, []);

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
      if (shown) {
        const fresh = list.find((r) => r.id === shown.id);
        setIncoming(fresh ?? null);
      }
      const next = list.find((r) => !seenRef.current.has(r.id) && r.offer_status === 'offered');
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
    if (!online) return;
    const offOffer = subscribe('ride:offer', (offer: RideOffer) => {
      if (busy) return;
      const before = incomingRef.current;
      setAvailable((list) => [offer, ...list.filter((r) => r.id !== offer.id)].sort(nearestFirst));
      if (before?.id === offer.id) {
        // The customer raised their price while this driver was looking at it
        setIncoming(offer);
      } else if (seenRef.current.has(offer.id) && offer.offer_status === 'offered') {
        const old = availableRef.current.find((r) => r.id === offer.id);
        if (old && offer.fare > old.fare) flash(`The customer raised their offer to TZS ${Math.round(offer.fare).toLocaleString('en-US')}`);
      }
      popUp(offer);
    });
    const offClosed = subscribe('ride:closed', ({ rideId, reason }: { rideId: string; reason?: string }) => {
      const had = availableRef.current.find((r) => r.id === rideId);
      setAvailable((list) => list.filter((r) => r.id !== rideId));
      if (incomingRef.current?.id === rideId) setIncoming(null);
      if (had?.offer_status === 'countered') {
        flash(reason === 'rejected' ? 'The customer declined your price' : 'The customer chose another driver');
      }
    });
    const offAssigned = subscribe('ride:assigned', ({ rideId }: { rideId: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setAvailable([]);
      setIncoming(null);
      assignedRef.current?.(rideId);
    });
    return () => {
      offOffer();
      offClosed();
      offAssigned();
    };
  }, [online, busy, popUp, flash]);

  const remove = (rideId: string) => {
    seenRef.current.add(rideId);
    setAvailable((list) => list.filter((r) => r.id !== rideId));
    if (incomingRef.current?.id === rideId) setIncoming(null);
  };

  // Take it at the customer's price
  const accept = useCallback(async (rideId: string) => {
    try {
      await post(`/rides/${rideId}/accept`, {});
    } finally {
      remove(rideId);
    }
  }, []);

  // Answer with the driver's own price; it waits for the customer in the list
  const counter = useCallback(async (rideId: string, fare: number) => {
    await post(`/rides/${rideId}/counter`, { fare });
    seenRef.current.add(rideId);
    const mine = { offer_status: 'countered' as const, my_counter: fare, my_counter_earning: Math.round(fare * DRIVER_SHARE) };
    setAvailable((list) => list.map((r) => (r.id === rideId ? { ...r, ...mine } : r)));
    if (incomingRef.current?.id === rideId) setIncoming(null);
  }, []);

  // "Decline" (or withdraw a price): the server passes it to the next nearest driver
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

  return { available, incoming, notice, accept, counter, decline, dismiss, open, refetch: fetchAvailable };
}
