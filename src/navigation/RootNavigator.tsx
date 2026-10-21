import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors } from '../theme/colors';
import {
  Home,
  Footprints,
  Camera,
  Heart,
  Users,
} from 'lucide-react-native';

import DashboardScreen from '../screens/DashboardScreen';
import ActivityTrackerScreen from '../screens/ActivityTrackerScreen';
import FoodScannerScreen from '../screens/FoodScannerScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import CommunityScreen from '../screens/CommunityScreen';

const Tab = createBottomTabNavigator();

export default function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.floatingPillTabBar,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#6F7771',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Home
                size={focused ? 20 : 18}
                color={focused ? Colors.primary : '#6F7771'}
                fill={focused ? Colors.primary : 'transparent'}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityTrackerScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Footprints
                size={focused ? 20 : 18}
                color={focused ? Colors.primary : '#6F7771'}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="FoodScanner"
        component={FoodScannerScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Camera
                size={focused ? 20 : 18}
                color={focused ? Colors.primary : '#6F7771'}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Workouts"
        component={WorkoutScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Heart
                size={focused ? 20 : 18}
                color={focused ? Colors.primary : '#6F7771'}
                fill={focused ? Colors.primary : 'transparent'}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconBox, focused && styles.activeTabBadge]}>
              <Users
                size={focused ? 20 : 18}
                color={focused ? Colors.primary : '#6F7771'}
              />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  floatingPillTabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 24,
    right: 24,
    backgroundColor: '#161A17', // Dark Charcoal Dock matching reference
    borderRadius: 36,
    height: 64,
    borderTopWidth: 0,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabBadge: {
    backgroundColor: '#FFFFFF', // White circular highlight badge matching reference
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
});
