import React from 'react';
import { View } from 'react-native';
import InbuiltRouteMap from '../../../components/map/InbuiltRouteMap';
import { WalkingPoint } from '../types';

interface LiveWalkingMapProps {
  currentLocation: WalkingPoint | null;
  routeCoordinates: WalkingPoint[];
  isTracking: boolean;
  status: string;
  onRecenter?: () => void;
  height?: number | string;
}

export const LiveWalkingMap: React.FC<LiveWalkingMapProps> = ({
  currentLocation,
  routeCoordinates,
  isTracking,
  height = '100%',
}) => (
  <View style={{ width: '100%', height: height as any }}>
    <InbuiltRouteMap
      routePoints={routeCoordinates.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude ?? undefined,
        timestamp: point.timestamp,
        speed: point.speed ?? undefined,
        accuracy: point.accuracy,
      }))}
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
  </View>
);
