import * as Location from "expo-location";
import { UserLocation } from "../types/models";

type LocationSnapshot =
  | {
      status: "granted";
      location: UserLocation | null;
      city: string | null;
    }
  | {
      status: "denied";
    };

const buildCityLabel = (place: Location.LocationGeocodedAddress | undefined) => {
  if (!place) return null;
  const parts = [place.city, place.subregion, place.region].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

export async function getLocationSnapshot(): Promise<LocationSnapshot> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return { status: "denied" };
  }
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    const now = Date.now();
    const location: UserLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      updatedAt: now
    };
    let city: string | null = null;
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });
      city = buildCityLabel(places?.[0]);
    } catch {
      city = null;
    }
    return { status: "granted", location, city };
  } catch {
    return { status: "granted", location: null, city: null };
  }
}
