import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '../../src/components/Avatar';
import { BadgeTile } from '../../src/components/BadgeTile';
import { Card } from '../../src/components/Card';
import { CarSilhouette } from '../../src/components/CarSilhouette';
import { Icon } from '../../src/components/Icon';
import { ProgressBar } from '../../src/components/ProgressBar';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SettingsGroup } from '../../src/components/SettingsGroup';
import { SettingsRow } from '../../src/components/SettingsRow';
import { Text } from '../../src/components/Text';
import { badgeStates, unlockedBadgeCount } from '../../src/data/badges';
import { formatNumber } from '../../src/lib/format';
import { events, resetAnalytics, track } from '../../src/services/analytics';
import { deleteAccount, signOut } from '../../src/services/auth';
import { hasSupabase } from '../../src/services/env';
import { deletePhoto } from '../../src/services/photo';
import { FOUNDER_FALLBACK_PRICE, restorePurchases } from '../../src/services/purchases';
import { visionMode } from '../../src/services/vision';
import { SHOWCASE_SIZE, useGameStore, useStats } from '../../src/store/useGameStore';
import { colors, fonts, gridItemWidth, gutter, radii, spacing, type } from '../../src/theme';

type Busy = 'restore' | 'signout' | 'delete' | null;

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

  const profile = useGameStore((state) => state.profile);
  const setUsername = useGameStore((state) => state.setUsername);
  const isFounder = useGameStore((state) => state.isFounder);
  const setFounder = useGameStore((state) => state.setFounder);
  const showcase = useGameStore((state) => state.showcase);
  const garage = useGameStore((state) => state.garage);
  const resetGarage = useGameStore((state) => state.resetGarage);
  const signOutLocal = useGameStore((state) => state.signOutLocal);
  const reset = useGameStore((state) => state.reset);

  const [draftName, setDraftName] = useState(profile.username);
  const [busy, setBusy] = useState<Busy>(null);

  const badges = badgeStates(stats);
  const unlocked = unlockedBadgeCount(stats);
  const showcaseEntries = showcase
    .map((id) => garage.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Application.nativeBuildVersion;

  /** Photos live on disk, outside the store, so they need removing by hand. */
  const purgePhotos = () => garage.forEach((entry) => deletePhoto(entry.photoUri));

  const onRestore = async () => {
    setBusy('restore');
    const restored = await restorePurchases();
    setBusy(null);

    if (restored) {
      setFounder(true);
      Alert.alert('Founder restauré', 'Ton accès à vie est de nouveau actif.');
      return;
    }
    Alert.alert(
      'Aucun achat trouvé',
      'Vérifie que tu es bien connecté avec le compte qui a servi à l’achat.',
    );
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
          <Avatar name={profile.username} />
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

        {isFounder ? (
          <View style={styles.founder}>
            <Icon name="star" size={13} color={colors.textInverted} />
            <Text variant="overline" tone="inverted" uppercase>
              Founder
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
          {badges.map((badge) => (
            <View key={badge.def.id} style={styles.badgeCell}>
              <BadgeTile badge={badge} />
            </View>
          ))}
        </View>
      </View>

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
          value={isFounder ? undefined : 'Gratuit'}
          badge={isFounder ? 'Founder' : undefined}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Achats">
        {!isFounder ? (
          <SettingsRow
            label="Passer Founder"
            value={`${FOUNDER_FALLBACK_PRICE} à vie`}
            onPress={() => router.push('/paywall?context=profile')}
            disabled={busy !== null}
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
  founder: {
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
  footer: {
    marginTop: spacing.xxl,
    gap: spacing.xs,
    paddingBottom: gutter,
  },
});
