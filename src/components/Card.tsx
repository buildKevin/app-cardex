import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, motion, radii, spacing } from '../theme';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle;
}

/** The one container in the app: near-black surface, hairline border, soft radius. */
export function Card({ children, onPress, padded = true, style }: CardProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.015 }],
    opacity: 1 - pressed.value * 0.25,
  }));

  const content = [styles.card, padded && styles.padded, style];

  if (!onPress) return <View style={content}>{children}</View>;

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
      <Animated.View style={[content, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.lg,
  },
});
