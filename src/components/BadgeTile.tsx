import { StyleSheet, View } from 'react-native';

import type { BadgeState } from '../data/badges';
import { colors, radii, spacing } from '../theme';
import { Icon } from './Icon';
import { ProgressBar } from './ProgressBar';
import { Text } from './Text';

interface BadgeTileProps {
  badge: BadgeState;
}

export function BadgeTile({ badge }: BadgeTileProps) {
  const { def, unlocked, value, ratio } = badge;

  return (
    <View style={[styles.root, unlocked && styles.unlocked]}>
      <View style={[styles.medal, unlocked && styles.medalUnlocked]}>
        <Icon
          name={unlocked ? 'badge' : 'lock'}
          size={18}
          color={unlocked ? colors.textInverted : colors.textTertiary}
        />
      </View>

      <Text variant="label" tone={unlocked ? 'primary' : 'secondary'} numberOfLines={2}>
        {def.name}
      </Text>

      {unlocked ? (
        <Text variant="caption" tone="tertiary">
          Débloqué
        </Text>
      ) : (
        <View style={styles.progress}>
          <ProgressBar ratio={ratio} height={2} color={colors.textSecondary} />
          <Text variant="caption" tone="tertiary">
            {Math.min(value, def.target)} / {def.target}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unlocked: {
    borderColor: colors.borderStrong,
  },
  medal: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  medalUnlocked: {
    backgroundColor: colors.accent,
  },
  progress: {
    gap: spacing.xs,
  },
});
