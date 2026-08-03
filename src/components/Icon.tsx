import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme';

export type IconName =
  | 'garage'
  | 'collections'
  | 'scan'
  | 'profile'
  | 'account'
  | 'chevron'
  | 'check'
  | 'close'
  | 'lock'
  | 'bolt'
  | 'badge'
  | 'camera'
  | 'star';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Thin strokes read as premium; keep it at 1.5 unless you have a reason. */
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = colors.text, strokeWidth = 1.5 }: IconProps) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'garage' ? (
        <>
          <Path d="M3.5 13.5 5.4 8.6A2.5 2.5 0 0 1 7.7 7h8.6a2.5 2.5 0 0 1 2.3 1.6l1.9 4.9v3.9h-17z" {...stroke} />
          <Circle cx={7.6} cy={17.4} r={1.6} {...stroke} />
          <Circle cx={16.4} cy={17.4} r={1.6} {...stroke} />
          <Path d="M3.5 13.5h17" {...stroke} />
        </>
      ) : null}

      {name === 'collections' ? (
        <>
          <Path d="M4 4.8h6.2V11H4zM13.8 4.8H20V11h-6.2zM4 13h6.2v6.2H4zM13.8 13H20v6.2h-6.2z" {...stroke} />
        </>
      ) : null}

      {/* Four corners and nothing else. The bar across the middle made it a
          barcode scanner; this is a viewfinder, which is what the camera does. */}
      {name === 'scan' ? (
        <Path d="M4 9V6.4A2.4 2.4 0 0 1 6.4 4H9M15 4h2.6A2.4 2.4 0 0 1 20 6.4V9M20 15v2.6a2.4 2.4 0 0 1-2.4 2.4H15M9 20H6.4A2.4 2.4 0 0 1 4 17.6V15" {...stroke} />
      ) : null}

      {name === 'camera' ? (
        <>
          <Path d="M4 9.6A2.4 2.4 0 0 1 6.4 7.2h1.3l1-1.7h6.6l1 1.7h1.3A2.4 2.4 0 0 1 20 9.6v7.2a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 16.8z" {...stroke} />
          <Circle cx={12} cy={13} r={3.2} {...stroke} />
        </>
      ) : null}

      {name === 'profile' ? (
        <>
          <Circle cx={12} cy={8.8} r={3.8} {...stroke} />
          <Path d="M5 20a7 7 0 0 1 14 0" {...stroke} />
        </>
      ) : null}

      {/* The same bust, inside its own ring — a header glyph that needs no chip
          drawn behind it to read as a button. */}
      {name === 'account' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Circle cx={12} cy={10} r={3} {...stroke} />
          <Path d="M6.9 18.7a5.9 5.9 0 0 1 10.2 0" {...stroke} />
        </>
      ) : null}

      {name === 'chevron' ? <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" {...stroke} /> : null}

      {name === 'check' ? <Path d="m5 12.5 4.5 4.5L19 7" {...stroke} /> : null}

      {name === 'close' ? <Path d="M6 6l12 12M18 6 6 18" {...stroke} /> : null}

      {name === 'lock' ? (
        <>
          <Path d="M5.8 10.8h12.4v8.4H5.8z" {...stroke} />
          <Path d="M8.6 10.8V8.4a3.4 3.4 0 0 1 6.8 0v2.4" {...stroke} />
        </>
      ) : null}

      {name === 'bolt' ? <Path d="M13.4 3 6 13.4h4.6L10.6 21 18 10.6h-4.6z" {...stroke} /> : null}

      {name === 'badge' ? (
        <>
          <Circle cx={12} cy={9.6} r={5.6} {...stroke} />
          <Path d="M8.4 14.4 7 21l5-2.4 5 2.4-1.4-6.6" {...stroke} />
        </>
      ) : null}

      {name === 'star' ? (
        <Path
          d="m12 4 2.5 5.1 5.5.8-4 3.9.9 5.6L12 16.8l-4.9 2.6.9-5.6-4-3.9 5.5-.8z"
          {...stroke}
        />
      ) : null}
    </Svg>
  );
}
