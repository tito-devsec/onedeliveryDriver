import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { COLORS, STATUS_CONFIG, LIGHT_MAP_STYLE, DEFAULT_REGION } from '../../constants';
import { get, put, post } from '../../lib/api';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { connectSocket, subscribe } from '../../lib/socket';
import { isTracking, startTracking } from '../../lib/tracking';
import {
  decodePolyline, distanceMeters, fetchRideRoute, formatDistance, formatEta, openExternalNavigation,
} from '../../lib/directions';
import type { LatLng, RideProgress, RideRequest, RideRoute } from '../../types';

// Confirming "arrived" or "delivered" further than this from the stop asks first
const ARRIVE_RADIUS_M = 300;

export default function Delivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapView>(null);

  const [ride, setRide] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [route, setRoute] = useState<RideRoute | null>(null);
  const [progress, setProgress] = useState<{ etaSeconds: number | null; remainingMeters: number | null } | null>(null);
  const [follow, setFollow] = useState(true);
  const routeVersion = useRef<number | null>(null);

  const { location, heading } = useDriverLocation();

  const fetchRide = useCallback(async () => {
    try {
      const res = await get<{ ride: RideRequest | null }>('/rides/driver/current');
      setRide(res.ride ?? null); // no active ride → delivered / cancelled / released
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoute = useCallback(async () => {
    const r = await fetchRideRoute(id);
    if (!r) return;
    setRoute(r);
    routeVersion.current = r.leg?.version ?? null;
    if (r.leg) setProgress({ etaSeconds: r.leg.etaSeconds, remainingMeters: r.leg.remainingMeters });
  }, [id]);

  // Keep sharing location for the whole delivery, also after an app restart
  useEffect(() => {
    (async () => {
      if (!(await isTracking())) await startTracking().catch(() => {});
      await connectSocket();
    })();
  }, []);

  useEffect(() => {
    fetchRide();
    loadRoute();
    const t1 = setInterval(fetchRide, 10000);
    const t2 = setInterval(loadRoute, 30000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [fetchRide, loadRoute]);

  // Live ETA computed by the server after every fix, and status changes (e.g. customer cancels)
  useEffect(() => {
    const offProgress = subscribe('ride:progress', (p: RideProgress) => {
      if (p.rideId !== id) return;
      setProgress({ etaSeconds: p.etaSeconds, remainingMeters: p.remainingMeters });
      if (p.routeVersion && p.routeVersion !== routeVersion.current) loadRoute();
    });
    const offStatus = subscribe('ride:status', (s: { rideId: string; status: string }) => {
      if (s.rideId !== id) return;
      fetchRide();
      loadRoute();
      if (s.status === 'cancelled') Alert.alert('Delivery cancelled', 'The customer cancelled this delivery.');
    });
    return () => {
      offProgress();
      offStatus();
    };
  }, [id, fetchRide, loadRoute]);

  const beforePickup = ride ? ['accepted', 'going_to_shop'].includes(ride.status) : true;
  const pickup: LatLng | null = ride ? { latitude: Number(ride.pickup_lat), longitude: Number(ride.pickup_lng) } : null;
  const dropoff: LatLng | null = ride ? { latitude: Number(ride.dropoff_lat), longitude: Number(ride.dropoff_lng) } : null;
  const target = beforePickup ? pickup : dropoff;

  const legLine = useMemo(() => (route?.leg?.polyline ? decodePolyline(route.leg.polyline) : null), [route?.leg?.polyline]);
  const tripLine = useMemo(() => (route?.trip?.polyline ? decodePolyline(route.trip.polyline) : null), [route?.trip?.polyline]);

  // Navigation camera: follow the driver, pointing the way they're heading
  useEffect(() => {
    if (!follow || !location || !mapRef.current) return;
    mapRef.current.animateCamera({ center: location, heading, pitch: 45, zoom: 17 }, { duration: 800 });
  }, [follow, location?.latitude, location?.longitude, heading]);

  const overview = () => {
    setFollow(false);
    const pts = [location, target, ...(legLine || [])].filter(Boolean) as LatLng[];
    if (pts.length >= 2) {
      mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 160, right: 60, bottom: 380, left: 60 }, animated: true });
    }
  };

  const distToTarget = location && target ? distanceMeters(location, target) : null;

  const finishLocally = () => {
    queryClient.setQueryData(['currentRide'], { ride: null });
    router.replace('/(tabs)/home');
  };

  const advance = async () => {
    if (!ride) return;
    const cfg = STATUS_CONFIG[ride.status];
    if (!cfg?.next) return;
    // "Arrived" / "Delivered" far from the stop is usually a slip of the finger
    const atStop = cfg.next === 'going_to_shop' || cfg.next === 'delivered';
    if (atStop && distToTarget != null && distToTarget > ARRIVE_RADIUS_M) {
      const where = cfg.next === 'going_to_shop' ? 'the shop' : "the customer's location";
      const go = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Are you there?',
          `You're ${formatDistance(distToTarget)} from ${where}. Continue anyway?`,
          [
            { text: 'Not yet', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Yes, continue', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        )
      );
      if (!go) return;
    }
    setUpdating(true);
    try {
      await put(`/rides/${ride.id}/status`, { status: cfg.next });
      if (cfg.next === 'delivered') {
        queryClient.invalidateQueries({ queryKey: ['earnings'] });
        queryClient.invalidateQueries({ queryKey: ['driverHistory'] });
        Alert.alert('Delivered 🎉', 'Great job! Earnings have been added to your balance.');
        finishLocally();
        return;
      }
      setFollow(true);
      await fetchRide();
      await loadRoute();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update status');
    } finally {
      setUpdating(false);
    }
  };

  // Can't make it: the delivery goes straight to the next nearest driver
  const release = () => {
    if (!ride) return;
    Alert.alert(
      'Release this delivery?',
      "It will be offered to the next nearest driver. Only do this if you really can't make it.",
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: async () => {
            try {
              await put(`/rides/${ride.id}/status`, { status: 'cancelled' });
              finishLocally();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not release the delivery');
            }
          },
        },
      ]
    );
  };

  const call = (phone?: string | null) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const openChat = async () => {
    if (!ride) return;
    try {
      const res = await post<{ conversationId: string }>('/chat/conversations', {
        recipientId: ride.customer_id,
        type: 'user_driver',
        rideId: ride.id,
        orderId: ride.order_id,
      });
      router.push(`/chat/${res.conversationId}`);
    } catch (e: any) {
      Alert.alert('Chat', e.message || 'Could not open chat');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="checkmark-done-circle" size={64} color={COLORS.success} />
        <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginTop: 16 }}>No active delivery</Text>
        <Pressable onPress={finishLocally} style={{ marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 26 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>Back to home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const cfg = STATUS_CONFIG[ride.status] || STATUS_CONFIG.accepted;
  const shopName = ride.shop_name || 'the shop';
  const stopTitle = beforePickup ? `Pick up at ${shopName}` : `Deliver to ${ride.customer_name || 'the customer'}`;
  const stopAddress = beforePickup ? ride.pickup_address || 'Pickup point' : ride.dropoff_address || 'Customer location';
  const eta = progress?.etaSeconds != null ? formatEta(progress.etaSeconds) : null;
  const left = progress?.remainingMeters != null ? formatDistance(progress.remainingMeters) : distToTarget != null ? formatDistance(distToTarget) : null;
  const phone = beforePickup ? ride.shop_phone : ride.customer_phone;
  const feePaid = !!Number(ride.delivery_fee_paid);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        customMapStyle={LIGHT_MAP_STYLE}
        showsUserLocation={false}
        showsCompass={false}
        onPanDrag={() => follow && setFollow(false)}
        initialRegion={location ? { ...location, latitudeDelta: 0.02, longitudeDelta: 0.02 } : DEFAULT_REGION}
      >
        {/* Shop → customer, faint while heading to the shop */}
        {beforePickup && (tripLine ? (
          <Polyline coordinates={tripLine} strokeColor={COLORS.navy + '66'} strokeWidth={4} />
        ) : pickup && dropoff ? (
          <Polyline coordinates={[pickup, dropoff]} strokeColor={COLORS.navy + '66'} strokeWidth={3} lineDashPattern={[8, 6]} />
        ) : null)}
        {/* Current leg: driver → next stop */}
        {legLine && legLine.length > 1 ? (
          <Polyline coordinates={legLine} strokeColor={COLORS.primary} strokeWidth={6} />
        ) : location && target ? (
          <Polyline coordinates={[location, target]} strokeColor={COLORS.primary} strokeWidth={4} lineDashPattern={[10, 8]} />
        ) : null}

        {pickup && (
          <Marker coordinate={pickup} title={ride.shop_name || 'Pickup'} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ backgroundColor: COLORS.primary, padding: 7, borderRadius: 18, borderWidth: 2, borderColor: '#fff' }}>
              <Ionicons name="storefront" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {dropoff && (
          <Marker coordinate={dropoff} title="Customer" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ backgroundColor: COLORS.navy, padding: 7, borderRadius: 18, borderWidth: 2, borderColor: '#fff' }}>
              <Ionicons name="home" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {location && (
          <Marker coordinate={location} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading}>
            <View style={{ backgroundColor: COLORS.white, padding: 4, borderRadius: 20, elevation: 4 }}>
              <View style={{ backgroundColor: COLORS.primary, padding: 6, borderRadius: 16 }}>
                <Ionicons name="navigate" size={18} color="#fff" />
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Header: next stop + live ETA */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
          <Pressable onPress={() => router.replace('/(tabs)/home')} style={{ backgroundColor: '#fff', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, elevation: 4 }}>
            <Text style={{ fontWeight: '800', color: cfg.color }} numberOfLines={1}>{cfg.label}</Text>
            <Text style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' }}>
              {eta ? `${eta} · ${left}` : left ? `${left} away` : 'Locating you…'}
              {route?.leg?.estimated ? <Text style={{ color: COLORS.textMuted, fontWeight: '500' }}>  (approx.)</Text> : null}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', paddingHorizontal: 16 }}>
          <Pressable
            onPress={() => (follow ? overview() : setFollow(true))}
            style={{ backgroundColor: '#fff', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 4 }}
          >
            <Ionicons name={follow ? 'map-outline' : 'locate'} size={22} color={COLORS.textPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Bottom action card */}
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, elevation: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
            {beforePickup ? 'STEP 1 OF 2 · PICKUP' : 'STEP 2 OF 2 · DROP-OFF'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 }}>
            <Ionicons name={beforePickup ? 'storefront' : 'home'} size={24} color={beforePickup ? COLORS.primary : COLORS.navy} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{stopTitle}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{stopAddress}</Text>
            </View>
          </View>

          {/* Navigate / call / chat */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => target && openExternalNavigation(target)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.navy, borderRadius: 22, paddingVertical: 12 }}
            >
              <Ionicons name="navigate" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800' }}>Navigate</Text>
            </Pressable>
            {!!phone && (
              <Pressable onPress={() => call(phone)} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="call" size={20} color={COLORS.success} />
              </Pressable>
            )}
            <Pressable onPress={openChat} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.navy} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
              Earn <Text style={{ color: COLORS.success, fontWeight: '800' }}>TZS {Number(ride.earning ?? Math.round(Number(ride.fare) * 0.85)).toLocaleString()}</Text>
            </Text>
            <Text style={{ color: feePaid ? COLORS.success : COLORS.warning, fontSize: 12, fontWeight: '700' }}>
              {feePaid ? 'Delivery fee paid' : 'Delivery fee not paid yet'}
            </Text>
          </View>

          {/* Advance status button */}
          {cfg.next && (
            <Pressable
              onPress={advance}
              disabled={updating}
              style={{ backgroundColor: COLORS.primary, borderRadius: 28, paddingVertical: 16, alignItems: 'center', opacity: updating ? 0.6 : 1, marginTop: 14 }}
            >
              {updating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{cfg.nextLabel}</Text>
              )}
            </Pressable>
          )}
          {beforePickup && (
            <Pressable onPress={release} style={{ alignItems: 'center', paddingTop: 12 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, textDecorationLine: 'underline' }}>Can't make it? Release this delivery</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
