import { Dimensions, StyleSheet, View } from 'react-native';

import { BRANDS } from '../data/brands';
import { CARS_BY_BRAND, COLLECTION_SIZE } from '../data/cars';
import type { Brand } from '../data/types';
import { rarityColor } from '../lib/rarity';
import { colors, gutter, spacing } from '../theme';

interface CollectionMatrixProps {
  /** Catalogue car ids the player owns. */
  ownedCarIds: Set<string>;
}

const GAP = 4;
/**
 * Brands are laid out in blocks rather than one long row: past ~13 columns the
 * cells shrink into unreadable specks, and the catalogue keeps growing.
 */
const MAX_COLUMNS = 13;

const CELL = Math.floor(
  (Dimensions.get('window').width - gutter * 2 - GAP * (MAX_COLUMNS - 1)) / MAX_COLUMNS,
);

function chunk(brands: Brand[], size: number): Brand[][] {
  const blocks: Brand[][] = [];
  for (let i = 0; i < brands.length; i += size) blocks.push(brands.slice(i, i + size));
  return blocks;
}

/**
 * The whole catalogue at a glance: one column per brand, one row per slot.
 * Owned cells carry their rarity colour, missing ones stay almost black — the
 * texture itself shows how far there is left to go.
 */
export function CollectionMatrix({ ownedCarIds }: CollectionMatrixProps) {
  return (
    <View style={styles.root}>
      {chunk(BRANDS, MAX_COLUMNS).map((block, blockIndex) => (
        <View key={blockIndex} style={styles.block}>
          {Array.from({ length: COLLECTION_SIZE }).map((_, row) => (
            <View key={row} style={styles.row}>
              {block.map((brand) => {
                const car = CARS_BY_BRAND[brand.id]?.[row];
                const owned = car ? ownedCarIds.has(car.id) : false;

                return (
                  <View
                    key={`${brand.id}-${row}`}
                    style={[
                      styles.cell,
                      owned && car ? { backgroundColor: rarityColor(car.rarity) } : styles.cellEmpty,
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  block: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  cellEmpty: {
    backgroundColor: '#131317',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
