import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { getCar } from '../data/cars';
import type { GarageEntry } from '../data/types';
import { displaySticker, isSticker } from '../lib/photo';
import { RARITY_ORDER, rarityColor } from '../lib/rarity';
import { colors, motion, radii, shadow, spacing } from '../theme';
import { CarSilhouette } from './CarSilhouette';
import { Text } from './Text';

interface CarTileProps {
  entry: GarageEntry;
  onPress?: () => void;
}

/**
 * Grid cell for the garage: the photo as a rounded plate, the name loose on the
 * canvas underneath.
 *
 * Not a `Card`. Boxing three of these per row draws nine outlines on one screen
 * and the grid stops reading as a set of objects — the photo *is* the object,
 * and the shadow is all the container it needs.
 */
export function CarTile({ entry, onPress }: CarTileProps) {
  const pressed = useSharedValue(0);

  const car = getCar(entry.carId);
  const photo = displaySticker(entry);
  const sticker = isSticker(entry, photo);
  // Only the top two tiers get a marker. A dot on every tile is a dot that says
  // nothing, and common is the default state of a garage.
  const standout = RARITY_ORDER.indexOf(entry.rarity) >= 2;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
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
      <Animated.View style={animatedStyle}>
        <View style={[styles.plate, sticker && styles.plateSticker]}>
          {/* Clipping is for a photo bleeding to the plate's edge. A sticker fits
              inside by construction, and the clip would eat its shadow. */}
          <View style={[styles.clip, sticker && styles.clipOpen]}>
            {photo ? (
              <Image
                source={{ uri: photo }}
                style={[StyleSheet.absoluteFill, sticker && styles.sticker]}
                // A die-cut sticker cropped to fill is a die-cut sticker with its
                // edge cut off.
                contentFit={sticker ? 'contain' : 'cover'}
                transition={220}
              />
            ) : (
              <CarSilhouette width={72} />
            )}
          </View>

          {standout ? (
            <View style={styles.badge}>
              <View style={[styles.dot, { backgroundColor: rarityColor(entry.rarity) }]} />
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text variant="label" numberOfLines={1}>
            {entry.model}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {car ? `${entry.make} · ${car.power} ch` : entry.make}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plate: {
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  /**
   * A sticker needs no plate: it is already an object with its own outline, and
   * a grey square behind it puts it back in the box the die-cut took it out of.
   * The shadow moves onto the image, where iOS computes it from the alpha
   * channel and it follows the silhouette.
   */
  plateSticker: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  clipOpen: {
    overflow: 'visible',
  },
  sticker: {
    ...shadow.card,
  },
  // Same reason as `Card`: clipping on the plate itself would eat its shadow.
  clip: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  body: {
    marginTop: spacing.sm,
    gap: 1,
  },
});
