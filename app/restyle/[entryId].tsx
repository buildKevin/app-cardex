import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '../../src/components/Button';
import { CarSilhouette } from '../../src/components/CarSilhouette';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { displayPhoto } from '../../src/lib/photo';
import { breadcrumb, captureError, events, track } from '../../src/services/analytics';
import { persistStyledPhoto } from '../../src/services/photo';
import {
  BACKDROPS,
  RestyleError,
  restylePhoto,
  type BackdropKey,
  type RestyleErrorCode,
} from '../../src/services/restyle';
import { pushEntry } from '../../src/services/sync';
import {
  useGameStore,
  useGarageEntry,
  useRestylesLeft,
} from '../../src/store/useGameStore';
import { colors, gridItemWidth, gutter, motion, radii, spacing } from '../../src/theme';

type Phase = 'choose' | 'working' | 'done';

const ERROR_COPY: Record<RestyleErrorCode, string> = {
  limit: 'Tu as utilisé ton rendu gratuit.',
  not_synced: "Cette photo n'est pas encore sauvegardée. Réessaie dans un instant.",
  network: 'Connexion impossible. Vérifie ton réseau.',
  failed: "L'IA n'a pas réussi ce rendu. Réessaie, ça ne t'a rien coûté.",
  unconfigured: "Les rendus ne sont pas disponibles sur cette version.",
};

const CARD_WIDTH = gridItemWidth(2);

export default function Restyle() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const entry = useGarageEntry(entryId);

  const isPro = useGameStore((state) => state.isPro);
  const accountId = useGameStore((state) => state.profile.accountId);
  const setStyledPhoto = useGameStore((state) => state.setStyledPhoto);
  const consumeRestyle = useGameStore((state) => state.consumeRestyle);
  const markSynced = useGameStore((state) => state.markSynced);
  const left = useRestylesLeft();

  const [backdrop, setBackdrop] = useState<BackdropKey>('beach');
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState<string | null>(null);

  // Same slow sweep as the scanner, for the same reason: a generation takes
  // half a minute and a static spinner reads as a frozen app.
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (phase !== 'working') return;
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [phase, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({ opacity: 0.15 + sweep.value * 0.35 }));

  if (!entry) {
    return (
      <Screen>
        <Text variant="headline" tone="secondary">
          Cette voiture n'est plus dans ton garage.
        </Text>
      </Screen>
    );
  }

  const preview = displayPhoto(entry);

  const generate = async () => {
    if (phase === 'working') return;

    if (!isPro && left <= 0) {
      track(events.restyleBlockedByLimit, { source: 'client', backdrop });
      router.push('/paywall?context=restyle');
      return;
    }

    setPhase('working');
    setError(null);
    track(events.restyleStarted, {
      backdrop,
      is_pro: isPro,
      // A re-roll on a car that already has a rendering is the case that burns
      // the allowance fastest, and the one most likely to hit the ceiling.
      already_styled: Boolean(entry.styledPhotoUri),
      rarity: entry.rarity,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // An image call costs 10-40x a vision call and takes about thirty seconds.
    // This number is what decides whether the copy promising "une trentaine de
    // secondes" is a promise or a lie.
    const startedAt = Date.now();

    try {
      // The function reads the stored photo rather than accepting one, so the
      // row has to exist server-side first. A scan pushes in the background and
      // the player may well have got here before it landed.
      let remoteId = entry.remoteId ?? null;
      if (!remoteId && accountId) {
        breadcrumb('restyle: pushing the entry first');
        const pushed = await pushEntry(accountId, entry);
        if (pushed) {
          markSynced(entry.id, pushed.remoteId, pushed.photoPath);
          remoteId = pushed.remoteId;
        } else {
          track(events.syncFailed, { stage: 'push_entry', source: 'restyle' });
        }
      }
      if (!remoteId) throw new RestyleError('not_synced');

      breadcrumb('restyle: calling the image model', { backdrop });
      const result = await restylePhoto(remoteId, backdrop);
      // Keep a local copy: the signed URL expires in a day, and this picture is
      // now what every screen shows.
      const uri = await persistStyledPhoto(result.uri, result.path);

      setStyledPhoto(entry.id, uri, result.path);
      consumeRestyle();
      track(events.restyleSucceeded, {
        backdrop,
        make: entry.make,
        model: entry.model,
        rarity: entry.rarity,
        is_pro: isPro,
        duration_ms: Date.now() - startedAt,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('done');
    } catch (caught) {
      const code = caught instanceof RestyleError ? caught.code : 'network';

      if (code === 'limit') {
        setPhase('choose');
        track(events.restyleBlockedByLimit, { source: 'server', backdrop });
        router.push('/paywall?context=restyle');
        return;
      }

      track(events.restyleFailed, {
        code,
        backdrop,
        is_pro: isPro,
        duration_ms: Date.now() - startedAt,
      });
      // Every one of these is ours: `not_synced` is a sync bug, `failed` is a
      // generation we paid nothing for but the player still waited thirty
      // seconds on, and `unconfigured` is a broken deploy.
      captureError(caught, { stage: 'restyle', code, backdrop });
      setError(ERROR_COPY[code]);
      setPhase('choose');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  };

  return (
    <Screen scroll bleed>
      <View style={styles.hero}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.image} contentFit="cover" transition={260} />
        ) : (
          <View style={styles.placeholder}>
            <CarSilhouette width={180} color={colors.silhouette} />
          </View>
        )}

        {phase === 'working' ? (
          <Animated.View style={[styles.veil, sweepStyle]} pointerEvents="none" />
        ) : null}

        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <View style={styles.closeCircle}>
            <Icon name="close" size={18} color={colors.text} />
          </View>
        </Pressable>
      </View>

      <View style={styles.content}>
        {phase === 'done' ? (
          <Animated.View entering={FadeIn.duration(motion.base)} style={styles.block}>
            <Text variant="overline" tone="tertiary" uppercase>
              Rendu terminé
            </Text>
            <Text variant="title">
              {entry.make} {entry.model}
            </Text>
            <Text variant="body" tone="secondary">
              Cette photo prend la place de l'originale dans ton garage, ta vitrine et ton profil.
              Ta photo d'origine est gardée : tu peux comparer les deux depuis la fiche.
            </Text>
            <Button label="Voir dans mon garage" onPress={() => router.back()} style={styles.cta} />
          </Animated.View>
        ) : (
          <View style={styles.block}>
            <Text variant="overline" tone="tertiary" uppercase>
              Sublimer la photo
            </Text>
            <Text variant="title">Choisis un décor</Text>
            <Text variant="body" tone="secondary">
              L'IA replace ta voiture dans un nouveau décor sans rien changer à la voiture
              elle-même.
            </Text>

            <View style={styles.grid}>
              {BACKDROPS.map((option) => {
                const active = option.key === backdrop;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      // Which decors people actually want. Four are offered and
                      // the prompts cost nothing to change — dropping the one
                      // nobody picks is only possible if we counted.
                      track(events.backdropSelected, { backdrop: option.key, from: backdrop });
                      setBackdrop(option.key);
                    }}
                    disabled={phase === 'working'}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.card, active && styles.cardActive]}
                  >
                    <View style={styles.cardHead}>
                      <Text variant="bodyMedium">{option.label}</Text>
                      {active ? <Icon name="check" size={16} strokeWidth={2} /> : null}
                    </View>
                    <Text variant="caption" tone="tertiary">
                      {option.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <Text variant="caption" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <Button
              label={phase === 'working' ? 'Génération…' : 'Générer la photo'}
              caption={
                phase === 'working'
                  ? 'Une trentaine de secondes'
                  : isPro
                    ? undefined
                    : left > 0
                      ? 'Ton rendu offert'
                      : 'Réservé à CarDex Pro'
              }
              onPress={generate}
              loading={phase === 'working'}
              style={styles.cta}
            />

            {phase === 'working' ? (
              <Text variant="caption" tone="tertiary" center>
                Reste sur cet écran, l'IA travaille.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceElevated,
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
  },
  close: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: gutter,
    paddingTop: spacing.xl,
  },
  block: {
    gap: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  card: {
    width: CARD_WIDTH,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  cardActive: {
    borderColor: colors.text,
    borderWidth: 1,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: {
    marginTop: spacing.lg,
    color: colors.danger,
  },
  cta: {
    marginTop: spacing.xl,
  },
});
