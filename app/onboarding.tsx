import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../src/components/Button';
import { CarSilhouette } from '../src/components/CarSilhouette';
import { Text } from '../src/components/Text';
import { captureError, events, identify, track } from '../src/services/analytics';
import {
  SignInCancelled,
  continueWithoutAccount,
  isAppleSignInAvailable,
  signIn,
  signInWithApple,
  type Account,
  type Provider,
} from '../src/services/auth';
import { restoreGarage } from '../src/services/restoreGarage';
import { useGameStore } from '../src/store/useGameStore';
import { colors, gutter, motion, radii, spacing } from '../src/theme';

const { width } = Dimensions.get('window');

interface Slide {
  eyebrow: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'CarDex',
    title: 'Bienvenue',
    body: 'Chaque voiture croisée dans la rue est une carte à collectionner.',
  },
  {
    eyebrow: 'Étape 01',
    title: 'Scanne des voitures dans la vraie vie',
    body: "Sors ton téléphone, cadre la voiture, l'IA l'identifie en une seconde.",
  },
  {
    eyebrow: 'Étape 02',
    title: 'Complète ton garage',
    body: 'Cinq voitures par marque. Les manquantes restent dans l’ombre.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<Provider | 'skip' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const completeOnboarding = useGameStore((state) => state.completeOnboarding);
  const setAccount = useGameStore((state) => state.setAccount);
  const setUsername = useGameStore((state) => state.setUsername);

  useEffect(() => {
    track(events.onboardingStarted);
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const isLast = page === SLIDES.length - 1;

  const goNext = () => {
    listRef.current?.scrollToOffset({ offset: (page + 1) * width, animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  // Where the three slides lose people, which is the only thing that would make
  // us cut one. Reported on arrival, so slide 0 fires alongside the start event.
  useEffect(() => {
    track(events.onboardingSlideViewed, {
      index: page,
      title: SLIDES[page]?.title,
      is_last: page === SLIDES.length - 1,
    });
  }, [page]);

  const finish = (account: Account) => {
    setAccount(account.id, account.email, account.provider);
    if (account.suggestedName) setUsername(account.suggestedName);
    identify(account.id, {
      provider: account.provider,
      // Not the address itself: `identify` does not send it, and knowing whether
      // a provider hands one over is what actually tells us if Apple's private
      // relay is costing us the ability to contact anyone.
      has_email: Boolean(account.email),
      apple_available: appleAvailable,
    });
    track(events.signedIn, { provider: account.provider, has_email: Boolean(account.email) });
    completeOnboarding();
    track(events.onboardingCompleted, {
      provider: account.provider,
      // The whole point of the skip button: how many players refuse an account.
      // Both values mean "skipped" — `anonymous` on a configured project,
      // `local` only when there is none, or when anonymous sign-ins are off.
      skipped_account: account.provider === 'local' || account.provider === 'anonymous',
    });

    // Not awaited: a returning player should reach the app immediately, and the
    // garage fills in behind them. Local accounts have nothing to reconcile.
    if (account.provider !== 'local') {
      restoreGarage(account.id)
        .then(({ pulled, pushed }) => track(events.garageRestored, { pulled, pushed }))
        .catch((error) => captureError(error, { stage: 'restore_garage' }));
    }

    router.replace('/paywall?context=onboarding');
  };

  const run = async (key: Provider | 'skip', task: () => Promise<Account>) => {
    setPending(key);
    track(events.signInStarted, { provider: key });
    try {
      finish(await task());
    } catch (error: any) {
      // Backing out of the Apple sheet is not a failure worth an alert.
      if (error instanceof SignInCancelled) {
        track(events.signInCancelled, { provider: key });
      } else {
        // Both, and on purpose: the event is what a funnel counts, the exception
        // is what tells us *why* — a refused Apple token and a dead network fail
        // identically from here, and only the stack trace separates them.
        track(events.signInFailed, { provider: key, reason: error?.message });
        captureError(error, { stage: 'sign_in', provider: key });
        Alert.alert('Connexion impossible', error?.message ?? 'Réessaie dans un instant.');
      }
    } finally {
      setPending(null);
    }
  };

  /**
   * Skipping has to stay possible — requiring an account would fall foul of
   * Guideline 5.1.1(i) — but it cannot mean "no server account". Identification
   * is a server call that answers 401 without a user token, so the previous
   * local-only id left the skip button leading to an app whose main action
   * failed. `continueWithoutAccount` creates an anonymous Supabase user
   * instead; see the note on it for why that is the only shape that works.
   */
  const onSkip = () => run('skip', continueWithoutAccount);

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <View style={[styles.slide, { paddingTop: insets.top + spacing.xxxl }]}>
            <Animated.View entering={FadeIn.delay(120).duration(motion.slow)} style={styles.art}>
              <CarSilhouette width={width * 0.62} color={index === 0 ? '#18181E' : '#141419'} />
            </Animated.View>

            <View style={styles.copy}>
              <Text variant="overline" tone="tertiary" uppercase>
                {item.eyebrow}
              </Text>
              <Text variant="display">{item.title}</Text>
              <Text variant="body" tone="secondary" style={styles.body}>
                {item.body}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, index) => (
            <View key={slide.title} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>

        {isLast ? (
          <Animated.View entering={FadeInDown.duration(motion.base)} style={styles.auth}>
            {/* Apple's own button: its wording, logo and proportions are part of
                what the review checks, so it is not restyled. */}
            {appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={radii.md}
                style={styles.appleButton}
                onPress={() => run('apple', signInWithApple)}
              />
            ) : null}

            <Button
              label="Continuer avec Google"
              variant={appleAvailable ? 'secondary' : 'primary'}
              onPress={() => run('google', () => signIn('google'))}
              loading={pending === 'google'}
              disabled={pending !== null}
            />

            <Button
              label="Continuer sans compte"
              variant="ghost"
              size="md"
              onPress={onSkip}
              loading={pending === 'skip'}
              disabled={pending !== null}
            />
          </Animated.View>
        ) : (
          <Button label="Continuer" onPress={goNext} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  slide: {
    width,
    flex: 1,
    paddingHorizontal: gutter,
    justifyContent: 'space-between',
  },
  art: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  body: {
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: gutter,
    gap: spacing.xl,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dotActive: {
    backgroundColor: colors.text,
  },
  auth: {
    gap: spacing.md,
  },
  appleButton: {
    height: 54,
    width: '100%',
  },
});
