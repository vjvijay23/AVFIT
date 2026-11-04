export type ThemeMode = 'dark' | 'light';

const palettes = {
  dark: {
    background: '#050B16',
    backgroundLight: '#09131E',
    surface: '#0D1824',
    surfaceWarm: '#12202B',
    surfaceMuted: '#1A2B36',
    border: '#203846',
    borderSubtle: '#172B37',
    primary: '#008775',
    primaryDark: '#006B5D',
    primaryLight: '#2DF461',
    primarySoft: '#103B35',
    accent: '#2DF461',
    accentOrange: '#00D7C2',
    accentSoft: '#10362F',
    accentYellow: '#A4F45B',
    cyan: '#00D7C2',
    blue: '#63B9D1',
    lilac: '#B69CFF',
    navbarBackground: '#030812',
    navbarActiveIcon: '#00BFA2',
    navbarActiveBadge: '#E9FFF8',
    textPrimary: '#F4F8FA',
    textSecondary: '#AFC0C9',
    textMuted: '#8AA0AA',
    textLight: '#F4F8FA',
    success: '#2DF461',
    warning: '#FFD166',
    danger: '#FF647C',
  },
  light: {
    background: '#F3F8FA',
    backgroundLight: '#EAF2F4',
    surface: '#FFFFFF',
    surfaceWarm: '#EDF5F2',
    surfaceMuted: '#DFE9EC',
    border: '#C9D9DE',
    borderSubtle: '#DDE8EB',
    primary: '#007968',
    primaryDark: '#006456',
    primaryLight: '#00A889',
    primarySoft: '#DCF5ED',
    accent: '#159A44',
    accentOrange: '#009D91',
    accentSoft: '#DFF5F0',
    accentYellow: '#6B9F24',
    cyan: '#008E87',
    blue: '#287D9A',
    lilac: '#7455AE',
    navbarBackground: '#FFFFFF',
    navbarActiveIcon: '#007968',
    navbarActiveBadge: '#DCF5ED',
    textPrimary: '#15262F',
    textSecondary: '#405963',
    textMuted: '#5E747D',
    textLight: '#F4F8FA',
    success: '#14863B',
    warning: '#9A6200',
    danger: '#C53650',
  },
} as const;

export type ThemeColors = { [K in keyof typeof palettes.dark]: string };
export let Colors: ThemeColors = palettes.dark;

export function setColorScheme(mode: ThemeMode) {
  Colors = palettes[mode];
}

export const ColorSchemes = palettes;
