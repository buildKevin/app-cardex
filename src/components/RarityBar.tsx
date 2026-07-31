import { StyleSheet, View } from 'react-native';

import type { Rarity } from '../data/types';
import { RARITY_ORDER, rarityColor } from '../lib/rarity';
import { radii, spacing } from '../theme';

interface RarityBarProps {
  counts: Record<Rarity, number>;
  height?: number;
}

/**
 * The garage split by tier, as one bar. Segments are weighted by count, so the
 * shape alone says whether a collection is broad or top-heavy.
 *
 * Empty tiers are dropped rather than drawn at zero width: a hairline segment
 * reads as a rendering glitch, and the legend underneath already lists what is
 * owned.
 */
export function RarityBar({ counts, height = spacing.sm }: RarityBarProps) {
  const owned = RARITY_ORDER.filter((rarity) => counts[rarity] > 0);
  if (owned.length === 0) return null;

  return (
    <View style={[styles.root, { height }]}>
      {owned.map((rarity) => (
        <View
          key={rarity}
          style={[styles.segment, { flex: counts[rarity], backgroundColor: rarityColor(rarity) }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    borderRadius: radii.pill,
  },
});
