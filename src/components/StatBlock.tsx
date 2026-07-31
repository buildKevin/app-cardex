import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { Text } from './Text';

interface StatBlockProps {
  label: string;
  value: string;
  align?: 'left' | 'center';
}

export function StatBlock({ label, value, align = 'left' }: StatBlockProps) {
  return (
    <View style={[styles.root, align === 'center' && styles.center]}>
      <Text variant="metric">{value}</Text>
      <Text variant="overline" tone="tertiary" uppercase>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  center: {
    alignItems: 'center',
  },
});
