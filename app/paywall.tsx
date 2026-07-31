import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ProPaywall } from '../src/components/ProPaywall';
import { events, track } from '../src/services/analytics';
import {
  getPurchasesUi,
  isProActive,
  isPurchasesAvailable,
  purchasePlan,
  restorePurchases,
  type Plan,
} from '../src/services/purchases';
import { useGameStore } from '../src/store/useGameStore';
import { colors } from '../src/theme';

/**
 * The CarDex Pro paywall.
 *
 * Prefers the paywall designed in the RevenueCat dashboard (Paywalls v2), which
 * means pricing, copy and layout can change without an App Store release. Falls
 * back to the in-app design when the native UI is unavailable — Expo Go, web,
 * or an empty `.env`.
 *
 * Kept as a route rather than a modal call so every existing
 * `router.push('/paywall?context=…')` still works.
 */
export default function Paywall() {
  const router = useRouter();
  const { context } = useLocalSearchParams<{ context?: string }>();
  const setPro = useGameStore((state) => state.setPro);

  const [busy, setBusy] = useState(false);
  // RevenueCat closes its paywall after a purchase and *then* calls onDismiss,
  // so leaving is guarded — otherwise the second call pops a screen that was
  // never part of the paywall, and logs a dismissal for a sale.
  const left = useRef(false);

  const from = context ?? 'unknown';
  const fromLimit = context === 'limit';
  // Only the onboarding paywall has nothing to go back to.
  const fromOnboarding = context === 'onboarding';

  const RevenueCatUI = getPurchasesUi();
  const useRevenueCatUi = process.env.EXPO_PUBLIC_USE_REVENUECAT_UI === '1';

  useEffect(() => {
    track(events.paywallViewed, {
      context: from,
      ui: RevenueCatUI && useRevenueCatUi ? 'revenuecat' : 'custom',
    });
  }, [from, RevenueCatUI, useRevenueCatUi]);

  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    if (fromOnboarding) router.replace('/(tabs)');
    else router.back();
  }, [fromOnboarding, router]);

  const dismiss = useCallback(() => {
    if (left.current) return;
    track(events.paywallDismissed, { context: from });
    leave();
  }, [from, leave]);

  /** Shared by both paywalls: unlock, celebrate, leave. */
  const unlocked = useCallback(
    async (via: 'purchase' | 'restore') => {
      setPro(true);
      track(via === 'purchase' ? events.purchaseCompleted : events.purchaseRestored, {
        context: from,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      leave();
    },
    [from, leave, setPro],
  );

  /**
   * RevenueCat's own paywall, used only when explicitly opted into.
   *
   * It was the default, which broke the moment the UI package shipped in a real
   * build: with no paywall configured in the dashboard it renders "There's no
   * paywall configured" to the user. Beyond that, its templates cannot deliver
   * the design this app is built around — pure black, near-zero colour, our own
   * typography. Our screen below is the product; this stays for the day someone
   * builds a paywall in the dashboard and sets EXPO_PUBLIC_USE_REVENUECAT_UI.
   */
  if (RevenueCatUI && useRevenueCatUi) {
    return (
      <View style={styles.root}>
        <RevenueCatUI.Paywall
          style={styles.root}
          onPurchaseStarted={({ packageBeingPurchased }) =>
            track(events.purchaseStarted, {
              context: from,
              product: packageBeingPurchased.product.identifier,
            })
          }
          // Trust the entitlement, not the transaction: a completed purchase
          // that did not unlock Pro means the dashboard is misconfigured, and
          // unlocking anyway would hide that from us.
          onPurchaseCompleted={({ customerInfo }) => {
            if (isProActive(customerInfo)) unlocked('purchase');
            else track(events.purchaseFailed, { context: from, reason: 'not_entitled' });
          }}
          onPurchaseCancelled={() => track(events.purchaseCancelled, { context: from })}
          onPurchaseError={({ error }) =>
            track(events.purchaseFailed, { context: from, code: error?.code })
          }
          onRestoreCompleted={({ customerInfo }) => {
            if (isProActive(customerInfo)) unlocked('restore');
          }}
          onDismiss={dismiss}
        />
      </View>
    );
  }

  // ── Fallback paywall ───────────────────────────────────────────────────────
  const buy = async (plan: Plan) => {
    setBusy(true);
    track(events.purchaseStarted, { context: from, product: plan.package.product.identifier });

    const outcome = await purchasePlan(plan.package);
    setBusy(false);

    switch (outcome.status) {
      case 'purchased':
        await unlocked('purchase');
        return;

      case 'cancelled':
        track(events.purchaseCancelled, { context: from });
        return;

      case 'pending':
        track(events.purchasePending, { context: from });
        Alert.alert(
          'Paiement en attente',
          'Ton achat doit encore être validé. Pro s’activera automatiquement dès que ce sera fait.',
        );
        return;

      case 'not_entitled':
        track(events.purchaseFailed, { context: from, reason: 'not_entitled' });
        Alert.alert(
          'Achat enregistré',
          'Le paiement est passé mais l’accès Pro n’est pas encore actif. Réessaie « Restaurer un achat » dans un instant.',
        );
        return;

      case 'unavailable':
        track(events.purchaseFailed, { context: from, reason: 'unavailable' });
        Alert.alert(
          'Achats indisponibles',
          'Configure RevenueCat et lance un build natif pour activer les achats.',
        );
        return;

      default:
        track(events.purchaseFailed, { context: from, code: outcome.code });
        Alert.alert('Achat impossible', outcome.message);
    }
  };

  const restore = async () => {
    setBusy(true);
    const restored = await restorePurchases();
    setBusy(false);

    if (restored) {
      await unlocked('restore');
      return;
    }
    Alert.alert('Rien à restaurer', 'Aucun achat trouvé sur ce compte.');
  };

  return (
    <ProPaywall
      fromLimit={fromLimit}
      busy={busy}
      onPurchase={buy}
      onRestore={restore}
      onClose={dismiss}
      /** Dev escape hatch so the Pro flow is testable without a native build. */
      onDemoUnlock={
        __DEV__ && !isPurchasesAvailable()
          ? () => {
              setPro(true);
              leave();
            }
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
