import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { getCar } from '../data/cars';
import type { GarageEntry } from '../data/types';
import { rarityColor } from '../lib/rarity';
import { colors, spacing } from '../theme';
import { Card } from './Card';
import { CarSilhouette } from './CarSilhouette';
import { Text } from './Text';

interface CarTileProps {
  entry: GarageEntry;
  onPress?: () => void;
}

/** Grid cell for the garage. Photo on top, two lines of text underneath. */
export function CarTile({ entry, onPress }: CarTileProps) {
  const car = getCar(entry.carId);
  const accent = rarityColor(entry.rarity);

  return (
    <Card onPress={onPress} padded={false}>
      <View style={styles.media}>
        {entry.photoUri ? (
          <Image source={{ uri: entry.photoUri }} style={styles.image} contentFit="cover" transition={220} />
        ) : (
          <CarSilhouette width={110} color="#22222A" />
        )}
        <View style={[styles.rarityBar, { backgroundColor: accent }]} />
      </View>

      <View style={styles.body}>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {entry.make}
        </Text>
        <Text variant="bodyMedium" numberOfLines={1}>
          {entry.model}
        </Text>
        {car ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {car.power} ch
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  media: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  rarityBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  body: {
    padding: spacing.md,
    gap: 1,
  },
});
