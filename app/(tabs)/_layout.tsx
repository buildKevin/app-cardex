import { Tabs } from 'expo-router';

import { Dock } from '../../src/components/Dock';
import { colors } from '../../src/theme';

/**
 * All four routes stay registered; only two of them appear in the bar.
 * `<Dock>` promotes `scan` to the disc in its middle, and `profile` is reached
 * from `<TabSwitcher>` in the header instead.
 */
const TABS: { name: string; title: string }[] = [
  { name: 'index', title: 'Garage' },
  { name: 'collections', title: 'Collections' },
  { name: 'scan', title: 'Scanner' },
  { name: 'profile', title: 'Profil' },
];

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <Dock {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            // Per-screen as well as in screenOptions: every tab draws its own
            // header, so the navigator header must never appear.
            headerShown: false,
          }}
        />
      ))}
    </Tabs>
  );
}
