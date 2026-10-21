import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Colors } from '../theme/colors';
import {
  Flame,
  Zap,
  TrendingUp,
  Plus,
  Footprints,
  Camera,
  Dumbbell,
  Droplets,
} from 'lucide-react-native';
import AvfitLogo from '../components/common/AvfitLogo';

export default function DashboardScreen({ navigation }: any) {
  const [waterMl, setWaterMl] = useState(1750);
  const streakDays = 11;

  const addWater = () => {
    setWaterMl((prev) => Math.min(prev + 250, 2500));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Top Header Row with Official AVFIT Logo */}
        <View style={styles.topHeader}>
          {/* User Avatar with soft halo */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarEmoji}>🏃‍♀️</Text>
            </View>
          </View>

          {/* Official AVFIT Brand Logo Badge */}
          <View style={styles.brandBadgePill}>
            <AvfitLogo size={28} showWordmark={true} />
          </View>

          {/* Quick Action Button */}
          <TouchableOpacity
            style={styles.circleActionButton}
            onPress={() => navigation.navigate('FoodScanner')}
          >
            <Zap size={18} color="#00A6FF" />
          </TouchableOpacity>
        </View>

        {/* Greeting & Streak Row (Matching Reference) */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greetingTitle}>Hey, Michelle</Text>
            <Text style={styles.greetingSubtitle}>Welcome, 11-week. Keep keep going!</Text>
          </View>
          <View style={styles.streakPill}>
            <Flame size={16} color={Colors.accentOrange} fill={Colors.accentOrange} />
            <Text style={styles.streakNumber}>{streakDays}</Text>
          </View>
        </View>

        {/* Hero Visual Card / Illustrated Centerpiece */}
        <View style={styles.heroArtCard}>
          <View style={styles.botanicalLeafLeft}>
            <Text style={{ fontSize: 36 }}>🌿</Text>
          </View>
          <View style={styles.heroCenterGraphic}>
            <View style={styles.athleteBadge}>
              <Text style={{ fontSize: 56 }}>🧘‍♀️</Text>
            </View>
            <View style={styles.heroFloatingBadge}>
              <Text style={styles.heroBadgeText}>⚡ Target 85% Reached</Text>
            </View>
          </View>
          <View style={styles.botanicalLeafRight}>
            <Text style={{ fontSize: 36 }}>🍃</Text>
          </View>
        </View>

        {/* Active Stats Card (Exact Match to Reference Screen 1) */}
        <View style={styles.activeStatsCard}>
          <View style={styles.activeStatsHeader}>
            <View style={styles.activeStatsTitleRow}>
              <Zap size={16} color={Colors.primary} />
              <Text style={styles.activeStatsTitle}>Active Stats</Text>
            </View>
            <TouchableOpacity
              style={styles.miniPlusButton}
              onPress={() => navigation.navigate('Activity')}
            >
              <Plus size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.metricsSplitRow}>
            {/* Left metric: 450 kcal Duration */}
            <View style={styles.metricColumn}>
              <View style={styles.metricNumberRow}>
                <Text style={styles.metricBigNumber}>450</Text>
                <Text style={styles.metricUnit}>kcal</Text>
              </View>
              <Text style={styles.metricLabel}>Duration</Text>
            </View>

            {/* Subtle Vertical Divider */}
            <View style={styles.verticalDivider} />

            {/* Right metric: 72 min Workouts */}
            <View style={styles.metricColumn}>
              <View style={styles.metricNumberRow}>
                <Text style={styles.metricBigNumber}>72</Text>
                <Text style={styles.metricUnit}>min</Text>
              </View>
              <Text style={styles.metricLabel}>Workouts</Text>
            </View>
          </View>
        </View>

        {/* Today's Goals & Quick Actions */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Today's Goals</Text>
          <TouchableOpacity
            style={styles.addGoalBtn}
            onPress={() => navigation.navigate('Workouts')}
          >
            <Plus size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Goal 1: Gym Workout */}
        <TouchableOpacity
          style={styles.goalCard}
          onPress={() => navigation.navigate('Workouts')}
        >
          <View style={[styles.goalIconBox, { backgroundColor: '#E8F1EC' }]}>
            <Dumbbell size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.goalTitle}>Morning Full Body Stretch</Text>
            <Text style={styles.goalMeta}>20-30 min per day • Mobility</Text>
          </View>
          <View style={styles.statusCompletedPill}>
            <Text style={styles.statusCompletedText}>Complete</Text>
          </View>
        </TouchableOpacity>

        {/* Goal 2: Food & Nutrition AI Scan */}
        <TouchableOpacity
          style={styles.goalCard}
          onPress={() => navigation.navigate('FoodScanner')}
        >
          <View style={[styles.goalIconBox, { backgroundColor: '#FDF1EC' }]}>
            <Camera size={18} color={Colors.accentOrange} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.goalTitle}>AI Food Macro Log</Text>
            <Text style={styles.goalMeta}>Lunch scanned • 540 kcal logged</Text>
          </View>
          <View style={styles.statusProgressPill}>
            <Text style={styles.statusProgressText}>In Progress</Text>
          </View>
        </TouchableOpacity>

        {/* Goal 3: Hydration */}
        <TouchableOpacity style={styles.goalCard} onPress={addWater}>
          <View style={[styles.goalIconBox, { backgroundColor: '#E6F0FA' }]}>
            <Droplets size={18} color="#2A75A0" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.goalTitle}>Hydration Target</Text>
            <Text style={styles.goalMeta}>{(waterMl / 1000).toFixed(2)}L / 2.5L • Tap +250ml</Text>
          </View>
          <View style={[styles.statusCompletedPill, { backgroundColor: '#E6F0FA' }]}>
            <Text style={[styles.statusCompletedText, { color: '#2A75A0' }]}>+ Add</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 90, // Space for floating bottom navbar
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EAE1D3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F7F0E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 20,
  },
  brandBadgePill: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  calorieBurnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  burnIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calorieBurnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  circleActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F3E5D8',
    gap: 6,
    shadowColor: Colors.accentOrange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  streakNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  heroArtCard: {
    backgroundColor: '#F3EDE2',
    borderRadius: 28,
    height: 170,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  botanicalLeafLeft: {
    position: 'absolute',
    left: -6,
    top: 10,
    opacity: 0.8,
  },
  botanicalLeafRight: {
    position: 'absolute',
    right: -6,
    bottom: 10,
    opacity: 0.8,
  },
  heroCenterGraphic: {
    alignItems: 'center',
  },
  athleteBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF60',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroFloatingBadge: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  activeStatsCard: {
    backgroundColor: '#F7F2EA',
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EAE1D2',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  activeStatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  activeStatsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeStatsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  miniPlusButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2D8C6',
  },
  metricsSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricColumn: {
    flex: 1,
    paddingHorizontal: 4,
  },
  metricNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  metricBigNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  metricUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#DFD5C2',
    marginHorizontal: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  addGoalBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  goalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
  },
  goalIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  goalMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusCompletedPill: {
    backgroundColor: '#E8F1EC',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusCompletedText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  statusProgressPill: {
    backgroundColor: '#FDF1EC',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusProgressText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accentOrange,
  },
});
