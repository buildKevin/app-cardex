import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { CarTile } from '../../src/components/CarTile';
import { EmptyState } from '../../src/components/EmptyState';
import { ProgressBar } from '../../src/components/ProgressBar';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { StatBlock } from '../../src/components/StatBlock';
import { Text } from '../../src/components/Text';
import { formatNumber } from '../../src/lib/format';
import { useGameStore, useScansLeft, useStats } from '../../src/store/useGameStore';
import { gridItemWidth, motion, spacing } from '../../src/theme';

export default function Garage() {
  const router = useRouter();
  const garage = useGameStore((state) => state.garage);
  const isFounder = useGameStore((state) => state.isFounder);
  const stats = useStats();
  const left = useScansLeft();

  const { level, current, span, xpToNext } = stats.progress;

  return (
    <Screen scroll>
      <Text variant="display">Garage</Text>

      <Card style={styles.statCard}>
        <View style={styles.statRow}>
          <StatBlock label="Voitures" value={formatNumber(stats.cars)} />
          <StatBlock label="Niveau" value={String(level)} />
          <StatBlock label="XP" value={formatNumber(stats.xp)} />
        </View>

        <View style={styles.progress}>
          <ProgressBar ratio={stats.progress.ratio} />
          <View style={styles.progressLabels}>
            <Text variant="caption" tone="tertiary">
              {formatNumber(current)} / {formatNumber(span)} XP
            </Text>
            <Text variant="caption" tone="tertiary">
              {xpToNext > 0 ? `${formatNumber(xpToNext)} XP → niveau ${level + 1}` : 'Niveau max atteint'}
            </Text>
          </View>
        </View>
      </Card>

      <Button
        label="Scanner une voiture"
        size="xl"
        onPress={() => router.push('/(tabs)/scan')}
        caption={isFounder ? 'Scans illimités' : `${left} scan${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}`}
        style={styles.cta}
      />

      <View style={styles.section}>
        <SectionHeader
          title="Dernières découvertes"
          trailing={stats.cars > 0 ? formatNumber(stats.cars) : undefined}
        />

        {garage.length === 0 ? (
          <EmptyState
            title="Ton garage est vide"
            subtitle="Trouve une voiture dans la rue et scanne-la pour ouvrir ta première carte."
          />
        ) : (
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
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statCard: {
    marginTop: spacing.xl,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progress: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cta: {
    marginTop: spacing.lg,
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
