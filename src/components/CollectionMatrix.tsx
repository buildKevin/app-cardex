import { Dimensions, StyleSheet, View } from 'react-native';

import { BRANDS } from '../data/brands';
import { CARS_BY_BRAND, COLLECTION_SIZE } from '../data/cars';
import { rarityColor } from '../lib/rarity';
import { colors, gutter, radii } from '../theme';

interface CollectionMatrixProps {
  /** Catalogue car ids the player owns. */
  ownedCarIds: Set<string>;
}

const GAP = 4;
const COLUMNS = BRANDS.length;

const CELL = Math.floor(
  (Dimensions.get('window').width - gutter * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
);

/**
 * The whole catalogue at a glance: one column per brand, one row per slot.
 * Owned cells carry their rarity colour, missing ones stay almost black — the
 * texture itself shows how far there is left to go.
 */
export function CollectionMatrix({ ownedCarIds }: CollectionMatrixProps) {
  return (
    <View style={styles.root}>
      {Array.from({ length: COLLECTION_SIZE }).map((_, row) => (
        <View key={row} style={styles.row}>
          {BRANDS.map((brand) => {
            const car = CARS_BY_BRAND[brand.id]?.[row];
            const owned = car ? ownedCarIds.has(car.id) : false;

            return (
              <View
                key={`${brand.id}-${row}`}
                style={[
                  styles.cell,
                  owned && car
                    ? { backgroundColor: rarityColor(car.rarity) }
                    : styles.cellEmpty,
                ]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: radii.sm - 4,
  },
  cellEmpty: {
    backgroundColor: '#131317',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
