import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Dock } from '../../src/components/Dock';
import { GarageDoor } from '../../src/components/GarageDoor';
import {
  WELCOME_PAYWALL_DELAY,
  consumeGarageDoor,
  consumeWelcomePaywall,
} from '../../src/lib/welcome';
import { useGameStore } from '../../src/store/useGameStore';
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
  const router = useRouter();
  const isPro = useGameStore((state) => state.isPro);

  /**
   * Read once, on mount: `consumeGarageDoor` is a one-shot, so a re-render can
   * never re-arm the door and a tab change can never replay it. Here rather than
   * in `index.tsx` because the door has to cover the dock as well.
   */
  const [door, setDoor] = useState(consumeGarageDoor);
  /** Same one-shot read, for the offer onboarding handed over instead of showing. */
  const [welcomePaywall, setWelcomePaywall] = useState(consumeWelcomePaywall);

  /**
   * The paywall a player arriving from onboarding gets, once they have had their
   * garage to themselves for a moment.
   *
   * Waits for the door: five seconds counted from arrival is three and a half
   * seconds of garage and a second and a half of a door, which is not what the
   * pause is for. Owned here rather than by the garage screen because a tab change
   * would unmount that one and take the timer with it.
   */
  useEffect(() => {
    if (!welcomePaywall || door) return;

    // Nothing to sell a subscriber, and a reinstalling Pro player goes through
    // onboarding like everybody else. RevenueCat has usually answered by the time
    // the door is up; if it answers later, this effect re-runs and drops the flag.
    if (isPro) {
      setWelcomePaywall(false);
      return;
    }

    const timer = setTimeout(() => {
      setWelcomePaywall(false);
      // Pushed, not replaced: it sits over the garage now, so dismissing it puts
      // the player back where they already were.
      router.push('/paywall?context=onboarding');
    }, WELCOME_PAYWALL_DELAY);

    return () => clearTimeout(timer);
  }, [welcomePaywall, door, isPro, router]);

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
