export type VehicleType = 'bodaboda' | 'bajaj' | 'toyo' | 'pickup';

// Side views for cards and lists (96×64 at 1x)
const SIDE: Record<VehicleType, number> = {
  bodaboda: require('../assets/vehicles/side/bodaboda.png'),
  bajaj: require('../assets/vehicles/side/bajaj.png'),
  toyo: require('../assets/vehicles/side/toyo.png'),
  pickup: require('../assets/vehicles/side/pickup.png'),
};

// Top views for map markers, front pointing up (48×48 at 1x, rotate around the centre)
const TOP: Record<VehicleType, number> = {
  bodaboda: require('../assets/vehicles/top/bodaboda.png'),
  bajaj: require('../assets/vehicles/top/bajaj.png'),
  toyo: require('../assets/vehicles/top/toyo.png'),
  pickup: require('../assets/vehicles/top/pickup.png'),
};

const known = (type?: string | null): VehicleType =>
  type && type in SIDE ? (type as VehicleType) : 'bodaboda';

export const vehicleSideImage = (type?: string | null) => SIDE[known(type)];
export const vehicleTopImage = (type?: string | null) => TOP[known(type)];
