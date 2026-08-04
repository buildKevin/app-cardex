import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { CarSilhouette } from '../../src/components/CarSilhouette';
import { Icon } from '../../src/components/Icon';
import { RarityTag } from '../../src/components/RarityTag';
import { RestyleCta } from '../../src/components/RestyleCta';
import { Screen } from '../../src/components/Screen';
import { SpecRow } from '../../src/components/SpecRow';
import { Text } from '../../src/components/Text';
import { getBrand } from '../../src/data/brands';
import { entryFiche } from '../../src/lib/fiche';
import { formatDiscoveredAt, formatPower, formatPrice } from '../../src/lib/format';
import { displayPhoto, hasBothPhotos, isSticker, originalPhoto } from '../../src/lib/photo';
import { RARITY_LABEL, rarityColor } from '../../src/lib/rarity';
import { captureError, events, track } from '../../src/services/analytics';
import { isGalleryAvailable, saveToGallery } from '../../src/services/gallery';
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

  // A comparison, not a revert: the sticker leads here as it does everywhere
  // else, and this only peeks at the photograph behind it — making the fiche the
  // one way back to what the camera actually saw.
  const [showOriginal, setShowOriginal] = useState(false);

  // `saved` is terminal on purpose: the library keeps the copy, so a second tap
  // would only litter the player's gallery with duplicates.
  const [stickerSave, setStickerSave] = useState<'idle' | 'saving' | 'saved'>('idle');

  // The card is reachable from the garage grid, the hero, a collection slot, the
  // showcase and the reveal, so `$screen`'s `previous_screen` is what says which
  // — this only has to carry what the card itself is.
  useEffect(() => {
    if (!entry) return;
    track(events.carOpened, {
      make: entry.make,
      model: entry.model,
      brand_id: entry.brandId,
      car_id: entry.carId,
      rarity: entry.rarity,
      in_catalogue: entry.carId !== null,
      source: entry.discovered ? 'community' : entry.carId ? 'catalogue' : 'unknown',
      has_styled_photo: Boolean(entry.styledPhotoUri),
      in_showcase: showcase.includes(entry.id),
    });
    // Only on arrival: re-firing when the showcase toggles would double-count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  if (!entry) {
    return (
      <Screen>
        <Text variant="headline" tone="secondary">
          {"Cette voiture n'est plus dans ton garage."}
        </Text>
      </Screen>
    );
  }

  const brand = getBrand(entry.brandId);
  const fiche = entryFiche(entry, car, brand);
  const inShowcase = showcase.includes(entry.id);
  const showcaseFull = showcase.length >= SHOWCASE_SIZE;

  const canCompare = hasBothPhotos(entry);
  const hero = showOriginal && canCompare ? originalPhoto(entry) : displayPhoto(entry);

  const onToggleShowcase = () => {
    if (!inShowcase && showcaseFull) {
      // Hitting a full showcase from here sends the player to the profile to make
      // room, which is a dead end worth counting rather than guessing at.
      track(events.showcaseRejected, { reason: 'full', source: 'car' });
      Alert.alert(
        'Vitrine complète',
        `Ta vitrine ne garde que ${SHOWCASE_SIZE} voitures. Retire-en une depuis ton profil.`,
      );
      return;
    }
    toggleShowcase(entry.id);
    track(events.showcaseUpdated, {
      added: !inShowcase,
      source: 'car',
      rarity: entry.rarity,
      has_styled_photo: Boolean(entry.styledPhotoUri),
    });
  };

  const onSaveSticker = async () => {
    if (stickerSave !== 'idle' || !entry.styledPhotoUri) return;
    setStickerSave('saving');

    try {
      const result = await saveToGallery(entry.styledPhotoUri, entry.styledPhotoPath);

      if (result === 'saved') {
        track(events.stickerSaved, {
          rarity: entry.rarity,
          brand_id: entry.brandId,
          in_catalogue: entry.carId !== null,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setStickerSave('saved');
        return;
      }

      setStickerSave('idle');
      track(events.stickerSaveFailed, { reason: result });
      if (result === 'denied') {
        Alert.alert(
          'Accès refusé',
          'Autorise CarDex à ajouter des photos dans Réglages pour enregistrer tes stickers.',
        );
      } else {
        Alert.alert('Indisponible', "L'enregistrement n'est pas disponible sur cette version.");
      }
    } catch (error) {
      setStickerSave('idle');
      // Both, on purpose: the event is what a funnel counts, the exception is
      // what says why.
      track(events.stickerSaveFailed, { reason: 'error' });
      captureError(error, { stage: 'save_sticker' });
      Alert.alert('Enregistrement impossible', 'Réessaie dans un instant.');
    }
  };

  const onDelete = () => {
    Alert.alert('Retirer du garage ?', `${entry.make} ${entry.model} sera supprimée.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () => {
          deletePhoto(entry.photoUri);
          deletePhoto(entry.styledPhotoUri ?? null);
          if (entry.remoteId) {
            deleteRemoteEntry(entry.remoteId).catch((error) =>
              captureError(error, { stage: 'delete_remote_entry' }),
            );
          }
          // Deletions in a collection game are a signal, not routine: a rarity
          // that gets removed often is one the identification keeps getting wrong.
          track(events.carRemoved, {
            rarity: entry.rarity,
            brand_id: entry.brandId,
            in_catalogue: entry.carId !== null,
            was_in_showcase: inShowcase,
            had_styled_photo: Boolean(entry.styledPhotoUri),
          });
          removeEntry(entry.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen scroll bleed>
      <View style={[styles.hero, isSticker(entry, hero) && styles.heroSticker]}>
        {hero ? (
          <Image
            source={{ uri: hero }}
            style={styles.image}
            contentFit={isSticker(entry, hero) ? 'contain' : 'cover'}
            transition={220}
          />
        ) : (
          <View style={styles.placeholder}>
            <CarSilhouette width={180} color={colors.silhouette} />
          </View>
        )}

        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <View style={styles.closeCircle}>
            <Icon name="close" size={18} color={colors.textInverted} />
          </View>
        </Pressable>

        {canCompare ? (
          <Pressable
            onPress={() => {
              // How often a player checks the rendering against their own photo
              // is the closest thing we have to "was the rendering any good".
              track(events.photoCompared, { showing: showOriginal ? 'sticker' : 'photo' });
              setShowOriginal((current) => !current);
            }}
            hitSlop={8}
            style={styles.compare}
          >
            <View style={styles.compareChip}>
              {/* On the dark plate over the photo, so inverted rather than primary. */}
              <Text variant="caption" color={colors.textInverted}>
                {showOriginal ? 'Voir le sticker' : 'Voir la photo'}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {/* Only over the sticker itself — saving is about the thing on screen,
            and the raw photograph is already in the player's library. Hidden
            when the native module is missing (Expo Go, a build older than the
            pod), because a button that only ever apologises is worse than none. */}
        {isSticker(entry, hero) && isGalleryAvailable() ? (
          <Pressable
            onPress={onSaveSticker}
            hitSlop={8}
            disabled={stickerSave === 'saving'}
            style={styles.save}
          >
            <View style={[styles.compareChip, styles.saveChip]}>
              <Icon
                name={stickerSave === 'saved' ? 'check' : 'download'}
                size={14}
                color={colors.textInverted}
              />
              <Text variant="caption" color={colors.textInverted}>
                {stickerSave === 'saving'
                  ? 'Enregistrement…'
                  : stickerSave === 'saved'
                    ? 'Enregistré'
                    : 'Enregistrer'}
              </Text>
            </View>
          </Pressable>
        ) : null}
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
            {"Cette voiture n'est pas encore dans notre catalogue, donc certaines caractéristiques manquent. Elle compte quand même dans ton garage."}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={inShowcase ? 'Retirer de la vitrine' : 'Mettre en vitrine'}
            variant={inShowcase ? 'secondary' : 'primary'}
            onPress={onToggleShowcase}
          />
          <RestyleCta entry={entry} accent={rarityColor(entry.rarity)} source="car" />
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
  /** A die-cut object needs the canvas behind it, not a grey plate. */
  heroSticker: {
    backgroundColor: colors.bg,
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
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compare: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
  },
  compareChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
  },
  save: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
  },
  saveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
