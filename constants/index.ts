// ─── One Delivery Driver — Design Tokens & Domain Constants ───────────────────
// Brand: "One Delivery" · Slogan: "From Anywhere To You"

export const COLORS = {
  primary: '#F97316', // One Delivery orange
  primaryDark: '#EA580C',
  navy: '#283A7A', // One Delivery navy
  navyDark: '#1E2B5C',
  background: '#FFFFFF',
  surface: '#F4F5F7',
  surfaceAlt: '#EEF0F4',
  border: '#E4E7EC',
  textPrimary: '#1A1D29',
  textSecondary: '#475467',
  textMuted: '#667085',
  textDim: '#98A2B3',
  success: '#16A34A',
  successBg: '#DCFCE7',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  white: '#FFFFFF',
  black: '#000000',
};

export const BRAND = {
  name: 'One Delivery',
  driverName: 'One Delivery Driver',
  slogan: 'From Anywhere To You',
  tagline: 'Drive with One Delivery. Earn on your schedule.',
};

// Vehicle types — MUST match backend ENUM('bodaboda','bajaj','pickup','toyo')
export const VEHICLE_TYPES = [
  { id: 'bodaboda', label: 'Bodaboda', subtitle: 'Motorcycle · fast', emoji: '🏍️' },
  { id: 'bajaj', label: 'Bajaj', subtitle: '3-wheel · affordable', emoji: '🛺' },
  { id: 'toyo', label: 'Toyo', subtitle: 'Toyota Hilux / similar', emoji: '🚙' },
  { id: 'pickup', label: 'Pickup / Carry', subtitle: 'Large & heavy items', emoji: '🚛' },
] as const;

export type VehicleTypeId = (typeof VEHICLE_TYPES)[number]['id'];

// Maps "What kind of vehicle do you have?" Bolt-style label → backend type
export const VEHICLE_KIND_OPTIONS = [
  { label: 'Motorbike', value: 'bodaboda' },
  { label: 'Bajaj', value: 'bajaj' },
  { label: 'Car', value: 'toyo' },
  { label: 'Pickup', value: 'pickup' },
];

export const MOBILE_MONEY_NETWORKS = ['VODACOM MM', 'AIRTEL MM', 'YAS (TIGO)', 'HALOTEL'];

// Delivery lifecycle (matches backend ride_requests.status transitions)
export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; next?: string; nextLabel?: string; hint?: string }
> = {
  accepted: {
    label: 'Heading to pickup',
    color: '#2563EB',
    next: 'going_to_shop',
    nextLabel: 'Arrived at pickup',
    hint: 'Drive to the pickup point',
  },
  going_to_shop: {
    label: 'At pickup location',
    color: '#7C3AED',
    next: 'picked_up',
    nextLabel: 'Order picked up',
    hint: 'Collect the order from the shop',
  },
  picked_up: {
    label: 'Order collected',
    color: '#F59E0B',
    next: 'on_the_way',
    nextLabel: 'Start delivery',
    hint: 'Head to the customer',
  },
  on_the_way: {
    label: 'On the way to customer',
    color: '#F97316',
    next: 'delivered',
    nextLabel: 'Mark as delivered',
    hint: 'Deliver to the drop-off point',
  },
  delivered: { label: 'Delivered', color: '#16A34A' },
  cancelled: { label: 'Cancelled', color: '#DC2626' },
};

export const ACTIVE_STATUSES = ['accepted', 'going_to_shop', 'picked_up', 'on_the_way'];

// Dar es Salaam default region
export const DEFAULT_REGION = {
  latitude: -6.7924,
  longitude: 39.2083,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

// Clean light Google Maps style (Bolt-like)
export const LIGHT_MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
