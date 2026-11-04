import { useThemeStyles } from '../theme/ThemeContext';
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../theme/colors';
import {
  Home,
  Activity,
  Dumbbell,
  ScanLine,
  Utensils,
} from 'lucide-react-native';

// Tab Screens (Original Core Features)
import DashboardScreen from '../screens/DashboardScreen';
import ActivityTrackerScreen from '../screens/ActivityTrackerScreen';
import FoodScannerScreen from '../screens/FoodScannerScreen';
import CommunityScreen from '../screens/CommunityScreen';

// Auth, Onboarding & Extra Feature Screens
import AuthWelcomeScreen from '../screens/auth/AuthWelcomeScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SetPinScreen from '../screens/auth/SetPinScreen';
import PhoneAuthScreen from '../screens/auth/PhoneAuthScreen';
import OtpVerificationScreen from '../screens/auth/OtpVerificationScreen';
import FitnessOnboardingScreen from '../screens/onboarding/FitnessOnboardingScreen';
import AchievementsScreen from '../screens/achievements/AchievementsScreen';
import ProfileEditScreen from '../screens/profile/ProfileEditScreen';
import DietPlanScreen from '../screens/DietPlanScreen';
import RecordActivityScreen from '../screens/activity/RecordActivityScreen';
import ActivitySummaryScreen from '../screens/activity/ActivitySummaryScreen';
import { LiveWalkingAnalyzerScreen } from '../modules/walking-analyzer';
import GymWorkoutScreen from '../screens/activity/GymWorkoutScreen';
import GymWorkoutDetailScreen from '../screens/activity/GymWorkoutDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarStyle: [
          styles.floatingPillTabBar,
          { bottom: Math.max(insets.bottom, 14) },
        ],
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
                <Home
                size={focused ? 21 : 19}
                color={focused ? Colors.primary : Colors.textMuted}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityTrackerScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Activity
                size={focused ? 21 : 19}
                color={focused ? Colors.primary : Colors.textMuted}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
          tabBarLabel: 'Move',
        }}
      />
      <Tab.Screen
        name="Gym"
        component={ActivityTrackerScreen}
        initialParams={{ initialSport: 'weight_training', gymOnly: true }}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Dumbbell
                size={focused ? 21 : 19}
                color={focused ? Colors.primary : Colors.textMuted}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
          tabBarLabel: 'Train',
        }}
      />
      <Tab.Screen
        name="FoodScanner"
        component={FoodScannerScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <ScanLine
                size={focused ? 21 : 19}
                color={focused ? Colors.primary : Colors.textMuted}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
          tabBarLabel: 'Scan',
        }}
      />
      <Tab.Screen
        name="Diet"
        component={DietPlanScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Utensils
                size={focused ? 21 : 19}
                color={focused ? Colors.primary : Colors.textMuted}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
          tabBarLabel: 'Nutrition',
        }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator({ initialRouteName = 'AuthWelcome' }: { initialRouteName?: 'AuthWelcome' | 'Main' }) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      {/* Auth Entry & Gateway */}
      <Stack.Screen name="AuthWelcome" component={AuthWelcomeScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SetPin" component={SetPinScreen} />

      {/* Phone Auth & OTP Verification */}
      <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
      <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />

      {/* Fitness Onboarding Wizard */}
      <Stack.Screen name="FitnessOnboarding" component={FitnessOnboardingScreen} />

      {/* Primary Tab App (Supporting both 'Main' and 'Dashboard') */}
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Dashboard" component={MainTabs} />

      {/* Extra GPS Outdoor Tracker & Summary */}
      <Stack.Screen name="RecordActivity" component={RecordActivityScreen} />
      <Stack.Screen name="Record" component={RecordActivityScreen} />
      <Stack.Screen name="ActivitySummary" component={ActivitySummaryScreen} />
      <Stack.Screen name="GymWorkout" component={GymWorkoutScreen} />
      <Stack.Screen name="GymWorkoutDetail" component={GymWorkoutDetailScreen} />
      <Stack.Screen name="Community" component={CommunityScreen} />

      {/* Strava-grade Live Walking Analyzer (Screen-off Foreground Service) */}
      <Stack.Screen name="LiveWalkingAnalyzer" component={LiveWalkingAnalyzerScreen} />
      <Stack.Screen name="WalkingAnalyzer" component={LiveWalkingAnalyzerScreen} />

      {/* Gamified Achievements & Trophy Room */}
      <Stack.Screen name="Achievements" component={AchievementsScreen} />

      {/* Fitness Profile & Target Editor */}
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
      <Stack.Screen name="DietPlan" component={DietPlanScreen} />

      {/* Historical Activity Tracker */}
      <Stack.Screen name="ActivityHistory" component={ActivityTrackerScreen} />
    </Stack.Navigator>
  );
}

const createStyles = () => ({
  floatingPillTabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 20,
    right: 20,
    backgroundColor: Colors.navbarBackground,
    borderRadius: 25,
    height: 76,
    borderTopWidth: 0,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    paddingHorizontal: 5,
    paddingTop: 6,
    paddingBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBox: {
    width: 37,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabBadge: {
    backgroundColor: Colors.navbarActiveBadge,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  tabBarItem: { paddingTop: 3 },
  tabBarLabel: { fontSize: 9, fontWeight: '800', marginTop: 2, marginBottom: 2 },
});
