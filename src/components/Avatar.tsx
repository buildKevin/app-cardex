import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, radii } from '../theme';
import { Text } from './Text';

interface AvatarProps {
  name: string;
  /** Local file uri of the player's picture. Falls back to the initials. */
  uri?: string | null;
  size?: number;
}

export function Avatar({ name, uri, size = 64 }: AvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} contentFit="cover" />
      ) : (
        <Text variant="title" tone="secondary">
          {initials || '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.pill,
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
});
