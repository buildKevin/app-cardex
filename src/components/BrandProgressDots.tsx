import { StyleSheet, View } from 'react-native';

import { BRANDS } from '../data/brands';
import type { BrandProgress } from '../lib/stats';
import { colors, radii, spacing } from '../theme';

interface BrandProgressDotsProps {
  brands: Record<string, BrandProgress>;
}

/**
 * One dot per brand: dark when untouched, dim when started, solid when the set
 * is complete.
 *
 * This replaced a 125-cell grid. The grid was honest but read as a broken
 * loading state early on — 124 outlined empty boxes dominating the screen. A
 * single row of 25 dots carries the same "how far along am I" signal at a
 * fraction of the weight, and detail already lives in the Collections tab.
 */
export function BrandProgressDots({ brands }: BrandProgressDotsProps) {
  return (
    <View style={styles.root}>
      {BRANDS.map((brand) => {
        const progress = brands[brand.id];
        const state = progress?.complete ? 'complete' : progress?.owned ? 'started' : 'empty';

        return (
          <View
            key={brand.id}
            style={[
              styles.dot,
              state === 'started' && styles.dotStarted,
              state === 'complete' && styles.dotComplete,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm - 2,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  dotStarted: {
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  dotComplete: {
    backgroundColor: colors.text,
  },
});
