import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, type, type TypeVariant } from '../theme';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'inverted';

const TONES: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  inverted: colors.textInverted,
};

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: Tone;
  color?: string;
  center?: boolean;
  uppercase?: boolean;
}

export function Text({
  variant = 'body',
  tone = 'primary',
  color,
  center,
  uppercase,
  style,
  ...rest
}: TextProps) {
  const base: TextStyle = {
    ...type[variant],
    color: color ?? TONES[tone],
    ...(center ? { textAlign: 'center' } : null),
    ...(uppercase ? { textTransform: 'uppercase' } : null),
  };

  return <RNText {...rest} style={[base, style]} />;
}
