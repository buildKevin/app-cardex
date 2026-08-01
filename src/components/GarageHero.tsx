import { Image } from 'expo-image';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { getCar } from '../data/cars';
import type { GarageEntry } from '../data/types';
import { formatPower } from '../lib/format';
import { rarityColor } from '../lib/rarity';
import { colors, gutter, motion, radii, spacing } from '../theme';
import { BrandLogo } from './BrandLogo';
import { CarSilhouette } from './CarSilhouette';
import { Glow } from './Glow';
import { RarityTag } from './RarityTag';
import { Scrim } from './Scrim';
import { Text } from './Text';

interface GarageHeroProps {
  /** The latest sighting, or null for a garage that has never been used. */
  entry: GarageEntry | null;
  onPress?: () => void;
}

/**
 * The home screen's one dominant element: the player's own photo of their last
 * find, full-bleed under the status bar.
 *
 * It replaced a stack of stat lines. A number set in 60pt is precise but says
 * nothing about what the player collected — the photo is the reason they opened
 * the app, so it gets the whole top of the screen and everything else reads as
 * secondary underneath.
 */
export function GarageHero({ entry, onPress }: GarageHeroProps) {
  const { width } = useWindowDimensions();
  const pressed = useSharedValue(0);

  const height = Math.min(Math.round(width * 1.06), 470);
  const car = entry ? getCar(entry.carId) : null;
  // Empty garage has no rarity to echo, so the halo borrows the mid tier.
  const accent = entry ? rarityColor(entry.rarity) : colors.rarity.rare;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.012 }],
  }));

  const body = (
    <Animated.View style={[styles.root, { height }, animatedStyle]}>
      {entry?.photoUri ? (
        <Image
          source={{ uri: entry.photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={280}
        />
      ) : (
        <View style={styles.placeholder}>
          <CarSilhouette width={Math.round(width * 0.62)} color="#16161B" />
        </View>
      )}

      {/* Legibility: the status bar on top, the caption below. Neither fade is
          visible on its own. */}
      <Scrim from="top" height="32%" strength={0.7} />
      <Scrim height="66%" strength={0.94} />

      {/* Bloom in the rarity of the find — drawn over the scrim, or the black
          would swallow the only colour on the screen. */}
      <View style={[styles.bloom, { bottom: -Math.round(width * 0.44) }]} pointerEvents="none">
        <Glow color={accent} width={Math.round(width * 1.3)} intensity={entry?.photoUri ? 0.24 : 0.32} />
      </View>

      <View style={styles.caption}>
        {entry ? (
          <>
            <View style={styles.brand}>
              {/* No monogram: the make is spelled out right beside it. */}
              <BrandLogo
                brandId={entry.brandId}
                name={entry.make}
                size={15}
                framed={false}
                color={colors.textSecondary}
                fallback="none"
              />
              <Text variant="overline" tone="secondary" uppercase>
                {entry.make}
              </Text>
            </View>

            <Text variant="display" numberOfLines={2}>
              {entry.model}
            </Text>

            <View style={styles.meta}>
              <RarityTag rarity={entry.rarity} />
              {car ? (
                <Text variant="label" tone="tertiary">
                  {formatPower(car.power)}
                </Text>
              ) : null}
              <Text variant="label" tone="tertiary">
                +{entry.xp} XP
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text variant="display">Rien dans le garage</Text>
            <Text variant="body" tone="secondary" style={styles.blurb}>
              Repère une voiture dans la rue, scanne-la, et sa carte s'ouvre ici.
            </Text>
          </>
        )}
      </View>
    </Animated.View>
  );

  if (!onPress) return body;

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
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloom: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  caption: {
    position: 'absolute',
    left: gutter,
    right: gutter,
    bottom: spacing.xl,
    gap: spacing.xs,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  blurb: {
    maxWidth: 300,
    marginTop: spacing.xs,
  },
});
