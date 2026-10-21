import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
}

export default function AvfitLogo({
  size = 40,
  showWordmark = true,
  wordmarkColor = '#191C1A',
}: LogoProps) {
  return (
    <View style={styles.container}>
      {/* Official AVFIT Electric Blue App Emblem */}
      <Image
        source={require('../../../assets/avfit_official_logo.png')}
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
        }}
        resizeMode="contain"
      />

      {showWordmark && (
        <View style={styles.wordmarkRow}>
          <Text style={[styles.wordmarkAV, { color: wordmarkColor }]}>AV</Text>
          <Text style={styles.wordmarkFIT}>FIT</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmarkAV: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  wordmarkFIT: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: '#00A6FF', // Electric Cyan Blue matching official logo
  },
});
