import { Tabs } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Dock } from '../../src/components/Dock';
import { GarageDoor } from '../../src/components/GarageDoor';
import { consumeGarageDoor } from '../../src/lib/garageDoor';
import { colors } from '../../src/theme';

/**
 * All four routes stay registered; only two of them appear in the bar.
 * `<Dock>` promotes `scan` to the disc in its middle, and `profile` is reached
 * from `<TabSwitcher>` in the header instead.
 *
 * The order is also the order `<TabSwipe>` drags through, so Garage before
 * Collections is what makes a leftward drag slide leftwards.
 */
const TABS: { name: string; title: string }[] = [
  { name: 'index', title: 'Garage' },
  { name: 'collections', title: 'Collections' },
  { name: 'scan', title: 'Scanner' },
  { name: 'profile', title: 'Profil' },
];

export default function TabsLayout() {
  /**
   * Read once, on mount: `consumeGarageDoor` is a one-shot, so a re-render can
   * never re-arm the door and a tab change can never replay it. Here rather than
   * in `index.tsx` because the door has to cover the dock as well.
   */
  const [door, setDoor] = useState(consumeGarageDoor);

  return (
    <View style={styles.root}>
      <Tabs
        tabBar={(props) => <Dock {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          // `shift` is what makes `<TabSwipe>` feel like a swipe rather than a
          // teleport: it reads each scene's position relative to the active one,
          // so the screen you left slides out the way your finger went. `fade`
          // would be direction-blind, and the default `none` leaves the drag
          // with nothing to show for itself.
          animation: 'shift',
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

      {door ? <GarageDoor onOpened={() => setDoor(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
