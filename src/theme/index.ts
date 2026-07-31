import { Dimensions } from 'react-native';

/**
 * Design tokens — dark only, black canvas, almost no colour.
 * Reference: Trade Republic / Linear / Arc.
 */

export const colors = {
  bg: '#000000',
  /** Cards sitting on the canvas. */
  surface: '#0B0B0D',
  /** Cards sitting on a card, or pressed state. */
  surfaceElevated: '#141417',
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.56)',
  textTertiary: 'rgba(255, 255, 255, 0.30)',
  textInverted: '#000000',

  /** The only real accent: a white primary action on black. */
  accent: '#FFFFFF',
  danger: '#FF453A',

  rarity: {
    common: '#8E8E93',
    rare: '#5B8DEF',
    epic: '#A472F0',
    legendary: '#E0B15C',
  },
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Horizontal page gutter — generous on purpose. */
export const gutter = 20;

/**
 * Exact width for one cell of an n-column grid inside the page gutter.
 * Percentages are a trap here: rounding pushes two cells past 100% and the row
 * silently collapses to a single column.
 */
export function gridItemWidth(columns: number, gap: number = spacing.md): number {
  const available = Dimensions.get('window').width - gutter * 2 - gap * (columns - 1);
  return Math.floor(available / columns);
}

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -1.1 },
  title: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.7 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17, letterSpacing: -0.05 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  /** Small all-caps eyebrow above a section. */
  overline: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  /** Big numbers in stat blocks. */
  metric: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 30, letterSpacing: -0.9 },
} as const;

/** Discreet, fluid — never bouncy. */
export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  reveal: 620,
} as const;

export type TypeVariant = keyof typeof type;
