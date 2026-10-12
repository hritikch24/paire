import * as Location from "expo-location";
import { UserLocation } from "../types/models";

export type LocationResult =
  | { status: "granted"; location: UserLocation; city: string | null }
  | { status: "denied" }
  | { status: "unavailable" };

/**
 * Rounds to two decimals (~1 km). Paire only ever stores approximate location,
 * and the app only requests the approximate-location permission.
 */
export function approximate(latitude: number, longitude: number): UserLocation {
  return {
    lat: Math.round(latitude * 100) / 100,
    lng: Math.round(longitude * 100) / 100,
    updatedAt: Date.now()
  };
}

async function readPosition(): Promise<UserLocation | null> {
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return approximate(position.coords.latitude, position.coords.longitude);
  } catch {
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    return last ? approximate(last.coords.latitude, last.coords.longitude) : null;
  }
}

async function cityFor(location: UserLocation): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: location.lat, longitude: location.lng });
    return place?.city || place?.subregion || place?.region || null;
  } catch {
    return null;
  }
}

/** Asks for permission if needed, then reads an approximate position and city. */
export async function requestApproximateLocation(): Promise<LocationResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") return { status: "denied" };
  const location = await readPosition();
  if (!location) return { status: "unavailable" };
  return { status: "granted", location, city: await cityFor(location) };
}

/** Reads a position only if permission was already granted (never prompts). */
export async function currentApproximateLocation(): Promise<UserLocation | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") return null;
  return readPosition();
}
