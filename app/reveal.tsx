import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../src/components/Button';
import { CarSilhouette } from '../src/components/CarSilhouette';
import { Glow } from '../src/components/Glow';
import { RarityTag } from '../src/components/RarityTag';
import { RestyleCta } from '../src/components/RestyleCta';
import { Text } from '../src/components/Text';
import { getBrand } from '../src/data/brands';
import { entryFiche } from '../src/lib/fiche';
import { formatPower } from '../src/lib/format';
import { displayPhoto } from '../src/lib/photo';
import { rarityColor } from '../src/lib/rarity';
import { events, track } from '../src/services/analytics';
import { useEntryCar, useGameStore, useStats } from '../src/store/useGameStore';
import { colors, gutter, motion, radii, spacing, withAlpha } from '../src/theme';

const { width } = Dimensions.get('window');

export default function Reveal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const { entry, car } = useEntryCar(entryId);
  const garage = useGameStore((state) => state.garage);
  const stats = useStats();
  const photo = entry ? displayPhoto(entry) : null;

  const level = stats.progress.level;
  const knownLevel = useRef<number | null>(null);

  const brandProgress = entry?.brandId ? stats.brands[entry.brandId] : undefined;
  // This scan finished the set if the brand is now full and this is our first
  // copy of the car — otherwise a duplicate would re-trigger the message.
  // Hoisted above the early return so the effects below can read it.
  const isFirstCopy = entry
    ? garage.filter((item) => item.carId === entry.carId).length === 1
    : false;
  const justCompleted =
    brandProgress?.complete === true && entry?.carId != null && isFirstCopy;

  useEffect(() => {
    if (!entry) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    track(events.carRevealed, {
      rarity: entry.rarity,
      matched: entry.carId !== null,
      make: entry.make,
      model: entry.model,
      brand_id: entry.brandId,
      xp: entry.xp,
      source: entry.discovered ? 'community' : entry.carId ? 'catalogue' : 'unknown',
      cars_after: stats.cars,
      level_after: level,
    });
    // Only on the entry, not on every stats recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  /**
   * Levelling up and finishing a collection are the two rewards the whole game is
   * built around, and neither had an event — so "do players who complete a
   * collection convert better?" was unanswerable. Fired here rather than in the
   * store because this is where the player is actually told.
   */
  useEffect(() => {
    if (knownLevel.current === null) {
      knownLevel.current = level;
      return;
    }
    if (level <= knownLevel.current) return;
    knownLevel.current = level;
    track(events.levelReached, { level, xp: stats.xp, cars: stats.cars });
  }, [level, stats.xp, stats.cars]);

  useEffect(() => {
    if (!justCompleted || !entry?.brandId) return;
    track(events.collectionCompleted, {
      brand_id: entry.brandId,
      make: entry.make,
      completed_brands: stats.completedBrands,
      cars: stats.cars,
    });
    // The badge is derived from the completed collection, so it unlocks in the
    // same instant — but it is a separate reward to the player, and a funnel
    // that mixes the two cannot tell which one they came back for.
    track(events.badgeUnlocked, { badge_id: entry.brandId, kind: 'brand' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCompleted, entry?.brandId]);

  if (!entry) {
    return (
      <View style={styles.root}>
        <Text variant="headline" tone="secondary">
          Carte introuvable
        </Text>
      </View>
    );
  }

  const accent = rarityColor(entry.rarity);
  const brand = getBrand(entry.brandId);
  const fiche = entryFiche(entry, car, brand);

  /**
   * Which way out of the reveal the player takes.
   *
   * The retention question for the whole app: straight back to the camera is a
   * player in the loop, and off to the garage is a player who stopped. Tapping
   * the restyle CTA instead is a third answer, reported by `RestyleCta`.
   */
  const leave = (via: 'scan_again' | 'garage') => {
    track(events.revealDismissed, { via, rarity: entry.rarity, just_completed: justCompleted });
    if (via === 'scan_again') router.back();
    else router.navigate('/(tabs)');
  };

  return (
    // Scrollable rather than a fixed column: card + CTA + two buttons overflow a
    // 4.7" screen once the "not in the catalogue" note is showing, and
    // `marginTop: auto` on the footer silently clipped it. `flexGrow: 1` keeps
    // the footer pinned to the bottom whenever there IS room.
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.glow} pointerEvents="none">
        <Glow color={accent} width={width * 1.4} />
      </View>

      <Animated.View entering={FadeIn.duration(motion.base)} style={styles.header}>
        <Text variant="overline" tone="tertiary" uppercase center>
          Nouvelle carte débloquée
        </Text>
      </Animated.View>

      <Animated.View
        entering={ZoomIn.delay(80).duration(motion.reveal)}
        style={[styles.card, { borderColor: withAlpha(accent, 0.27) }]}
      >
        <View style={styles.media}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.image} contentFit="cover" transition={280} />
          ) : (
            <CarSilhouette width={width * 0.5} color={colors.silhouette} />
          )}
        </View>

        <View style={styles.body}>
          <Text variant="label" tone="secondary" uppercase>
            {entry.make}
          </Text>
          <Text variant="title">{entry.model}</Text>

          <View style={styles.tagRow}>
            <RarityTag rarity={entry.rarity} size="md" />
            <Text variant="label" tone="tertiary">
              +{entry.xp} XP
            </Text>
          </View>

          <View style={styles.specs}>
            {fiche.power ? (
              <Text variant="body" tone="secondary">
                {formatPower(fiche.power)}
              </Text>
            ) : null}
            <Text variant="body" tone="secondary">
              {fiche.country ?? '—'}
            </Text>
            <Text variant="body" tone="secondary">
              {entry.year ?? '—'}
            </Text>
          </View>
        </View>
      </Animated.View>

      {justCompleted && brand ? (
        <Animated.View entering={FadeInDown.delay(360).duration(motion.base)} style={styles.completed}>
          <Text variant="label" center>
            Collection {brand.name} complète · badge débloqué
          </Text>
        </Animated.View>
      ) : null}

      {!car ? (
        <Animated.View entering={FadeIn.delay(400).duration(motion.base)} style={styles.unlisted}>
          <Text variant="caption" tone="tertiary" center>
            {fiche.source === 'community'
              ? // A rated car pays full XP but fills no collection, and unlike an
                // unrated one it did cost a scan — saying so here is the only
                // place the player can reconcile the counter they just saw move.
                `Première fois qu'on voit cette ${entry.make} : on l'a évaluée pour toi. Elle ne compte pas dans une collection, mais elle te rapporte ses ${entry.xp} XP.`
              : brand
                ? `Pas encore dans la collection ${brand.name} — elle rejoint ton garage, garde tes XP, et ce scan ne t'est pas compté.`
                : "Marque inconnue de notre catalogue — elle rejoint quand même ton garage, et ce scan ne t'est pas compté."}
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View
        entering={FadeInDown.delay(440).duration(motion.base)}
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {/* Above the buttons on purpose: this is the moment the player is
            looking at their own photo and judging it. */}
        <RestyleCta entry={entry} accent={accent} source="reveal" />
        <Button label="Scanner à nouveau" size="lg" onPress={() => leave('scan_again')} />
        <Button
          label="Voir mon garage"
          variant="ghost"
          size="md"
          onPress={() => leave('garage')}
        />
      </Animated.View>
    </ScrollView>
  );
}

const CARD_WIDTH = width - gutter * 2;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: gutter,
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    top: -width * 0.35,
    alignSelf: 'center',
  },
  header: {
    marginBottom: spacing.xl,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  media: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  specs: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  completed: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  unlisted: {
    marginTop: spacing.lg,
    maxWidth: 280,
  },
  footer: {
    width: '100%',
    marginTop: 'auto',
    gap: spacing.sm,
  },
});
