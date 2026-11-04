import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';
import { Colors, setColorScheme, type ThemeColors, type ThemeMode } from './colors';
import { SecureStorage } from '../services/secureStorage';

export type ThemePreference = 'system' | ThemeMode;
const THEME_STORAGE_KEY = 'avfit_theme_preference';

const initialSystemMode: ThemeMode = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
setColorScheme(initialSystemMode);

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: initialSystemMode,
  colors: Colors,
  preference: 'system',
  setPreference: () => undefined,
});

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = React.useState<ThemePreference>('system');
  const [preferenceLoaded, setPreferenceLoaded] = React.useState(false);
  const systemMode: ThemeMode = systemColorScheme === 'dark' ? 'dark' : 'light';
  const mode: ThemeMode = preference === 'system' ? systemMode : preference;
  // Set the module palette before rendering descendants. Screen style factories
  // read Colors while rendering; updating it in an effect left those styles
  // cached with the previous (usually light) text colors after a theme switch.
  setColorScheme(mode);
  useEffect(() => {
    let mounted = true;
    const readPreference = async () => {
      try {
        const saved = Platform.OS === 'web'
          ? (typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null)
          : await SecureStorage.getItemAsync(THEME_STORAGE_KEY);
        if (mounted && (saved === 'system' || saved === 'light' || saved === 'dark')) setPreferenceState(saved);
      } catch { /* Keep the system appearance if device storage is unavailable. */ }
      finally { if (mounted) setPreferenceLoaded(true); }
    };
    void readPreference();
    return () => { mounted = false; };
  }, []);
  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    const save = Platform.OS === 'web'
      ? Promise.resolve().then(() => { if (typeof window !== 'undefined') window.localStorage.setItem(THEME_STORAGE_KEY, next); })
      : SecureStorage.setItemAsync(THEME_STORAGE_KEY, next);
    void save.catch(() => undefined);
  };
  const value = useMemo(() => ({ mode, colors: Colors, preference, setPreference }), [mode, preference, preferenceLoaded]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

const lightBackgrounds: Record<string, string> = {
  '#050B16': '#F3F8FA',
  '#09131E': '#EAF2F4',
  '#0B1621': '#EDF4F6',
  '#0D1824': '#FFFFFF',
  '#12202B': '#EDF5F2',
  '#1A2B36': '#DFE9EC',
  '#172833': '#E3ECEF',
  '#172B37': '#DDE8EB',
  '#203846': '#C9D9DE',
  '#20313B': '#DFE9EC',
  '#030812': '#0B1720',
  '#103B35': '#DCF5ED',
  '#10362F': '#DCF5ED',
  '#3B1C28': '#FCE8EC',
  '#392B18': '#FFF2D7',
  '#3A3316': '#FBF1D5',
  '#241C36': '#F0EAFE',
  '#5A2731': '#F4D5DB',
  '#5A4326': '#F2E3C7',
  '#6B5524': '#F1E6C7',
  '#00D7C2': '#007968',
  '#2DF461': '#008775',
  '#34D399': '#008775',
};

const lightText: Record<string, string> = {
  '#FFF': '#15262F',
  '#FFFFFF': '#15262F',
  '#F8FAFC': '#15262F',
  '#F9FAFB': '#15262F',
  '#FAFAFA': '#15262F',
  '#F5F5F5': '#15262F',
  '#F1F5F9': '#405963',
  '#E5E7EB': '#405963',
  '#D1D5DB': '#405963',
  '#F4F8FA': '#15262F',
  '#E0E7E3': '#405963',
  '#A4B8C1': '#405963',
  '#AFC0C9': '#405963',
  '#91A7B2': '#5E747D',
  '#94A3B8': '#5E747D',
  '#748B96': '#5E747D',
  '#8AA0AA': '#5E747D',
  '#1A202C': '#15262F',
  '#334155': '#405963',
  '#C2410C': '#8C5200',
  '#991B1B': '#A52B42',
  '#92400E': '#805200',
  '#6A4B82': '#674D90',
  '#3A6878': '#286477',
  '#78603A': '#745A2D',
  '#4A7C9B': '#286A86',
};

const lightBorders: Record<string, string> = {
  '#203846': '#C9D9DE',
  '#172B37': '#DDE8EB',
  '#20313B': '#D3E0E4',
  '#392B18': '#E8D7B4',
  '#5A2731': '#E8C1CA',
  '#5A4326': '#E8D6B0',
  '#6B5524': '#E8DCB6',
};

const darkBackgrounds: Record<string, string> = {
  '#FFF': '#0D1824',
  '#FFFFFF': '#0D1824',
  '#FAFAF8': '#0B1621',
  '#F9FAFB': '#0D1824',
  '#F3F4F6': '#12202B',
  '#F1F5F9': '#12202B',
  '#F3F8FA': '#050B16',
  '#EAF2F4': '#09131E',
  '#EDF4F6': '#09131E',
  '#EDF5F2': '#12202B',
  '#DFE9EC': '#1A2B36',
  '#E3ECEF': '#172833',
  '#DDE8EB': '#172B37',
  '#C9D9DE': '#203846',
  '#DCF5ED': '#103B35',
  '#FCE8EC': '#3B1C28',
  '#FFF2D7': '#392B18',
  '#FBF1D5': '#3A3316',
  '#F0EAFE': '#241C36',
  '#F4D5DB': '#5A2731',
  '#F2E3C7': '#5A4326',
  '#F1E6C7': '#6B5524',
  '#E5E7EB': '#1A2B36',
  '#D1D5DB': '#203846',
};

function resolveStyles(value: any, mode: ThemeMode, property = '', owner = ''): any {
  if (Array.isArray(value)) return value.map((item) => resolveStyles(item, mode, property, owner));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'number' && property === 'fontSize') return Math.max(11, Math.round(value * 1.08));
    if (typeof value === 'string') {
      const color = value.toUpperCase();
      if (property === 'backgroundColor') {
        return mode === 'light' ? (lightBackgrounds[color] || value) : (darkBackgrounds[color] || value);
      }
      if (mode === 'light' && (property === 'color' || property === 'tintColor' || property === 'fill' || property === 'stroke')) {
        const isOnColorSurface = /button|cta|chip|badge|pill|action|selected|active|fab/i.test(owner);
        if (isOnColorSurface && ['#FFF', '#FFFFFF', '#F8FAFC', '#F9FAFB', '#FAFAFA', '#F5F5F5'].includes(color)) return value;
        return lightText[color] || value;
      }
      if (mode === 'light' && property.toLowerCase().includes('border') && property.toLowerCase().includes('color')) {
        return lightBorders[color] || value;
      }
    }
    return value;
  }
  const output: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) output[key] = resolveStyles(child, mode, key, owner || key);
  return output;
}

export function useThemeStyles<T extends Record<string, any>>(factory: () => T): any {
  const { mode } = useTheme();
  // Factories intentionally return unregistered style objects so palette and font
  // tokens can be resolved before React Native registers the active theme.
  return useMemo(() => StyleSheet.create(resolveStyles(factory(), mode) as any), [factory, mode]);
}
