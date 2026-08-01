import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../src/components/Button';
import { CarSilhouette } from '../src/components/CarSilhouette';
import { Glow } from '../src/components/Glow';
import { RarityTag } from '../src/components/RarityTag';
import { Text } from '../src/components/Text';
import { getBrand } from '../src/data/brands';
import { entryFiche } from '../src/lib/fiche';
import { formatPower } from '../src/lib/format';
import { rarityColor } from '../src/lib/rarity';
import { events, track } from '../src/services/analytics';
import { useEntryCar, useGameStore, useStats } from '../src/store/useGameStore';
import { colors, gutter, motion, radii, spacing } from '../src/theme';

const { width } = Dimensions.get('window');

export default function Reveal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const { entry, car } = useEntryCar(entryId);
  const garage = useGameStore((state) => state.garage);
  const stats = useStats();

  useEffect(() => {
    if (!entry) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    track(events.carRevealed, { rarity: entry.rarity, matched: entry.carId !== null });
  }, [entry]);

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
  const brandProgress = entry.brandId ? stats.brands[entry.brandId] : undefined;

  // This scan finished the set if the brand is now full and this is our first
  // copy of the car — otherwise a duplicate would re-trigger the message.
  const isFirstCopy = garage.filter((item) => item.carId === entry.carId).length === 1;
  const justCompleted = brandProgress?.complete === true && entry.carId !== null && isFirstCopy;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
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
        style={[styles.card, { borderColor: `${accent}44` }]}
      >
        <View style={styles.media}>
          {entry.photoUri ? (
            <Image source={{ uri: entry.photoUri }} style={styles.image} contentFit="cover" transition={280} />
          ) : (
            <CarSilhouette width={width * 0.5} color="#24242C" />
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
        <Button label="Scanner à nouveau" size="lg" onPress={() => router.back()} />
        <Button
          label="Voir mon garage"
          variant="ghost"
          size="md"
          onPress={() => router.navigate('/(tabs)')}
        />
      </Animated.View>
    </View>
  );
}

const CARD_WIDTH = width - gutter * 2;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
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
