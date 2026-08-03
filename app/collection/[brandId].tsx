import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { events, track } from '../../src/services/analytics';

import { BrandLogo } from '../../src/components/BrandLogo';
import { Card } from '../../src/components/Card';
import { CarSilhouette } from '../../src/components/CarSilhouette';
import { Icon } from '../../src/components/Icon';
import { ProgressBar } from '../../src/components/ProgressBar';
import { RarityTag } from '../../src/components/RarityTag';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Text } from '../../src/components/Text';
import { getBrand } from '../../src/data/brands';
import { CARS_BY_BRAND } from '../../src/data/cars';
import { formatPower } from '../../src/lib/format';
import { displaySticker, isSticker } from '../../src/lib/photo';
import { colors, gridItemWidth, radii, spacing } from '../../src/theme';
import { useGameStore, useStats } from '../../src/store/useGameStore';

export default function BrandCollection() {
  const router = useRouter();
  const { brandId } = useLocalSearchParams<{ brandId: string }>();
  const stats = useStats();
  const garage = useGameStore((state) => state.garage);

  const brand = getBrand(brandId);
  if (!brand) {
    return (
      <Screen>
        <Text variant="headline" tone="secondary">
          Marque inconnue
        </Text>
      </Screen>
    );
  }

  const catalogue = CARS_BY_BRAND[brand.id] ?? [];
  const progress = stats.brands[brand.id];

  /** First garage entry for a catalogue car, so tapping opens its full card. */
  const entryForCar = (carId: string) => garage.find((entry) => entry.carId === carId);

  return (
    <Screen scroll>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <View style={styles.backIcon}>
          <Icon name="chevron" size={18} color={colors.textSecondary} />
        </View>
        <Text variant="label" tone="secondary">
          Collections
        </Text>
      </Pressable>

      <View style={styles.identity}>
        <BrandLogo brandId={brand.id} name={brand.name} size={56} />
        <View style={styles.identityText}>
          <Text variant="display">{brand.name}</Text>
          <Text variant="body" tone="secondary" style={styles.country}>
            {brand.country}
          </Text>
        </View>
      </View>

      <Card style={styles.summary}>
        <View style={styles.summaryHead}>
          <Text variant="title">
            {progress.owned} / {progress.total}
          </Text>
          {progress.complete ? (
            <View style={styles.badgePill}>
              <Icon name="badge" size={14} color={colors.textInverted} />
              <Text variant="label" tone="inverted">
                Badge débloqué
              </Text>
            </View>
          ) : (
            <Text variant="caption" tone="tertiary">
              {progress.total - progress.owned} restante
              {progress.total - progress.owned > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <View style={styles.summaryBar}>
          <ProgressBar ratio={progress.total ? progress.owned / progress.total : 0} />
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader title="La collection" />

        <View style={styles.slots}>
          {catalogue.map((car, index) => {
            const entry = entryForCar(car.id);

            if (!entry) {
              return (
                // Pressable purely to measure it: a locked slot has nothing to
                // open, and a tap on one is a player asking "what is this car?".
                // How often that happens is the case for revealing a hint.
                <Pressable
                  key={car.id}
                  style={styles.slot}
                  onPress={() =>
                    track(events.lockedSlotTapped, {
                      brand_id: brand.id,
                      car_id: car.id,
                      rarity: car.rarity,
                      slot: index + 1,
                      owned: progress.owned,
                    })
                  }
                >
                  <View style={styles.locked}>
                    <CarSilhouette width={104} color={colors.silhouette} />
                  </View>
                  <Text variant="caption" tone="tertiary">
                    Slot {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text variant="bodyMedium" tone="tertiary">
                    ? ? ?
                  </Text>
                </Pressable>
              );
            }

            const photo = displaySticker(entry);

            return (
              <Pressable
                key={car.id}
                style={styles.slot}
                onPress={() => router.push(`/car/${entry.id}`)}
              >
                <View style={styles.unlocked}>
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={styles.photo}
                      contentFit={isSticker(entry, photo) ? 'contain' : 'cover'}
                    />
                  ) : (
                    <CarSilhouette width={104} color={colors.silhouette} />
                  )}
                </View>
                <Text variant="caption" tone="tertiary">
                  {formatPower(car.power)}
                </Text>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {car.model}
                </Text>
                <View style={styles.tag}>
                  <RarityTag rarity={car.rarity} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  backIcon: {
    transform: [{ rotate: '180deg' }],
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  identityText: {
    flexShrink: 1,
  },
  country: {
    marginTop: spacing.xs,
  },
  summary: {
    marginTop: spacing.xl,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryBar: {
    marginTop: spacing.lg,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  section: {
    marginTop: spacing.xxl,
  },
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  slot: {
    width: gridItemWidth(2),
    gap: 2,
  },
  locked: {
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  unlocked: {
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  photo: {
    ...StyleSheet.absoluteFill,
  },
  tag: {
    marginTop: spacing.sm,
  },
});
