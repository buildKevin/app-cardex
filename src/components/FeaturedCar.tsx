import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { getCar } from '../data/cars';
import type { GarageEntry } from '../data/types';
import { formatPower } from '../lib/format';
import { rarityColor } from '../lib/rarity';
import { colors, motion, radii, spacing } from '../theme';
import { CarSilhouette } from './CarSilhouette';
import { RarityTag } from './RarityTag';
import { Scrim } from './Scrim';
import { Text } from './Text';

interface FeaturedCarProps {
  entry: GarageEntry;
  onPress: () => void;
}

/**
 * The last sighting, shown large. This is the emotional payload of the home
 * screen — the player's own photo, not a catalogue illustration.
 */
export function FeaturedCar({ entry, onPress }: FeaturedCarProps) {
  const car = getCar(entry.carId);
  const accent = rarityColor(entry.rarity);
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.012 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: motion.fast });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: motion.base });
      }}
    >
      <Animated.View style={[styles.card, { borderColor: `${accent}33` }, animatedStyle]}>
        <View style={styles.media}>
          {entry.photoUri ? (
            <Image source={{ uri: entry.photoUri }} style={styles.image} contentFit="cover" transition={240} />
          ) : (
            <CarSilhouette width={200} color="#24242C" />
          )}

          {/* Keeps the caption legible over any photo. */}
          <Scrim />

          <View style={styles.caption}>
            <Text variant="overline" tone="secondary" uppercase>
              {entry.make}
            </Text>
            <Text variant="title" numberOfLines={1}>
              {entry.model}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <RarityTag rarity={entry.rarity} />
          <View style={styles.facts}>
            {car ? (
              <Text variant="label" tone="tertiary">
                {formatPower(car.power)}
              </Text>
            ) : null}
            <Text variant="label" tone="tertiary">
              +{entry.xp} XP
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  media: {
    aspectRatio: 16 / 11,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  caption: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  facts: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
});
