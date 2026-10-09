import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { COLORS, STATUS_CONFIG, LIGHT_MAP_STYLE, DEFAULT_REGION } from '../../constants';
import { get, put, post } from '../../lib/api';
import { connectSocket, subscribe } from '../../lib/socket';
import { isTracking, startTracking } from '../../lib/tracking';
import {
  bearingDegrees, decodePolyline, distanceMeters, fetchRideRoute, formatDistance, formatEta, openExternalNavigation,
} from '../../lib/directions';
import {
  bannerDistance, buildTrack, maneuverIcon, nextManeuver, remainingLine, snapToTrack, spokenDistance, spokenInstruction,
  type Guidance,
} from '../../lib/navigation';
import { isVoiceMuted, onVoiceMuted, say, setVoiceMuted, stopSpeaking } from '../../lib/voice';
import { useNavigationFix } from '../../hooks/useNavigationFix';
import VehicleMarker from '../../components/VehicleMarker';
import type { LatLng, RideProgress, RideRequest, RideRoute } from '../../types';

// Confirming "arrived" or "delivered" further than this from the stop asks first
const ARRIVE_RADIUS_M = 300;
// Close enough to announce the arrival
const ARRIVED_M = 45;
// Further than this from the route the server works out a new one
const REROUTE_M = 120;

const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const clockIn = (seconds: number) => {
  const d = new Date(Date.now() + seconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export default function Delivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);

  const [ride, setRide] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [route, setRoute] = useState<RideRoute | null>(null);
  const [progress, setProgress] = useState<{ etaSeconds: number | null; remainingMeters: number | null } | null>(null);
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(isVoiceMuted());
  const [notice, setNotice] = useState<string | null>(null);
  const routeVersion = useRef<number | null>(null);
  const spoken = useRef<Set<string>>(new Set());

  // A fix every second for the camera, the vehicle and the turn distances
  const fix = useNavigationFix(true);
  const here: LatLng | null = fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;

  useEffect(() => onVoiceMuted(setMuted), []);
  useEffect(() => () => stopSpeaking(), []);

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

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 7000);
  };

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

  // Live ETA from the server after every fix; status changes (customer cancels) and payment
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
    const offPaid = subscribe('ride:paid', (p: { rideId: string; fare: number }) => {
      if (p.rideId !== id) return;
      fetchRide();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      flash(`Paid in the app (${tzs(p.fare)}) — don't collect cash`);
      say('The customer paid in the app. Do not collect cash.');
    });
    return () => {
      offProgress();
      offStatus();
      offPaid();
    };
  }, [id, fetchRide, loadRoute]);

  const status = ride?.status;
  const beforePickup = ride ? ['accepted', 'going_to_shop'].includes(ride.status) : true;
  const atShop = status === 'going_to_shop';
  const pickup: LatLng | null = ride ? { latitude: Number(ride.pickup_lat), longitude: Number(ride.pickup_lng) } : null;
  const dropoff: LatLng | null = ride ? { latitude: Number(ride.dropoff_lat), longitude: Number(ride.dropoff_lng) } : null;
  const target = beforePickup ? pickup : dropoff;
  const destName = beforePickup ? ride?.shop_name || 'the shop' : "the customer's location";

  // Direction of travel: from the movement, or the GPS course when moving slowly
  const courseRef = useRef<{ at: LatLng | null; deg: number }>({ at: null, deg: 0 });
  const course = useMemo(() => {
    const c = courseRef.current;
    if (!here) return c.deg;
    if (!c.at) {
      c.at = here;
      if (fix && fix.heading >= 0) c.deg = fix.heading;
    } else if (distanceMeters(c.at, here) >= 3) {
      c.deg = bearingDegrees(c.at, here);
      c.at = here;
    } else if (fix && fix.heading >= 0 && (fix.speed ?? 0) > 2) {
      c.deg = fix.heading;
    }
    return c.deg;
  }, [fix?.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the driver is along the route, what's ahead, and the next turn
  const legPoints = useMemo(() => (route?.leg?.polyline ? decodePolyline(route.leg.polyline) : null), [route?.leg?.polyline]);
  const tripLine = useMemo(() => (route?.trip?.polyline ? decodePolyline(route.trip.polyline) : null), [route?.trip?.polyline]);
  const track = useMemo(() => (legPoints && legPoints.length > 1 ? buildTrack(legPoints) : null), [legPoints]);
  const alongRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    alongRef.current = undefined;
  }, [track]);
  const snap = useMemo(() => {
    if (!track || !here) return null;
    const s = snapToTrack(track, here, alongRef.current);
    if (s && s.offRoute < 80) alongRef.current = s.along;
    return s;
  }, [track, fix?.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps
  const rerouting = !!snap && snap.offRoute > REROUTE_M;
  const steps = route?.leg?.steps;
  const guidance: Guidance | null = useMemo(
    () => (track && snap && steps?.length && !rerouting ? nextManeuver(steps, track, snap.along, route?.leg?.version ?? '') : null),
    [track, snap?.along, steps, rerouting, route?.leg?.version] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const aheadLine = useMemo(
    () => (track && snap && !rerouting ? remainingLine(track, snap) : legPoints),
    [track, snap?.index, snap?.point.latitude, snap?.point.longitude, rerouting, legPoints] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const distToTarget = here && target ? distanceMeters(here, target) : null;
  const remainingM =
    track && snap && !rerouting ? Math.max(0, track.total - snap.along) : progress?.remainingMeters ?? distToTarget;

  // Navigation camera: behind the vehicle, tilted, turning with the road
  useEffect(() => {
    if (!follow || !here || !mapRef.current) return;
    const speed = fix?.speed ?? 0;
    const zoom = speed > 13 ? 16.6 : speed > 7 ? 17.1 : 17.6;
    mapRef.current.animateCamera({ center: here, heading: course, pitch: 55, zoom }, { duration: 900 });
  }, [follow, fix?.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spoken prompts: "In 300 metres, turn left onto …", then "Turn left onto …" just before
  useEffect(() => {
    if (!guidance || guidance.arrive || atShop) return;
    const speed = fix?.speed ?? 0;
    const near = Math.max(45, speed * 7);
    const key = guidance.stepKey;
    const instruction = spokenInstruction(guidance, destName);
    if (guidance.distance <= near) {
      if (spoken.current.has(`${key}:now`)) return;
      spoken.current.add(`${key}:now`).add(`${key}:soon`);
      const then = guidance.then && !guidance.then.text ? ', then you will arrive' : guidance.then ? `, then ${lowerFirst(guidance.then.text)}` : '';
      say(instruction + then);
    } else if (guidance.distance <= 450 && guidance.distance > near + 100) {
      if (spoken.current.has(`${key}:soon`)) return;
      spoken.current.add(`${key}:soon`);
      say(`In ${spokenDistance(guidance.distance)}, ${lowerFirst(instruction)}`);
    }
  }, [guidance?.stepKey, guidance ? Math.round(guidance.distance / 10) : -1]); // eslint-disable-line react-hooks/exhaustive-deps

  const arrived = distToTarget != null && distToTarget <= ARRIVED_M;
  useEffect(() => {
    if (!arrived || !status) return;
    const key = `arrive:${status}`;
    if (spoken.current.has(key)) return;
    spoken.current.add(key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    say(beforePickup ? `You have arrived at ${destName}` : 'You have arrived at the customer');
  }, [arrived, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const overview = () => {
    setFollow(false);
    const pts = [here, target, ...(aheadLine || [])].filter(Boolean) as LatLng[];
    if (pts.length >= 2) {
      mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 40, right: 50, bottom: 40, left: 50 }, animated: true });
    }
  };

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
        const cash = Number(ride.cash_to_collect ?? 0);
        Alert.alert(
          'Delivered',
          cash > 0
            ? `Great job! You collected ${tzs(cash)} in cash; the OneDelivery commission comes off your balance.`
            : 'Great job! Your earnings have been added to your balance.'
        );
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
        <TouchableOpacity onPress={finishLocally} activeOpacity={0.85} style={{ marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 26 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>Back to home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const cfg = STATUS_CONFIG[ride.status] || STATUS_CONFIG.accepted;
  const shopName = ride.shop_name || 'the shop';
  const stopTitle = beforePickup ? `Pick up at ${shopName}` : `Deliver to ${ride.customer_name || 'the customer'}`;
  const stopAddress = beforePickup ? ride.pickup_address || 'Pickup point' : ride.dropoff_address || 'Customer location';
  const etaSec = progress?.etaSeconds ?? null;
  const phone = beforePickup ? ride.shop_phone : ride.customer_phone;
  const feePaid = !!Number(ride.delivery_fee_paid);
  const cash = Number(ride.cash_to_collect ?? (feePaid ? 0 : ride.fare));
  const fare = Number(ride.fare || 0);
  const earning = Number(ride.earning ?? Math.round(fare * 0.85));
  const cardH = expanded ? 360 : 230;
  const mapPadding = follow
    ? { top: Math.round(screenH * 0.42), right: 0, bottom: cardH, left: 0 }
    : { top: insets.top + 150, right: 0, bottom: cardH, left: 0 };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        customMapStyle={LIGHT_MAP_STYLE}
        mapPadding={mapPadding}
        showsUserLocation={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPanDrag={() => follow && setFollow(false)}
        initialRegion={here ? { ...here, latitudeDelta: 0.01, longitudeDelta: 0.01 } : DEFAULT_REGION}
      >
        {/* Shop → customer, faint while heading to the shop */}
        {beforePickup && (tripLine ? (
          <Polyline coordinates={tripLine} strokeColor={COLORS.navy + '55'} strokeWidth={4} />
        ) : pickup && dropoff ? (
          <Polyline coordinates={[pickup, dropoff]} strokeColor={COLORS.navy + '55'} strokeWidth={3} lineDashPattern={[8, 6]} />
        ) : null)}
        {/* The road still ahead to the next stop */}
        {aheadLine && aheadLine.length > 1 ? (
          <>
            <Polyline coordinates={aheadLine} strokeColor={COLORS.navyDark} strokeWidth={11} zIndex={1} />
            <Polyline coordinates={aheadLine} strokeColor={COLORS.primary} strokeWidth={7} zIndex={2} />
          </>
        ) : here && target ? (
          <Polyline coordinates={[here, target]} strokeColor={COLORS.primary} strokeWidth={4} lineDashPattern={[10, 8]} />
        ) : null}

        {pickup && (
          <Marker coordinate={pickup} title={ride.shop_name || 'Pickup'} anchor={{ x: 0.5, y: 0.5 }} zIndex={5}>
            <View style={{ backgroundColor: COLORS.primary, padding: 7, borderRadius: 18, borderWidth: 2, borderColor: '#fff' }}>
              <Ionicons name="storefront" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {dropoff && (
          <Marker coordinate={dropoff} title="Customer" anchor={{ x: 0.5, y: 0.5 }} zIndex={5}>
            <View style={{ backgroundColor: COLORS.navy, padding: 7, borderRadius: 18, borderWidth: 2, borderColor: '#fff' }}>
              <Ionicons name="home" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {here && <VehicleMarker coordinate={here} heading={fix?.heading} vehicleType={ride.vehicle_type} zIndex={20} />}
      </MapView>

      {/* Turn-by-turn banner */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }}>
        <ManeuverBanner
          guidance={atShop ? null : guidance}
          rerouting={rerouting && !atShop}
          arrived={arrived}
          atShop={atShop}
          destName={destName}
          fallbackMeters={remainingM ?? null}
        />
        {!!guidance?.then && !atShop && !rerouting && (
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.navyDark, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 14 }}>
            <Text style={{ color: '#C7CFEA', fontWeight: '700', fontSize: 13 }}>Then</Text>
            <MaterialCommunityIcons name={maneuverIcon(guidance.then.maneuver) as any} size={20} color="#fff" />
          </View>
        )}

        {/* Map controls */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <RoundButton icon="arrow-back" onPress={() => router.replace('/(tabs)/home')} />
          <View style={{ gap: 10 }}>
            <RoundButton icon={muted ? 'volume-mute' : 'volume-high'} onPress={() => setVoiceMuted(!muted)} tint={muted ? COLORS.textDim : COLORS.navy} />
            <RoundButton icon={follow ? 'map-outline' : 'navigate'} onPress={() => (follow ? overview() : setFollow(true))} />
          </View>
        </View>
      </View>

      {!!notice && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: cardH + 64, backgroundColor: COLORS.success, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 8 }}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>{notice}</Text>
        </View>
      )}

      {!follow && (
        <TouchableOpacity
          onPress={() => setFollow(true)}
          activeOpacity={0.85}
          style={{ position: 'absolute', alignSelf: 'center', bottom: cardH + 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, elevation: 6 }}
        >
          <Ionicons name="navigate" size={18} color={COLORS.navy} />
          <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Re-centre</Text>
        </TouchableOpacity>
      )}

      {/* Bottom card */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 14, elevation: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14 }}>
        <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={10} style={{ alignItems: 'center', paddingBottom: 8 }}>
          <View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.border }} />
        </Pressable>

        {/* ETA */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: atShop ? COLORS.navy : COLORS.success }}>
              {atShop ? 'At the shop' : etaSec != null ? formatEta(etaSec) : remainingM != null ? formatDistance(remainingM) : 'Locating…'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontWeight: '600', marginTop: 1 }} numberOfLines={1}>
              {atShop
                ? 'Collect the order, then start the delivery'
                : `${remainingM != null ? formatDistance(remainingM) : ''}${etaSec != null ? ` · arrive ${clockIn(etaSec)}` : ''}${route?.leg?.estimated ? ' · approx.' : ''}`}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setExpanded((e) => !e)} activeOpacity={0.8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Ionicons name={beforePickup ? 'storefront' : 'home'} size={18} color={beforePickup ? COLORS.primary : COLORS.navy} />
          <Text style={{ flex: 1, color: COLORS.textPrimary, fontWeight: '800' }} numberOfLines={1}>
            {beforePickup ? '1/2 · ' : '2/2 · '}{stopTitle}
          </Text>
        </View>

        {/* Money at the door */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: cash > 0 ? COLORS.warningBg : COLORS.successBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons name={cash > 0 ? 'cash-outline' : 'checkmark-circle'} size={18} color={cash > 0 ? '#B45309' : COLORS.success} />
          <Text style={{ flex: 1, color: cash > 0 ? '#92400E' : '#166534', fontWeight: '700', fontSize: 13 }}>
            {cash > 0
              ? `${beforePickup ? 'At drop-off, collect' : 'Collect'} ${tzs(cash)} cash from the customer`
              : `Paid in the app (${tzs(fare)}) — don't collect cash`}
          </Text>
        </View>

        {expanded && (
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 10 }} numberOfLines={2}>{stopAddress}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => target && openExternalNavigation(target)}
                activeOpacity={0.85}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 22, paddingVertical: 12 }}
              >
                <Ionicons name="map" size={17} color={COLORS.navy} />
                <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Google Maps</Text>
              </TouchableOpacity>
              {!!phone && (
                <TouchableOpacity onPress={() => call(phone)} activeOpacity={0.85} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="call" size={20} color={COLORS.success} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={openChat} activeOpacity={0.85} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.navy} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 12 }}>
              Agreed price <Text style={{ color: COLORS.textPrimary, fontWeight: '800' }}>{tzs(fare)}</Text> · you earn{' '}
              <Text style={{ color: COLORS.success, fontWeight: '800' }}>{tzs(earning)}</Text>
            </Text>
          </View>
        )}

        {/* Advance status button */}
        {cfg.next && (
          <TouchableOpacity
            onPress={advance}
            disabled={updating}
            activeOpacity={0.85}
            style={{ backgroundColor: COLORS.primary, borderRadius: 28, paddingVertical: 16, alignItems: 'center', opacity: updating ? 0.6 : 1, marginTop: 14 }}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{cfg.nextLabel}</Text>
            )}
          </TouchableOpacity>
        )}
        {beforePickup && expanded && (
          <TouchableOpacity onPress={release} activeOpacity={0.7} style={{ alignItems: 'center', paddingTop: 12 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, textDecorationLine: 'underline' }}>Can't make it? Release this delivery</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ManeuverBanner({
  guidance,
  rerouting,
  arrived,
  atShop,
  destName,
  fallbackMeters,
}: {
  guidance: Guidance | null;
  rerouting: boolean;
  arrived: boolean;
  atShop: boolean;
  destName: string;
  fallbackMeters: number | null;
}) {
  let icon = 'navigation-variant';
  let big = fallbackMeters != null ? bannerDistance(fallbackMeters) : '';
  let line = `Head to ${destName}`;
  if (atShop) {
    icon = 'storefront';
    big = 'At the shop';
    line = 'Collect the order';
  } else if (arrived) {
    icon = 'map-marker-check';
    big = 'Arrived';
    line = destName.charAt(0).toUpperCase() + destName.slice(1);
  } else if (rerouting) {
    icon = 'sign-direction';
    big = 'Rerouting…';
    line = 'Finding a new way from here';
  } else if (guidance) {
    icon = maneuverIcon(guidance.arrive ? 'ARRIVE' : guidance.maneuver);
    big = bannerDistance(guidance.distance);
    line = guidance.arrive ? `Arrive at ${destName}` : guidance.text || 'Continue straight';
  }
  return (
    <View style={{ backgroundColor: arrived || atShop ? COLORS.success : COLORS.navy, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }}>
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: '#FFFFFF1F', alignItems: 'center', justifyContent: 'center' }}>
        {rerouting ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name={icon as any} size={38} color="#fff" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }} numberOfLines={1}>{big}</Text>
        <Text style={{ color: '#E4E8F7', fontSize: 15, fontWeight: '700', marginTop: 1 }} numberOfLines={2}>{line}</Text>
      </View>
    </View>
  );
}

function RoundButton({ icon, onPress, tint = COLORS.textPrimary }: { icon: any; onPress: () => void; tint?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ backgroundColor: '#fff', width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6 }}
    >
      <Ionicons name={icon} size={22} color={tint} />
    </TouchableOpacity>
  );
}
