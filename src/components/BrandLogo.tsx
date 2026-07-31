import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BRAND_LOGO_VIEW_BOX, getBrandLogoPath } from '../data/brandLogos';
import { colors } from '../theme';
import { Text } from './Text';

interface BrandLogoProps {
  /**
   * Catalogue brand id. Unknown or null is a supported state — three catalogue
   * brands have no upstream icon, and an uncatalogued car has no brand at all.
   */
  brandId: string | null | undefined;
  /** Brand name, as the monogram source when there is no mark. */
  name: string;
  /** Side of the square tile. The mark itself is inset inside it. */
  size?: number;
  color?: string;
  /** Off when the logo already sits on its own surface. */
  framed?: boolean;
  /** `none` where the brand name sits right next to the mark and would stutter. */
  fallback?: 'monogram' | 'none';
}

/** "Mercedes-Benz" → "MB". */
function monogram(name: string): string {
  const initials = name
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

  return initials || '?';
}

/**
 * The brand mark, monochrome. Simple Icons paths are all authored 24x24 with a
 * single path, so one <Svg> serves every brand — see src/data/brandLogos.ts.
 */
export function BrandLogo({
  brandId,
  name,
  size = 40,
  color = colors.text,
  framed = true,
  fallback = 'monogram',
}: BrandLogoProps) {
  const path = brandId ? getBrandLogoPath(brandId) : undefined;
  if (!path && fallback === 'none') return null;

  const glyph = Math.round(size * (framed ? 0.55 : 1));

  const frame = framed
    ? [styles.frame, { width: size, height: size, borderRadius: Math.round(size * 0.32) }]
    : [styles.bare, { width: glyph, height: glyph }];

  return (
    <View style={frame}>
      {path ? (
        <Svg width={glyph} height={glyph} viewBox={BRAND_LOGO_VIEW_BOX}>
          <Path d={path} fill={color} />
        </Svg>
      ) : (
        <Text variant={size >= 48 ? 'headline' : 'label'} color={color}>
          {monogram(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bare: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
