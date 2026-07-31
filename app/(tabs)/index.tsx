import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '../../src/components/Button';
import { CarTile } from '../../src/components/CarTile';
import { EmptyState } from '../../src/components/EmptyState';
import { ProgressBar } from '../../src/components/ProgressBar';
import { RarityBreakdown } from '../../src/components/RarityBreakdown';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Text } from '../../src/components/Text';
import { formatNumber } from '../../src/lib/format';
import { useGameStore, useStats } from '../../src/store/useGameStore';
import { gridItemWidth, motion, spacing } from '../../src/theme';

export default function Garage() {
  const router = useRouter();
  const garage = useGameStore((state) => state.garage);
  const stats = useStats();

  const { level, xpToNext, ratio } = stats.progress;
  const hasCars = stats.cars > 0;

  return (
    <Screen scroll>
      <Text variant="overline" tone="tertiary" uppercase>
        Garage
      </Text>

      {/* One focal figure; everything else is a supporting line. */}
      <View style={styles.hero}>
        <Text variant="hero">{formatNumber(stats.cars)}</Text>
        <Text variant="body" tone="secondary">
          {stats.cars === 1 ? 'voiture collectionnée' : 'voitures collectionnées'}
        </Text>
      </View>

      <View style={styles.level}>
        <View style={styles.levelRow}>
          <Text variant="bodyMedium">Niveau {level}</Text>
          <Text variant="bodyMedium" tone="secondary">
            {formatNumber(stats.xp)} XP
          </Text>
        </View>

        <ProgressBar ratio={ratio} height={2} />

        <Text variant="caption" tone="tertiary">
          {xpToNext > 0
            ? `${formatNumber(xpToNext)} XP avant le niveau ${level + 1}`
            : 'Niveau maximum atteint'}
        </Text>
      </View>

      {hasCars ? (
        <View style={styles.rarity}>
          <RarityBreakdown counts={stats.rarityCounts} />
        </View>
      ) : null}

      {/* No scan counter here on purpose — a countdown reads as a warning. */}
      <Button
        label="Scanner une voiture"
        size="xl"
        onPress={() => router.push('/(tabs)/scan')}
        style={styles.cta}
      />

      <View style={styles.section}>
        {hasCars ? (
          <>
            <SectionHeader title="Dernières découvertes" trailing={formatNumber(stats.cars)} />
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
  hero: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  level: {
    marginTop: spacing.xxl,
    gap: spacing.sm,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  rarity: {
    marginTop: spacing.xl,
  },
  cta: {
    marginTop: spacing.xxl,
  },
  section: {
    marginTop: spacing.xxl,
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
