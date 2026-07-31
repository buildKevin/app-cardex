import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BadgeTile } from '../src/components/BadgeTile';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { badgeStates, rankBadges, unlockedBadgeCount } from '../src/data/badges';
import { useStats } from '../src/store/useGameStore';
import { colors, gridItemWidth, gutter, spacing } from '../src/theme';

export default function AllBadges() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stats = useStats();

  const badges = rankBadges(badgeStates(stats));
  const unlocked = unlockedBadgeCount(stats);

  return (
    <View style={styles.root}>
      <Screen scroll edgeToEdgeTop contentStyle={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
          <Text variant="title">Tes badges</Text>
          <Text variant="body" tone="secondary">
            {unlocked} débloqué{unlocked > 1 ? 's' : ''} sur {badges.length}.
          </Text>
        </View>

        <View style={styles.grid}>
          {badges.map((badge) => (
            <View key={badge.def.id} style={styles.cell}>
              <BadgeTile badge={badge} />
            </View>
          ))}
        </View>
      </Screen>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button label="Fermer" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screen: {
    paddingBottom: 140,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cell: {
    width: gridItemWidth(2),
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: gutter,
    paddingTop: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
