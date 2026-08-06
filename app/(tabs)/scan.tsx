import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { breadcrumb, captureError, events, track } from '../../src/services/analytics';
import { createDiecut } from '../../src/services/diecut';
import { preparePhoto } from '../../src/services/photo';
import { VisionError, identifyCar, visionMode } from '../../src/services/vision';
import { pushEntry } from '../../src/services/sync';
import { useGameStore, useScansLeft } from '../../src/store/useGameStore';
import { colors, gutter, motion, radii, spacing, withAlpha } from '../../src/theme';

type Phase = 'idle' | 'working' | 'error';

const ERROR_COPY: Record<string, string> = {
  no_car: 'Aucune voiture reconnue. Recadre et réessaie.',
  network: 'Connexion impossible. Vérifie ton réseau.',
  unreadable: "Réponse illisible de l'IA. Réessaie.",
  limit: 'Tes scans gratuits sont épuisés.',
  unconfigured: "L'identification n'est pas configurée sur cette version.",
};

export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  /** Which error the player is retrying after, kept out of state so it never re-renders. */
  const lastError = useRef<string | null>(null);

  const consumeScan = useGameStore((state) => state.consumeScan);
  const addScan = useGameStore((state) => state.addScan);
  const isPro = useGameStore((state) => state.isPro);
  const accountId = useGameStore((state) => state.profile.accountId);
  const markSynced = useGameStore((state) => state.markSynced);
  const setDiecut = useGameStore((state) => state.setDiecut);
  const scanCount = useGameStore((state) => state.scanCount);
  const garage = useGameStore((state) => state.garage);
  const left = useScansLeft();

  // Keep the camera mounted only while the tab is on screen.
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      setPhase('idle');
      setError(null);
      return () => setActive(false);
    }, []),
  );

  const sweep = useSharedValue(0);
  useEffect(() => {
    if (phase === 'working') {
      sweep.value = 0;
      sweep.value = withRepeat(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    }
  }, [phase, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + sweep.value * 0.55,
    transform: [{ translateY: -60 + sweep.value * 120 }],
  }));

  const askPermission = async () => {
    track(events.cameraPermissionRequested);
    const answer = await requestPermission();
    // The single hardest wall in the app: a refusal here means the player can
    // never scan anything, and nothing else we measure applies to them.
    track(events.cameraPermissionAnswered, {
      granted: answer.granted,
      can_ask_again: answer.canAskAgain,
    });
  };

  const openSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  const capture = async () => {
    if (phase === 'working') return;

    if (!isPro && left <= 0) {
      track(events.scanBlockedByLimit, { source: 'client', scans_used: scanCount });
      router.push('/paywall?context=limit');
      return;
    }

    // A shutter tap while an error is on screen is a retry, and the retry rate on
    // each error code is what says whether the message is actionable.
    if (phase === 'error') track(events.scanRetried, { after: lastError.current });

    setPhase('working');
    setError(null);
    track(events.scanStarted, { mode: visionMode, scans_used: scanCount });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Wall-clock, not model time: this is what the player waits, shutter to card,
    // and it includes the resize and the upload. p95 on this number is the reason
    // to change the image size or the model.
    const startedAt = Date.now();

    try {
      breadcrumb('scan: taking picture');
      const shot = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (!shot?.uri) throw new VisionError('unreadable');

      breadcrumb('scan: preparing photo');
      const photo = await preparePhoto(shot.uri);

      breadcrumb('scan: calling the model', { mode: visionMode });
      const result = await identifyCar(photo.base64);

      const entry = addScan(result, photo.uri);

      // A catalogue match costs a scan, and so does a car the server managed to
      // rate — both give the player a real card. What stays free is the case we
      // cannot answer at all: that is our gap, not the player's. Mirrors the
      // condition in identify-car, which owns the real counter.
      const matched = entry.carId !== null;
      const charged = matched || entry.discovered != null;
      if (charged) consumeScan();

      // Awaited, and before the reveal: this is the card's face, so the payoff
      // frame has to be the sticker itself. Showing the photograph and swapping
      // it a moment later is the "two half-finished apps" the display rule exists
      // to prevent — and 200 ms on the end of a model call nobody notices.
      breadcrumb('scan: lifting the car out');
      const diecut = await createDiecut(photo.uri);
      if (diecut) setDiecut(entry.id, diecut);

      track(events.scanSucceeded, {
        make: entry.make,
        model: entry.model,
        brand_id: entry.brandId,
        car_id: entry.carId,
        rarity: entry.rarity,
        xp: entry.xp,
        matched,
        charged,
        discovered: entry.discovered != null,
        // A pending fiche is only visible to its discoverer, so the two are very
        // different experiences for the same event.
        discovered_status: entry.discovered?.status,
        confidence: Math.round(result.confidence * 100) / 100,
        duration_ms: Date.now() - startedAt,
        mode: visionMode,
        // Whether the card leaves here as a sticker or as a snapshot. A property
        // rather than a success event of its own: this is the once-per-car
        // measurement, and `diecut_failed` carries the reason when it is false.
        has_diecut: Boolean(diecut),
        // Whether this car was already in the garage. A collection game whose
        // players mostly rescan the same Clio has a catalogue problem.
        duplicate: garage.some((item) => item.id !== entry.id && item.carId === entry.carId && entry.carId !== null),
        // Raw strings on a miss: this is the list of cars worth adding next.
        raw_make: matched ? undefined : result.make,
        raw_model: matched ? undefined : result.model,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('idle');
      router.push(`/reveal?entryId=${entry.id}`);

      // Deliberately not awaited: the reveal must not wait on a network round
      // trip, and an unsynced entry is picked up on the next sign-in.
      if (accountId) {
        pushEntry(accountId, entry).then((result) => {
          if (result) markSynced(entry.id, result.remoteId, result.photoPath);
          // A silent failure until now. It costs a player their collection on
          // reinstall, so it is worth knowing how often it happens.
          else track(events.syncFailed, { stage: 'push_entry', source: 'scan' });
        });
      }
    } catch (caught) {
      const code = caught instanceof VisionError ? caught.code : 'unreadable';

      // The server refused because the free allowance is gone.
      if (code === 'limit') {
        setPhase('idle');
        track(events.scanBlockedByLimit, { source: 'server', scans_used: scanCount });
        router.push('/paywall?context=limit');
        return;
      }

      track(events.scanFailed, { code, duration_ms: Date.now() - startedAt, mode: visionMode });
      // `no_car` is the player framing badly, not a bug — filing it as an
      // exception would bury the real ones. Everything else is ours.
      if (code !== 'no_car') captureError(caught, { stage: 'scan', code, mode: visionMode });

      lastError.current = code;
      setError(ERROR_COPY[code] ?? ERROR_COPY.unreadable);
      setPhase('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    // Once iOS stops offering the prompt, the button below can only lead to
    // Réglages — a screen still calling itself a permission request would be a
    // button that does nothing.
    const blocked = !permission.canAskAgain;

    return (
      <View style={[styles.root, styles.permission, { paddingTop: insets.top + spacing.xxxl }]}>
        <Text variant="title">Accès à l'appareil photo</Text>
        <Text variant="body" tone="secondary" style={styles.permissionCopy}>
          {blocked
            ? "L'accès à la caméra est désactivé. Active-le dans Réglages pour identifier les voitures que tu croises."
            : 'CarDex a besoin de la caméra pour identifier les voitures que tu croises.'}
        </Text>
        {/* App Review 5.1.1(iv): the screen before the system prompt explains why
            we ask, and never tells the player how to answer — hence « Continuer »
            rather than a button that pushes for a yes. */}
        <Button
          label={blocked ? 'Ouvrir les Réglages' : 'Continuer'}
          onPress={blocked ? openSettings : askPermission}
          style={styles.permissionCta}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {active ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" />
      ) : null}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.top, { paddingTop: insets.top + spacing.md }]} />

        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />

          {phase === 'working' ? (
            <Animated.View style={[styles.sweep, sweepStyle]} />
          ) : null}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
          {phase === 'working' ? (
            <Animated.View entering={FadeIn.duration(motion.fast)}>
              <Text variant="bodyMedium" color={colors.textInverted} center>
                Identification…
              </Text>
            </Animated.View>
          ) : (
            <Text variant="body" color={withAlpha(colors.textInverted, 0.75)} center>
              {error ?? 'Cadre la voiture entière, puis appuie.'}
            </Text>
          )}

          <Pressable
            onPress={capture}
            disabled={phase === 'working'}
            style={styles.shutterHit}
            hitSlop={12}
          >
            <View style={[styles.shutterRing, phase === 'working' && styles.shutterBusy]}>
              <View style={styles.shutterCore} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const FRAME_INSET = gutter + 4;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  permission: {
    paddingHorizontal: gutter,
    gap: spacing.md,
  },
  permissionCopy: {
    maxWidth: 300,
  },
  permissionCta: {
    marginTop: spacing.lg,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'center',
  },
  frame: {
    position: 'absolute',
    left: FRAME_INSET,
    right: FRAME_INSET,
    top: '28%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: withAlpha(colors.textInverted, 0.85),
  },
  tl: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 6 },
  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: colors.textInverted,
  },
  bottom: {
    paddingHorizontal: gutter,
    gap: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingTop: spacing.xl,
  },
  shutterHit: {
    padding: spacing.xs,
  },
  shutterRing: {
    width: 74,
    height: 74,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: withAlpha(colors.textInverted, 0.7),
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: {
    opacity: 0.4,
  },
  shutterCore: {
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    backgroundColor: colors.textInverted,
  },
});
