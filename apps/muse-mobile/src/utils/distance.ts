type Coordinates = {
  lat: number;
  lng: number;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

export function distanceKm(a: Coordinates, b: Coordinates) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const haversine =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusKm * c;
}

export function formatDistanceKm(value: number) {
  if (!Number.isFinite(value)) return "";
  if (value < 1) return "<1 km away";
  if (value < 10) return `${value.toFixed(1)} km away`;
  return `${Math.round(value)} km away`;
}
