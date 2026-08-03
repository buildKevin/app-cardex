import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { colors, motion, radii, shadow, spacing, withAlpha } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

const { height } = Dimensions.get('window');

/** Enough slats to read as corrugated metal at any screen height. */
const SLATS = 16;

interface GarageDoorProps {
  /** Called once the door is fully up, so the caller can unmount it. */
  onOpened: () => void;
}

/**
 * A garage door rolling up off the screen, played once when a player walks out
 * of onboarding into their garage.
 *
 * It closes nothing: it mounts already shut, holds for a beat so the player
 * registers a door rather than a black flash, then travels the full height on a
 * slow mechanical ease. The two haptics are the point of the beat — a heavy one
 * as it settles shut, a light one as it stops at the top.
 *
 * Mounted above the navigator rather than inside a screen, so it covers the tab
 * bar too. A door with a dock showing through the bottom of it is a curtain.
 */
export function GarageDoor({ onOpened }: GarageDoorProps) {
  /** 0 shut, 1 fully up. */
  const lift = useSharedValue(0);

  /**
   * The callback as it was on first render, held so the effect below never
   * re-runs. Callers pass an inline arrow and the navigator above this
   * re-renders on every tab change — with `onOpened` in the dependency list,
   * one of those would restart the animation and drop a fully-opened door back
   * down over the garage.
   *
   * Deliberately never reassigned: the door plays once, and every arrow a caller
   * passes closes over the same `useState` setter anyway, so the first one is as
   * current as the tenth.
   */
  const opened = useRef(onOpened);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    // Captured as a plain function: a worklet can call this, it cannot read a
    // ref's `.current` off the UI thread.
    const finish = opened.current;

    lift.value = withDelay(
      motion.slow,
      withTiming(
        1,
        // Real doors start slow, run, and stop slow. Linear reads as a wipe.
        { duration: motion.door, easing: Easing.inOut(Easing.cubic) },
        (done) => {
          if (done) runOnJS(finish)();
        },
      ),
    );
  }, [lift]);

  const doorStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -height * lift.value }],
  }));

  return (
    // Not `pointerEvents: none`: a door is solid, and a card tapped through it
    // would navigate away from the garage the player is being shown.
    <Animated.View style={[styles.door, doorStyle]}>
      <View style={styles.slats}>
        {Array.from({ length: SLATS }, (_, index) => (
          <View key={index} style={styles.slat} />
        ))}
      </View>

      <View style={styles.plate}>
        <Icon name="garage" size={34} color={withAlpha(colors.textInverted, 0.5)} />
        <Text variant="overline" color={withAlpha(colors.textInverted, 0.45)} uppercase center>
          Ton garage
        </Text>
      </View>

      {/* The leading edge. Without it the door has no bottom, and a slab of ink
          sliding upward could be anything. */}
      <View style={styles.rail} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  door: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  slats: {
    ...StyleSheet.absoluteFill,
  },
  /**
   * One highlight line per slat and nothing else: on near-black, a hairline of
   * white at the top of each panel is all corrugation needs.
   */
  slat: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(colors.textInverted, 0.09),
  },
  plate: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 5,
    borderRadius: radii.sm,
    backgroundColor: withAlpha(colors.textInverted, 0.22),
  },
});
