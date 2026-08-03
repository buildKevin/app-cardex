import { Image } from 'expo-image';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { getCar } from '../data/cars';
import type { GarageEntry } from '../data/types';
import { formatPower } from '../lib/format';
import { displayPhoto } from '../lib/photo';
import { rarityColor } from '../lib/rarity';
import { colors, gutter, spacing } from '../theme';
import { BrandLogo } from './BrandLogo';
import { Card } from './Card';
import { CarSilhouette } from './CarSilhouette';
import { RarityTag } from './RarityTag';
import { Text } from './Text';

interface GarageHeroProps {
  /** The latest sighting, or null for a garage that has never been used. */
  entry: GarageEntry | null;
  onPress?: () => void;
}

/**
 * The home screen's one dominant element: the player's own photo of their last
 * find, big, at the top of the screen.
 *
 * It replaced a stack of stat lines. A number set in 60pt is precise but says
 * nothing about what the player collected — the photo is the reason they opened
 * the app, so it gets the top of the screen and everything else reads as
 * secondary underneath.
 *
 * The photo used to bleed under the status bar with the caption laid over it
 * behind a dark fade. On a white canvas the caption goes *below* the image
 * instead: black on white always wins over white on an unpredictable
 * photograph, and no fade has to be drawn at all.
 */
export function GarageHero({ entry, onPress }: GarageHeroProps) {
  const { width } = useWindowDimensions();

  const car = entry ? getCar(entry.carId) : null;
  const photo = entry ? displayPhoto(entry) : null;

  return (
    <Card onPress={onPress} padded={false}>
      <View style={styles.media}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={280}
          />
        ) : (
          <CarSilhouette width={Math.round((width - gutter * 2) * 0.55)} />
        )}
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

            <Text variant="title" numberOfLines={2}>
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
            <Text variant="title">Rien dans le garage</Text>
            <Text variant="body" tone="secondary" style={styles.blurb}>
              Repère une voiture dans la rue, scanne-la, et sa carte s'ouvre ici.
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  media: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tier: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
  caption: {
    padding: spacing.lg,
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
