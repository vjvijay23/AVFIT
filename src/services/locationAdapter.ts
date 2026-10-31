import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation, { type GeoPosition } from 'react-native-geolocation-service';

export type LocationPermission = { status: 'granted' | 'denied'; canAskAgain: boolean };
export type LocationSubscription = { remove: () => void };

export async function requestLocationPermission(): Promise<LocationPermission> {
  if (Platform.OS === 'web') return { status: 'granted', canAskAgain: true };
  // Android 12+ expects coarse and fine location to be requested together.
  // Requesting only fine can leave users in a denied state when they choose
  // approximate location in the system dialog.
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  const fine = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const coarse = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
  return {
    status: fine === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied',
    canAskAgain: fine !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN && coarse !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  };
}

export async function getLocationPermission(): Promise<LocationPermission> {
  if (Platform.OS === 'web') return { status: 'granted', canAskAgain: true };
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return { status: granted ? 'granted' : 'denied', canAskAgain: true };
}

export function getCurrentLocation(timeout: number, highAccuracy: boolean): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    const options = { enableHighAccuracy: highAccuracy, timeout, maximumAge: 0, showLocationDialog: true };
    if (Platform.OS === 'web') {
      if (!navigator.geolocation) return reject(new Error('Location is not available in this browser.'));
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position as unknown as GeoPosition),
        reject,
        { enableHighAccuracy: highAccuracy, timeout, maximumAge: 0 },
      );
      return;
    }
    Geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export function watchLocation(
  onPosition: (position: GeoPosition) => void,
  onError: (error: { message: string }) => void,
  highAccuracy = true,
  distanceFilter = 2,
  interval = 2000,
): LocationSubscription {
  if (Platform.OS === 'web') {
    const id = navigator.geolocation.watchPosition(
      (position) => onPosition(position as unknown as GeoPosition),
      onError,
      { enableHighAccuracy: highAccuracy, maximumAge: 0 },
    );
    return { remove: () => navigator.geolocation.clearWatch(id) };
  }
  const id = Geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: highAccuracy,
    distanceFilter,
    interval,
    fastestInterval: Math.max(500, Math.floor(interval / 2)),
    showLocationDialog: true,
    forceRequestLocation: true,
  });
  return { remove: () => Geolocation.clearWatch(id) };
}
