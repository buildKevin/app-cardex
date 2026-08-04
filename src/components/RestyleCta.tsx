import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { events, track } from '../services/analytics';
import type { GarageEntry } from '../data/types';
import { restyleAvailable } from '../services/restyle';
import { useGameStore, useRestylesLeft } from '../store/useGameStore';
import { colors, motion, radii, spacing, withAlpha } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface RestyleCtaProps {
  entry: GarageEntry;
  /**
   * Rarity accent of the card this sits under. Tinting the frame is what makes
   * the action read as part of the reveal rather than as one more grey button.
   */
  accent?: string;
  /**
   * Which screen the tile is sitting on. The same CTA converts very differently
   * fresh off a reveal and hours later on a fiche, and without this they land in
   * one undifferentiated number.
   */
  source: 'reveal' | 'car';
}

/**
 * The upgrade: « Embellir », shared by the reveal and the fiche.
 *
 * The card it sits under is already a sticker — every car is cut out on the
 * device the moment it is scanned — so this no longer sells the *existence* of a
 * sticker. It sells a better one: drawn rather than cut out, and Pro-only. That
 * is the whole reason the free allowance went to zero. What the player is being
 * asked to buy is a visible difference on a car they already like, instead of
 * access to a feature they would have to take on trust.
 *
 * Deliberately not a `<Button>`. It sits next to real buttons on both screens,
 * and a fourth grey rectangle in a stack of grey rectangles is invisible — this
 * earns attention by being a different *kind* of object: an icon tile, two
 * lines, a chevron, and a frame tinted with the car's own rarity.
 *
 * Lives on the reveal screen because that is the moment the player is looking
 * at their photo and deciding how they feel about it. Making them navigate back
 * into the fiche to find it spends that moment.
 */
export function RestyleCta({ entry, accent = colors.accent, source }: RestyleCtaProps) {
  const router = useRouter();
  const isPro = useGameStore((state) => state.isPro);
  const left = useRestylesLeft();

  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.015 }],
  }));

  // Hidden rather than broken when the feature has no server behind it, and
  // meaningless without a photograph to work from.
  if (!restyleAvailable || !entry.photoUri) return null;

  // `styledPhotoUri`, deliberately — never `displayPhoto`. Every car has a
  // die-cut now, so a check on "does this entry have a sticker" would answer yes
  // everywhere and this button would offer « Refaire » on a redraw that has never
  // been made. What it asks is narrower: has the *paid* one been drawn yet.
  const styled = Boolean(entry.styledPhotoUri);
  const hint = isPro ? 'Une trentaine de secondes' : 'Avec CarDex Pro';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        track(events.restyleCtaTapped, {
          source,
          rarity: entry.rarity,
          method: 'redraw',
          // A second rendering on the same car is a different intent from a first
          // one — and for a free player it is the tap that hits the paywall.
          already_styled: Boolean(entry.styledPhotoUri),
          restyles_left: Number.isFinite(left) ? left : null,
          is_pro: isPro,
        });
        router.push(`/restyle/${entry.id}`);
      }}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: motion.fast });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: motion.base });
      }}
    >
      <Animated.View
        style={[styles.root, { borderColor: withAlpha(accent, 0.34) }, animatedStyle]}
      >
        <View
          style={[
            styles.tile,
            { borderColor: withAlpha(accent, 0.34), backgroundColor: withAlpha(accent, 0.1) },
          ]}
        >
          <Icon name="bolt" size={20} color={accent} strokeWidth={1.8} />
        </View>

        <View style={styles.copy}>
          <Text variant="bodyMedium">{styled ? 'Refaire le sticker' : 'Embellir ce sticker'}</Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {hint}
          </Text>
        </View>

        <Icon name="chevron" size={18} color={colors.textTertiary} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
