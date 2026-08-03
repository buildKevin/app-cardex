import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BrandStrip } from '../../src/components/BrandStrip';
import { Card } from '../../src/components/Card';
import { CarTile } from '../../src/components/CarTile';
import { GarageHero } from '../../src/components/GarageHero';
import { Icon } from '../../src/components/Icon';
import { ProgressBar } from '../../src/components/ProgressBar';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { StatBlock } from '../../src/components/StatBlock';
import { TabSwipe } from '../../src/components/TabSwipe';
import { TabSwitcher } from '../../src/components/TabSwitcher';
import { Text } from '../../src/components/Text';
import { BRANDS } from '../../src/data/brands';
import { CARS } from '../../src/data/cars';
import { formatNumber } from '../../src/lib/format';
import { useGameStore, useStats } from '../../src/store/useGameStore';
import { colors, gridItemWidth, motion, spacing } from '../../src/theme';

/** Three across, like a sheet of stickers. */
const COLUMNS = 3;

export default function Garage() {
  const router = useRouter();
  const garage = useGameStore((state) => state.garage);
  const stats = useStats();

  const { level, xpToNext, ratio } = stats.progress;
  const hasCars = stats.cars > 0;
  const featured = garage[0] ?? null;

  const ownedCarIds = new Set(
    garage.map((entry) => entry.carId).filter((id): id is string => Boolean(id)),
  );

  return (
    <TabSwipe>
      <Screen scroll>
        {/* The switcher is this screen's title: no <Text variant="display">
            above it, or the word Garage appears twice in 60pt of each other. */}
        <TabSwitcher />

        <SectionHeader title="Dernière trouvaille" />
        <GarageHero
          entry={featured}
          onPress={featured ? () => router.push(`/car/${featured.id}`) : undefined}
        />

        {/* The cars come first, straight under the last find. Everything that
            counts them — the collections, the level — reads as a footnote to the
            collection itself and sits below it.

            No empty state here either: the hero already says the garage is
            empty, and saying it twice on one screen reads as a bug. */}
        {hasCars ? (
          <View style={styles.block}>
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
          </View>
        ) : null}

        <Card onPress={() => router.push('/(tabs)/collections')} style={styles.block}>
          <View style={styles.cardHead}>
            <Text variant="headline">Collections</Text>
            <Icon name="chevron" size={15} color={colors.textTertiary} />
          </View>

          <View style={styles.strip}>
            <BrandStrip brands={stats.brands} />
          </View>

          <View style={styles.collectionProgress}>
            <ProgressBar ratio={ownedCarIds.size / CARS.length} height={3} />
            <Text variant="caption" tone="tertiary">
              {ownedCarIds.size} / {CARS.length} modèles · {stats.completedBrands} /{' '}
              {BRANDS.length} marques complètes
            </Text>
          </View>
        </Card>

        {/* Bare, not in tiles: a counter is a readout, and boxing three of them
            gave the level the same weight as the cars it counts. */}
        <View style={styles.block}>
          <SectionHeader title="Progression" />
          <View style={styles.stats}>
            <StatBlock label="Voitures" value={formatNumber(stats.cars)} />
            <StatBlock label="Niveau" value={String(level)} />
            <StatBlock label="XP" value={formatNumber(stats.xp)} />
          </View>

          <View style={styles.progress}>
            <ProgressBar ratio={ratio} height={4} />
            <Text variant="caption" tone="tertiary">
              {xpToNext > 0
                ? `${formatNumber(xpToNext)} XP avant le niveau ${level + 1}`
                : 'Niveau maximum atteint'}
            </Text>
          </View>
        </View>
      </Screen>
    </TabSwipe>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: spacing.xxl,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progress: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  strip: {
    marginTop: spacing.lg,
  },
  collectionProgress: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xl,
  },
  cell: {
    width: gridItemWidth(COLUMNS),
  },
});
