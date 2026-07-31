import { StyleSheet, View } from 'react-native';

import type { Brand } from '../data/types';
import type { BrandProgress } from '../lib/stats';
import { colors, radii, spacing } from '../theme';
import { BrandLogo } from './BrandLogo';
import { Card } from './Card';
import { Icon } from './Icon';
import { ProgressBar } from './ProgressBar';
import { Text } from './Text';

interface BrandRowProps {
  brand: Brand;
  progress: BrandProgress;
  onPress: () => void;
}

export function BrandRow({ brand, progress, onPress }: BrandRowProps) {
  return (
    <Card onPress={onPress}>
      <View style={styles.head}>
        <View style={styles.leading}>
          {/* Untouched collections keep their mark dimmed — progress lights it up. */}
          <BrandLogo
            brandId={brand.id}
            name={brand.name}
            size={40}
            color={progress.owned > 0 ? colors.text : colors.textTertiary}
          />
          <View style={styles.titles}>
            <Text variant="headline">{brand.name}</Text>
            <Text variant="caption" tone="tertiary">
              {brand.country}
            </Text>
          </View>
        </View>

        <View style={styles.trailing}>
          <Text variant="bodyMedium" tone={progress.complete ? 'primary' : 'secondary'}>
            {progress.owned} / {progress.total}
          </Text>
          {progress.complete ? (
            <View style={styles.completeDot}>
              <Icon name="check" size={12} color={colors.textInverted} strokeWidth={2.4} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.bar}>
        <ProgressBar ratio={progress.total ? progress.owned / progress.total : 0} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
  },
  titles: {
    gap: 2,
    flexShrink: 1,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  completeDot: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    marginTop: spacing.lg,
  },
});
