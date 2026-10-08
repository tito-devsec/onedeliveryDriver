import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STATUS_CONFIG, VEHICLE_TYPES } from '../../constants';
import { useCurrentRide, useDriverHistory } from '../../hooks/useEarnings';
import { useAuth } from '../../context/AuthContext';
import type { RideRequest } from '../../types';

export default function Orders() {
  const router = useRouter();
  const { isApproved } = useAuth();
  const { data: current } = useCurrentRide(isApproved);
  const { data: history, refetch, isFetching } = useDriverHistory();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const activeRide = current?.ride;
  const rides = history?.rides || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={['top']}>
      <View style={{ padding: 20, paddingBottom: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: COLORS.textPrimary }}>Deliveries</Text>
        <Text style={{ color: COLORS.textMuted, marginTop: 2 }}>Your active and completed trips</Text>
      </View>

      <FlatList
        data={rides}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing || isFetching} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          activeRide ? (
            <Pressable
              onPress={() => router.push(`/delivery/${activeRide.id}`)}
              style={{ backgroundColor: COLORS.navy, borderRadius: 18, padding: 18, marginBottom: 18 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Active delivery</Text>
                <View style={{ backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    {STATUS_CONFIG[activeRide.status]?.label || activeRide.status}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#C9D2F0', marginTop: 8 }} numberOfLines={1}>
                {activeRide.pickup_address} → {activeRide.dropoff_address}
              </Text>
              <Text style={{ color: '#fff', fontWeight: '700', marginTop: 10 }}>
                Tap to continue navigation →
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => <HistoryRow ride={item} />}
        ListEmptyComponent={
          !activeRide ? (
            <View style={{ alignItems: 'center', marginTop: 80 }}>
              <Ionicons name="cube-outline" size={56} color={COLORS.textDim} />
              <Text style={{ color: COLORS.textMuted, marginTop: 12 }}>No deliveries yet</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function HistoryRow({ ride }: { ride: RideRequest }) {
  const vehicle = VEHICLE_TYPES.find((v) => v.id === ride.vehicle_type);
  const date = new Date(ride.created_at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 20 }}>{vehicle?.emoji || '📦'}</Text>
          <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{date}</Text>
        </View>
        <Text style={{ fontWeight: '800', color: COLORS.success }}>
          + TZS {Math.round(Number(ride.fare) * 0.85).toLocaleString()}
        </Text>
      </View>
      <Text style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 13 }} numberOfLines={1}>
        {ride.pickup_address || 'Pickup'} → {ride.dropoff_address || 'Drop-off'}
      </Text>
      <Text style={{ color: COLORS.textDim, marginTop: 4, fontSize: 12 }}>
        {Number(ride.distance_km).toFixed(1)} km · Delivered
      </Text>
    </View>
  );
}
