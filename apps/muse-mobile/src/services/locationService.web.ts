import type { UserLocation } from "../types/models";

export type LocationResult = { status: "granted"; location: UserLocation; city: null } | { status: "denied" | "unavailable" };
export function approximate(latitude: number, longitude: number): UserLocation {
  return { lat: Math.round(latitude * 100) / 100, lng: Math.round(longitude * 100) / 100, updatedAt: Date.now() };
}

/** A finite wait, approximate precision, and no address lookup sent to another provider. */
async function readPosition(): Promise<LocationResult> {
  if (!window.isSecureContext || !navigator.geolocation) return { status: "unavailable" };
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ status: "granted", location: approximate(position.coords.latitude, position.coords.longitude), city: null }),
    (error) => resolve({ status: error.code === 1 ? "denied" : "unavailable" }),
    { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 12_000 }
  ));
}

/** Called only from Use location or Refresh; the browser owns the permission prompt. */
export const requestApproximateLocation = readPosition;
/** A foreground refresh never prompts again after one-time permission expires. */
export async function currentApproximateLocation(): Promise<UserLocation | null> {
  try {
    if (!navigator.permissions || (await navigator.permissions.query({ name: "geolocation" })).state !== "granted") return null;
    const result = await readPosition();
    return result.status === "granted" ? result.location : null;
  } catch { return null; }
}
