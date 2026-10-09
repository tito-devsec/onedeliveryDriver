// ─── Types matching the OneDelivery backend API ──────────────────────────────

export type Role = 'customer' | 'seller' | 'driver' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  profile_image?: string;
  created_at?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  message?: string;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface DriverApplication {
  id: string;
  user_id: string;
  vehicle_type: 'bodaboda' | 'bajaj' | 'pickup' | 'toyo';
  plate_number: string;
  vehicle_color: string;
  vehicle_model: string;
  license_number: string;
  id_document_url: string;
  license_document_url: string;
  vehicle_photo_url: string;
  status: ApplicationStatus;
  rejection_reason: string;
  reviewed_at: string | null;
  created_at: string;
}

export interface DriverProfile {
  id: string;
  user_id: string;
  vehicle_type: 'bodaboda' | 'bajaj' | 'pickup' | 'toyo';
  plate_number: string;
  vehicle_color: string;
  vehicle_model: string;
  license_number: string;
  is_approved: number; // 0 | 1
  is_online: number; // 0 | 1
  current_lat: number | null;
  current_lng: number | null;
  heading: number;
  rating: number;
  total_trips: number;
  total_earnings: number;
  balance: number;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  mobile_money_number: string;
  created_at: string;
}

export type RideStatus =
  | 'searching'
  | 'accepted'
  | 'going_to_shop'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'
  | 'no_driver';

export interface RideRequest {
  id: string;
  customer_id: string;
  driver_id: string | null;
  order_id: string | null;
  vehicle_type: string;
  status: RideStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  fare: number;
  distance_km: number;
  customer_name?: string;
  customer_image?: string;
  customer_phone?: string;
  driver_lat?: number;
  driver_lng?: number;
  shop_name?: string | null;
  shop_phone?: string | null;
  earning?: number;
  delivery_fee_paid?: number | boolean;
  payment_method?: PaymentMethod;
  cash_to_collect?: number; // what to collect at the door: the agreed price unless paid in the app
  suggested_fare?: number | null;
  offered_fare?: number | null;
  route_distance_m?: number | null;
  route_duration_s?: number | null;
  created_at: string;
}

export type PaymentMethod = 'mobile' | 'cash';

// A delivery offered to this driver (nearest drivers get it first). `fare` is the
// customer's offer; the driver accepts it or answers with their own price (counter).
export interface RideOffer {
  id: string;
  vehicle_type: string;
  status: RideStatus;
  fare: number;
  earning: number;
  suggested_fare: number;
  payment_method: PaymentMethod;
  offer_status: 'offered' | 'countered';
  my_counter: number | null;
  my_counter_earning: number | null;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  shop_name: string | null;
  customer_name: string | null;
  distance_km: number;
  trip_km: number;
  trip_min: number | null;
  pickup_distance_km: number | null;
  pickup_eta_min: number | null;
  delivery_fee_paid: boolean;
  created_at: string;
}

// GET /rides/:id/route — the whole trip and the live leg from the driver's position
export interface RideRoute {
  status: RideStatus;
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
  trip: { polyline: string; distanceMeters: number | null; durationSeconds: number | null } | null;
  driver: { lat: number; lng: number; heading: number; at: number | null } | null;
  leg: {
    leg: 'to_pickup' | 'to_dropoff';
    polyline: string | null;
    version: number | null;
    remainingMeters: number;
    etaSeconds: number;
    estimated: boolean;
    steps?: RouteStep[];
  } | null;
}

// One turn-by-turn step (Google Routes API); the instruction is the manoeuvre at its start
export interface RouteStep {
  maneuver: string;
  text: string;
  distanceMeters: number;
  start: { lat: number; lng: number } | null;
  end: { lat: number; lng: number } | null;
}

// Socket "ride:progress" — sent after every GPS fix during a delivery
export interface RideProgress {
  rideId: string;
  lat: number;
  lng: number;
  heading: number;
  status: RideStatus;
  leg: 'to_pickup' | 'to_dropoff' | null;
  etaSeconds: number | null;
  remainingMeters: number | null;
  routeVersion: number | null;
}

export interface EarningEntry {
  id: string;
  driver_id: string;
  ride_id: string | null;
  amount: number;
  type: 'delivery' | 'bonus' | 'adjustment';
  description: string;
  created_at: string;
}

export interface EarningsSummary {
  balance: number;
  totalEarnings: number;
  totalTrips: number;
  earnings: EarningEntry[];
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  data: string;
  is_read: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  body: string;
  is_read: number;
  created_at: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}
