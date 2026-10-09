import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, VEHICLE_TYPES } from '../constants';
import type { RideOffer } from '../types';

const COUNTDOWN = 25;

interface Props {
  ride: RideOffer | null;
  onAccept: (rideId: string) => Promise<void>;
  onDecline: (rideId: string) => void;
  onTimeout: (rideId: string) => void;
}

export default function RideRequestModal({ ride, onAccept, onDecline, onTimeout }: Props) {
  const [seconds, setSeconds] = useState(COUNTDOWN);
  const [accepting, setAccepting] = useState(false);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ride) return;
    setSeconds(COUNTDOWN);
    setAccepting(false);
    progress.setValue(1);
    Animated.timing(progress, {
      toValue: 0,
      duration: COUNTDOWN * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          onTimeout(ride.id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ride?.id]);

  if (!ride) return null;

  const vehicle = VEHICLE_TYPES.find((v) => v.id === ride.vehicle_type);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await onAccept(ride.id);
    } catch {
      /* the caller explains why */
    } finally {
      setAccepting(false);
    }
  };

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal visible transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View
          style={{
            backgroundColor: COLORS.white,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 24,
            paddingBottom: 36,
          }}
        >
          {/* Countdown bar */}
          <View style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden', marginBottom: 18 }}>
            <Animated.View style={{ height: '100%', width, backgroundColor: COLORS.primary }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Text style={{ fontSize: 28 }}>{vehicle?.emoji || '📦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                  New delivery nearby
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                  {ride.pickup_distance_km != null
                    ? `Shop ${ride.pickup_distance_km} km from you${ride.pickup_eta_min ? ` · ~${ride.pickup_eta_min} min` : ''}`
                    : vehicle?.label}
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: COLORS.primary, borderRadius: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 18 }}>{seconds}</Text>
            </View>
          </View>

          {/* Earning + trip */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
            <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>You earn</Text>
              <Text style={{ color: COLORS.success, fontSize: 20, fontWeight: '800' }}>
                TZS {Number(ride.earning || 0).toLocaleString()}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Shop → customer</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: '800' }}>
                {Number(ride.trip_km || ride.distance_km).toFixed(1)} km
              </Text>
              {!!ride.trip_min && <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>~{ride.trip_min} min drive</Text>}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, backgroundColor: ride.delivery_fee_paid ? COLORS.successBg : COLORS.warningBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 16 }}>
            <Ionicons name={ride.delivery_fee_paid ? 'checkmark-circle' : 'time-outline'} size={14} color={ride.delivery_fee_paid ? COLORS.success : COLORS.warning} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: ride.delivery_fee_paid ? COLORS.success : COLORS.warning }}>
              {ride.delivery_fee_paid ? 'Delivery fee paid' : 'Delivery fee payment pending'}
            </Text>
          </View>

          {/* Pickup (shop) / drop-off (customer) */}
          <View style={{ marginBottom: 22 }}>
            <Row icon="storefront" color={COLORS.primary} label={ride.shop_name ? `Pickup · ${ride.shop_name}` : 'Pickup'} value={ride.pickup_address || 'Shop'} />
            <View style={{ height: 14, marginLeft: 11, borderLeftWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' }} />
            <Row icon="flag" color={COLORS.navy} label="Drop-off · customer" value={ride.dropoff_address || 'Customer location'} />
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={() => onDecline(ride.id)}
              disabled={accepting}
              style={{ flex: 1, paddingVertical: 16, borderRadius: 30, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 16 }}>Decline</Text>
            </Pressable>
            <Pressable
              onPress={handleAccept}
              disabled={accepting}
              style={{ flex: 2, paddingVertical: 16, borderRadius: 30, backgroundColor: COLORS.primary, alignItems: 'center', opacity: accepting ? 0.6 : 1 }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
                {accepting ? 'Accepting…' : 'Accept'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({ icon, color, label, value }: { icon: any; color: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Ionicons name={icon} size={22} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}
