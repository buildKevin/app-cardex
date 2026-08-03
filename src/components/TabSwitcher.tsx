import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * The two collection views, as text tabs, plus the way into the profile.
 *
 * This is the screen's title and its navigation at once — which is why no page
 * that renders it draws a title of its own. The tabs are set in `title` rather
 * than `display`: at 34pt "Garage" and "Collections" plus the profile button
 * overflow the gutter on a 375pt screen, and a header that wraps is worse than
 * a header set 10pt smaller.
 */
export function TabSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const onProfile = pathname.startsWith('/profile');

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <Tab
          label="Garage"
          active={pathname === '/'}
          onPress={() => router.navigate('/(tabs)')}
        />
        <Tab
          label="Collections"
          active={pathname.startsWith('/collections')}
          onPress={() => router.navigate('/(tabs)/collections')}
        />
      </View>

      {/* Profile is a destination, not a tab — so it gets the glyph, and the
          glyph fills in when you are on it. Without that state the header on
          the profile screen shows two inactive tabs and nothing selected. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profil"
        accessibilityState={{ selected: onProfile }}
        hitSlop={spacing.md}
        onPress={() => router.navigate('/(tabs)/profile')}
        style={onProfile ? styles.profileActive : undefined}
      >
        <Icon
          name={onProfile ? 'profile' : 'account'}
          size={onProfile ? 20 : 32}
          color={onProfile ? colors.textInverted : colors.text}
          strokeWidth={1.4}
        />
      </Pressable>
    </View>
  );
}

interface TabProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function Tab({ label, active, onPress }: TabProps) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress}>
      <Text variant="title" tone={active ? 'primary' : 'tertiary'}>
        {label}
      </Text>
      {/* Drawn only under the active tab, and inset so it reads as an
          underline rather than a border on the whole row. */}
      <View style={[styles.rule, !active && styles.ruleHidden]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  rule: {
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
    marginTop: spacing.xs + 2,
  },
  ruleHidden: {
    backgroundColor: 'transparent',
  },
  profileActive: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
