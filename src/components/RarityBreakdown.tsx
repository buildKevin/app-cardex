import { StyleSheet, View } from 'react-native';

import type { Rarity } from '../data/types';
import { RARITY_LABEL, RARITY_ORDER, rarityColor } from '../lib/rarity';
import { radii, spacing } from '../theme';
import { Text } from './Text';

interface RarityBreakdownProps {
  counts: Record<Rarity, number>;
}

/**
 * The collector's shorthand: how many of each tier, no chrome around it.
 * Only tiers actually owned are listed — a row of zeros reads like a debug
 * readout and gets noisier the emptier the garage is.
 */
export function RarityBreakdown({ counts }: RarityBreakdownProps) {
  const owned = RARITY_ORDER.filter((rarity) => counts[rarity] > 0);
  if (owned.length === 0) return null;

  return (
    <View style={styles.root}>
      {owned.map((rarity) => (
        <View key={rarity} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: rarityColor(rarity) }]} />
          <Text variant="label">{counts[rarity]}</Text>
          <Text variant="caption" tone="tertiary">
            {RARITY_LABEL[rarity]}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
  },
});
