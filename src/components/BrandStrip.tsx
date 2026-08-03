import { StyleSheet, View } from 'react-native';

import { BRANDS } from '../data/brands';
import type { BrandProgress } from '../lib/stats';
import { colors, radii, spacing, withAlpha } from '../theme';
import { BrandLogo } from './BrandLogo';
import { Text } from './Text';

interface BrandStripProps {
  brands: Record<string, BrandProgress>;
  /** Marks to show before the "+n" tile. */
  limit?: number;
}

/**
 * A teaser row of brand marks for the home screen.
 *
 * This replaced a row of 25 anonymous dots. The dots were an honest progress
 * readout and a terrible one to look at — identical grey circles read as a
 * loading indicator, and none of them told the player *which* marques they had
 * started. The marks carry the same signal and are the thing being collected.
 *
 * Ordered activity first, then trophies, then the unknown — the opposite of the
 * Collections tab, which pushes finished sets to the bottom because there is
 * nothing left to do there. Six tiles is a teaser, not a list, so it leads with
 * what the player is in the middle of.
 */
export function BrandStrip({ brands, limit = 6 }: BrandStripProps) {
  const ordered = [...BRANDS].sort((a, b) => {
    const pa = brands[a.id];
    const pb = brands[b.id];
    const rank = (progress?: BrandProgress) =>
      progress?.complete ? 1 : progress?.owned ? 0 : 2;

    return rank(pa) - rank(pb) || (pb?.owned ?? 0) - (pa?.owned ?? 0);
  });

  const shown = ordered.slice(0, limit);
  const rest = ordered.length - shown.length;

  return (
    <View style={styles.root}>
      {shown.map((brand) => {
        const progress = brands[brand.id];
        const complete = Boolean(progress?.complete);
        const started = Boolean(progress?.owned);

        return (
          <View key={brand.id} style={[styles.tile, complete && styles.tileComplete]}>
            {/* Lit means "you own one of these"; the filled tile means the set
                is finished. Dimming a started brand to secondary made it read
                as untouched at tile size. */}
            <BrandLogo
              brandId={brand.id}
              name={brand.name}
              size={22}
              framed={false}
              color={started ? colors.text : colors.textTertiary}
            />
          </View>
        );
      })}

      {rest > 0 ? (
        <View style={styles.tile}>
          <Text variant="label" tone="tertiary">
            +{rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    // Sized by the row rather than a fixed width: the card it sits in is
    // gutter-bound, so anything hardcoded overflows on a small screen.
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileComplete: {
    backgroundColor: withAlpha(colors.text, 0.1),
  },
});
