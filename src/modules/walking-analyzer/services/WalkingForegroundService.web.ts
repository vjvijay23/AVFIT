import { WalkingPoint, WalkingTelemetry, WalkingSummary, TrackerStatus, BackgroundServiceOptions } from '../types';
import { filterAndComputeIncrementalDistance, formatElapsedSeconds, formatDistance, computePaceSecondsPerKm, formatPace, DEFAULT_FILTER_CONFIG } from './HaversineCalculator';

type TelemetryListener = (telemetry: WalkingTelemetry) => void;

class WalkingForegroundServiceManager {
  private status: TrackerStatus = 'idle';
  private subscription: number | null = null;
  private listeners = new Set<TelemetryListener>();
  private routeCoordinates: WalkingPoint[] = [];
  private lastValidPoint: WalkingPoint | null = null;
  private totalDistanceMeters = 0;
  private startTimestamp = 0;
  private totalPausedDurationMs = 0;
  private pauseStartTimestamp: number | null = null;
  private currentSpeedMps: number | null = null;
  private currentAccuracy: number | null = null;
  private pointsRejected = 0;
  private maxSpeedMps = 0;

  getStatus(): TrackerStatus { return this.status; }

  subscribe(listener: TelemetryListener) {
    this.listeners.add(listener);
    listener(this.getTelemetrySnapshot());
    return () => this.listeners.delete(listener);
  }

  getTelemetrySnapshot(): WalkingTelemetry {
    const now = this.status === 'paused' && this.pauseStartTimestamp ? this.pauseStartTimestamp : Date.now();
    const elapsedSeconds = this.startTimestamp ? Math.max(0, Math.floor((now - this.startTimestamp - this.totalPausedDurationMs) / 1000)) : 0;
    const pace = computePaceSecondsPerKm(this.totalDistanceMeters, elapsedSeconds);
    const current = this.routeCoordinates[this.routeCoordinates.length - 1] || null;
    return {
      currentLocation: current,
      routeCoordinates: [...this.routeCoordinates],
      totalDistanceMeters: Math.round(this.totalDistanceMeters * 10) / 10,
      totalDistanceKm: Math.round(this.totalDistanceMeters / 10) / 100,
      elapsedSeconds,
      livePaceSecPerKm: pace,
      avgPaceSecPerKm: pace,
      formattedTime: formatElapsedSeconds(elapsedSeconds),
      formattedDistance: formatDistance(this.totalDistanceMeters),
      formattedPace: formatPace(pace),
      gpsAccuracy: this.currentAccuracy,
      currentSpeedMps: this.currentSpeedMps,
      pointsRecorded: this.routeCoordinates.length,
      pointsRejected: this.pointsRejected,
    };
  }

  async startTracking(_options?: Partial<BackgroundServiceOptions>) {
    if (this.status === 'tracking' || this.status === 'starting') return;
    this.status = 'starting';
    this.routeCoordinates = [];
    this.lastValidPoint = null;
    this.totalDistanceMeters = 0;
    this.totalPausedDurationMs = 0;
    this.pauseStartTimestamp = null;
    this.pointsRejected = 0;
    this.maxSpeedMps = 0;
    if (!navigator.geolocation) throw new Error('Location is not available in this browser.');
    this.startTimestamp = Date.now();
    this.subscription = navigator.geolocation.watchPosition(
      (location) => this.onLocation(location),
      (error) => { this.status = 'error'; this.emit(); console.warn('GPS update error:', error.message); },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    this.status = 'tracking';
    this.emit();
  }

  private onLocation(location: GeolocationPosition) {
    if (this.status !== 'tracking') return;
    const point: WalkingPoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude,
      accuracy: location.coords.accuracy ?? 999,
      speed: location.coords.speed,
      heading: location.coords.heading,
      timestamp: location.timestamp || Date.now(),
    };
    this.currentAccuracy = point.accuracy;
    this.currentSpeedMps = point.speed;
    if (point.speed && point.speed > this.maxSpeedMps) this.maxSpeedMps = point.speed;
    const filter = filterAndComputeIncrementalDistance(this.lastValidPoint, point, DEFAULT_FILTER_CONFIG);
    if (filter.accepted) {
      this.totalDistanceMeters += filter.incrementalDistanceMeters;
      this.lastValidPoint = point;
      this.routeCoordinates.push(point);
    } else this.pointsRejected++;
    this.emit();
  }

  async pauseTracking() {
    if (this.status !== 'tracking') return;
    this.status = 'paused';
    this.pauseStartTimestamp = Date.now();
    this.emit();
  }

  async resumeTracking() {
    if (this.status !== 'paused') return;
    if (this.pauseStartTimestamp) this.totalPausedDurationMs += Date.now() - this.pauseStartTimestamp;
    this.pauseStartTimestamp = null;
    this.status = 'tracking';
    this.emit();
  }

  async finishTracking(): Promise<WalkingSummary> {
    const snapshot = this.getTelemetrySnapshot();
    if (this.subscription !== null) navigator.geolocation.clearWatch(this.subscription);
    this.subscription = null;
    this.status = 'finished';
    const endTime = Date.now();
    const activeDurationSeconds = snapshot.elapsedSeconds;
    const avgPaceSecPerKm = computePaceSecondsPerKm(this.totalDistanceMeters, activeDurationSeconds);
    const avgSpeedKmh = activeDurationSeconds > 0 ? this.totalDistanceMeters / 1000 / (activeDurationSeconds / 3600) : 0;
    this.emit();
    return {
      sessionTitle: `Walk — ${new Date(this.startTimestamp).toLocaleDateString()}`,
      startTime: this.startTimestamp,
      endTime,
      totalDurationSeconds: Math.max(1, Math.floor((endTime - this.startTimestamp) / 1000)),
      activeDurationSeconds,
      totalDistanceMeters: Math.round(this.totalDistanceMeters),
      totalDistanceKm: snapshot.totalDistanceKm,
      avgPaceSecPerKm,
      formattedAvgPace: formatPace(avgPaceSecPerKm),
      maxSpeedKmh: this.maxSpeedMps * 3.6,
      avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
      estimatedCaloriesBurned: Math.max(1, Math.round(3.8 * 70 * activeDurationSeconds / 3600)),
      routeCoordinates: [...this.routeCoordinates],
    };
  }

  private emit() {
    const telemetry = this.getTelemetrySnapshot();
    this.listeners.forEach((listener) => listener(telemetry));
  }
}

export const WalkingForegroundService = new WalkingForegroundServiceManager();
