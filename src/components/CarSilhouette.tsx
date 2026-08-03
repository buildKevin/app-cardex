import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme';

interface CarSilhouetteProps {
  width?: number;
  color?: string;
  opacity?: number;
}

/**
 * Anonymous car side-view. Used for every locked collection slot so the player
 * cannot tell which cars are still missing.
 */
export function CarSilhouette({
  width = 120,
  color = colors.silhouette,
  opacity = 1,
}: CarSilhouetteProps) {
  const height = (width * 44) / 120;

  return (
    <Svg width={width} height={height} viewBox="0 0 120 44" fill="none" opacity={opacity}>
      <Path
        d="M6 32c0-4 2.5-6.4 7-7.2l17-2.4C35.5 15.2 43.5 11 55 11c11.5 0 21 3.4 28.5 10.4l19.5 2.6c6.5 1 11 3.2 11 8v3.4c0 1.4-1 2.2-2.6 2.2H8.6C7 37.6 6 36.8 6 35.4z"
        fill={color}
      />
      <Circle cx={34} cy={36} r={7.5} fill={color} />
      <Circle cx={90} cy={36} r={7.5} fill={color} />
    </Svg>
  );
}
