import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '../../src/components/Button';
import { CarSilhouette } from '../../src/components/CarSilhouette';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { StickerReveal } from '../../src/components/StickerReveal';
import { Text } from '../../src/components/Text';
import { displayPhoto, originalPhoto } from '../../src/lib/photo';
import { rarityColor } from '../../src/lib/rarity';
import { breadcrumb, captureError, events, track } from '../../src/services/analytics';
import { persistStyledPhoto } from '../../src/services/photo';
import { RestyleError, restylePhoto, type RestyleErrorCode } from '../../src/services/restyle';
import { pushEntry } from '../../src/services/sync';
import { useGameStore, useGarageEntry, useRestylesLeft } from '../../src/store/useGameStore';
import { colors, gutter, motion, radii, spacing } from '../../src/theme';

type Phase = 'idle' | 'working' | 'done';

/**
 * What the player reads while the model works, one line at a time.
 *
 * The generation takes half a minute and a single static caption makes it feel
 * like a hang. These are written as work on *their* car — jantes, calandre,
 * capot — because that is what the model is actually being asked to preserve.
 * The list does not loop: a run that outlives it holds on the last line, since
 * « Reconstruction des jantes » coming round a second time reads as a stuck
 * queue, not as progress.
 */
const WORKING_STEPS = [
  "Reste sur cet écran, l'IA travaille…",
  'Analyse de la photographie…',
  'Reconstruction des jantes…',
  'Redessin de la calandre…',
  'Polissage du capot…',
  'Teinte de la carrosserie…',
  'Découpe du contour…',
  'Pose du vernis…',
] as const;

const STEP_MS = 4000;

const ERROR_COPY: Record<RestyleErrorCode, string> = {
  limit: 'Tu as utilisé ton sticker gratuit.',
  not_synced: "Cette photo n'est pas encore sauvegardée. Réessaie dans un instant.",
  network: 'Connexion impossible. Vérifie ton réseau.',
  failed: "L'IA n'a pas réussi ce sticker. Réessaie, ça ne t'a rien coûté.",
  unconfigured: 'Les stickers ne sont pas disponibles sur cette version.',
};

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

  const [phase, setPhase] = useState<Phase>('idle');
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

  // Before: the photograph, which is literally what is about to be redrawn —
  // even on a re-roll, where `displayPhoto` would hand back the old sticker.
  // After: the new one, delivered by `StickerReveal` as an explosion rather
  // than a cross-fade — the player waited half a minute for this frame.
  const done = phase === 'done';
  const preview = originalPhoto(entry);

  const generate = async () => {
    if (phase === 'working') return;

    if (!isPro && left <= 0) {
      track(events.restyleBlockedByLimit, { source: 'client' });
      router.push('/paywall?context=restyle');
      return;
    }

    setPhase('working');
    setError(null);
    track(events.restyleStarted, {
      is_pro: isPro,
      // A re-roll on a car that already has a sticker is the case that burns the
      // allowance fastest, and the one most likely to hit the ceiling.
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

      breadcrumb('restyle: calling the image model');
      const result = await restylePhoto(remoteId);
      // Keep a local copy: the signed URL expires in a day, and this picture is
      // now the entry's face in every grid.
      const uri = await persistStyledPhoto(result.uri, result.path);

      setStyledPhoto(entry.id, uri, result.path);
      consumeRestyle();
      track(events.restyleSucceeded, {
        make: entry.make,
        model: entry.model,
        rarity: entry.rarity,
        is_pro: isPro,
        duration_ms: Date.now() - startedAt,
      });

      // No success haptic here: `StickerReveal` fires the heavy impact at the
      // exact frame the photograph blows apart, and two pulses read as a bug.
      setPhase('done');
    } catch (caught) {
      const code = caught instanceof RestyleError ? caught.code : 'network';

      if (code === 'limit') {
        setPhase('idle');
        track(events.restyleBlockedByLimit, { source: 'server' });
        router.push('/paywall?context=restyle');
        return;
      }

      track(events.restyleFailed, {
        code,
        is_pro: isPro,
        duration_ms: Date.now() - startedAt,
      });
      // Every one of these is ours: `not_synced` is a sync bug, `failed` is a
      // generation we paid nothing for but the player still waited thirty
      // seconds on, and `unconfigured` is a broken deploy.
      captureError(caught, { stage: 'restyle', code });
      setError(ERROR_COPY[code]);
      setPhase('idle');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  };

  return (
    <Screen scroll bleed>
      <View style={styles.hero}>
        {done ? (
          // No `overflow: hidden` on the hero: the burst must escape the frame,
          // and `StickerReveal` clips its images itself.
          <StickerReveal
            before={preview}
            after={displayPhoto(entry)}
            accent={rarityColor(entry.rarity)}
            radius={0}
            style={styles.image}
          />
        ) : preview ? (
          <Image source={{ uri: preview }} style={styles.image} contentFit="cover" transition={260} />
        ) : (
          <View style={styles.placeholder}>
            <CarSilhouette width={180} />
          </View>
        )}

        {phase === 'working' ? (
          <Animated.View style={[styles.veil, sweepStyle]} pointerEvents="none" />
        ) : null}

        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <View style={styles.closeCircle}>
            <Icon name="close" size={18} color={colors.textInverted} />
          </View>
        </Pressable>
      </View>

      <View style={styles.content}>
        {done ? (
          // Delayed to land with the sticker: `StickerReveal` holds the
          // photograph for `motion.reveal` before blowing it apart, and copy
          // announcing the sticker before it exists spoils the explosion.
          <Animated.View
            entering={FadeIn.delay(motion.reveal + motion.flash).duration(motion.base)}
            style={styles.block}
          >
            <Text variant="overline" tone="tertiary" uppercase>
              Sticker créé
            </Text>
            <Text variant="title">
              {entry.make} {entry.model}
            </Text>
            <Text variant="body" tone="secondary">
              Il prend la place de la photo dans ton garage, ta vitrine et tes collections. Ta photo
              d'origine reste celle de la fiche et de l'accueil.
            </Text>
            <Button label="Voir dans mon garage" onPress={() => router.back()} style={styles.cta} />
          </Animated.View>
        ) : (
          <View style={styles.block}>
            <Text variant="overline" tone="tertiary" uppercase>
              Transformer en sticker
            </Text>
            <Text variant="title">Ta voiture, en collector</Text>
            <Text variant="body" tone="secondary">
              L'IA redessine ta voiture en sticker découpé, sans rien changer au modèle, à sa
              couleur ni à son angle. Ta photo est conservée.
            </Text>

            {error ? (
              <Text variant="caption" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <Button
              label={phase === 'working' ? 'Création…' : 'Créer le sticker'}
              caption={
                phase === 'working'
                  ? 'Une trentaine de secondes'
                  : isPro
                    ? undefined
                    : left > 0
                      ? 'Ton sticker offert'
                      : 'Réservé à CarDex Pro'
              }
              onPress={generate}
              loading={phase === 'working'}
              style={styles.cta}
            />

            {phase === 'working' ? <WorkingSteps /> : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

/**
 * One line at a time, advancing on a timer, never looping back.
 *
 * The lines swap inside a fixed-height box with each one absolutely centred:
 * Reanimated keeps the exiting view mounted while it fades, and letting the two
 * stack in normal flow makes the whole column jump once per step.
 */
function WorkingSteps() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((current) => Math.min(current + 1, WORKING_STEPS.length - 1));
    }, STEP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.steps}>
      <Animated.View
        key={step}
        entering={FadeIn.duration(motion.base)}
        exiting={FadeOut.duration(motion.fast)}
        style={styles.stepLine}
      >
        <Text variant="caption" tone="tertiary" center>
          {WORKING_STEPS[step]}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.surface,
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
  error: {
    marginTop: spacing.lg,
    color: colors.danger,
  },
  cta: {
    marginTop: spacing.xl,
  },
  steps: {
    height: spacing.xl,
    justifyContent: 'center',
  },
  stepLine: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
