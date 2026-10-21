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
  TrendingUp,
  Zap,
  Footprints,
  Dumbbell,
  Heart,
  Trophy,
  Plus,
  Watch,
} from 'lucide-react-native';

export default function ActivityTrackerScreen({ navigation }: any) {
  const [selectedPeriod, setSelectedPeriod] = useState<'Day' | 'Week'>('Week');
  const [activeActivityTag, setActiveActivityTag] = useState('Gym');

  const stepBars = [
    { day: 'Sun', steps: '8,328', height: 85, isHighlight: false, isPending: false },
    { day: 'Mon', steps: '10,032', height: 110, isHighlight: false, isPending: false },
    { day: 'Tue', steps: '8,211', height: 80, isHighlight: false, isPending: false },
    { day: 'Wed', steps: '7,427', height: 95, isHighlight: true, isPending: false },
    { day: 'Thr', steps: '', height: 100, isHighlight: false, isPending: true },
    { day: 'Fri', steps: '', height: 100, isHighlight: false, isPending: true },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Top Header (Matching Reference Screen 2) */}
        <View style={styles.topHeader}>
          <View style={styles.avatarCircle}>
            <Text style={{ fontSize: 20 }}>🏃‍♀️</Text>
          </View>
          <View style={styles.calorieBurnPill}>
            <View style={styles.burnIconCircle}>
              <TrendingUp size={12} color="#FFFFFF" />
            </View>
            <Text style={styles.calorieBurnText}>124 kcal</Text>
          </View>
          <TouchableOpacity style={styles.circleActionButton}>
            <Zap size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Screen Title */}
        <Text style={styles.screenTitle}>Activity Summary</Text>

        {/* Walking Steps Card with Bar Graph (Exact Match to Reference Screen 2) */}
        <View style={styles.walkingStepsCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.walkingTitleRow}>
              <Footprints size={18} color={Colors.primary} />
              <Text style={styles.cardHeaderTitle}>Walking steps</Text>
            </View>
            <View style={styles.periodPill}>
              <Text style={styles.periodPillText}>Week</Text>
            </View>
          </View>

          {/* Bar Chart Container */}
          <View style={styles.chartArea}>
            {stepBars.map((item, idx) => (
              <View key={idx} style={styles.barColumn}>
                
                {/* Wednesday Highlight Tooltip Pill */}
                {item.isHighlight && (
                  <View style={styles.highlightTooltip}>
                    <Footprints size={10} color="#FFFFFF" />
                    <Text style={styles.tooltipText}>{item.steps}</Text>
                  </View>
                )}

                {/* Bar Element */}
                <View
                  style={[
                    styles.barBody,
                    { height: item.height },
                    item.isHighlight
                      ? styles.barHighlightOrange
                      : item.isPending
                      ? styles.barPendingDashed
                      : styles.barSolidGreen,
                  ]}
                >
                  {!item.isPending && !item.isHighlight && (
                    <View style={styles.barInnerContent}>
                      <Footprints size={9} color="#FFFFFF99" />
                      <Text style={styles.barNumberSmall}>{item.steps}</Text>
                    </View>
                  )}
                </View>

                {/* Day Label */}
                <Text
                  style={[
                    styles.dayLabel,
                    item.isHighlight && styles.dayLabelHighlight,
                  ]}
                >
                  {item.day}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Two-Column Cards: Sets & Heart Rate (Exact Match to Reference) */}
        <View style={styles.twoColumnGrid}>
          
          {/* Card Left: Sets & Duration */}
          <View style={styles.miniStatsCard}>
            <View style={styles.miniCardHeader}>
              <View style={[styles.miniIconBadge, { backgroundColor: '#E8F1EC' }]}>
                <Dumbbell size={16} color={Colors.primary} />
              </View>
              <Text style={styles.miniCardTitle}>Sets</Text>
            </View>

            <View style={styles.bigValRow}>
              <Text style={styles.bigValNumber}>7,3</Text>
              <Text style={styles.bigValSuffix}>k</Text>
            </View>
            <Text style={styles.miniCardSublabel}>Duration</Text>

            {/* Activity Category Pills */}
            <View style={styles.activityPillsRow}>
              {['Run', 'Gym', 'Walk'].map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.actPill,
                    activeActivityTag === tag && styles.actPillActive,
                  ]}
                  onPress={() => setActiveActivityTag(tag)}
                >
                  <Text
                    style={[
                      styles.actPillText,
                      activeActivityTag === tag && styles.actPillTextActive,
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.actPillPlus}>
                <Plus size={10} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Card Right: Heart Rate */}
          <View style={styles.miniStatsCard}>
            <View style={styles.miniCardHeader}>
              <View style={[styles.miniIconBadge, { backgroundColor: '#FDF1EC' }]}>
                <Watch size={16} color={Colors.accentOrange} />
              </View>
              <Text style={styles.miniCardTitle}>Heart rate</Text>
            </View>

            <View style={styles.bigValRow}>
              <Text style={styles.bigValNumber}>139</Text>
              <Text style={styles.bigValSuffixSmall}>bpm</Text>
            </View>
            <Text style={styles.miniCardSublabel}>Min • 128-162</Text>

            {/* Device Pill */}
            <View style={styles.devicePill}>
              <Text style={styles.devicePillText}>⌚ Device: Apple Watch...</Text>
            </View>
          </View>
        </View>

        {/* Today's Goals Section (Matching Reference) */}
        <View style={styles.goalsCard}>
          <View style={styles.goalsHeader}>
            <View style={styles.goalsTitleRow}>
              <Trophy size={18} color={Colors.primary} />
              <Text style={styles.goalsTitle}>Today's Goals</Text>
            </View>
            <TouchableOpacity style={styles.miniPlusButton}>
              <Plus size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Goal Item: Gym Workout */}
          <View style={styles.goalRow}>
            <View style={styles.goalIconGreen}>
              <Dumbbell size={16} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.goalItemTitle}>Gym Workout</Text>
              <Text style={styles.goalItemSub}>Upper Body + Core Strength</Text>
            </View>
            <View style={styles.completeBadge}>
              <Text style={styles.completeText}>Complete</Text>
            </View>
          </View>
        </View>

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
    paddingBottom: 90,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F7F0E4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  walkingStepsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  walkingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  periodPill: {
    backgroundColor: '#F3EDE2',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  periodPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  chartArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    paddingTop: 24,
  },
  barColumn: {
    alignItems: 'center',
    width: 42,
    position: 'relative',
  },
  highlightTooltip: {
    position: 'absolute',
    top: -24,
    backgroundColor: '#1E231F',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 10,
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  barBody: {
    width: 38,
    borderRadius: 14,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
  },
  barSolidGreen: {
    backgroundColor: Colors.primary,
  },
  barHighlightOrange: {
    backgroundColor: Colors.accentOrange,
    borderWidth: 2,
    borderColor: '#F9D1BF',
  },
  barPendingDashed: {
    backgroundColor: '#F3EDE2',
  },
  barInnerContent: {
    alignItems: 'center',
    gap: 2,
  },
  barNumberSmall: {
    fontSize: 7,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 8,
  },
  dayLabelHighlight: {
    color: Colors.textPrimary,
    fontWeight: '800',
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  miniStatsCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  miniCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  miniIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  bigValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bigValNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  bigValSuffix: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginLeft: 1,
  },
  bigValSuffixSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginLeft: 3,
  },
  miniCardSublabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
    marginBottom: 12,
  },
  activityPillsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  actPill: {
    backgroundColor: '#F3EDE2',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actPillActive: {
    backgroundColor: '#E8F1EC',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  actPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  actPillTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  actPillPlus: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F3EDE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  devicePill: {
    backgroundColor: '#F7F2EA',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  devicePillText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  goalsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  goalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  miniPlusButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F3EDE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F4',
    padding: 12,
    borderRadius: 16,
  },
  goalIconGreen: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E8F1EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  goalItemSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  completeBadge: {
    backgroundColor: '#E8F1EC',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  completeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
});
