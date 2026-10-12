import { LatLng } from "../types";

const EARTH_RADIUS_KM = 6371;
const toRadians = (value: number) => (value * Math.PI) / 180;

export function isValidLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Snap a position to a ~1.1 km grid before it is stored in the discovery index.
 * Distances shown to other people are computed from this coarse point, which
 * bounds what anyone can learn (e.g. via trilateration) to the grid cell.
 */
export function coarsen(point: LatLng): LatLng {
  return {
    lat: Math.round(point.lat * 100) / 100,
    lng: Math.round(point.lng * 100) / 100
  };
}

/** Whole kilometres, never below 1, so exact proximity is not revealed. */
export function displayDistanceKm(km: number): number {
  return Math.max(1, Math.round(km));
}
