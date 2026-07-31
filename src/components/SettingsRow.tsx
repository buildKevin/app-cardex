import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface SettingsRowProps {
  label: string;
  /** Right-aligned value, for read-only facts. */
  value?: string;
  /** Second line under the label, for the consequences of a destructive action. */
  hint?: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  /** Small pill instead of a plain value — used for status. */
  badge?: string;
  last?: boolean;
}

export function SettingsRow({
  label,
  value,
  hint,
  onPress,
  loading,
  disabled,
  destructive,
  badge,
  last,
}: SettingsRowProps) {
  const inert = !onPress || disabled || loading;

  const content = (
    <View style={[styles.row, !last && styles.divided, disabled && styles.disabled]}>
      <View style={styles.text}>
        <Text variant="bodyMedium" color={destructive ? colors.danger : colors.text}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="tertiary" style={styles.hint}>
            {hint}
          </Text>
        ) : null}
      </View>

      <View style={styles.trailing}>
        {loading ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}

        {!loading && badge ? (
          <View style={styles.badge}>
            <Text variant="overline" tone="inverted" uppercase>
              {badge}
            </Text>
          </View>
        ) : null}

        {!loading && value ? (
          <Text variant="body" tone="secondary" numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        ) : null}

        {!loading && onPress && !destructive ? (
          <Icon name="chevron" size={16} color={colors.textTertiary} />
        ) : null}
      </View>
    </View>
  );

  if (inert) return content;

  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.surfaceElevated }}>
      {({ pressed }) => <View style={pressed ? styles.pressed : undefined}>{content}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  divided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    backgroundColor: colors.surfaceElevated,
  },
  text: {
    flexShrink: 1,
    gap: 2,
  },
  hint: {
    maxWidth: 240,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  value: {
    maxWidth: 170,
  },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
});
