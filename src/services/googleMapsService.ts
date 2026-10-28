import { GOOGLE_MAPS_API_KEY, MAP_CONFIG } from '../config/maps';
import { GPSPoint } from '../types';

export interface GeocodingResult {
  formattedAddress: string;
  neighborhood?: string;
  locality?: string; // City
  adminArea?: string; // State / Region
  country?: string;
}

export class GoogleMapsService {
  /**
   * Reverse geocodes coordinates to a human-readable location name
   * using the Google Maps Geocoding API.
   */
  static async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<GeocodingResult | null> {
    if (!GOOGLE_MAPS_API_KEY) return null;

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return null;
      }

      const first = data.results[0];
      const components: any[] = first.address_components || [];

      let neighborhood: string | undefined;
      let locality: string | undefined;
      let adminArea: string | undefined;
      let country: string | undefined;

      for (const comp of components) {
        const types: string[] = comp.types || [];
        if (types.includes('neighborhood') || types.includes('sublocality')) {
          neighborhood = comp.long_name;
        } else if (types.includes('locality')) {
          locality = comp.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          adminArea = comp.short_name;
        } else if (types.includes('country')) {
          country = comp.long_name;
        }
      }

      return {
        formattedAddress: first.formatted_address,
        neighborhood,
        locality,
        adminArea,
        country,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Generates a descriptive activity title based on geocoded location.
   * Example: "Morning Run — Central Park, New York"
   */
  static async generateActivityTitle(
    sportLabel: string,
    latitude: number,
    longitude: number
  ): Promise<string> {
    const geo = await this.reverseGeocode(latitude, longitude);
    const timeOfDay = this.getTimeOfDay();

    if (!geo) {
      return `${timeOfDay} ${sportLabel}`;
    }

    const place = geo.neighborhood || geo.locality || geo.adminArea;
    if (place) {
      return `${timeOfDay} ${sportLabel} — ${place}`;
    }

    return `${timeOfDay} ${sportLabel}`;
  }

  /**
   * Generates a Google Static Maps snapshot URL for route cards and summaries.
   */
  static getStaticRouteMapUrl(
    coordinates: GPSPoint[],
    options?: {
      width?: number;
      height?: number;
      pathColor?: string; // 0xRRGGBBFF
      scale?: number;
    }
  ): string | null {
    if (!GOOGLE_MAPS_API_KEY || !coordinates || coordinates.length < 2) {
      return null;
    }

    const width = options?.width || 600;
    const height = options?.height || 320;
    const pathColor = options?.pathColor || '0xfc5200ff'; // Strava Orange
    const scale = options?.scale || 2;

    // Downsample points if there are too many (URL length limits)
    const sampled = this.downsampleCoordinates(coordinates, 40);

    const pathString = sampled
      .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
      .join('|');

    const startPt = sampled[0];
    const endPt = sampled[sampled.length - 1];

    const markers = [
      `markers=color:green|label:S|${startPt.latitude.toFixed(5)},${startPt.longitude.toFixed(5)}`,
      `markers=color:orange|label:F|${endPt.latitude.toFixed(5)},${endPt.longitude.toFixed(5)}`,
    ].join('&');

    return (
      `https://maps.googleapis.com/maps/api/staticmap?` +
      `size=${width}x${height}` +
      `&scale=${scale}` +
      `&maptype=roadmap` +
      `&path=color:${pathColor}|weight:5|${pathString}` +
      `&${markers}` +
      `&key=${GOOGLE_MAPS_API_KEY}`
    );
  }

  private static getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 21) return 'Evening';
    return 'Night';
  }

  private static downsampleCoordinates(points: GPSPoint[], maxPoints: number): GPSPoint[] {
    if (points.length <= maxPoints) return points;
    const step = (points.length - 1) / (maxPoints - 1);
    const result: GPSPoint[] = [];
    for (let i = 0; i < maxPoints; i++) {
      const index = Math.round(i * step);
      result.push(points[index]);
    }
    return result;
  }
}
