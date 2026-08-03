import { Dimensions } from 'react-native';

/**
 * Design tokens — light only, white canvas, almost no colour.
 *
 * The canvas used to be black. Depth now comes from a soft fill and a shadow
 * rather than from a hairline on near-black, which is why `shadow` exists:
 * on white, a border alone reads as a wireframe.
 */

export const colors = {
  bg: '#FFFFFF',
  /** Soft grey fill: chips, stat tiles, the plate a photo sits on. */
  surface: '#F4F4F6',
  /** One step further from the canvas — a plate sitting on a surface, or a
      pressed state. Darker than `surface`, not lighter: the canvas is white
      now, so "more contrast" means more ink. */
  surfaceElevated: '#E9E9EE',
  border: 'rgba(10, 10, 12, 0.06)',
  borderStrong: 'rgba(10, 10, 12, 0.12)',

  text: '#0A0A0C',
  textSecondary: 'rgba(10, 10, 12, 0.55)',
  textTertiary: 'rgba(10, 10, 12, 0.34)',
  textInverted: '#FFFFFF',

  /** Empty half of a progress track. */
  track: 'rgba(10, 10, 12, 0.07)',
  /** A dark plate laid over a photograph so `textInverted` stays readable on
      it. Stays dark whatever the canvas does — the photo is not the canvas. */
  overlay: 'rgba(0, 0, 0, 0.55)',
  /** The car outline drawn wherever there is no photo yet. */
  silhouette: '#E4E4E8',

  /** The only real accent: a black primary action on white. */
  accent: '#0A0A0C',
  danger: '#E5342A',

  /** Darkened from their dark-canvas values — a tier has to be legible as
      label text on white, not just as a filled dot. */
  rarity: {
    common: '#82828A',
    rare: '#3D6FD6',
    epic: '#8B4FD8',
    legendary: '#B0801F',
  },
} as const;

/**
 * A theme colour at a given opacity.
 *
 * Accent-tinted borders and washes were being written as `${accent}44`, which
 * is a hardcoded style value wearing a disguise — unreadable, and impossible to
 * grep for. Takes the 6-digit hex the palette and `rarityColor()` both return.
 */
export function withAlpha(hex: string, alpha: number): string {
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${channel.toString(16).padStart(2, '0')}`;
}

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Elevation, in two steps only.
 *
 * Spread rather than referenced (`...shadow.card`) so a style stays one flat
 * object — RN reads the four iOS keys and `elevation` independently.
 */
export const shadow = {
  /** Anything resting on the canvas: cards, tiles, chips. */
  card: {
    shadowColor: '#0A0A0C',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  /** Anything floating over scrolling content. */
  raised: {
    shadowColor: '#0A0A0C',
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
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
  /** An emoji standing in for an icon. Sized a little above the label beside
      it, the way the system draws them in a tab bar. */
  emoji: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 22, letterSpacing: 0 },
  /** Small all-caps eyebrow above a section. */
  overline: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  /** Big numbers in stat blocks. */
  metric: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 30, letterSpacing: -0.9 },
  /** The single focal figure of a screen. Tracking is tight on purpose. */
  hero: { fontFamily: fonts.bold, fontSize: 60, lineHeight: 62, letterSpacing: -3 },
} as const;

/** Discreet, fluid — never bouncy. */
export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  reveal: 620,
} as const;

export type TypeVariant = keyof typeof type;
