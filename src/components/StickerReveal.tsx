import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, motion, withAlpha } from '../theme';

interface StickerRevealProps {
  /** The photograph. On screen alone until the sticker lands on top of it. */
  before: string | null;
  /** The sticker. Null when none was generated — then nothing explodes. */
  after: string | null;
  /** Rarity colour, so the burst is the colour of what was won. */
  accent: string;
  /** Corner rounding for the picture, matching the card it sits in. */
  radius: number;
  style?: ViewStyle;
}

/**
 * The photograph turning into a sticker, as an event rather than a cross-fade.
 *
 * The player has just waited half a minute for this, and a 260ms opacity swap
 * spends that wait on nothing. So the photograph is held a beat, blown apart —
 * flash, shockwave, shards in the car's rarity colour — and the sticker snaps
 * into the hole it left, overshooting once before it settles.
 *
 * The burst deliberately escapes the picture: it is drawn in a layer with no
 * clipping, over the card, which is why the caller must not wrap this in
 * `overflow: 'hidden'` — the images clip themselves instead. A burst that stops
 * dead on a rounded edge reads as a video playing inside a frame.
 *
 * With no sticker to reveal (a failed or refused generation) it degrades to the
 * photograph, silently: an explosion that ends on the same picture is a bug.
 */
export function StickerReveal({ before, after, accent, radius, style }: StickerRevealProps) {
  /** 0 → 1 over the burst: shards travel, ring expands, both fade. */
  const burst = useSharedValue(0);
  const flash = useSharedValue(0);
  /** 0 → 1 as the sticker arrives, overshooting past 1 on the way. */
  const land = useSharedValue(0);
  const photo = useSharedValue(1);

  useEffect(() => {
    if (!after) return;

    // Long enough for the player to register that they are looking at their own
    // photograph. Without it the explosion is over before the eye arrives.
    const hold = motion.reveal;

    flash.value = withDelay(
      hold,
      withSequence(
        withTiming(1, { duration: motion.flash }),
        withTiming(0, { duration: motion.base }),
      ),
    );
    burst.value = withDelay(
      hold,
      withTiming(1, { duration: motion.burst, easing: Easing.out(Easing.cubic) }),
    );
    // Under the flash, so the swap itself is never seen.
    photo.value = withDelay(hold + motion.flash, withTiming(0, { duration: motion.fast }));
    land.value = withDelay(
      hold + motion.flash,
      // `back` is what makes it land rather than appear: it passes the final
      // scale and comes back to it.
      withTiming(1, { duration: motion.reveal, easing: Easing.out(Easing.back(2.2)) }),
    );

    const impact = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, hold);
    return () => clearTimeout(impact);
  }, [after, burst, flash, land, photo]);

  const photoStyle = useAnimatedStyle(() => ({ opacity: photo.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const landStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, land.value * 2),
    transform: [
      { scale: 0.35 + land.value * 0.65 },
      { rotate: `${(1 - land.value) * -16}deg` },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - burst.value),
    transform: [{ scale: 0.15 + burst.value * 2.6 }],
  }));

  return (
    <View style={[styles.root, style]}>
      {/* The images clip themselves: the burst layer below must not be clipped,
          so the rounding cannot live on the container. */}
      <View style={[styles.frame, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}>
        {before ? (
          <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
            <Image
              source={{ uri: before }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={220}
            />
          </Animated.View>
        ) : null}

        {after ? (
          <Animated.View style={[StyleSheet.absoluteFill, landStyle]}>
            <Image
              source={{ uri: after }}
              style={StyleSheet.absoluteFill}
              // Die-cut: cropping it to fill would cut off the edge that makes
              // it a sticker.
              contentFit="contain"
            />
          </Animated.View>
        ) : null}
      </View>

      {after ? (
        <View style={styles.burst} pointerEvents="none">
          <Animated.View
            style={[styles.ring, { borderColor: withAlpha(accent, 0.5) }, ringStyle]}
          />

          {SHARDS.map((shard, index) => (
            <Shard key={index} shard={shard} progress={burst} color={accent} />
          ))}

          <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
        </View>
      ) : null}
    </View>
  );
}

interface ShardSpec {
  angle: number;
  distance: number;
  size: number;
}

/**
 * Where the pieces go. Precomputed rather than random, so the burst is the same
 * every time — an explosion that differs per run cannot be tuned, and this one
 * is deliberately uneven already: three distances and two sizes, so it reads as
 * debris rather than as a clock face.
 */
const SHARDS: ShardSpec[] = Array.from({ length: 18 }, (_, index) => ({
  angle: (index / 18) * Math.PI * 2,
  distance: 140 + (index % 3) * 46,
  size: index % 2 === 0 ? 9 : 5,
}));

function Shard({
  shard,
  progress,
  color,
}: {
  shard: ShardSpec;
  progress: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(shard.angle) * shard.distance * progress.value },
      { translateY: Math.sin(shard.angle) * shard.distance * progress.value },
      { scale: 1 - progress.value * 0.75 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.shard,
        { width: shard.size, height: shard.size, backgroundColor: color },
        style,
      ]}
    />
  );
}

const RING = 120;

const styles = StyleSheet.create({
  root: {
    aspectRatio: 1,
  },
  frame: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  burst: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
  },
  shard: {
    position: 'absolute',
    borderRadius: 2,
  },
  flash: {
    backgroundColor: colors.textInverted,
  },
});
