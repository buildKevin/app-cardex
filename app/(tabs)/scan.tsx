import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
import { events, track } from '../../src/services/analytics';
import { preparePhoto } from '../../src/services/photo';
import { VisionError, identifyCar, visionMode } from '../../src/services/vision';
import { useGameStore, useScansLeft } from '../../src/store/useGameStore';
import { colors, gutter, motion, radii, spacing } from '../../src/theme';

type Phase = 'idle' | 'working' | 'error';

const ERROR_COPY: Record<string, string> = {
  no_car: 'Aucune voiture reconnue. Recadre et réessaie.',
  network: 'Connexion impossible. Vérifie ton réseau.',
  unreadable: "Réponse illisible de l'IA. Réessaie.",
  limit: 'Tes scans gratuits sont épuisés.',
};

export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const consumeScan = useGameStore((state) => state.consumeScan);
  const addScan = useGameStore((state) => state.addScan);
  const isFounder = useGameStore((state) => state.isFounder);
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

  const capture = async () => {
    if (phase === 'working') return;

    if (!isFounder && left <= 0) {
      track(events.scanBlockedByLimit);
      router.push('/paywall?context=limit');
      return;
    }

    setPhase('working');
    setError(null);
    track(events.scanStarted, { mode: visionMode });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const shot = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (!shot?.uri) throw new VisionError('unreadable');

      const photo = await preparePhoto(shot.uri);
      const result = await identifyCar(photo.base64);

      const entry = addScan(result, photo.uri);
      consumeScan();

      track(events.scanSucceeded, {
        make: entry.make,
        model: entry.model,
        rarity: entry.rarity,
        matched: entry.carId !== null,
        confidence: Math.round(result.confidence * 100) / 100,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('idle');
      router.push(`/reveal?entryId=${entry.id}`);
    } catch (caught) {
      const code = caught instanceof VisionError ? caught.code : 'unreadable';

      // The server refused because the free allowance is gone.
      if (code === 'limit') {
        setPhase('idle');
        track(events.scanBlockedByLimit, { source: 'server' });
        router.push('/paywall?context=limit');
        return;
      }

      track(events.scanFailed, { code });
      setError(ERROR_COPY[code] ?? ERROR_COPY.unreadable);
      setPhase('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.permission, { paddingTop: insets.top + spacing.xxxl }]}>
        <Text variant="title">Accès à l'appareil photo</Text>
        <Text variant="body" tone="secondary" style={styles.permissionCopy}>
          CarDex a besoin de la caméra pour identifier les voitures que tu croises.
        </Text>
        <Button label="Autoriser la caméra" onPress={requestPermission} style={styles.permissionCta} />
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
              <Text variant="bodyMedium" center>
                Identification…
              </Text>
            </Animated.View>
          ) : (
            <Text variant="body" tone="secondary" center>
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
    borderColor: 'rgba(255,255,255,0.85)',
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
    backgroundColor: colors.text,
  },
  bottom: {
    paddingHorizontal: gutter,
    gap: spacing.xl,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    borderColor: 'rgba(255,255,255,0.7)',
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
    backgroundColor: colors.accent,
  },
});
