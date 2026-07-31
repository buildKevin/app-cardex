import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '../../src/components/Button';
import { CarTile } from '../../src/components/CarTile';
import { BrandProgressDots } from '../../src/components/BrandProgressDots';
import { EmptyState } from '../../src/components/EmptyState';
import { FeaturedCar } from '../../src/components/FeaturedCar';
import { Glow } from '../../src/components/Glow';
import { ProgressBar } from '../../src/components/ProgressBar';
import { RarityBreakdown } from '../../src/components/RarityBreakdown';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Text } from '../../src/components/Text';
import { BRANDS } from '../../src/data/brands';
import { CARS } from '../../src/data/cars';
import { formatNumber } from '../../src/lib/format';
import { rarityColor } from '../../src/lib/rarity';
import { useGameStore, useStats } from '../../src/store/useGameStore';
import { gridItemWidth, gutter, motion, spacing } from '../../src/theme';

export default function Garage() {
  const router = useRouter();
  const garage = useGameStore((state) => state.garage);
  const stats = useStats();

  const { level, xpToNext, ratio } = stats.progress;
  const hasCars = stats.cars > 0;
  const featured = garage[0];

  const ownedCarIds = new Set(
    garage.map((entry) => entry.carId).filter((id): id is string => Boolean(id)),
  );
  const started = Object.values(stats.brands).filter((brand) => brand.owned > 0).length;

  return (
    <Screen scroll>
      {/* Soft halo in the rarity of the latest find — the only depth cue. */}
      {featured ? (
        <View style={styles.glow} pointerEvents="none">
          <Glow color={rarityColor(featured.rarity)} width={420} intensity={0.2} />
        </View>
      ) : null}

      <Text variant="overline" tone="tertiary" uppercase>
        Garage
      </Text>

      <View style={styles.headline}>
        <View style={styles.count}>
          <Text variant="hero">{formatNumber(stats.cars)}</Text>
          <Text variant="body" tone="secondary">
            {stats.cars === 1 ? 'voiture collectionnée' : 'voitures collectionnées'}
          </Text>
        </View>

        <View style={styles.levelBlock}>
          <Text variant="bodyMedium">Niveau {level}</Text>
          <Text variant="caption" tone="tertiary">
            {formatNumber(stats.xp)} XP
          </Text>
        </View>
      </View>

      <View style={styles.progress}>
        <ProgressBar ratio={ratio} height={2} />
        <Text variant="caption" tone="tertiary">
          {xpToNext > 0
            ? `${formatNumber(xpToNext)} XP avant le niveau ${level + 1}`
            : 'Niveau maximum atteint'}
        </Text>
      </View>

      {hasCars ? (
        <>
          <View style={styles.rarity}>
            <RarityBreakdown counts={stats.rarityCounts} />
          </View>

          <View style={styles.featured}>
            <SectionHeader title="Dernière découverte" />
            <FeaturedCar entry={featured} onPress={() => router.push(`/car/${featured.id}`)} />
          </View>
        </>
      ) : null}

      {/* No scan counter on purpose — a countdown reads as a warning. */}
      <Button
        label="Scanner une voiture"
        size="xl"
        onPress={() => router.push('/(tabs)/scan')}
        style={styles.cta}
      />

      <Pressable style={styles.section} onPress={() => router.push('/(tabs)/collections')}>
        <SectionHeader title="Progression" trailing={`${ownedCarIds.size} / ${CARS.length}`} />
        <BrandProgressDots brands={stats.brands} />
        <Text variant="caption" tone="tertiary" style={styles.progressionHint}>
          {started === 0
            ? `${BRANDS.length} marques à découvrir`
            : `${started} marque${started > 1 ? 's' : ''} commencée${started > 1 ? 's' : ''} · ${stats.completedBrands} complète${stats.completedBrands > 1 ? 's' : ''}`}
        </Text>
      </Pressable>

      <View style={styles.section}>
        {hasCars ? (
          <>
            <SectionHeader title="Tout le garage" trailing={formatNumber(stats.cars)} />
            <View style={styles.grid}>
              {garage.map((entry, index) => (
                <Animated.View
                  key={entry.id}
                  entering={FadeIn.delay(Math.min(index, 8) * 40).duration(motion.base)}
                  style={styles.cell}
                >
                  <CarTile entry={entry} onPress={() => router.push(`/car/${entry.id}`)} />
                </Animated.View>
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            title="Ton garage est vide"
            subtitle="Trouve une voiture dans la rue et scanne-la pour ouvrir ta première carte."
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -160,
    left: -gutter,
    right: 0,
    alignItems: 'center',
  },
  headline: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  count: {
    gap: spacing.xs,
    flexShrink: 1,
  },
  levelBlock: {
    alignItems: 'flex-end',
    gap: 2,
    paddingTop: spacing.sm,
  },
  progress: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  rarity: {
    marginTop: spacing.xl,
  },
  featured: {
    marginTop: spacing.xxl,
  },
  cta: {
    marginTop: spacing.xxl,
  },
  section: {
    marginTop: spacing.xxl,
  },
  progressionHint: {
    marginTop: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cell: {
    width: gridItemWidth(2),
  },
});
