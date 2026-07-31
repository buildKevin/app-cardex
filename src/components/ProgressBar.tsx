import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, motion, radii } from '../theme';

interface ProgressBarProps {
  /** 0 → 1 */
  ratio: number;
  color?: string;
  height?: number;
  /** Animate from 0 on mount. */
  animate?: boolean;
}

export function ProgressBar({
  ratio,
  color = colors.text,
  height = 3,
  animate = true,
}: ProgressBarProps) {
  const target = Math.min(1, Math.max(0, ratio));
  const value = useSharedValue(animate ? 0 : target);

  useEffect(() => {
    value.value = withTiming(target, { duration: motion.slow });
  }, [target, value]);

  const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: height }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    borderRadius: radii.pill,
  },
  fill: {
    height: '100%',
  },
});
