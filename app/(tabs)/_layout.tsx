import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Icon, type IconName } from '../../src/components/Icon';
import { colors, fonts } from '../../src/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Garage', icon: 'garage' },
  { name: 'collections', title: 'Collections', icon: 'collections' },
  { name: 'scan', title: 'Scanner', icon: 'scan' },
  { name: 'profile', title: 'Profil', icon: 'profile' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            // Per-screen as well as in screenOptions: every tab draws its own
            // large title, so the navigator header must never appear.
            headerShown: false,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} size={23} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    height: 84,
    paddingTop: 10,
    elevation: 0,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    letterSpacing: 0,
    marginTop: 2,
  },
  item: {
    paddingVertical: 2,
  },
});
