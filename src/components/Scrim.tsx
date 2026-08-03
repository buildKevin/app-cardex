import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface ScrimProps {
  /** Portion of the parent height the fade covers. */
  height?: `${number}%`;
  /** Opacity at the anchored edge. */
  strength?: number;
  /** Which edge the fade is anchored to, and darkest at. */
  from?: 'bottom' | 'top';
}

/** Stops on an eased curve, so the far edge of the fade stays imperceptible. */
const STEPS = 8;

/**
 * Dark fade behind text laid over a photo.
 *
 * Deliberately not expo-linear-gradient: that is a native module, so adding it
 * would force a fresh native build. `react-native-svg` already ships here, and
 * an SVG gradient interpolates in the renderer — the earlier version stacked
 * translucent bands, and over the hero's short top fade the rectangles were
 * plainly visible.
 */
export function Scrim({ height = '65%', strength = 0.92, from = 'bottom' }: ScrimProps) {
  // A gradient id is global to the SVG renderer, and several scrims coexist on
  // one screen — a shared id would hand them all the first one's opacities.
  const id = `scrim${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View
      style={[styles.root, from === 'top' ? styles.fromTop : styles.fromBottom, { height }]}
      pointerEvents="none"
    >
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {Array.from({ length: STEPS + 1 }).map((_, index) => {
              const offset = index / STEPS;
              const t = from === 'bottom' ? offset : 1 - offset;
              return (
                <Stop
                  key={index}
                  offset={offset}
                  stopColor="#000"
                  stopOpacity={Number((t ** 2 * strength).toFixed(3))}
                />
              );
            })}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
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
});
