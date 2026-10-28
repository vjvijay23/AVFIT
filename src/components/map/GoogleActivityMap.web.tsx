import React from 'react';
import { View } from 'react-native';
import InbuiltRouteMap from './InbuiltRouteMap';
import { GPSPoint } from '../../types';

interface GoogleActivityMapProps {
  currentLocation: GPSPoint | null;
  routeCoordinates: GPSPoint[];
  isTracking: boolean;
  status: string;
  onRecenter?: () => void;
  height?: number | string;
}

export default function GoogleActivityMap({
  currentLocation,
  routeCoordinates,
  isTracking,
  height = '100%',
}: GoogleActivityMapProps) {
  return (
    <View style={{ width: '100%', height: height as any }}>
      <InbuiltRouteMap
        routePoints={routeCoordinates}
        currentLocation={currentLocation}
        isLiveTracking={isTracking}
        height={typeof height === 'number' ? height : 260}
      />
    </View>
  );
}
