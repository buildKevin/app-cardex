import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter, spacing } from '../theme';

interface ScreenProps {
  children: ReactNode;
  /** Wrap the content in a ScrollView. */
  scroll?: boolean;
  /** Remove the horizontal page gutter (full-bleed screens). */
  bleed?: boolean;
  /** Skip the top safe-area padding (modals with their own header). */
  edgeToEdgeTop?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

export function Screen({
  children,
  scroll,
  bleed,
  edgeToEdgeTop,
  style,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = {
    paddingTop: edgeToEdgeTop ? 0 : insets.top + spacing.sm,
    paddingHorizontal: bleed ? 0 : gutter,
  };

  if (scroll) {
    return (
      <View style={[styles.root, style]}>
        <ScrollView
          contentContainerStyle={[padding, styles.scrollContent, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return <View style={[styles.root, padding, contentStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
});
