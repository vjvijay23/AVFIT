import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Navigation, Crosshair } from 'lucide-react-native';
import { WalkingPoint } from '../types';
import InbuiltRouteMap from '../../../components/map/InbuiltRouteMap';
import { sampleRouteForRendering } from '../../../utils/routeRendering';

interface LiveWalkingMapProps {
  currentLocation: WalkingPoint | null;
  routeCoordinates: WalkingPoint[];
  isTracking: boolean;
  status: string;
  onRecenter?: () => void;
  height?: number | string;
}

const STRAVA_ORANGE = '#FC5200';

export const LiveWalkingMap: React.FC<LiveWalkingMapProps> = ({
  currentLocation,
  routeCoordinates,
  isTracking,
  status,
  onRecenter,
  height = '100%',
}) => {
  const mapRef = useRef<MapView | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [useRouteMapFallback, setUseRouteMapFallback] = useState(false);
  const renderRouteCoordinates = useMemo(() => sampleRouteForRendering(routeCoordinates), [routeCoordinates]);
  const mapPolylineCoordinates = useMemo(
    () => renderRouteCoordinates.map(({ latitude, longitude }) => ({ latitude, longitude })),
    [renderRouteCoordinates],
  );
  const fallbackRoutePoints = useMemo(() => renderRouteCoordinates.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    altitude: point.altitude ?? undefined,
    timestamp: point.timestamp,
    speed: point.speed ?? undefined,
    accuracy: point.accuracy,
  })), [renderRouteCoordinates]);

  useEffect(() => {
    if (mapLoaded || useRouteMapFallback) return;
    const timeout = setTimeout(() => setUseRouteMapFallback(true), 7000);
    return () => clearTimeout(timeout);
  }, [mapLoaded, useRouteMapFallback]);

  // Initial map center
  const initialRegion: Region = {
    latitude:
      currentLocation?.latitude ||
      (routeCoordinates.length > 0 ? routeCoordinates[0].latitude : 37.7749),
    longitude:
      currentLocation?.longitude ||
      (routeCoordinates.length > 0 ? routeCoordinates[0].longitude : -122.4194),
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  };

  // Follow user movement smoothly when autoFollow is enabled
  useEffect(() => {
    if (mapRef.current && currentLocation && autoFollow) {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          zoom: 17,
        },
        { duration: 500 }
      );
    }
  }, [currentLocation, autoFollow]);

  const handleRecenter = useCallback(() => {
    setAutoFollow(true);
    if (mapRef.current && currentLocation) {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          zoom: 17.5,
        },
        { duration: 400 }
      );
    }
    onRecenter?.();
  }, [currentLocation, onRecenter]);

  if (useRouteMapFallback) {
    return (
      <View style={[styles.container, { height: height as any }]}>
        <InbuiltRouteMap
          routePoints={fallbackRoutePoints}
          currentLocation={currentLocation ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            altitude: currentLocation.altitude ?? undefined,
            timestamp: currentLocation.timestamp,
            speed: currentLocation.speed ?? undefined,
            accuracy: currentLocation.accuracy,
          } : null}
          isLiveTracking={isTracking}
          height={typeof height === 'number' ? height : 260}
        />
        <View style={styles.fallbackNotice}>
          <Text style={styles.fallbackNoticeText}>Map fallback • actual GPS points only</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: height as any }]}>
      {/* GPS Acquisition Loading State */}
      {(!currentLocation || status === 'starting') && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={STRAVA_ORANGE} />
          <Text style={styles.loadingTitle}>Connecting to GPS Satellites...</Text>
          <Text style={styles.loadingSubtitle}>
            Stand outdoors with a clear line-of-sight to the sky for high precision
          </Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation={false} // Custom Strava beacon rendered below
        showsCompass={true}
        showsScale={true}
        showsMyLocationButton={false}
        onMapReady={() => setMapLoaded(true)}
        onMapLoaded={() => setMapLoaded(true)}
        onTouchStart={() => setAutoFollow(false)}
      >
        {/* Strava Orange Live Polyline */}
        {renderRouteCoordinates.length > 1 && (
          <Polyline
            coordinates={mapPolylineCoordinates}
            strokeColor={STRAVA_ORANGE}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Start Position Pin */}
        {renderRouteCoordinates.length > 0 && (
          <Marker
            coordinate={{
              latitude: renderRouteCoordinates[0].latitude,
              longitude: renderRouteCoordinates[0].longitude,
            }}
            title="Start Point"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.startBadge}>
              <Text style={styles.startBadgeText}>START</Text>
            </View>
          </Marker>
        )}

        {/* Live User Position (Strava-style Orange Beacon) */}
        {currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            title="Current Location"
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
          >
            <View style={styles.beaconOuter}>
              <View style={styles.beaconHalo} />
              <View style={styles.beaconCore}>
                <View style={styles.beaconDot} />
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Floating Recenter Action Button */}
      <TouchableOpacity
        style={[styles.recenterButton, autoFollow && styles.recenterButtonActive]}
        onPress={handleRecenter}
        activeOpacity={0.85}
      >
        {autoFollow ? (
          <Crosshair size={20} color="#FFFFFF" />
        ) : (
          <Navigation size={20} color="#2D3748" />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    padding: 24,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
    marginTop: 14,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: '#718096',
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 280,
  },
  fallbackNotice: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  fallbackNoticeText: { color: '#334155', fontSize: 10, fontWeight: '700' },
  recenterButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recenterButtonActive: {
    backgroundColor: STRAVA_ORANGE,
    borderColor: STRAVA_ORANGE,
  },
  startBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  startBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  beaconOuter: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beaconHalo: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(252, 82, 0, 0.22)',
  },
  beaconCore: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  beaconDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: STRAVA_ORANGE,
  },
});
