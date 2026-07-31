import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { Text } from './Text';

interface SpecRowProps {
  label: string;
  value: string;
  /** Skip the hairline separator on the last row. */
  last?: boolean;
}

export function SpecRow({ label, value, last }: SpecRowProps) {
  return (
    <View style={[styles.root, !last && styles.divided]}>
      <Text variant="body" tone="secondary">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 2,
    gap: spacing.lg,
  },
  divided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
