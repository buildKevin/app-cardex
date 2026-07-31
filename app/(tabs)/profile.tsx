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
import { Text } from '../../src/components/Text';
import { badgeStates, unlockedBadgeCount } from '../../src/data/badges';
import { formatNumber } from '../../src/lib/format';
import { restorePurchases } from '../../src/services/purchases';
import { SHOWCASE_SIZE, useGameStore, useStats } from '../../src/store/useGameStore';
import { colors, fonts, gridItemWidth, gutter, radii, spacing, type } from '../../src/theme';

export default function Profile() {
  const router = useRouter();
  const stats = useStats();

  const profile = useGameStore((state) => state.profile);
  const setUsername = useGameStore((state) => state.setUsername);
  const isFounder = useGameStore((state) => state.isFounder);
  const setFounder = useGameStore((state) => state.setFounder);
  const showcase = useGameStore((state) => state.showcase);
  const garage = useGameStore((state) => state.garage);
  const reset = useGameStore((state) => state.reset);

  const [draftName, setDraftName] = useState(profile.username);

  const badges = badgeStates(stats);
  const unlocked = unlockedBadgeCount(stats);
  const showcaseEntries = showcase
    .map((id) => garage.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const onRestore = async () => {
    const restored = await restorePurchases();
    if (restored) {
      setFounder(true);
      Alert.alert('Founder restauré', 'Ton accès à vie est de nouveau actif.');
      return;
    }
    Alert.alert('Rien à restaurer', 'Aucun achat trouvé sur ce compte.');
  };

  const onReset = () => {
    Alert.alert('Réinitialiser ?', 'Ton garage, tes XP et tes badges seront effacés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Réinitialiser', style: 'destructive', onPress: reset },
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
          <ProgressBar ratio={stats.progress.ratio} />
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
              <Pressable
                key={entry.id}
                style={styles.slot}
                onPress={() => router.push(`/car/${entry.id}`)}
              >
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

      <View style={styles.footerActions}>
        {!isFounder ? (
          <Pressable onPress={() => router.push('/paywall?context=profile')} hitSlop={8}>
            <Text variant="label">Passer Founder</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onRestore} hitSlop={8}>
          <Text variant="label" tone="secondary">
            Restaurer un achat
          </Text>
        </Pressable>

        <Pressable onPress={onReset} hitSlop={8}>
          <Text variant="label" color={colors.danger}>
            Réinitialiser mes données
          </Text>
        </Pressable>
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
  footerActions: {
    marginTop: spacing.xxxl,
    gap: spacing.lg,
    paddingBottom: gutter,
  },
});
