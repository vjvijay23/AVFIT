import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';
import Svg, { Circle, Path } from 'react-native-svg';
import { Check, ChevronLeft, ImagePlus, RotateCcw, Share2 } from 'lucide-react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Colors } from '../../theme/colors';
import { GPSPoint } from '../../types';

type ShareStat = { label: string; value: string };

type ActivityShareModalProps = {
  visible: boolean;
  onClose: () => void;
  activityType: string;
  title: string;
  subtitle: string;
  stats: ShareStat[];
  highlights?: string[];
  caption: string;
  routePoints?: GPSPoint[];
};

export default function ActivityShareModal({
  visible,
  onClose,
  activityType,
  title,
  subtitle,
  stats,
  highlights = [],
  caption,
  routePoints = [],
}: ActivityShareModalProps) {
  const viewShot = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const { width, height } = useWindowDimensions();
  const cardWidth = Math.min(width - 56, Math.floor((height - 230) * 9 / 16), 340);
  const cardHeight = cardWidth * 16 / 9;
  const routePath = createRoutePath(routePoints, 284, 108);

  const shareImage = async () => {
    try {
      setSharing(true);
      const imageUri = await viewShot.current?.capture?.();
      if (!imageUri) throw new Error('The share card could not be created. Try again.');
      const url = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
      await Share.open({
        url,
        type: 'image/png',
        title: 'Share your AVFIT activity',
        message: caption,
        failOnCancel: false,
      });
    } catch (error: any) {
      if (!error?.message?.toLowerCase?.().includes('cancel')) {
        Alert.alert('Could not share activity', error?.message || 'Please try sharing again.');
      }
    } finally {
      setSharing(false);
    }
  };

  const chooseBackground = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Could not open gallery', result.errorMessage || 'Please try again.');
        return;
      }
      const uri = result.assets?.[0]?.uri;
      if (uri) setBackgroundImage(uri);
    } catch (error: any) {
      Alert.alert('Could not open gallery', error?.message || 'Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: 12 }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close share preview">
              <ChevronLeft size={21} color={Colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.heading}>Share your activity</Text>
              <Text style={styles.subheading}>Preview your story card</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.previewArea} showsVerticalScrollIndicator={false}>
            <ViewShot
              ref={viewShot}
              style={{ width: cardWidth, height: cardHeight }}
              options={{ format: 'png', quality: 1, width: 1080, height: 1920 }}
            >
              <View style={styles.storyCard}>
                {backgroundImage ? <Image source={{ uri: backgroundImage }} style={styles.backgroundImage} resizeMode="cover" blurRadius={2} /> : null}
                {backgroundImage ? <View pointerEvents="none" style={styles.backgroundScrim} /> : null}
                <View style={styles.accentLine}>
                  <View style={styles.accentTeal} />
                  <View style={styles.accentGreen} />
                </View>
                <View style={styles.brandRow}>
                  <Image source={require('../../../assets/avfit-mountain-mark.png')} style={styles.logo} resizeMode="contain" />
                  <View>
                    <Text style={styles.brandName}>AVFIT</Text>
                    <Text style={styles.brandTagline}>TRACK · TRAIN · FUEL · ACHIEVE</Text>
                  </View>
                </View>

                <View style={styles.activityPill}><Text style={styles.activityPillText}>{activityType.toUpperCase()}</Text></View>
                <Text numberOfLines={2} style={styles.cardTitle}>{title}</Text>
                <Text numberOfLines={2} style={styles.cardSubtitle}>{subtitle}</Text>

                {routePath ? (
                  <View style={styles.routeMap}>
                    <View style={styles.routeMapHeader}><Text style={styles.routeMapLabel}>YOUR ROUTE</Text><Text style={styles.routeMapLabel}>{routePoints.length} GPS POINTS</Text></View>
                    <Svg width="100%" height={82} viewBox="0 0 284 108" preserveAspectRatio="xMidYMid meet">
                      <Path d="M0 29H284M0 78H284M45 0V108M168 0V108" stroke="#2C414B" strokeWidth={2} />
                      <Path d="M0 53H284M111 0V108M238 0V108" stroke="#1A303A" strokeWidth={1} />
                      <Path d={routePath} fill="none" stroke="#071018" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
                      <Path d={routePath} fill="none" stroke="#FF7043" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
                      {routePoints.length > 0 ? (() => {
                        const points = normalizeRoute(routePoints, 284, 108);
                        if (!points.length) return null;
                        const start = points[0];
                        const end = points[points.length - 1];
                        return <><Circle cx={start.x} cy={start.y} r={6} fill="#39D98A" stroke="#071018" strokeWidth={3} /><Circle cx={end.x} cy={end.y} r={6} fill="#FFFFFF" stroke="#FF7043" strokeWidth={3} /></>;
                      })() : null}
                    </Svg>
                  </View>
                ) : null}

                <View style={styles.statsGrid}>
                  {stats.slice(0, 4).map((stat, index) => (
                    <View key={`${stat.label}-${index}`} style={styles.statBox}>
                      <Text numberOfLines={1} style={styles.statValue}>{stat.value}</Text>
                      <Text numberOfLines={1} style={styles.statLabel}>{stat.label.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>

                {highlights.length > 0 && (
                  <View style={styles.highlights}>
                    <Text style={styles.highlightsTitle}>SESSION HIGHLIGHTS</Text>
                    {highlights.slice(0, 4).map((item, index) => (
                      <View key={`${item}-${index}`} style={styles.highlightRow}>
                        <Check size={13} color="#00D7C2" />
                        <Text numberOfLines={1} style={styles.highlightText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <Text style={styles.footerLine}>ONE SESSION STRONGER.</Text>
                  <Text style={styles.footerBrand}>AVFIT</Text>
                </View>
              </View>
            </ViewShot>
            <View style={styles.backgroundActions}>
              <TouchableOpacity onPress={() => void chooseBackground()} style={styles.backgroundButton} accessibilityRole="button" accessibilityLabel="Choose a background photo from gallery">
                <ImagePlus size={16} color={Colors.primary} />
                <Text style={styles.backgroundButtonText}>{backgroundImage ? 'Change photo' : 'Choose background photo'}</Text>
              </TouchableOpacity>
              {backgroundImage ? (
                <TouchableOpacity onPress={() => setBackgroundImage(null)} style={styles.resetButton} accessibilityRole="button" accessibilityLabel="Use the default background">
                  <RotateCcw size={15} color={Colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.shareHint}>Choose Instagram, WhatsApp, Snapchat, or another installed app from the share menu.</Text>
            <TouchableOpacity onPress={() => void shareImage()} disabled={sharing} style={styles.shareButton} accessibilityRole="button">
              {sharing ? <ActivityIndicator color="#FFFFFF" /> : <><Share2 size={18} color="#FFFFFF" /><Text style={styles.shareButtonText}>Share image</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  backdrop: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { maxHeight: '94%' as const, backgroundColor: Colors.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' as const },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerCopy: { marginLeft: 10 },
  heading: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' as const },
  subheading: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  previewArea: { alignItems: 'center' as const, paddingTop: 12, paddingBottom: 18, paddingHorizontal: 16 },
  storyCard: { flex: 1, backgroundColor: '#050B16', borderRadius: 22, paddingHorizontal: '8%' as any, paddingVertical: '7%' as any, overflow: 'hidden' as const, justifyContent: 'flex-start' as const },
  backgroundImage: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0, width: '100%' as any, height: '100%' as any },
  // Keep the selected photo visible while the opaque content panels preserve contrast.
  backgroundScrim: { ...({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(2, 10, 18, 0.56)' } as const) },
  accentLine: { position: 'absolute' as const, top: 0, left: 0, right: 0, height: 5, flexDirection: 'row' as const },
  accentTeal: { flex: 1, backgroundColor: '#00D7C2' },
  accentGreen: { flex: 1, backgroundColor: '#2DF461' },
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: '8%' as any },
  logo: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#0D1824', marginRight: 10 },
  brandName: { color: '#F4F8FA', fontSize: 18, fontWeight: '900' as const, letterSpacing: 1 },
  brandTagline: { color: '#8AA0AA', fontSize: 6, fontWeight: '800' as const, letterSpacing: 0.6, marginTop: 2 },
  activityPill: { alignSelf: 'flex-start' as const, backgroundColor: '#103B35', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginBottom: '4%' as any },
  activityPillText: { color: '#2DF461', fontSize: 8, fontWeight: '900' as const, letterSpacing: 1.3 },
  cardTitle: { color: '#F4F8FA', fontSize: 23, fontWeight: '900' as const, lineHeight: 28 },
  cardSubtitle: { color: '#AFC0C9', fontSize: 10, marginTop: 5, lineHeight: 15 },
  routeMap: { marginTop: '5%' as any, borderRadius: 13, overflow: 'hidden' as const, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 2, backgroundColor: '#0C1A23', borderWidth: 1, borderColor: '#203846' },
  routeMapHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingHorizontal: 3, marginBottom: 2 },
  routeMapLabel: { color: '#8AA0AA', fontSize: 6, fontWeight: '900' as const, letterSpacing: 0.8 },
  statsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, marginTop: '8%' as any, gap: 8 },
  statBox: { width: '47%' as any, minHeight: 66, borderRadius: 13, backgroundColor: '#0D1824', borderWidth: 1, borderColor: '#203846', paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center' as const },
  statValue: { color: '#F4F8FA', fontSize: 17, fontWeight: '900' as const },
  statLabel: { color: '#8AA0AA', fontSize: 7, fontWeight: '800' as const, letterSpacing: 0.8, marginTop: 5 },
  highlights: { marginTop: '8%' as any },
  highlightsTitle: { color: '#00D7C2', fontSize: 7, fontWeight: '900' as const, letterSpacing: 1, marginBottom: 7 },
  highlightRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 5 },
  highlightText: { color: '#D5E0E4', fontSize: 8, fontWeight: '700' as const, marginLeft: 6, flex: 1 },
  cardFooter: { flex: 1, justifyContent: 'flex-end' as const, marginTop: 12 },
  footerLine: { color: '#607984', fontSize: 7, fontWeight: '800' as const, letterSpacing: 1.2 },
  footerBrand: { color: '#00D7C2', fontSize: 10, fontWeight: '900' as const, letterSpacing: 2, marginTop: 4 },
  shareHint: { color: Colors.textSecondary, fontSize: 11, textAlign: 'center' as const, lineHeight: 16, marginTop: 11, maxWidth: 320 },
  backgroundActions: { flexDirection: 'row' as const, alignItems: 'center' as const, alignSelf: 'stretch' as const, justifyContent: 'center' as const, marginTop: 11, gap: 8 },
  backgroundButton: { minHeight: 40, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 7, paddingHorizontal: 15, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.surface },
  backgroundButtonText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '800' as const },
  resetButton: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.surface },
  shareButton: { minHeight: 48, alignSelf: 'stretch' as const, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, marginTop: 12, backgroundColor: Colors.primary, borderRadius: 15 },
  shareButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' as const },
};

function normalizeRoute(points: GPSPoint[], width: number, height: number) {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)).slice(-1200);
  if (valid.length < 2) return [];
  const minLat = Math.min(...valid.map((point) => point.latitude));
  const maxLat = Math.max(...valid.map((point) => point.latitude));
  const minLon = Math.min(...valid.map((point) => point.longitude));
  const maxLon = Math.max(...valid.map((point) => point.longitude));
  const latSpan = maxLat - minLat || 0.00001;
  const lonSpan = maxLon - minLon || 0.00001;
  const pad = 12;
  const scale = Math.min((width - pad * 2) / lonSpan, (height - pad * 2) / latSpan);
  const usedW = lonSpan * scale;
  const usedH = latSpan * scale;
  const offsetX = (width - usedW) / 2;
  const offsetY = (height - usedH) / 2;
  return valid.map((point) => ({
    x: offsetX + (point.longitude - minLon) * scale,
    y: height - offsetY - (point.latitude - minLat) * scale,
  }));
}

function createRoutePath(points: GPSPoint[], width: number, height: number) {
  const normalized = normalizeRoute(points, width, height);
  if (normalized.length < 2) return '';
  const step = Math.max(1, Math.ceil(normalized.length / 240));
  const sampled = normalized.filter((_, index) => index % step === 0);
  const last = normalized[normalized.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}
