import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { CarSilhouette } from '../../src/components/CarSilhouette';
import { Icon } from '../../src/components/Icon';
import { RarityTag } from '../../src/components/RarityTag';
import { Screen } from '../../src/components/Screen';
import { SpecRow } from '../../src/components/SpecRow';
import { Text } from '../../src/components/Text';
import { getBrand } from '../../src/data/brands';
import { entryFiche } from '../../src/lib/fiche';
import { formatDiscoveredAt, formatPower, formatPrice } from '../../src/lib/format';
import { RARITY_LABEL } from '../../src/lib/rarity';
import { events, track } from '../../src/services/analytics';
import { deletePhoto } from '../../src/services/photo';
import { deleteRemoteEntry } from '../../src/services/sync';
import { SHOWCASE_SIZE, useEntryCar, useGameStore } from '../../src/store/useGameStore';
import { colors, gutter, radii, spacing } from '../../src/theme';

export default function CarDetail() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const { entry, car } = useEntryCar(entryId);

  const showcase = useGameStore((state) => state.showcase);
  const toggleShowcase = useGameStore((state) => state.toggleShowcase);
  const removeEntry = useGameStore((state) => state.removeEntry);

  if (!entry) {
    return (
      <Screen>
        <Text variant="headline" tone="secondary">
          Cette voiture n'est plus dans ton garage.
        </Text>
      </Screen>
    );
  }

  const brand = getBrand(entry.brandId);
  const fiche = entryFiche(entry, car, brand);
  const inShowcase = showcase.includes(entry.id);
  const showcaseFull = showcase.length >= SHOWCASE_SIZE;

  const onToggleShowcase = () => {
    if (!inShowcase && showcaseFull) {
      Alert.alert(
        'Vitrine complète',
        `Ta vitrine ne garde que ${SHOWCASE_SIZE} voitures. Retire-en une depuis ton profil.`,
      );
      return;
    }
    toggleShowcase(entry.id);
    track(events.showcaseUpdated, { added: !inShowcase });
  };

  const onDelete = () => {
    Alert.alert('Retirer du garage ?', `${entry.make} ${entry.model} sera supprimée.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () => {
          deletePhoto(entry.photoUri);
          if (entry.remoteId) deleteRemoteEntry(entry.remoteId).catch(() => {});
          removeEntry(entry.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen scroll bleed>
      <View style={styles.hero}>
        {entry.photoUri ? (
          <Image source={{ uri: entry.photoUri }} style={styles.image} contentFit="cover" transition={220} />
        ) : (
          <View style={styles.placeholder}>
            <CarSilhouette width={180} color="#22222A" />
          </View>
        )}

        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <View style={styles.closeCircle}>
            <Icon name="close" size={18} color={colors.text} />
          </View>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text variant="label" tone="secondary" uppercase>
          {entry.make}
        </Text>
        <Text variant="display">{fiche.model}</Text>

        <View style={styles.tags}>
          <RarityTag rarity={entry.rarity} size="md" />
          <Text variant="label" tone="tertiary">
            +{entry.xp} XP
          </Text>
        </View>

        <Card style={styles.specs}>
          <SpecRow label="Marque" value={brand?.name ?? entry.make} />
          <SpecRow label="Modèle" value={fiche.model} />
          {fiche.generation ? <SpecRow label="Génération" value={fiche.generation} /> : null}
          <SpecRow label="Année" value={entry.year ? String(entry.year) : (fiche.years ?? '—')} />
          <SpecRow label="Puissance" value={fiche.power ? formatPower(fiche.power) : 'Inconnue'} />
          <SpecRow label="Pays" value={fiche.country ?? 'Inconnu'} />
          <SpecRow label="Prix neuf" value={fiche.priceNew ? formatPrice(fiche.priceNew) : 'Inconnu'} />
          <SpecRow label="Rareté" value={RARITY_LABEL[entry.rarity]} />
          <SpecRow label="Découverte" value={formatDiscoveredAt(entry.discoveredAt)} last />
        </Card>

        {fiche.source === 'community' ? (
          <Text variant="caption" tone="tertiary" style={styles.note}>
            {"Cette voiture n'est pas dans notre catalogue : ses caractéristiques ont été estimées lors de sa première découverte, et sont les mêmes pour tous les joueurs qui la scannent."}
          </Text>
        ) : null}

        {fiche.source === 'unknown' ? (
          <Text variant="caption" tone="tertiary" style={styles.note}>
            Cette voiture n'est pas encore dans notre catalogue, donc certaines caractéristiques
            manquent. Elle compte quand même dans ton garage.
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={inShowcase ? 'Retirer de la vitrine' : 'Mettre en vitrine'}
            variant={inShowcase ? 'secondary' : 'primary'}
            onPress={onToggleShowcase}
          />
          <Button label="Retirer du garage" variant="ghost" size="md" onPress={onDelete} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceElevated,
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: gutter,
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  specs: {
    marginTop: spacing.xl,
    paddingVertical: spacing.xs,
  },
  note: {
    marginTop: spacing.md,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
