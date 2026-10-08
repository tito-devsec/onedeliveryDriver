import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, VEHICLE_TYPES } from '../constants';
import type { RideRequest } from '../types';

const COUNTDOWN = 25;

interface Props {
  ride: RideRequest | null;
  onAccept: (rideId: string) => Promise<void>;
  onDecline: (rideId: string) => void;
}

export default function RideRequestModal({ ride, onAccept, onDecline }: Props) {
  const [seconds, setSeconds] = useState(COUNTDOWN);
  const [accepting, setAccepting] = useState(false);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ride) return;
    setSeconds(COUNTDOWN);
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
          onDecline(ride.id);
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
    } catch (e: any) {
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 28 }}>{vehicle?.emoji || '📦'}</Text>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                  New delivery request
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{vehicle?.label}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: COLORS.primary, borderRadius: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 18 }}>{seconds}</Text>
            </View>
          </View>

          {/* Fare + distance */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>
            <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>You earn</Text>
              <Text style={{ color: COLORS.success, fontSize: 20, fontWeight: '800' }}>
                TZS {Math.round(Number(ride.fare) * 0.85).toLocaleString()}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Distance</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: '800' }}>
                {Number(ride.distance_km).toFixed(1)} km
              </Text>
            </View>
          </View>

          {/* Pickup / dropoff */}
          <View style={{ marginBottom: 22 }}>
            <Row icon="location" color={COLORS.primary} label="Pickup" value={ride.pickup_address || 'Pickup point'} />
            <View style={{ height: 14, marginLeft: 11, borderLeftWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' }} />
            <Row icon="flag" color={COLORS.navy} label="Drop-off" value={ride.dropoff_address || 'Destination'} />
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={() => onDecline(ride.id)}
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
