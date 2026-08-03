import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { colors, gutter, radii, spacing } from '../theme';
import { Text } from './Text';

export interface Chip<T extends string> {
  value: T;
  label: string;
}

interface ChipRowProps<T extends string> {
  chips: Chip<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A row of filter pills: grey by default, ink-filled when selected.
 *
 * Horizontally scrollable and bled past the gutter, because the row has to be
 * allowed to run off the edge — wrapping filters onto a second line turns a
 * one-line control into a block that pushes the content it filters off screen.
 */
export function ChipRow<T extends string>({ chips, value, onChange }: ChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bleed}
      contentContainerStyle={styles.row}
    >
      {chips.map((chip) => {
        const selected = chip.value === value;

        return (
          <Pressable
            key={chip.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(chip.value)}
          >
            <Text
              variant="bodyMedium"
              color={selected ? colors.textInverted : colors.textSecondary}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -gutter,
  },
  row: {
    paddingHorizontal: gutter,
    gap: spacing.sm,
  },
  chip: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
});
