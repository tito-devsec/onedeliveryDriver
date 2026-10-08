import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import type { EarningsSummary, RideRequest } from '../types';

export function useEarnings() {
  return useQuery({
    queryKey: ['earnings'],
    queryFn: () => get<EarningsSummary>('/rides/driver/earnings'),
    staleTime: 15000,
  });
}

export function useCurrentRide(enabled = true) {
  return useQuery({
    queryKey: ['currentRide'],
    queryFn: () => get<{ ride: RideRequest | null }>('/rides/driver/current'),
    refetchInterval: 6000,
    enabled,
  });
}

export function useDriverHistory() {
  return useQuery({
    queryKey: ['driverHistory'],
    queryFn: () => get<{ rides: RideRequest[] }>('/rides/driver/history'),
    staleTime: 30000,
  });
}
