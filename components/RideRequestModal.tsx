import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Modal, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, VEHICLE_TYPES } from '../constants';
import { vehicleSideImage } from '../lib/vehicles';
import type { RideOffer } from '../types';

const COUNTDOWN = 25;
const STEPS = [500, 1000, 2000];
const DRIVER_SHARE = 0.85;

const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const round100 = (n: number) => Math.round(n / 100) * 100;

interface Props {
  ride: RideOffer | null;
  onAccept: (rideId: string) => Promise<void>;
  onCounter: (rideId: string, fare: number) => Promise<void>;
  onDecline: (rideId: string) => void;
  onTimeout: (rideId: string) => void;
}

export default function RideRequestModal({ ride, onAccept, onCounter, onDecline, onTimeout }: Props) {
  const [seconds, setSeconds] = useState(COUNTDOWN);
  const [busy, setBusy] = useState<'accept' | 'counter' | null>(null);
  const [price, setPrice] = useState<number | null>(null); // the driver's own price, once they pick one
  const [touched, setTouched] = useState(false); // working on a price: no countdown
  const progress = useRef(new Animated.Value(1)).current;
  const { height: screenH } = useWindowDimensions();
  const countered = ride?.offer_status === 'countered';

  useEffect(() => {
    if (!ride) return;
    setSeconds(COUNTDOWN);
    setBusy(null);
    setPrice(null);
    setTouched(false);
    progress.setValue(1);
    if (countered) return;
    const anim = Animated.timing(progress, { toValue: 0, duration: COUNTDOWN * 1000, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [ride?.id, countered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ride || countered || touched) return;
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
  }, [ride?.id, countered, touched]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ride) return null;

  const vehicle = VEHICLE_TYPES.find((v) => v.id === ride.vehicle_type);
  const offer = Number(ride.fare || 0);
  const suggested = Number(ride.suggested_fare || offer);
  const maxPrice = round100(suggested * 3);
  const minCounter = offer + 100;
  const cash = ride.payment_method === 'cash' && !ride.delivery_fee_paid;

  const pickStep = (step: number) => {
    setTouched(true);
    progress.stopAnimation();
    setPrice(Math.min(maxPrice, round100(offer + step)));
  };
  const nudge = (delta: number) => {
    setTouched(true);
    progress.stopAnimation();
    setPrice((p) => Math.min(maxPrice, Math.max(minCounter, round100((p ?? offer) + delta))));
  };

  const accept = async () => {
    setBusy('accept');
    try {
      await onAccept(ride.id);
    } catch {
      /* the caller explains why */
    } finally {
      setBusy(null);
    }
  };

  const sendPrice = async () => {
    if (price == null) return;
    setBusy('counter');
    try {
      await onCounter(ride.id, price);
    } catch (e: any) {
      Alert.alert('Price not sent', e?.message || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onTimeout(ride.id)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: screenH * 0.92 }}>
          <ScrollView bounces={false} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
          {/* Countdown bar */}
          {!countered && !touched && (
            <View style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
              <Animated.View style={{ height: '100%', width, backgroundColor: COLORS.primary }} />
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Image source={vehicleSideImage(ride.vehicle_type)} style={{ width: 66, height: 44 }} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                {countered ? 'Waiting for the customer' : 'New delivery request'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                {ride.pickup_distance_km != null
                  ? `Shop ${ride.pickup_distance_km} km from you${ride.pickup_eta_min ? ` · ~${ride.pickup_eta_min} min` : ''}`
                  : vehicle?.label}
              </Text>
            </View>
            {!countered && !touched && (
              <View style={{ backgroundColor: COLORS.primary, borderRadius: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 18 }}>{seconds}</Text>
              </View>
            )}
          </View>

          {/* The customer's offer */}
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>CUSTOMER OFFERS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: cash ? COLORS.warningBg : COLORS.successBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Ionicons name={cash ? 'cash-outline' : 'phone-portrait-outline'} size={13} color={cash ? '#B45309' : COLORS.success} />
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: cash ? '#B45309' : COLORS.success }}>
                  {ride.delivery_fee_paid ? 'Paid in app' : cash ? 'Cash' : 'Mobile money'}
                </Text>
              </View>
            </View>
            <Text style={{ color: COLORS.textPrimary, fontSize: 30, fontWeight: '900', marginTop: 2 }}>{tzs(offer)}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12.5 }}>
              You earn <Text style={{ color: COLORS.success, fontWeight: '800' }}>{tzs(offer * DRIVER_SHARE)}</Text>
              {suggested !== offer ? ` · suggested ${tzs(suggested)}` : ' · the suggested price'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12.5, marginTop: 6 }}>
              Shop → customer <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>{Number(ride.trip_km || ride.distance_km).toFixed(1)} km</Text>
              {ride.trip_min ? ` · ~${ride.trip_min} min drive` : ''}
            </Text>
          </View>

          {/* Pickup (shop) / drop-off (customer) */}
          <View style={{ marginBottom: 16 }}>
            <Row icon="storefront" color={COLORS.primary} label={ride.shop_name ? `Pickup · ${ride.shop_name}` : 'Pickup'} value={ride.pickup_address || 'Shop'} />
            <View style={{ height: 12, marginLeft: 11, borderLeftWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' }} />
            <Row icon="flag" color={COLORS.navy} label="Drop-off · customer" value={ride.dropoff_address || 'Customer location'} />
          </View>

          {countered && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 14, padding: 12, marginBottom: 12 }}>
              <ActivityIndicator color={COLORS.navy} />
              <Text style={{ color: COLORS.navy, fontWeight: '700', flex: 1 }}>
                You asked {tzs(ride.my_counter || 0)} (you earn {tzs(ride.my_counter_earning || 0)}). We'll open the delivery as soon as the customer accepts.
              </Text>
            </View>
          )}

          {/* Take it at the customer's price */}
          <TouchableOpacity
            onPress={accept}
            disabled={!!busy}
            activeOpacity={0.85}
            style={{ paddingVertical: 16, borderRadius: 30, backgroundColor: COLORS.primary, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
          >
            {busy === 'accept' ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
                {countered ? `Accept ${tzs(offer)} instead` : `Accept ${tzs(offer)}`}
              </Text>
            )}
          </TouchableOpacity>

          {/* Or the driver's own price */}
          <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>
            {countered ? 'CHANGE YOUR PRICE' : 'OR OFFER YOUR PRICE'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {STEPS.map((step) => {
              const value = round100(offer + step);
              const active = price === value;
              const tooHigh = value > maxPrice;
              return (
                <TouchableOpacity
                  key={step}
                  disabled={tooHigh || !!busy}
                  onPress={() => pickStep(step)}
                  activeOpacity={0.85}
                  style={{ flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 2, borderColor: active ? COLORS.navy : COLORS.border, backgroundColor: active ? '#EEF2FF' : COLORS.white, opacity: tooHigh ? 0.4 : 1 }}
                >
                  <Text style={{ color: active ? COLORS.navy : COLORS.textPrimary, fontWeight: '800' }}>+{step.toLocaleString('en-US')}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{value.toLocaleString('en-US')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {price != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <TouchableOpacity onPress={() => nudge(-500)} disabled={price <= minCounter} activeOpacity={0.8}
                style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', opacity: price <= minCounter ? 0.4 : 1 }}>
                <Ionicons name="remove" size={22} color={COLORS.navy} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendPrice}
                disabled={!!busy}
                activeOpacity={0.85}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 26, backgroundColor: COLORS.navy, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
              >
                {busy === 'counter' ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15 }}>Send {tzs(price)}</Text>
                    <Text style={{ color: '#C7CFEA', fontSize: 11 }}>you earn {tzs(price * DRIVER_SHARE)}</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => nudge(500)} disabled={price >= maxPrice} activeOpacity={0.8}
                style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', opacity: price >= maxPrice ? 0.4 : 1 }}>
                <Ionicons name="add" size={22} color={COLORS.navy} />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {countered && (
              <TouchableOpacity onPress={() => onTimeout(ride.id)} activeOpacity={0.85}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 26, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' }}>
                <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>Keep waiting</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => onDecline(ride.id)} disabled={!!busy} activeOpacity={0.85}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 26, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' }}>
              <Text style={{ color: countered ? COLORS.danger : COLORS.textPrimary, fontWeight: '700' }}>{countered ? 'Withdraw my price' : 'Decline'}</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
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
