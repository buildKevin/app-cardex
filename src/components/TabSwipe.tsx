import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

/**
 * The two sections a sideways drag moves between, in the order
 * `app/(tabs)/_layout.tsx` registers them.
 *
 * That order is not decoration: `animation: 'shift'` reads a screen's position
 * relative to the active one, so registering Collections after Garage is what
 * makes the outgoing screen leave to the left when you drag leftwards. A list
 * written the other way round here would navigate correctly and animate
 * backwards.
 *
 * Scan and Profile are registered in the same navigator and are deliberately
 * absent: scan is the disc in the middle of the dock rather than a section, and
 * mounting the camera because a finger slipped is not a gesture anyone wants.
 */
const SECTIONS = ['/(tabs)', '/(tabs)/collections'] as const;

/**
 * How far sideways before the drag is ours rather than the page's. The page
 * under this scrolls vertically, so the gesture has to stay asleep through a
 * flick down the garage and only wake on something clearly horizontal.
 */
const ACTIVATION = 24;
/** Any vertical travel past this and the drag was a scroll — give up for good. */
const GIVE_UP = 18;
/** A slow drag counts once it has crossed this much of the screen. */
const DISTANCE = 64;
/** A flick counts on speed alone, so a short fast one still switches. */
const VELOCITY = 500;

interface TabSwipeProps {
  children: ReactNode;
}

/**
 * Wraps a section screen so a horizontal drag switches to the neighbouring one.
 *
 * There is no finger-following transition, and that is a deliberate limit rather
 * than an oversight: the sections are screens of a bottom-tab navigator, whose
 * scenes are not laid out side by side, so nothing exists to drag. Carrying the
 * finger would mean swapping the navigator for a pager — a native dependency
 * (`react-native-tab-view` and `react-native-pager-view` behind expo-router's
 * `TopTabs`), a rebuild, and the dock rewritten against a different props shape.
 * What ships instead is a decisive drag plus the navigator's own `shift`
 * animation, which slides in the direction you dragged.
 *
 * The ends of the row are walls, not a carousel: dragging left on Collections
 * does nothing, because wrapping round to the Garage from the last section reads
 * as the app losing its place.
 */
export function TabSwipe({ children }: TabSwipeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const index = pathname.startsWith('/collections') ? 1 : 0;

  const swipe = Gesture.Pan()
    .activeOffsetX([-ACTIVATION, ACTIVATION])
    .failOffsetY([-GIVE_UP, GIVE_UP])
    // The handler navigates, it does not animate, so there is nothing worth
    // keeping on the UI thread — and `router` is not a worklet.
    .runOnJS(true)
    .onEnd((event) => {
      const decisive =
        Math.abs(event.translationX) > DISTANCE || Math.abs(event.velocityX) > VELOCITY;
      if (!decisive) return;

      // Dragging leftwards moves forward through the row, the way the content
      // itself appears to travel.
      const next = SECTIONS[index + (event.translationX < 0 ? 1 : -1)];
      if (!next) return;

      router.navigate(next);
    });

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.root}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
