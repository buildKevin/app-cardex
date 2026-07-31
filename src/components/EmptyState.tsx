import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { CarSilhouette } from './CarSilhouette';
import { Text } from './Text';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.root}>
      <CarSilhouette width={140} color="#16161B" />
      <View style={styles.copy}>
        <Text variant="headline" tone="secondary" center>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" tone="tertiary" center>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  copy: {
    gap: spacing.sm,
    maxWidth: 260,
  },
});
