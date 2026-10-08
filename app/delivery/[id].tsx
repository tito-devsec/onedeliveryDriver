import { useEffect, useMemo, useRef, useState } from 'react';
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
import { fetchRoute, openExternalNavigation, RouteResult } from '../../lib/directions';
import type { RideRequest, LatLng } from '../../types';

export default function Delivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapView>(null);

  const [ride, setRide] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);

  const { location } = useDriverLocation({ enabled: true, rideId: id });

  const fetchRide = async () => {
    try {
      const res = await get<{ ride: RideRequest | null }>('/rides/driver/current');
      if (res.ride && res.ride.id === id) {
        setRide(res.ride);
      } else if (res.ride) {
        setRide(res.ride);
      } else {
        // No active ride — likely delivered/cancelled
        setRide(null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRide();
    const t = setInterval(fetchRide, 8000);
    return () => clearInterval(t);
  }, [id]);

  // Target depends on status: before pickup → pickup; after → dropoff
  const target: LatLng | null = useMemo(() => {
    if (!ride) return null;
    const beforePickup = ['accepted', 'going_to_shop'].includes(ride.status);
    return beforePickup
      ? { latitude: Number(ride.pickup_lat), longitude: Number(ride.pickup_lng) }
      : { latitude: Number(ride.dropoff_lat), longitude: Number(ride.dropoff_lng) };
  }, [ride?.status, ride?.id]);

  // Recompute route when driver location or target changes
  useEffect(() => {
    if (location && target) {
      fetchRoute(location, target).then(setRoute);
    }
  }, [location?.latitude, location?.longitude, target?.latitude, target?.longitude]);

  // Fit map to driver + target
  useEffect(() => {
    if (location && target && mapRef.current) {
      mapRef.current.fitToCoordinates([location, target], {
        edgePadding: { top: 120, right: 80, bottom: 320, left: 80 },
        animated: true,
      });
    }
  }, [location?.latitude, target?.latitude]);

  const advance = async () => {
    if (!ride) return;
    const cfg = STATUS_CONFIG[ride.status];
    if (!cfg?.next) return;
    setUpdating(true);
    try {
      await put(`/rides/${ride.id}/status`, { status: cfg.next });
      if (cfg.next === 'delivered') {
        queryClient.invalidateQueries({ queryKey: ['earnings'] });
        queryClient.invalidateQueries({ queryKey: ['driverHistory'] });
        Alert.alert('Delivered 🎉', 'Great job! Earnings have been added to your balance.');
        router.replace('/(tabs)/home');
        return;
      }
      await fetchRide();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update status');
    } finally {
      setUpdating(false);
    }
  };

  const callCustomer = () => {
    if (ride?.customer_phone) Linking.openURL(`tel:${ride.customer_phone}`);
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
        <Pressable onPress={() => router.replace('/(tabs)/home')} style={{ marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 26 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>Back to home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const cfg = STATUS_CONFIG[ride.status] || STATUS_CONFIG.accepted;
  const beforePickup = ['accepted', 'going_to_shop'].includes(ride.status);
  const pickup = { latitude: Number(ride.pickup_lat), longitude: Number(ride.pickup_lng) };
  const dropoff = { latitude: Number(ride.dropoff_lat), longitude: Number(ride.dropoff_lng) };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        customMapStyle={LIGHT_MAP_STYLE}
        showsUserLocation
        initialRegion={location ? { ...location, latitudeDelta: 0.03, longitudeDelta: 0.03 } : DEFAULT_REGION}
      >
        <Marker coordinate={pickup} title="Pickup" pinColor={COLORS.primary}>
          <View style={{ backgroundColor: COLORS.primary, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: '#fff' }}>
            <Ionicons name="storefront" size={16} color="#fff" />
          </View>
        </Marker>
        <Marker coordinate={dropoff} title="Drop-off">
          <View style={{ backgroundColor: COLORS.navy, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: '#fff' }}>
            <Ionicons name="flag" size={16} color="#fff" />
          </View>
        </Marker>
        {route?.coordinates && route.coordinates.length > 1 && (
          <Polyline coordinates={route.coordinates} strokeColor={COLORS.primary} strokeWidth={5} />
        )}
      </MapView>

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
          <Pressable onPress={() => router.replace('/(tabs)/home')} style={{ backgroundColor: '#fff', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, elevation: 4 }}>
            <Text style={{ fontWeight: '800', color: cfg.color }}>{cfg.label}</Text>
            {!!route?.durationText && (
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                {route.durationText} · {route.distanceText}
              </Text>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom action card */}
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, elevation: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14 }}>
          {/* Customer row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={24} color={COLORS.textMuted} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.textPrimary }}>
                {ride.customer_name || 'Customer'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                Earn TZS {Math.round(Number(ride.fare) * 0.85).toLocaleString()} · {Number(ride.distance_km).toFixed(1)} km
              </Text>
            </View>
            <Pressable onPress={callCustomer} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <Ionicons name="call" size={20} color={COLORS.success} />
            </Pressable>
            <Pressable onPress={openChat} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.navy} />
            </Pressable>
          </View>

          {/* Address */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
            <Ionicons name={beforePickup ? 'storefront' : 'flag'} size={22} color={beforePickup ? COLORS.primary : COLORS.navy} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{beforePickup ? 'Pickup' : 'Drop-off'}</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }}>
                {beforePickup ? ride.pickup_address || 'Pickup point' : ride.dropoff_address || 'Destination'}
              </Text>
            </View>
            <Pressable onPress={() => target && openExternalNavigation(target)} style={{ backgroundColor: COLORS.surface, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="navigate" size={16} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}>Navigate</Text>
            </Pressable>
          </View>

          {/* Advance status button */}
          {cfg.next && (
            <Pressable
              onPress={advance}
              disabled={updating}
              style={{ backgroundColor: COLORS.primary, borderRadius: 28, paddingVertical: 16, alignItems: 'center', opacity: updating ? 0.6 : 1 }}
            >
              {updating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{cfg.nextLabel}</Text>
              )}
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
