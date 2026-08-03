import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BrandStrip } from '../../src/components/BrandStrip';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { CarTile } from '../../src/components/CarTile';
import { GarageHero } from '../../src/components/GarageHero';
import { Icon } from '../../src/components/Icon';
import { ProgressBar } from '../../src/components/ProgressBar';
import { RarityBar } from '../../src/components/RarityBar';
import { RarityBreakdown } from '../../src/components/RarityBreakdown';
import { Screen } from '../../src/components/Screen';
import { Scrim } from '../../src/components/Scrim';
import { SectionHeader } from '../../src/components/SectionHeader';
import { StatBlock } from '../../src/components/StatBlock';
import { Text } from '../../src/components/Text';
import { BRANDS } from '../../src/data/brands';
import { CARS } from '../../src/data/cars';
import { formatNumber } from '../../src/lib/format';
import { useGameStore, useStats } from '../../src/store/useGameStore';
import { colors, gridItemWidth, gutter, motion, spacing } from '../../src/theme';

/** Room under the scroll for the docked call to action. */
const DOCK_HEIGHT = 132;

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
    <View style={styles.root}>
      <Screen scroll bleed edgeToEdgeTop contentStyle={styles.content}>
        <GarageHero
          entry={featured}
          onPress={featured ? () => router.push(`/car/${featured.id}`) : undefined}
        />

        <View style={styles.page}>
          <Card>
            <View style={styles.stats}>
              <StatBlock label="Voitures" value={formatNumber(stats.cars)} />
              <View style={styles.divider} />
              <StatBlock label="Niveau" value={String(level)} />
              <View style={styles.divider} />
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
          </Card>

          {hasCars ? (
            <View style={styles.block}>
              <SectionHeader title="Raretés" />
              <RarityBar counts={stats.rarityCounts} />
              <View style={styles.legend}>
                <RarityBreakdown counts={stats.rarityCounts} />
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

          {/* No empty state here — the hero already says the garage is empty,
              and saying it twice on one screen reads as a bug. */}
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
        </View>
      </Screen>

      {/* Scanning is the whole app, so the button never scrolls away.
          No scan counter on purpose — a countdown reads as a warning. */}
      <View style={styles.dock} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Scrim height="100%" strength={1} />
        </View>
        <Button
          label="Scanner une voiture"
          size="xl"
          onPress={() => router.push('/(tabs)/scan')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: DOCK_HEIGHT,
  },
  page: {
    paddingHorizontal: gutter,
    marginTop: spacing.xl,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  progress: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  block: {
    marginTop: spacing.xxl,
  },
  legend: {
    marginTop: spacing.md,
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
    gap: spacing.md,
  },
  cell: {
    width: gridItemWidth(2),
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: gutter,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
  },
});
