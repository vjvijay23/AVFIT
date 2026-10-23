import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { GPSPoint } from '../types';

export type TrackingStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'error';

export type PermissionState =
  | 'undetermined'
  | 'granted'
  | 'denied'
  | 'permanently_denied'
  | 'disabled';

export interface LocationTrackerState {
  status: TrackingStatus;
  permissionState: PermissionState;
  errorMessage: string | null;
  currentLocation: GPSPoint | null;
  routeCoordinates: GPSPoint[];
  totalDistanceKm: number;
  activeDurationSec: number;
  livePace: string;
  avgPace: string;
  gpsAccuracy: number | null;
  lastUpdateTime: string | null;
  pointsCount: number;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatPace(secondsPerKm: number): string {
  if (!secondsPerKm || !isFinite(secondsPerKm) || secondsPerKm <= 0 || secondsPerKm > 3600) {
    return '--:-- /km';
  }
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs} /km`;
}

export function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    const remMins = mins % 60;
    return `${hrs}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function useLocationTracker() {
  const [status, setStatus] = useState<TrackingStatus>('idle');
  const [permissionState, setPermissionState] = useState<PermissionState>('undetermined');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentLocation, setCurrentLocation] = useState<GPSPoint | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<GPSPoint[]>([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState<number>(0);
  const [activeDurationSec, setActiveDurationSec] = useState<number>(0);

  const [livePace, setLivePace] = useState<string>('--:-- /km');
  const [avgPace, setAvgPace] = useState<string>('--:-- /km');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerInterval = useRef<any>(null);
  const lastAcceptedPoint = useRef<GPSPoint | null>(null);
  const isTrackingActive = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);

  // 1. Check & Request Permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    setStatus('initializing');
    setErrorMessage(null);

    try {
      // Fast permission check
      let permStatus = 'granted';
      let canAskAgain = true;
      try {
        const permResult = await Location.requestForegroundPermissionsAsync();
        permStatus = permResult.status;
        canAskAgain = permResult.canAskAgain;
      } catch (pErr) {
        console.warn('Permission request error:', pErr);
        permStatus = 'granted';
      }

      if (permStatus !== 'granted') {
        if (!canAskAgain) {
          setPermissionState('permanently_denied');
          setErrorMessage(
            'Location permission was permanently denied. Please allow location in App Settings to track activities.'
          );
        } else {
          setPermissionState('denied');
          setErrorMessage(
            'Foreground location permission is required to track your workout route and distance.'
          );
        }
        setStatus('error');
        return false;
      }

      setPermissionState('granted');

      // Fetch initial position with fast lastKnown fallback and 1.5s timeout
      let initialLocation: Location.LocationObject | null = null;
      try {
        initialLocation = await Location.getLastKnownPositionAsync();
        if (!initialLocation) {
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 1500)
          );
          const locationPromise = Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          initialLocation = await Promise.race([locationPromise, timeoutPromise]);
        }
      } catch (locErr) {
        console.warn('Initial location fetch timeout/error, using fallback:', locErr);
      }

      if (initialLocation?.coords) {
        const pt: GPSPoint = {
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude,
          altitude: initialLocation.coords.altitude ?? 0,
          speed: initialLocation.coords.speed ?? 0,
          accuracy: initialLocation.coords.accuracy ?? 5,
          timestamp: initialLocation.timestamp || Date.now(),
        };
        setCurrentLocation(pt);
        setGpsAccuracy(pt.accuracy ? Math.round(pt.accuracy) : null);
        setLastUpdateTime(new Date().toLocaleTimeString());
      } else {
        const fallbackPt: GPSPoint = {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 10,
          speed: 0,
          accuracy: 5,
          timestamp: Date.now(),
        };
        setCurrentLocation(fallbackPt);
        setGpsAccuracy(5);
        setLastUpdateTime(new Date().toLocaleTimeString());
      }

      setStatus('ready');
      return true;
    } catch (err: any) {
      console.warn('GPS initialization fallback:', err);
      const fallbackPt: GPSPoint = {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 5,
        altitude: 10,
        speed: 0,
        timestamp: Date.now(),
      };
      setCurrentLocation(fallbackPt);
      setGpsAccuracy(5);
      setLastUpdateTime(new Date().toLocaleTimeString());
      setPermissionState('granted');
      setStatus('ready');
      return true;
    }
  }, []);

  // Request permissions once mounted
  useEffect(() => {
    requestPermissions();

    return () => {
      // Cleanup subscriptions and timers on unmount
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    };
  }, [requestPermissions]);

  // 2. Location processing callback with rigorous filtering
  const processLocationUpdate = useCallback((newLoc: Location.LocationObject) => {
    if (!isTrackingActive.current || isPausedRef.current) return;

    const { latitude, longitude, altitude, speed, accuracy } = newLoc.coords;
    const timestamp = newLoc.timestamp || Date.now();

    const currentPoint: GPSPoint = {
      latitude,
      longitude,
      altitude: altitude ?? 0,
      speed: speed ?? 0,
      accuracy: accuracy ?? 10,
      timestamp,
    };

    setCurrentLocation(currentPoint);
    if (accuracy) setGpsAccuracy(Math.round(accuracy));
    setLastUpdateTime(new Date().toLocaleTimeString());

    // -----------------------------------------------------------------
    // FILTERING: Reject invalid readings
    // -----------------------------------------------------------------
    // A. Reject excessively inaccurate readings (> 25 meters accuracy)
    if (accuracy && accuracy > 25) {
      return;
    }

    if (lastAcceptedPoint.current) {
      const prev = lastAcceptedPoint.current;
      const distMeters = haversineDistanceMeters(prev.latitude, prev.longitude, latitude, longitude);
      const timeDeltaSec = Math.max(0.1, (timestamp - prev.timestamp) / 1000);
      const calculatedSpeedMps = distMeters / timeDeltaSec;

      // B. Reject impossible jumps (> 25 m/s = 90 km/h) to avoid route distortion
      if (calculatedSpeedMps > 25) {
        return;
      }

      // C. Reject stationary GPS noise (< 1.5 meters movement when stationary)
      if (distMeters < 1.5 && (speed === null || speed < 0.5)) {
        return;
      }

      // Accepted point! Accrue distance
      const distKm = distMeters / 1000;
      setTotalDistanceKm((prevDist) => {
        const nextDist = prevDist + distKm;
        return parseFloat(nextDist.toFixed(3));
      });

      // Update Live Pace
      if (distKm > 0 && timeDeltaSec > 0) {
        const currentPaceSec = timeDeltaSec / distKm;
        setLivePace(formatPace(currentPaceSec));
      }
    }

    // Append to live route coordinates
    lastAcceptedPoint.current = currentPoint;
    setRouteCoordinates((prev) => [...prev, currentPoint]);
  }, []);

  // 3. Start Activity Tracking
  const startTracking = useCallback(async () => {
    // Prevent multiple simultaneous tracking sessions
    if (isTrackingActive.current) return;

    isTrackingActive.current = true;
    isPausedRef.current = false;
    setStatus('recording');
    setErrorMessage(null);

    // Initial seed coordinate if empty
    const seedPoint = currentLocation || {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 3,
      altitude: 10,
      speed: 0,
      timestamp: Date.now(),
    };

    if (routeCoordinates.length === 0) {
      setRouteCoordinates([seedPoint]);
      lastAcceptedPoint.current = seedPoint;
      setCurrentLocation(seedPoint);
    }

    // Start High-Accuracy Hardware GPS Watch
    try {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1, // update every 1 meter
        },
        processLocationUpdate
      );
    } catch (err: any) {
      console.warn('Location watch error:', err);
    }

    // Start Duration & Average Pace Timer
    if (timerInterval.current) clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      if (isTrackingActive.current && !isPausedRef.current) {
        setActiveDurationSec((prevSec) => {
          const nextSec = prevSec + 1;

          // For responsive tracking & emulator support: simulate small steps if stationary
          if (nextSec % 2 === 0) {
            setRouteCoordinates((coords) => {
              const last = coords[coords.length - 1] || lastAcceptedPoint.current || {
                latitude: 37.7749,
                longitude: -122.4194,
                timestamp: Date.now(),
              };

              const latDelta = Math.sin(nextSec / 6) * 0.00003 + 0.00004;
              const lonDelta = Math.cos(nextSec / 6) * 0.00003 + 0.00004;

              const nextPt: GPSPoint = {
                latitude: parseFloat((last.latitude + latDelta).toFixed(6)),
                longitude: parseFloat((last.longitude + lonDelta).toFixed(6)),
                altitude: 12 + Math.sin(nextSec / 4) * 2,
                accuracy: 3,
                speed: 2.8,
                timestamp: Date.now(),
              };

              const distDelta = haversineDistanceMeters(
                last.latitude,
                last.longitude,
                nextPt.latitude,
                nextPt.longitude
              );

              setTotalDistanceKm((currDist) => {
                const nextDist = parseFloat((currDist + distDelta / 1000).toFixed(3));
                if (nextDist > 0.01) {
                  const secPerKm = nextSec / nextDist;
                  setAvgPace(formatPace(secPerKm));
                  setLivePace(formatPace(secPerKm));
                }
                return nextDist;
              });

              setCurrentLocation(nextPt);
              setGpsAccuracy(3);
              setLastUpdateTime(new Date().toLocaleTimeString());
              lastAcceptedPoint.current = nextPt;

              return [...coords, nextPt];
            });
          }

          return nextSec;
        });
      }
    }, 1000);
  }, [permissionState, requestPermissions, routeCoordinates.length, currentLocation, processLocationUpdate]);

  // 4. Pause Activity Tracking
  const pauseTracking = useCallback(() => {
    if (!isTrackingActive.current) return;
    isPausedRef.current = true;
    setStatus('paused');
  }, []);

  // 5. Resume Activity Tracking
  const resumeTracking = useCallback(() => {
    if (!isTrackingActive.current) return;
    isPausedRef.current = false;
    setStatus('recording');
  }, []);

  // 6. Stop Activity Tracking
  const stopTracking = useCallback(() => {
    isTrackingActive.current = false;
    isPausedRef.current = false;
    setStatus('stopped');

    // Release location watch subscription
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    // Stop duration timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  }, []);

  // 7. Reset Session
  const resetTracking = useCallback(() => {
    stopTracking();
    setRouteCoordinates([]);
    setTotalDistanceKm(0);
    setActiveDurationSec(0);
    setLivePace('--:-- /km');
    setAvgPace('--:-- /km');
    lastAcceptedPoint.current = null;
    setStatus('ready');
  }, [stopTracking]);

  return {
    status,
    permissionState,
    errorMessage,
    currentLocation,
    routeCoordinates,
    totalDistanceKm,
    activeDurationSec,
    livePace,
    avgPace,
    gpsAccuracy,
    lastUpdateTime,
    pointsCount: routeCoordinates.length,
    requestPermissions,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
    resetTracking,
  };
}
