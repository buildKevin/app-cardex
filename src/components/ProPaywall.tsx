import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEGAL, hasLegalLinks } from '../config/release';
import { getProPlans, type Plan, type PlanKey } from '../services/purchases';
import { FREE_SCAN_LIMIT, PRO_RESTYLE_LIMIT } from '../store/useGameStore';
import { colors, gutter, motion, radii, spacing } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * The in-app paywall, shown only when RevenueCat's own paywall cannot be
 * presented — Expo Go, web, or a build with no API key. Production uses the
 * dashboard-designed paywall so copy and pricing change without a release.
 *
 * It still has to be complete: this is the screen the app falls back to, and a
 * paywall missing its legal links is an App Store rejection.
 */

const PERKS = [
  'Scans illimités',
  `${PRO_RESTYLE_LIMIT} photos de studio par mois`,
  'Toutes les futures fonctionnalités',
  'Badge Pro sur ton profil',
  'Aucune publicité, jamais',
];

const PLAN_LABEL: Record<PlanKey, string> = {
  lifetime: 'À vie',
  yearly: 'Annuel',
  monthly: 'Mensuel',
};

const PLAN_NOTE: Record<PlanKey, string> = {
  lifetime: 'Paiement unique',
  yearly: 'Facturé chaque année',
  monthly: 'Facturé chaque mois',
};

interface Props {
  /** Where the paywall was opened from, for the copy at the top. */
  fromLimit: boolean;
  /** Opened from a second photo restyle — a different promise sells it. */
  fromRestyle?: boolean;
  busy: boolean;
  onPurchase: (plan: Plan) => void;
  onRestore: () => void;
  onClose: () => void;
  /** Rendered under the footer in dev when purchases are unavailable. */
  onDemoUnlock?: () => void;
}

export function ProPaywall({
  fromLimit,
  fromRestyle,
  busy,
  onPurchase,
  onRestore,
  onClose,
  onDemoUnlock,
}: Props) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<PlanKey>('yearly');

  useEffect(() => {
    getProPlans().then((loaded) => {
      if (loaded.length === 0) return;
      setPlans(loaded);
      // Default to the offering's own order rather than assuming yearly exists.
      setSelected((current) =>
        loaded.some((plan) => plan.key === current) ? current : loaded[0].key,
      );
    });
  }, []);

  const chosen = plans.find((plan) => plan.key === selected) ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <Pressable onPress={onClose} style={styles.close} hitSlop={12}>
        <Icon name="close" size={20} color={colors.textTertiary} />
      </Pressable>

      {/* Scrolls rather than centres-and-clips. With three plans the content is
          taller than a 6.1" screen, and the footer is a sibling that draws over
          the overflow — the third plan was rendered, hidden behind the button,
          and impossible to select. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(motion.slow)} style={styles.content}>
          <Text variant="overline" tone="tertiary" uppercase>
            CarDex Pro
          </Text>

          <Text variant="display" style={styles.title}>
            {fromRestyle
              ? 'Ton rendu offert\nest utilisé'
              : fromLimit
                ? 'Tes 10 scans gratuits\nsont utilisés'
                : 'Débloque\nCarDex Pro'}
          </Text>

          <Text variant="body" tone="secondary" style={styles.subtitle}>
            {fromRestyle
              ? `Passe Pro pour ${PRO_RESTYLE_LIMIT} rendus par mois, et mets toute ta collection en valeur.`
              : fromLimit
                ? `La version gratuite s'arrête à ${FREE_SCAN_LIMIT} scans. Passe Pro pour continuer à collectionner.`
                : 'Scanne sans limite et garde ta collection à jour.'}
          </Text>

          <View style={styles.perks}>
            {PERKS.map((perk) => (
              <View key={perk} style={styles.perk}>
                <Icon name="check" size={16} color={colors.text} strokeWidth={2} />
                <Text variant="bodyMedium">{perk}</Text>
              </View>
            ))}
          </View>

          {plans.length > 0 ? (
            <View style={styles.plans}>
              {plans.map((plan) => {
                const active = plan.key === selected;
                return (
                  <Pressable
                    key={plan.key}
                    onPress={() => setSelected(plan.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.plan, active && styles.planActive]}
                  >
                    <View>
                      <Text variant="label" tone="tertiary" uppercase>
                        {PLAN_LABEL[plan.key]}
                      </Text>
                      <Text variant="title">{plan.priceString}</Text>
                    </View>
                    <Text variant="caption" tone="tertiary" style={styles.planNote}>
                      {PLAN_NOTE[plan.key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            // No offering yet: say so rather than invent a price.
            <View style={styles.plan}>
              <Text variant="label" tone="tertiary" uppercase>
                Offres
              </Text>
              <Text variant="caption" tone="tertiary">
                Indisponibles pour l’instant
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button
          label={chosen?.isLifetime ? 'Acheter' : 'S’abonner'}
          caption={chosen ? `${chosen.priceString} · ${PLAN_NOTE[chosen.key]}` : undefined}
          onPress={() => chosen && onPurchase(chosen)}
          loading={busy}
          disabled={!chosen}
          size="xl"
        />
        <Button label="Continuer gratuitement" variant="ghost" size="md" onPress={onClose} />

        <Pressable onPress={onRestore} hitSlop={8}>
          <Text variant="caption" tone="tertiary" center>
            Restaurer un achat
          </Text>
        </Pressable>

        {/* Apple requires the terms and privacy policy to be reachable from any
            screen that sells something. */}
        {hasLegalLinks ? (
          <View style={styles.legal}>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(LEGAL.terms)} hitSlop={8}>
              <Text variant="caption" tone="tertiary">
                Conditions
              </Text>
            </Pressable>
            <Text variant="caption" tone="tertiary">
              ·
            </Text>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(LEGAL.privacy)} hitSlop={8}>
              <Text variant="caption" tone="tertiary">
                Confidentialité
              </Text>
            </Pressable>
          </View>
        ) : null}

        {onDemoUnlock ? (
          <Pressable onPress={onDemoUnlock} hitSlop={8}>
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
  scroll: {
    flex: 1,
  },
  // flexGrow keeps the centring on a tall screen; the scroll only engages once
  // the content genuinely outgrows it.
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: spacing.lg,
  },
  content: {
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
  plans: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  plan: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planActive: {
    borderColor: colors.text,
    borderWidth: 1,
  },
  planNote: {
    textAlign: 'right',
  },
  footer: {
    gap: spacing.sm,
  },
  legal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
