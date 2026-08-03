import { Pressable, StyleSheet, View } from 'react-native';

import { getBrand } from '../data/brands';
import type { Car, GarageEntry } from '../data/types';
import { colors, radii, spacing } from '../theme';
import { CarSilhouette } from './CarSilhouette';
import { CarTile } from './CarTile';
import { Text } from './Text';

interface CatalogueTileProps {
  car: Car;
  /** The player's first entry for this car, when they own it. */
  entry?: GarageEntry;
  onPress?: () => void;
}

/**
 * One cell of the whole-catalogue grid: the garage tile when the car is owned,
 * an anonymous slot when it is not.
 *
 * Owned deliberately delegates to `<CarTile>` rather than reimplementing it. The
 * grid it sits in is the same three-across sheet as the garage, so any
 * divergence would show up as two tile designs on adjacent screens — and the
 * sticker rules (`displayPhoto`, `contentFit`, the dropped plate) live inside
 * `<CarTile>`, which is exactly where they should stay.
 *
 * The reason this is a component and not an optional `entry` on `<CarTile>` is
 * that a missing entry is a state only this screen has. The garage and the
 * showcase always hold a real car; teaching their tile to render a car nobody
 * owns would make all three call sites reason about it.
 */
export function CatalogueTile({ car, entry, onPress }: CatalogueTileProps) {
  if (entry) {
    return <CarTile entry={entry} onPress={onPress} />;
  }

  const brand = getBrand(car.brandId);

  return (
    <Pressable onPress={onPress}>
      {/* Flat, and outlined rather than shadowed: an owned tile is an object
          lying on the canvas, a locked one is a hole in the sheet where one
          should be. Giving both a shadow made the grid read as complete. */}
      <View style={styles.plate}>
        <CarSilhouette width={72} />
      </View>

      <View style={styles.body}>
        {/* The model stays hidden, the way it is on a brand's locked slots. The
            grid would otherwise publish the whole catalogue in one screen and
            there would be nothing left to discover. */}
        <Text variant="label" tone="tertiary" numberOfLines={1}>
          ? ? ?
        </Text>
        {/* The marque is not a spoiler: the brand pages already say every marque
            holds five cars, so this only repeats what the player can count. */}
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {brand?.name ?? '—'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plate: {
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginTop: spacing.sm,
    gap: 1,
  },
});
