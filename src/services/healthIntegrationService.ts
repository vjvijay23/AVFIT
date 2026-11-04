import { Platform } from 'react-native';
import type { SportType } from '../types';
import { SecureStorage } from './secureStorage';

export type DailyHealthSummary = {
  steps: number;
  distanceMeters: number;
  activeCalories: number;
};

const HEALTH_CONNECT_PROVIDER = 'com.google.android.apps.healthdata';
const HEALTH_CONNECT_PERMISSIONS = [
  { accessType: 'read' as const, recordType: 'Steps' as const },
  { accessType: 'read' as const, recordType: 'Distance' as const },
  { accessType: 'read' as const, recordType: 'ActiveCaloriesBurned' as const },
  { accessType: 'write' as const, recordType: 'ExerciseSession' as const },
  { accessType: 'write' as const, recordType: 'Distance' as const },
  { accessType: 'write' as const, recordType: 'ActiveCaloriesBurned' as const },
];
const HEALTH_DISCONNECTED_KEY = 'avfit_health_connection_disabled';

const getHealthConnect = () => require('react-native-health-connect') as typeof import('react-native-health-connect');
type AppleHealthKitModule = import('react-native-health').AppleHealthKit;
const getAppleHealth = () => require('react-native-health') as AppleHealthKitModule;

function callbackResult<T>(register: (callback: (error: any, value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => register((error, value) => error ? reject(new Error(String(error))) : resolve(value)));
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { startTime: start.toISOString(), endTime: new Date().toISOString() };
}

export class HealthIntegrationService {
  static isSupported(): boolean {
    return Platform.OS === 'android' || Platform.OS === 'ios';
  }

  static async connect(): Promise<void> {
    await SecureStorage.deleteItemAsync(HEALTH_DISCONNECTED_KEY).catch(() => undefined);
    if (Platform.OS === 'android') {
      const health = getHealthConnect();
      const sdkStatus = await health.getSdkStatus(HEALTH_CONNECT_PROVIDER);
      if (sdkStatus !== health.SdkAvailabilityStatus.SDK_AVAILABLE) {
        throw new Error('Health Connect is unavailable. Install or update Health Connect on this phone, then try again.');
      }
      const initialized = await health.initialize(HEALTH_CONNECT_PROVIDER);
      if (!initialized) throw new Error('Health Connect could not be initialized on this device.');
      const granted = await health.requestPermission(HEALTH_CONNECT_PERMISSIONS);
      if (!granted.some((permission) => permission.recordType === 'Steps' && permission.accessType === 'read') &&
          !granted.some((permission) => permission.recordType === 'ExerciseSession' && permission.accessType === 'write')) {
        throw new Error('No Health Connect permissions were granted. Allow at least read steps or write workouts to connect.');
      }
      return;
    }

    if (Platform.OS === 'ios') {
      const health = getAppleHealth();
      const available = await callbackResult<boolean>((callback) => health.isAvailable(callback));
      if (!available) throw new Error('Apple Health is not available on this device.');
      await callbackResult((callback) => health.initHealthKit({
        permissions: {
          read: [health.Constants.Permissions.StepCount, health.Constants.Permissions.DistanceWalkingRunning, health.Constants.Permissions.ActiveEnergyBurned],
          write: [health.Constants.Permissions.Workout],
        },
      }, callback));
      return;
    }

    throw new Error('Health data connections are available in the Android and iOS mobile apps.');
  }

  static async isConnected(): Promise<boolean> {
    try {
      if ((await SecureStorage.getItemAsync(HEALTH_DISCONNECTED_KEY)) === 'true') return false;
      if (Platform.OS === 'android') {
        const health = getHealthConnect();
        if (!(await health.initialize(HEALTH_CONNECT_PROVIDER))) return false;
        const permissions = await health.getGrantedPermissions();
        return permissions.some((permission) =>
          (permission.recordType === 'Steps' && permission.accessType === 'read') ||
          (permission.recordType === 'ExerciseSession' && permission.accessType === 'write'),
        );
      }
      if (Platform.OS === 'ios') {
        const health = getAppleHealth();
        const result = await callbackResult<any>((callback) => health.getAuthStatus({
          permissions: { read: [], write: [health.Constants.Permissions.Workout] },
        }, callback));
        // HealthKit reports SharingAuthorized as status code 2.
        return result?.permissions?.write?.[0] === 2;
      }
    } catch {
      return false;
    }
    return false;
  }

  static async disconnect(): Promise<void> {
    if (Platform.OS === 'android') {
      const health = getHealthConnect();
      if (await health.initialize(HEALTH_CONNECT_PROVIDER)) await health.revokeAllPermissions();
    }
    // HealthKit does not expose an API to revoke permissions programmatically.
    // AVFIT stops reading it here; iOS users can also revoke access in Health > Apps > AVFIT.
    await SecureStorage.setItemAsync(HEALTH_DISCONNECTED_KEY, 'true');
  }

  static async getDailySummary(): Promise<DailyHealthSummary> {
    if (Platform.OS === 'android') {
      const health = getHealthConnect();
      const initialized = await health.initialize(HEALTH_CONNECT_PROVIDER);
      if (!initialized) throw new Error('Connect Health Connect first.');
      const timeRangeFilter = { operator: 'between' as const, ...todayRange() };
      const [steps, distance, calories] = await Promise.all([
        health.aggregateRecord<'Steps'>({ recordType: 'Steps', timeRangeFilter }).catch(() => null),
        health.aggregateRecord<'Distance'>({ recordType: 'Distance', timeRangeFilter }).catch(() => null),
        health.aggregateRecord<'ActiveCaloriesBurned'>({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }).catch(() => null),
      ]);
      return {
        steps: steps?.COUNT_TOTAL || 0,
        distanceMeters: distance?.DISTANCE?.inMeters || 0,
        activeCalories: Math.round(calories?.ACTIVE_CALORIES_TOTAL?.inKilocalories || 0),
      };
    }

    if (Platform.OS === 'ios') {
      const health = getAppleHealth();
      const { startTime, endTime } = todayRange();
      const [steps, distance, energy] = await Promise.all([
        callbackResult<any>((callback) => health.getStepCount({ date: endTime, startDate: startTime }, callback)),
        callbackResult<any>((callback) => health.getDistanceWalkingRunning({ startDate: startTime, endDate: endTime, unit: health.Constants.Units.meter }, callback)),
        callbackResult<any[]>((callback) => health.getActiveEnergyBurned({ startDate: startTime, endDate: endTime, unit: health.Constants.Units.kilocalorie }, callback)),
      ]);
      return {
        steps: Math.round(steps?.value || 0),
        distanceMeters: Math.round(distance?.value || 0),
        activeCalories: Math.round((energy || []).reduce((sum, item) => sum + (item.value || 0), 0)),
      };
    }

    throw new Error('Health data is supported on Android and iOS devices.');
  }

  static async writeWorkout(workout: {
    activityId?: string;
    sportType: SportType;
    title: string;
    startTime: string;
    endTime: string;
    distanceKm: number;
    caloriesBurned: number;
  }): Promise<void> {
    if (Platform.OS === 'android') {
      const health = getHealthConnect();
      const initialized = await health.initialize(HEALTH_CONNECT_PROVIDER);
      if (!initialized) return;
      const granted = await health.getGrantedPermissions();
      const hasExerciseWrite = granted.some((permission) => permission.recordType === 'ExerciseSession' && permission.accessType === 'write');
      if (!hasExerciseWrite) return;

      const typeBySport: Record<SportType, number> = {
        running: health.ExerciseType.RUNNING,
        cycling: health.ExerciseType.BIKING,
        walking: health.ExerciseType.WALKING,
        hiking: health.ExerciseType.HIKING,
        weight_training: health.ExerciseType.WEIGHTLIFTING,
      };
      const records: any[] = [{
        recordType: 'ExerciseSession',
        exerciseType: typeBySport[workout.sportType],
        title: workout.title,
        startTime: workout.startTime,
        endTime: workout.endTime,
        metadata: workout.activityId ? { clientRecordId: `avfit-${workout.activityId}` } : undefined,
      }];
      if (workout.distanceKm > 0 && granted.some((permission) => permission.recordType === 'Distance' && permission.accessType === 'write')) {
        records.push({ recordType: 'Distance', distance: { value: workout.distanceKm * 1000, unit: 'meters' }, startTime: workout.startTime, endTime: workout.endTime });
      }
      if (workout.caloriesBurned > 0 && granted.some((permission) => permission.recordType === 'ActiveCaloriesBurned' && permission.accessType === 'write')) {
        records.push({ recordType: 'ActiveCaloriesBurned', energy: { value: workout.caloriesBurned, unit: 'kilocalories' }, startTime: workout.startTime, endTime: workout.endTime });
      }
      await health.insertRecords(records);
      return;
    }

    if (Platform.OS === 'ios') {
      const health = getAppleHealth();
      const activityBySport: Record<SportType, string> = {
        running: 'Running', cycling: 'Cycling', walking: 'Walking', hiking: 'Hiking', weight_training: 'TraditionalStrengthTraining',
      };
      await callbackResult((callback) => health.saveWorkout({
        type: activityBySport[workout.sportType],
        startDate: workout.startTime,
        endDate: workout.endTime,
        energyBurned: workout.caloriesBurned,
        energyBurnedUnit: 'kilocalorie',
        distance: workout.distanceKm * 1000,
        distanceUnit: 'meter',
        metadata: workout.activityId ? { AVFITActivityID: workout.activityId } : undefined,
      } as any, callback));
    }
  }
}
