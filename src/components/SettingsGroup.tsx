import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { Text } from './Text';

interface SettingsGroupProps {
  title: string;
  children: ReactNode;
  /** Explanation sitting under the group, for anything irreversible. */
  footnote?: string;
}

/** A titled card of SettingsRow children, separated by hairlines. */
export function SettingsGroup({ title, children, footnote }: SettingsGroupProps) {
  return (
    <View style={styles.root}>
      <Text variant="overline" tone="tertiary" uppercase style={styles.title}>
        {title}
      </Text>

      <View style={styles.card}>{children}</View>

      {footnote ? (
        <Text variant="caption" tone="tertiary" style={styles.footnote}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.xxl,
  },
  title: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  footnote: {
    marginTop: spacing.md,
  },
});
