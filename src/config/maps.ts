import Config from 'react-native-config';

/**
 * Google Maps Configuration for AVFIT Outdoor Activity Tracking
 */
export const GOOGLE_MAPS_API_KEY = Config.AVFIT_GOOGLE_MAPS_API_KEY || '';

export const MAP_CONFIG = {
  defaultLatitude: 37.7749,
  defaultLongitude: -122.4194,
  defaultZoom: 17,
  defaultDelta: 0.005,
  polylineColor: '#FC5200', // Strava Athletic Orange
  polylineWidth: 5,
};
