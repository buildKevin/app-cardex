import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { Text } from '../src/components/Text';
import { events, track } from '../src/services/analytics';
import {
  FOUNDER_FALLBACK_PRICE,
  getFounderPrice,
  isPurchasesAvailable,
  purchaseFounder,
  restorePurchases,
} from '../src/services/purchases';
import { FREE_SCAN_LIMIT, useGameStore } from '../src/store/useGameStore';
import { colors, gutter, motion, radii, spacing } from '../src/theme';

const PERKS = [
  'Scans illimités',
  'Toutes les futures fonctionnalités',
  'Badge Founder sur ton profil',
  'Aucune publicité, jamais',
];

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { context } = useLocalSearchParams<{ context?: string }>();
  const setFounder = useGameStore((state) => state.setFounder);

  const [price, setPrice] = useState(FOUNDER_FALLBACK_PRICE);
  const [busy, setBusy] = useState(false);

  const fromLimit = context === 'limit';
  // Only the onboarding paywall has nothing to go back to.
  const fromOnboarding = context === 'onboarding';

  useEffect(() => {
    track(events.paywallViewed, { context: context ?? 'unknown' });
    getFounderPrice().then((value) => {
      if (value) setPrice(value);
    });
  }, [context]);

  const leave = () => {
    track(events.paywallDismissed, { context: context ?? 'unknown' });
    if (fromOnboarding) router.replace('/(tabs)');
    else router.back();
  };

  const unlock = async () => {
    setBusy(true);
    track(events.purchaseStarted, { context: context ?? 'unknown' });

    const outcome = await purchaseFounder();
    setBusy(false);

    if (outcome === 'purchased') {
      setFounder(true);
      track(events.purchaseCompleted);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (fromOnboarding) router.replace('/(tabs)');
      else router.back();
      return;
    }

    if (outcome === 'cancelled') return;

    track(events.purchaseFailed, { outcome });
    Alert.alert(
      outcome === 'unavailable' ? 'Achats indisponibles' : 'Achat impossible',
      outcome === 'unavailable'
        ? 'Configure RevenueCat et lance un build natif pour activer les achats.'
        : 'Quelque chose a échoué. Réessaie dans un instant.',
    );
  };

  const restore = async () => {
    const restored = await restorePurchases();
    if (restored) {
      setFounder(true);
      Alert.alert('Founder restauré', 'Ton accès à vie est de nouveau actif.');
      return;
    }
    Alert.alert('Rien à restaurer', 'Aucun achat trouvé sur ce compte.');
  };

  /** Dev escape hatch so the Founder flow is testable without a native build. */
  const demoUnlock = () => {
    setFounder(true);
    if (fromOnboarding) router.replace('/(tabs)');
    else router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <Pressable onPress={leave} style={styles.close} hitSlop={12}>
        <Icon name="close" size={20} color={colors.textTertiary} />
      </Pressable>

      <Animated.View entering={FadeInDown.duration(motion.slow)} style={styles.content}>
        <Text variant="overline" tone="tertiary" uppercase>
          Offre Founder
        </Text>

        <Text variant="display" style={styles.title}>
          {fromLimit ? 'Tes 10 scans gratuits\nsont utilisés' : 'Débloque CarDex\nà vie'}
        </Text>

        <Text variant="body" tone="secondary" style={styles.subtitle}>
          {fromLimit
            ? `La version gratuite s'arrête à ${FREE_SCAN_LIMIT} scans. Passe Founder pour continuer à collectionner.`
            : 'Un paiement unique. Aucun abonnement. Tu gardes tout, pour toujours.'}
        </Text>

        <View style={styles.perks}>
          {PERKS.map((perk) => (
            <View key={perk} style={styles.perk}>
              <Icon name="check" size={16} color={colors.text} strokeWidth={2} />
              <Text variant="bodyMedium">{perk}</Text>
            </View>
          ))}
        </View>

        <View style={styles.priceCard}>
          <View>
            <Text variant="label" tone="tertiary" uppercase>
              Accès à vie
            </Text>
            <Text variant="title">{price}</Text>
          </View>
          <Text variant="caption" tone="tertiary" style={styles.priceNote}>
            Paiement unique
          </Text>
        </View>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button label="Débloquer" onPress={unlock} loading={busy} size="xl" />
        <Button label="Continuer gratuitement" variant="ghost" size="md" onPress={leave} />

        <Pressable onPress={restore} hitSlop={8}>
          <Text variant="caption" tone="tertiary" center>
            Restaurer un achat
          </Text>
        </Pressable>

        {__DEV__ && !isPurchasesAvailable() ? (
          <Pressable onPress={demoUnlock} hitSlop={8}>
            <Text variant="caption" tone="tertiary" center>
              Dev · débloquer sans RevenueCat
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: gutter,
  },
  close: {
    alignSelf: 'flex-end',
    padding: spacing.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  title: {
    marginTop: spacing.xs,
  },
  subtitle: {
    maxWidth: 320,
  },
  perks: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  priceCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceNote: {
    textAlign: 'right',
  },
  footer: {
    gap: spacing.sm,
  },
});
