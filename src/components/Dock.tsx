import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter, radii, shadow, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

const BAR_HEIGHT = 62;
/** Half again as tall as the bar, so it reads as sitting on top of it. */
const FAB_SIZE = 74;

/**
 * Read off `<Tabs>` rather than imported from `@react-navigation/bottom-tabs`:
 * that package is not a dependency of this app, only a transitive one behind
 * expo-router, and importing it directly is how a version skew gets in.
 */
type DockProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * The bottom bar: a floating white pill holding the two sections, with scanning
 * as a black disc in the middle.
 *
 * Scan is not a tab. It is the one thing the app is for, it is reached far more
 * often than either section, and as a tab it was a 23pt icon indistinguishable
 * from the other three. The garage screen used to dock its own full-width
 * "Scanner une voiture" button for exactly that reason — this replaces it, so
 * the action is on every screen instead of one, and the screen gets its
 * bottom back.
 *
 * Profile is missing on purpose: it lives in the header, next to the tabs.
 */
export function Dock({ state, navigation }: DockProps) {
  const insets = useSafeAreaInsets();
  const active = state.routes[state.index]?.name;

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        <View style={styles.slotStart}>
          <DockItem
            label="Garage"
            emoji="🚗"
            active={active === 'index'}
            onPress={() => navigation.navigate('index')}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scanner une voiture"
          style={styles.fab}
          onPress={() => navigation.navigate('scan')}
        >
          <Icon name="scan" size={30} color={colors.textInverted} strokeWidth={2} />
        </Pressable>

        <View style={styles.slotEnd}>
          <DockItem
            label="Collections"
            emoji="🗂️"
            active={active === 'collections'}
            onPress={() => navigation.navigate('collections')}
          />
        </View>
      </View>
    </View>
  );
}

interface DockItemProps {
  label: string;
  /** An emoji, not an `<Icon>`: the bar is the one place in the app that wants
      a warm, physical mark rather than a hairline glyph, and a flat stroke icon
      on the black pill read as a system tab bar. */
  emoji: string;
  active: boolean;
  onPress: () => void;
}

function DockItem({ label, emoji, active, onPress }: DockItemProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
    >
      <Text variant="emoji">{emoji}</Text>
      <Text
        variant="bodyMedium"
        color={active ? colors.textInverted : colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: gutter,
    // Room for the disc, which sits proud of the bar's top edge.
    paddingTop: spacing.xl,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs + 2,
    ...shadow.raised,
  },
  // Equal halves, so the disc lands dead centre whatever the labels say. The
  // pill inside is sized by its content, not by the half it sits in.
  slotStart: {
    flex: 1,
    alignItems: 'flex-start',
  },
  slotEnd: {
    flex: 1,
    alignItems: 'flex-end',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
  },
  itemActive: {
    backgroundColor: colors.accent,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // A ring in the canvas colour, so the disc stays a separate object where it
    // overlaps the bar instead of merging into a black notch.
    borderWidth: 5,
    borderColor: colors.bg,
    ...shadow.raised,
  },
});
