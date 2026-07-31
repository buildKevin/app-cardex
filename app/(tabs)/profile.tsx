import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  type AlertButton,
  Linking,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '../../src/components/Avatar';
import { BadgeTile } from '../../src/components/BadgeTile';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { CarSilhouette } from '../../src/components/CarSilhouette';
import { Icon } from '../../src/components/Icon';
import { ProgressBar } from '../../src/components/ProgressBar';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SettingsGroup } from '../../src/components/SettingsGroup';
import { SettingsRow } from '../../src/components/SettingsRow';
import { Text } from '../../src/components/Text';
import { badgeStates, rankBadges, unlockedBadgeCount } from '../../src/data/badges';
import { formatDiscoveredAt, formatNumber } from '../../src/lib/format';
import { LEGAL, hasLegalLinks } from '../../src/config/release';
import { events, resetAnalytics, track } from '../../src/services/analytics';
import { deleteAccount, signOut } from '../../src/services/auth';
import { hasSupabase } from '../../src/services/env';
import { deletePhoto, prepareAvatar } from '../../src/services/photo';
import {
  getCustomerInfo,
  getProPlans,
  isPurchasesUiAvailable,
  presentCustomerCenter,
  readProStatus,
  resetPurchaser,
  restorePurchases,
  type ProStatus,
} from '../../src/services/purchases';
import { visionMode } from '../../src/services/vision';
import { SHOWCASE_SIZE, useGameStore, useScansLeft, useStats } from '../../src/store/useGameStore';
import { colors, fonts, gridItemWidth, gutter, radii, spacing, type } from '../../src/theme';

type Busy = 'restore' | 'manage' | 'signout' | 'delete' | null;

/** One badge per brand: the full grid is far longer than the rest of the page. */
const BADGE_PREVIEW = 4;

/** A teaser, not the full argument — the paywall makes that one. */
const PRO_PERKS = ['Scans illimités', 'Badge Pro sur ton profil', 'Aucune publicité, jamais'];

const PLAN_LABEL: Record<string, string> = {
  lifetime: 'À vie',
  yearly: 'Annuel',
  monthly: 'Mensuel',
};

const PROVIDER_LABEL: Record<string, string> = {
  apple: 'Apple',
  google: 'Google',
  local: 'Cet appareil uniquement',
};

const VISION_LABEL: Record<string, string> = {
  mock: 'simulée',
  supabase: 'serveur',
  openai: 'directe (dev)',
};

export default function Profile() {
  const router = useRouter();
  const stats = useStats();
  const scansLeft = useScansLeft();

  const profile = useGameStore((state) => state.profile);
  const setUsername = useGameStore((state) => state.setUsername);
  const setAvatar = useGameStore((state) => state.setAvatar);
  const isPro = useGameStore((state) => state.isPro);
  const setPro = useGameStore((state) => state.setPro);
  const showcase = useGameStore((state) => state.showcase);
  const garage = useGameStore((state) => state.garage);
  const resetGarage = useGameStore((state) => state.resetGarage);
  const signOutLocal = useGameStore((state) => state.signOutLocal);
  const reset = useGameStore((state) => state.reset);

  const [draftName, setDraftName] = useState(profile.username);
  const [busy, setBusy] = useState<Busy>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pro, setProStatus] = useState<ProStatus | null>(null);
  const [price, setPrice] = useState<string | null>(null);

  // Renewal date and plan come from RevenueCat, never from local state — the
  // store flag only says whether Pro is on, not what the customer is paying for.
  useEffect(() => {
    let live = true;
    getCustomerInfo().then((info) => {
      if (live && info) setProStatus(readProStatus(info));
    });
    return () => {
      live = false;
    };
  }, [isPro]);

  /**
   * The price on the card, straight from the store so it stays localised. Only
   * shown when the offering sells a single plan — with several, the honest
   * comparison belongs on the paywall, not in a one-line caption.
   */
  useEffect(() => {
    if (isPro) return;
    let live = true;
    getProPlans().then((plans) => {
      if (!live || plans.length !== 1) return;
      const [plan] = plans;
      setPrice(plan.isLifetime ? `${plan.priceString} · paiement unique` : plan.priceString);
    });
    return () => {
      live = false;
    };
  }, [isPro]);

  const badges = badgeStates(stats);
  const unlocked = unlockedBadgeCount(stats);
  const previewBadges = rankBadges(badges).slice(0, BADGE_PREVIEW);
  const showcaseEntries = showcase
    .map((id) => garage.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Application.nativeBuildVersion;

  /** Photos live on disk, outside the store, so they need removing by hand. */
  const purgePhotos = () => garage.forEach((entry) => deletePhoto(entry.photoUri));

  /**
   * The picker returns a cache uri, so the pick only counts once `prepareAvatar`
   * has a copy in the documents directory. The previous file goes at the same
   * moment, or every change would leave one behind forever.
   */
  const pickAvatar = async (source: 'library' | 'camera') => {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Appareil photo bloqué',
          'Autorise CarDex à utiliser l’appareil photo dans les réglages de ton téléphone.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Ouvrir les réglages', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;

    setSavingAvatar(true);
    const previous = profile.avatarUri;
    const uri = await prepareAvatar(asset.uri);
    setSavingAvatar(false);

    if (!uri) {
      Alert.alert('Photo non enregistrée', 'Réessaie dans un instant.');
      return;
    }

    setAvatar(uri);
    deletePhoto(previous);
  };

  const removeAvatar = () => {
    const previous = profile.avatarUri;
    setAvatar(null);
    deletePhoto(previous);
  };

  const onChangeAvatar = () => {
    const buttons: AlertButton[] = [
      { text: 'Choisir dans mes photos', onPress: () => pickAvatar('library') },
      { text: 'Prendre une photo', onPress: () => pickAvatar('camera') },
    ];

    if (profile.avatarUri) {
      buttons.push({ text: 'Retirer la photo', style: 'destructive', onPress: removeAvatar });
    }
    buttons.push({ text: 'Annuler', style: 'cancel' });

    Alert.alert('Photo de profil', undefined, buttons);
  };

  const onRestore = async () => {
    setBusy('restore');
    const restored = await restorePurchases();
    setBusy(null);

    if (restored) {
      setPro(true);
      track(events.purchaseRestored, { context: 'profile' });
      Alert.alert('CarDex Pro restauré', 'Ton accès est de nouveau actif.');
      return;
    }
    Alert.alert(
      'Aucun achat trouvé',
      'Vérifie que tu es bien connecté avec le compte qui a servi à l’achat.',
    );
  };

  /**
   * Customer Center: cancel, change plan, request a refund, restore — all
   * configured in the RevenueCat dashboard. Falls back to the store's own
   * management page, because Apple requires the subscription to be manageable
   * from inside the app either way.
   */
  const onManageSubscription = async () => {
    setBusy('manage');
    track(events.customerCenterOpened);

    const presented = await presentCustomerCenter({
      onRestoreCompleted: (info) => setPro(readProStatus(info).isPro),
      onShowingManageSubscriptions: () => track(events.subscriptionManaged),
      onFeedbackSurveyCompleted: (optionId) =>
        track(events.churnSurveyCompleted, { option: optionId }),
    });

    if (!presented) {
      const url = pro?.managementUrl;
      if (url) await Linking.openURL(url).catch(() => {});
      else {
        Alert.alert(
          'Gestion indisponible',
          'Ouvre les réglages de ton compte App Store ou Google Play pour gérer ton abonnement.',
        );
      }
    }

    // Whatever happened in there may have changed the subscription.
    const info = await getCustomerInfo();
    if (info) {
      const status = readProStatus(info);
      setProStatus(status);
      setPro(status.isPro);
    }
    setBusy(null);
  };

  const onResetGarage = () => {
    Alert.alert(
      'Vider le garage ?',
      'Tes voitures, tes XP et tes badges seront effacés. Ton compte est conservé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider',
          style: 'destructive',
          onPress: () => {
            purgePhotos();
            resetGarage();
          },
        },
      ],
    );
  };

  const onSignOut = () => {
    Alert.alert('Se déconnecter ?', 'Ton garage reste sur cet appareil.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        onPress: async () => {
          setBusy('signout');
          await signOut();
          // Back to an anonymous RevenueCat id, or the next person to sign in
          // on this device inherits these entitlements.
          await resetPurchaser();
          track(events.signedOut);
          resetAnalytics();
          signOutLocal();
          setBusy(null);
          router.replace('/onboarding');
        },
      },
    ]);
  };

  // Two steps on purpose: Apple wants deletion easy to find, not easy to hit.
  const onDeleteAccount = () => {
    Alert.alert(
      'Supprimer mon compte ?',
      'Ton compte, ton garage, tes XP et tes badges seront définitivement supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', style: 'destructive', onPress: confirmDeleteAccount },
      ],
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert('Dernière confirmation', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer définitivement',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          const outcome = await deleteAccount();
          setBusy(null);

          if (outcome === 'error') {
            Alert.alert(
              'Suppression impossible',
              'Ton compte n’a pas pu être supprimé. Réessaie dans un instant.',
            );
            return;
          }

          track(events.accountDeleted, { remote: outcome === 'deleted' });
          purgePhotos();
          deletePhoto(profile.avatarUri);
          resetAnalytics();
          reset();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <Text variant="display">Profil</Text>

      <Card style={styles.identity}>
        <View style={styles.identityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Changer ma photo de profil"
            onPress={onChangeAvatar}
            disabled={savingAvatar}
            style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
          >
            <Avatar name={profile.username} uri={profile.avatarUri} />
            <View style={styles.avatarBadge}>
              <Icon name="camera" size={13} color={colors.text} />
            </View>
          </Pressable>
          <View style={styles.identityText}>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              onEndEditing={() => setUsername(draftName)}
              onSubmitEditing={() => setUsername(draftName)}
              style={styles.nameInput}
              placeholder="Ton pseudo"
              placeholderTextColor={colors.textTertiary}
              maxLength={22}
              returnKeyType="done"
              selectionColor={colors.text}
            />
            <Text variant="caption" tone="tertiary">
              Niveau {stats.progress.level} · {formatNumber(stats.xp)} XP
            </Text>
          </View>
        </View>

        {isPro ? (
          <View style={styles.proBadge}>
            <Icon name="star" size={13} color={colors.textInverted} />
            <Text variant="overline" tone="inverted" uppercase>
              Pro
            </Text>
          </View>
        ) : null}

        <View style={styles.levelBar}>
          <ProgressBar ratio={stats.progress.ratio} height={2} />
          <Text variant="caption" tone="tertiary">
            {stats.progress.xpToNext > 0
              ? `${formatNumber(stats.progress.xpToNext)} XP avant le niveau ${stats.progress.level + 1}`
              : 'Niveau maximum atteint'}
          </Text>
        </View>

        <View style={styles.counters}>
          <Counter label="Voitures" value={formatNumber(stats.cars)} />
          <Counter label="Badges" value={`${unlocked}`} />
          <Counter label="Scans" value={formatNumber(stats.scans)} />
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader title="Vitrine" trailing={`${showcaseEntries.length} / ${SHOWCASE_SIZE}`} />

        <View style={styles.showcase}>
          {Array.from({ length: SHOWCASE_SIZE }).map((_, index) => {
            const entry = showcaseEntries[index];

            if (!entry) {
              return (
                <Pressable
                  key={`empty-${index}`}
                  style={[styles.slot, styles.slotEmpty]}
                  onPress={() => router.push('/showcase')}
                >
                  <Icon name="star" size={18} color={colors.textTertiary} />
                </Pressable>
              );
            }

            return (
              <Pressable key={entry.id} style={styles.slot} onPress={() => router.push(`/car/${entry.id}`)}>
                {entry.photoUri ? (
                  <Image source={{ uri: entry.photoUri }} style={styles.slotImage} contentFit="cover" />
                ) : (
                  <View style={styles.slotPlaceholder}>
                    <CarSilhouette width={70} color="#26262E" />
                  </View>
                )}
                <View style={styles.slotLabel}>
                  <Text variant="caption" numberOfLines={1}>
                    {entry.model}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => router.push('/showcase')} hitSlop={8}>
          <Text variant="caption" tone="tertiary" style={styles.showcaseHint}>
            Choisir mes 3 voitures préférées
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Badges" trailing={`${unlocked} / ${badges.length}`} />
        <View style={styles.badges}>
          {previewBadges.map((badge) => (
            <View key={badge.def.id} style={styles.badgeCell}>
              <BadgeTile badge={badge} />
            </View>
          ))}
        </View>

        {badges.length > BADGE_PREVIEW ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/badges')}
            style={styles.badgeToggle}
          >
            <Text variant="label" tone="secondary">
              Tout afficher ({badges.length})
            </Text>
            <Icon name="chevron" size={14} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {/* An upsell is not a setting: as a plain row it read exactly like
          "Restaurer un achat" sitting under it. */}
      {!isPro ? (
        <View style={styles.upsell}>
          <View style={styles.upsellHead}>
            <View style={styles.upsellMedal}>
              <Icon name="star" size={16} color={colors.textInverted} />
            </View>
            <View style={styles.upsellTitle}>
              <Text variant="headline">CarDex Pro</Text>
              <Text variant="caption" tone="tertiary">
                {scansLeft > 0
                  ? `Il te reste ${scansLeft} scan${scansLeft > 1 ? 's' : ''} gratuit${scansLeft > 1 ? 's' : ''}`
                  : 'Tes scans gratuits sont épuisés'}
              </Text>
            </View>
          </View>

          <View style={styles.upsellPerks}>
            {PRO_PERKS.map((perk) => (
              <View key={perk} style={styles.upsellPerk}>
                <Icon name="check" size={14} color={colors.textSecondary} strokeWidth={2} />
                <Text variant="label" tone="secondary">
                  {perk}
                </Text>
              </View>
            ))}
          </View>

          <Button
            label="Débloquer"
            caption={price ?? undefined}
            size="md"
            onPress={() => router.push('/paywall?context=profile')}
            disabled={busy !== null}
          />
        </View>
      ) : null}

      <SettingsGroup title="Compte">
        <SettingsRow
          label="Connexion"
          value={profile.provider ? PROVIDER_LABEL[profile.provider] : 'Aucune'}
        />
        <SettingsRow
          label="Identifiant"
          value={profile.email ?? (profile.accountId ? 'Sans e-mail' : '—')}
        />
        <SettingsRow
          label="Statut"
          value={isPro ? undefined : 'Gratuit'}
          badge={isPro ? 'CarDex Pro' : undefined}
          last
        />
      </SettingsGroup>

      <SettingsGroup
        title="Abonnement"
        footnote={
          // Only say "renews" when it actually will: a cancelled subscription
          // still reads as active until the period ends.
          pro?.isPro && pro.expiresAt
            ? pro.willRenew
              ? `Renouvellement le ${formatDiscoveredAt(pro.expiresAt)}.`
              : `Actif jusqu’au ${formatDiscoveredAt(pro.expiresAt)}, sans renouvellement.`
            : undefined
        }
      >
        {isPro ? (
          <SettingsRow
            label="Formule"
            value={
              pro?.productIdentifier
                ? (PLAN_LABEL[pro.productIdentifier] ?? pro.productIdentifier)
                : 'CarDex Pro'
            }
            badge={pro?.isTrial ? 'Essai' : undefined}
          />
        ) : null}

        {/* A lifetime purchase has nothing to manage, and the Customer Center
            would open on an empty screen. */}
        {isPro && pro?.productIdentifier !== 'lifetime' ? (
          <SettingsRow
            label="Gérer mon abonnement"
            hint={isPurchasesUiAvailable() ? 'Changer de formule, annuler, remboursement' : 'Ouvre le store'}
            onPress={onManageSubscription}
            loading={busy === 'manage'}
            disabled={busy !== null && busy !== 'manage'}
          />
        ) : null}

        <SettingsRow
          label="Restaurer un achat"
          onPress={onRestore}
          loading={busy === 'restore'}
          disabled={busy !== null && busy !== 'restore'}
          last
        />
      </SettingsGroup>

      <SettingsGroup
        title="Données et compte"
        footnote="La suppression du compte efface aussi tes photos, et ne peut pas être annulée."
      >
        <SettingsRow
          label="Vider mon garage"
          hint="Garde le compte, efface les voitures"
          onPress={onResetGarage}
          destructive
          disabled={busy !== null}
        />
        <SettingsRow
          label="Se déconnecter"
          hint="Le garage reste sur cet appareil"
          onPress={onSignOut}
          loading={busy === 'signout'}
          disabled={busy !== null && busy !== 'signout'}
        />
        <SettingsRow
          label="Supprimer mon compte"
          hint="Compte, garage et photos, définitivement"
          onPress={onDeleteAccount}
          loading={busy === 'delete'}
          disabled={busy !== null && busy !== 'delete'}
          destructive
          last
        />
      </SettingsGroup>

      {hasLegalLinks ? (
        <SettingsGroup title="À propos">
          <SettingsRow
            label="Conditions d’utilisation"
            onPress={() => WebBrowser.openBrowserAsync(LEGAL.terms)}
          />
          <SettingsRow
            label="Politique de confidentialité"
            onPress={() => WebBrowser.openBrowserAsync(LEGAL.privacy)}
            last={!LEGAL.support}
          />
          {LEGAL.support ? (
            <SettingsRow
              label="Aide et contact"
              onPress={() => WebBrowser.openBrowserAsync(LEGAL.support)}
              last
            />
          ) : null}
        </SettingsGroup>
      ) : null}

      <View style={styles.footer}>
        <Text variant="caption" tone="tertiary">
          CarDex {version}
          {build ? ` (${build})` : ''}
        </Text>
        <Text variant="caption" tone="tertiary">
          {hasSupabase ? 'Serveur connecté' : 'Hors ligne'} · identification{' '}
          {VISION_LABEL[visionMode] ?? visionMode}
        </Text>
      </View>
    </Screen>
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.counter}>
      <Text variant="headline">{value}</Text>
      <Text variant="overline" tone="tertiary" uppercase>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    marginTop: spacing.xl,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    // The badge hangs off the circle, so no clipping here.
    position: 'relative',
  },
  avatarPressed: {
    opacity: 0.7,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  nameInput: {
    ...type.title,
    fontFamily: fonts.semibold,
    color: colors.text,
    padding: 0,
  },
  proBadge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  levelBar: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  counters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  counter: {
    gap: 2,
  },
  section: {
    marginTop: spacing.xxl,
  },
  showcase: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  slot: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  slotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  slotImage: {
    ...StyleSheet.absoluteFill,
  },
  slotPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  showcaseHint: {
    marginTop: spacing.md,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  badgeCell: {
    width: gridItemWidth(2),
  },
  badgeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  upsell: {
    marginTop: spacing.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  upsellHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  upsellMedal: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  upsellTitle: {
    flex: 1,
    gap: 2,
  },
  upsellPerks: {
    gap: spacing.sm,
  },
  upsellPerk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footer: {
    marginTop: spacing.xxl,
    gap: spacing.xs,
    paddingBottom: gutter,
  },
});
