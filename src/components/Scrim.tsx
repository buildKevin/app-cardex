import { StyleSheet, View } from 'react-native';

interface ScrimProps {
  /** Portion of the parent height the fade covers. */
  height?: `${number}%`;
  /** Opacity at the very bottom. */
  strength?: number;
  bands?: number;
  /** Which edge the fade is anchored to, and darkest at. */
  from?: 'bottom' | 'top';
}

/**
 * Dark fade, built from stacked translucent bands.
 *
 * Deliberately not expo-linear-gradient: that is a native module, so adding it
 * would force a fresh native build, and at these opacities the banding is
 * invisible over a photo.
 */
export function Scrim({ height = '65%', strength = 0.92, bands = 8, from = 'bottom' }: ScrimProps) {
  return (
    <View
      style={[styles.root, from === 'top' ? styles.fromTop : styles.fromBottom, { height }]}
      pointerEvents="none"
    >
      {Array.from({ length: bands }).map((_, index) => {
        // Ease in so the far edge of the fade stays imperceptible.
        const t = from === 'bottom' ? (index + 1) / bands : (bands - index) / bands;
        return (
          <View
            key={index}
            style={[
              styles.band,
              { backgroundColor: `rgba(0,0,0,${(t ** 2 * strength).toFixed(3)})` },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  fromBottom: {
    bottom: 0,
  },
  fromTop: {
    top: 0,
  },
  band: {
    flex: 1,
  },
});
