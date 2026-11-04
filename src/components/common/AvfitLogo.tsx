import { useTheme, useThemeStyles } from '../../theme/ThemeContext';
import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
  variant?: 'brand' | 'light' | 'dark';
}

export default function AvfitLogo({
  size = 36,
  showWordmark = true,
  wordmarkColor,
  variant = 'brand',
}: LogoProps) {
  const styles = useThemeStyles(createStyles);
  const { mode } = useTheme();
  // Brand color scheme: midnight navy with electric teal and lime.
  const defaultAVColor = variant === 'light' ? '#FFFFFF' : (variant === 'brand' && mode === 'light' ? '#007968' : '#00D7C2');
  const avColor = wordmarkColor || defaultAVColor;
  const fitColor = variant === 'brand' && mode === 'light' ? '#00813A' : '#2DF461';

  // Proportional font sizing matching emblem
  const fontSize = Math.round(size * 0.54);

  return (
    <View style={styles.container}>
      {/* Official AVFIT Icon Emblem - Rendered with exact aspect ratio without cropping */}
      <View
        style={[
          styles.emblemContainer,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.24),
            backgroundColor: '#050B16',
            borderWidth: mode === 'light' ? 1 : 0,
            borderColor: mode === 'light' ? '#C9D9DE' : 'transparent',
          },
        ]}
      >
        <Image
          source={require('../../../assets/avfit-mountain-mark.png')}
          style={{
            width: '100%',
            height: '100%',
          }}
          resizeMode="contain"
        />
      </View>

      {showWordmark && (
        <View style={styles.wordmarkRow}>
          <Text style={[styles.wordmarkAV, { color: avColor, fontSize }]}>AV</Text>
          <Text style={[styles.wordmarkFIT, { color: fitColor, fontSize }]}>FIT</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = () => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emblemContainer: {
    overflow: 'hidden',
    backgroundColor: '#050B16',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 2,
  },
  wordmarkAV: {
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  wordmarkFIT: {
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
