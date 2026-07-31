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
import { events, identify, track } from '../src/services/analytics';
import { signIn, type Provider } from '../src/services/auth';
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
  const [pending, setPending] = useState<Provider | null>(null);

  const completeOnboarding = useGameStore((state) => state.completeOnboarding);
  const setAccount = useGameStore((state) => state.setAccount);

  useEffect(() => {
    track(events.onboardingStarted);
  }, []);

  const isLast = page === SLIDES.length - 1;

  const goNext = () => {
    listRef.current?.scrollToOffset({ offset: (page + 1) * width, animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  const onSignIn = async (provider: Provider) => {
    setPending(provider);
    try {
      const account = await signIn(provider);
      setAccount(account.id, account.email, account.provider);
      identify(account.id, { provider: account.provider });
      track(events.signedIn, { provider: account.provider });
      completeOnboarding();
      track(events.onboardingCompleted);
      router.replace('/paywall?context=onboarding');
    } catch (error: any) {
      Alert.alert('Connexion impossible', error?.message ?? 'Réessaie dans un instant.');
    } finally {
      setPending(null);
    }
  };

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
            <Button
              label="Continuer avec Apple"
              onPress={() => onSignIn('apple')}
              loading={pending === 'apple'}
              disabled={pending !== null}
            />
            <Button
              label="Continuer avec Google"
              variant="secondary"
              onPress={() => onSignIn('google')}
              loading={pending === 'google'}
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
});
