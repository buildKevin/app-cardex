import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../src/components/Button';
import { CarSilhouette } from '../src/components/CarSilhouette';
import { EmptyState } from '../src/components/EmptyState';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { displayPhoto, isSticker } from '../src/lib/photo';
import { events, track } from '../src/services/analytics';
import { SHOWCASE_SIZE, useGameStore } from '../src/store/useGameStore';
import { colors, gridItemWidth, gutter, radii, spacing } from '../src/theme';

export default function ShowcasePicker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const garage = useGameStore((state) => state.garage);
  const showcase = useGameStore((state) => state.showcase);
  const toggleShowcase = useGameStore((state) => state.toggleShowcase);

  const full = showcase.length >= SHOWCASE_SIZE;

  // Reaching the picker with an empty garage is the one case where the screen is
  // useless, and it happens when the profile shows three inviting empty slots.
  useEffect(() => {
    track(events.showcaseOpened, { cars: garage.length, selected: showcase.length });
    // Arrival only — the counts move as the player picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <Screen scroll edgeToEdgeTop contentStyle={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
          <Text variant="title">Ta vitrine</Text>
          <Text variant="body" tone="secondary">
            Choisis {SHOWCASE_SIZE} voitures à afficher en grand sur ton profil.
          </Text>
        </View>

        {garage.length === 0 ? (
          <EmptyState title="Rien à exposer" subtitle="Scanne une première voiture." />
        ) : (
          <View style={styles.grid}>
            {garage.map((entry) => {
              const selected = showcase.includes(entry.id);
              const locked = !selected && full;
              const photo = displayPhoto(entry);

              return (
                <Pressable
                  key={entry.id}
                  style={[styles.cell, locked && styles.cellLocked]}
                  onPress={() => {
                    toggleShowcase(entry.id);
                    track(events.showcaseUpdated, {
                      added: !selected,
                      source: 'picker',
                      rarity: entry.rarity,
                      has_styled_photo: Boolean(entry.styledPhotoUri),
                    });
                  }}
                  disabled={locked}
                >
                  <View style={[styles.thumb, selected && styles.thumbSelected]}>
                    {photo ? (
                      <Image
                        source={{ uri: photo }}
                        style={styles.image}
                        contentFit={isSticker(entry, photo) ? 'contain' : 'cover'}
                      />
                    ) : (
                      <CarSilhouette width={80} color={colors.silhouette} />
                    )}

                    {selected ? (
                      <View style={styles.check}>
                        <Icon name="check" size={13} color={colors.textInverted} strokeWidth={2.4} />
                      </View>
                    ) : null}
                  </View>

                  <Text variant="caption" tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
                    {entry.model}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Screen>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label="Terminé"
          onPress={() => router.back()}
          caption={`${showcase.length} / ${SHOWCASE_SIZE} sélectionnée${showcase.length > 1 ? 's' : ''}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screen: {
    paddingBottom: 140,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cell: {
    width: gridItemWidth(3),
    gap: spacing.sm,
  },
  cellLocked: {
    opacity: 0.35,
  },
  thumb: {
    aspectRatio: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbSelected: {
    borderColor: colors.text,
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  check: {
    position: 'absolute',
    top: spacing.xs + 2,
    right: spacing.xs + 2,
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: gutter,
    paddingTop: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
