import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

interface GlowProps {
  color: string;
  width: number;
  height?: number;
  /** Peak opacity at the centre. */
  intensity?: number;
}

/** Soft radial halo behind a revealed card — the only "effect" in the app. */
export function Glow({ color, width, height = width * 0.7, intensity = 0.32 }: GlowProps) {
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={intensity} />
          <Stop offset="55%" stopColor={color} stopOpacity={intensity * 0.35} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill="url(#glow)" />
    </Svg>
  );
}
