import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { get, post } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { RideRequest } from '../types';

interface Options {
  online: boolean;
}

export function useRideRequests({ online }: Options) {
  const [available, setAvailable] = useState<RideRequest[]>([]);
  const [incoming, setIncoming] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAvailable = useCallback(async () => {
    try {
      const res = await get<{ rides: RideRequest[] }>('/rides/driver/available');
      setAvailable(res.rides || []);
      // Surface the newest unseen request as an incoming modal
      const fresh = (res.rides || []).find((r) => !seenRef.current.has(r.id));
      if (fresh && !incoming) {
        setIncoming(fresh);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {}
        );
      }
    } catch {
      /* ignore */
    }
  }, [incoming]);

  // Poll while online (fallback to sockets)
  useEffect(() => {
    if (!online) {
      if (pollRef.current) clearInterval(pollRef.current);
      setAvailable([]);
      setIncoming(null);
      return;
    }
    setLoading(true);
    fetchAvailable().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchAvailable, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [online, fetchAvailable]);

  // Real-time socket push for new requests
  useEffect(() => {
    if (!online) return;
    const socket = getSocket();
    if (!socket) return;

    const onNew = () => {
      fetchAvailable();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {}
      );
    };
    socket.on('ride:new', onNew);
    socket.on('new_ride_request', onNew);
    return () => {
      socket.off('ride:new', onNew);
      socket.off('new_ride_request', onNew);
    };
  }, [online, fetchAvailable]);

  const accept = useCallback(async (rideId: string) => {
    await post(`/rides/${rideId}/accept`, {});
    setIncoming(null);
    seenRef.current.add(rideId);
  }, []);

  const dismiss = useCallback((rideId: string) => {
    seenRef.current.add(rideId);
    setIncoming(null);
  }, []);

  return { available, incoming, loading, accept, dismiss, refetch: fetchAvailable };
}
