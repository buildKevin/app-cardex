import { StyleSheet, View } from 'react-native';

import type { Rarity } from '../data/types';
import { RARITY_LABEL, rarityColor } from '../lib/rarity';
import { radii, spacing } from '../theme';
import { Text } from './Text';

interface RarityTagProps {
  rarity: Rarity;
  size?: 'sm' | 'md';
}

export function RarityTag({ rarity, size = 'sm' }: RarityTagProps) {
  const color = rarityColor(rarity);

  return (
    <View
      style={[
        styles.tag,
        size === 'md' && styles.tagMd,
        { borderColor: `${color}55`, backgroundColor: `${color}14` },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant={size === 'md' ? 'label' : 'overline'} color={color} uppercase>
        {RARITY_LABEL[rarity]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
  },
});
