import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  trailing?: string;
}

export function SectionHeader({ title, trailing }: SectionHeaderProps) {
  return (
    <View style={styles.root}>
      <Text variant="overline" tone="tertiary" uppercase>
        {title}
      </Text>
      {trailing ? (
        <Text variant="overline" tone="tertiary">
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
});
