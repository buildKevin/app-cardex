import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, motion, radii, shadow, spacing } from '../theme';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle;
}

/**
 * The one container in the app: white, lifted off the canvas by a shadow.
 *
 * Two nested views on purpose. `overflow: 'hidden'` sets `clipsToBounds`, which
 * on iOS clips the view's *own* shadow as well as its children — so the outer
 * view carries the shadow and the inner one does the clipping that keeps a
 * full-bleed photo inside the radius.
 */
export function Card({ children, onPress, padded = true, style }: CardProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.015 }],
    opacity: 1 - pressed.value * 0.25,
  }));

  const body = <View style={[styles.clip, padded && styles.padded]}>{children}</View>;

  if (!onPress) return <View style={[styles.card, style]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: motion.fast });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: motion.base });
      }}
    >
      <Animated.View style={[styles.card, style, animatedStyle]}>{body}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    // No border. On white a hairline plus a shadow reads as two outlines, and
    // the shadow is the one doing the work.
    ...shadow.card,
  },
  clip: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.lg,
  },
});
