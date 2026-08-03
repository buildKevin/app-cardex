import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, motion, radii, shadow, spacing, withAlpha } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

const { height, width } = Dimensions.get('window');

/**
 * One slat, in points.
 *
 * Fixed, never a fraction of the screen. Corrugation is a real texture at a real
 * size, and this is where the first version went wrong: sixteen `flex: 1` panels
 * on a 900pt phone is a 56pt band with one hairline across it, which reads as a
 * black wall with lines on it. At 34pt a phone shows about twenty-five, which is
 * roughly what a real shutter shows, and the eye recognises it before it has
 * decided what it is looking at.
 */
const SLAT = 34;

/** The leading edge. Thicker than a slat, and the single strongest cue. */
const RAIL = 18;
/** Its pull handle. A door has something to pull; a panel does not. */
const HANDLE_WIDTH = 76;
const HANDLE_HEIGHT = 5;
/** The channels the door runs in, drawn over the slats down both edges. */
const GUIDE = 11;

/**
 * How far the door drops onto its springs before it goes up.
 *
 * The container hangs this much *below* the screen so the drop never uncovers a
 * strip of garage at the bottom — the point of the door is that nothing is
 * visible behind it until it lifts.
 */
const UNLATCH = 9;

const DOOR_HEIGHT = height + UNLATCH;
const SLATS = Math.ceil(DOOR_HEIGHT / SLAT);

interface GarageDoorProps {
  /** Called once the door is fully up, so the caller can unmount it. */
  onOpened: () => void;
}

/**
 * A garage door rolling up off the screen, played once when a player walks out
 * of onboarding into their garage.
 *
 * It closes nothing: it mounts already shut, drops onto its springs, then travels
 * the full height on a slow mechanical ease. Two haptics frame it — a heavy one
 * as it settles, a light one as it stops at the top.
 *
 * What makes it read as a door rather than as a dark layer being animated away is
 * all in the surface, and none of it is decoration:
 *
 * - Every slat is shaded, not outlined. The light comes from above, so the top of
 *   each panel catches it and the bottom stays the canvas's own near-black — that
 *   unlit band *is* the groove, which is also why the door cannot be black to
 *   begin with. A hairline per panel gave the outline of corrugation with none of
 *   the roundness, and roundness is the whole signal.
 * - Guide channels down both edges. A shutter with nothing holding it is a
 *   curtain, and two vertical rails place the object instantly.
 * - A thick bottom rail with a handle on it. A door has something to pull.
 *
 * Mounted above the navigator rather than inside a screen, so it covers the tab
 * bar too. A door with a dock showing through the bottom of it is a curtain.
 */
export function GarageDoor({ onOpened }: GarageDoorProps) {
  /** 0 shut, 1 fully up. Negative for the drop before the lift. */
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
    const settle = opened.current;
    const finish = () => {
      // The door arriving at its stop. Light, because it is the end of the
      // movement and not an impact.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      settle();
    };

    lift.value = withDelay(
      motion.slow,
      withSequence(
        // Onto the springs first. Without it the lift starts from nothing and the
        // whole thing reads as a layer fading upward rather than as a mechanism.
        withTiming(-UNLATCH / DOOR_HEIGHT, {
          duration: motion.fast,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(
          1,
          // Real doors start slow, run, and stop slow. Linear reads as a wipe.
          { duration: motion.door, easing: Easing.inOut(Easing.cubic) },
          (done) => {
            if (done) runOnJS(finish)();
          },
        ),
      ),
    );
  }, [lift]);

  const doorStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -DOOR_HEIGHT * lift.value }],
  }));

  // The sign goes before the door does: it is painted on something that is
  // leaving, and holding it at full strength all the way up drags the eye off the
  // garage arriving underneath.
  const plateStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.max(0, lift.value) * 3),
  }));

  return (
    // Not `pointerEvents: none`: a door is solid, and a card tapped through it
    // would navigate away from the garage the player is being shown.
    <Animated.View style={[styles.door, doorStyle]}>
      <Svg width={width} height={DOOR_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* One panel of shading, reused by every slat. Pure white at varying
              opacity over the door's own near-black: the lip at the top, the
              brightest ridge just under it, then a fall to nothing — and that
              nothing, at the bottom of every panel, is the groove. */}
          <LinearGradient id="slat" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.textInverted} stopOpacity={0.1} />
            <Stop offset="0.07" stopColor={colors.textInverted} stopOpacity={0.2} />
            <Stop offset="0.45" stopColor={colors.textInverted} stopOpacity={0.075} />
            <Stop offset="0.88" stopColor={colors.textInverted} stopOpacity={0.02} />
            <Stop offset="1" stopColor={colors.textInverted} stopOpacity={0} />
          </LinearGradient>

          {/* A wide, very faint sheen down the middle. A flat wall of identical
              slats is a texture; a sheen makes it a surface with a shape. */}
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.textInverted} stopOpacity={0} />
            <Stop offset="0.42" stopColor={colors.textInverted} stopOpacity={0.045} />
            <Stop offset="1" stopColor={colors.textInverted} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {Array.from({ length: SLATS }, (_, index) => (
          <Rect
            key={index}
            x={0}
            y={index * SLAT}
            width={width}
            height={SLAT}
            fill="url(#slat)"
          />
        ))}

        <Rect x={0} y={0} width={width} height={DOOR_HEIGHT} fill="url(#sheen)" />
      </Svg>

      {/* Over the slats, because the channels are in front of the door they hold.
          Lighter rather than darker: near-black is already the darkest thing on
          screen, so metal catching the light is the only way left to model it. */}
      <View style={[styles.guide, styles.guideLeft]} />
      <View style={[styles.guide, styles.guideRight]} />

      <Animated.View style={[styles.plate, plateStyle]}>
        <Icon name="garage" size={34} color={withAlpha(colors.textInverted, 0.5)} />
        <Text variant="overline" color={withAlpha(colors.textInverted, 0.45)} uppercase center>
          Ton garage
        </Text>
      </Animated.View>

      {/* The leading edge, and what a hand would take hold of. Without these the
          door has no bottom, and a slab of ink sliding upward could be anything. */}
      <View style={styles.rail}>
        <View style={styles.handle} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  door: {
    ...StyleSheet.absoluteFill,
    // Hangs below the screen by exactly the drop, so the unlatch cannot flash a
    // strip of the garage along the bottom edge.
    bottom: -UNLATCH,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  guide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: GUIDE,
    backgroundColor: withAlpha(colors.textInverted, 0.07),
  },
  guideLeft: {
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: withAlpha(colors.textInverted, 0.16),
  },
  guideRight: {
    right: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: withAlpha(colors.textInverted, 0.16),
  },
  plate: {
    alignItems: 'center',
    gap: spacing.sm,
    // Sits where it does because the container centres it and the door hangs low:
    // without this it reads a hair below the middle of the screen.
    marginBottom: UNLATCH,
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    // At the screen's bottom edge, not the container's — the container hangs
    // lower on purpose.
    bottom: UNLATCH,
    height: RAIL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.textInverted, 0.11),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(colors.textInverted, 0.26),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(colors.textInverted, 0.3),
  },
  handle: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: withAlpha(colors.textInverted, 0.34),
  },
});
