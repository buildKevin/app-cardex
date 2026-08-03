import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandRow } from '../../src/components/BrandRow';
import { CatalogueTile } from '../../src/components/CatalogueTile';
import { ChipRow, type Chip } from '../../src/components/ChipRow';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TabSwipe } from '../../src/components/TabSwipe';
import { TabSwitcher } from '../../src/components/TabSwitcher';
import { Text } from '../../src/components/Text';
import { BRANDS } from '../../src/data/brands';
import { CARS, CARS_BY_BRAND } from '../../src/data/cars';
import { formatNumber } from '../../src/lib/format';
import { events, track } from '../../src/services/analytics';
import { useGameStore, useStats } from '../../src/store/useGameStore';
import { gridItemWidth, spacing } from '../../src/theme';

/** Three across, the same sheet as the garage grid. */
const COLUMNS = 3;

/**
 * The two ways of reading the same catalogue: grouped into the sets you complete
 * for a badge, or the whole thing laid out flat.
 *
 * Both are needed and neither replaces the other. Marques answer "what do I
 * finish next", which is what the badges are for; the flat sheet answers "how
 * much of the game is there", which grouping hides — 25 rows of 0/5 look
 * identical, 125 tiles with a dozen filled do not.
 */
type CollectionView = 'brands' | 'cars';

const VIEWS: Chip<CollectionView>[] = [
  { value: 'brands', label: 'Par marque' },
  { value: 'cars', label: 'Toutes les voitures' },
];

type BrandFilter = 'all' | 'active' | 'complete';

const BRAND_FILTERS: Chip<BrandFilter>[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'active', label: 'En cours' },
  { value: 'complete', label: 'Complètes' },
];

const BRAND_EMPTY: Record<BrandFilter, string> = {
  all: '',
  active: 'Aucune collection commencée. Scanne une voiture et sa marque apparaît ici.',
  complete: 'Aucune collection terminée. Il faut les cinq voitures d’une marque.',
};

type CarFilter = 'all' | 'owned' | 'missing';

const CAR_FILTERS: Chip<CarFilter>[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'owned', label: 'Possédées' },
  { value: 'missing', label: 'Manquantes' },
];

const CAR_EMPTY: Record<CarFilter, string> = {
  all: '',
  owned: 'Aucune voiture du catalogue pour l’instant. Scanne-en une.',
  missing: 'Catalogue complet. Il n’en reste aucune à trouver.',
};

export default function Collections() {
  const router = useRouter();
  const stats = useStats();
  const garage = useGameStore((state) => state.garage);
  const [view, setView] = useState<CollectionView>('brands');
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('all');
  const [carFilter, setCarFilter] = useState<CarFilter>('all');

  // Started collections first, then untouched ones — completed drop to the end.
  const ordered = [...BRANDS].sort((a, b) => {
    const pa = stats.brands[a.id];
    const pb = stats.brands[b.id];
    const rank = (owned: number, complete: boolean) => (complete ? 2 : owned > 0 ? 0 : 1);
    const diff = rank(pa.owned, pa.complete) - rank(pb.owned, pb.complete);
    if (diff !== 0) return diff;
    return pb.owned - pa.owned || a.name.localeCompare(b.name);
  });

  const shownBrands = ordered.filter((brand) => {
    const progress = stats.brands[brand.id];
    if (brandFilter === 'active') return progress.owned > 0 && !progress.complete;
    if (brandFilter === 'complete') return progress.complete;
    return true;
  });

  /**
   * First garage entry per catalogue car. A player can scan the same model twice
   * — the catalogue counts it once, the way `stats.ts` does.
   */
  const entryByCarId = new Map(
    // Walked oldest-first so the newest entry is the one left in the map, which
    // is what `garage.find()` on a brand page resolves to. Two screens opening a
    // different photo for the same car is the divergence to avoid here.
    [...garage].reverse().flatMap((entry) => (entry.carId ? [[entry.carId, entry] as const] : [])),
  );

  // Catalogue order, not sorted by ownership: the sheet has to stay put between
  // visits, or the hole a player is chasing moves every time they fill another.
  const shownCars = CARS.filter((car) => {
    if (carFilter === 'owned') return entryByCarId.has(car.id);
    if (carFilter === 'missing') return !entryByCarId.has(car.id);
    return true;
  });

  return (
    <TabSwipe>
      <Screen scroll>
        <TabSwitcher />

        <Text variant="body" tone="secondary" style={styles.intro}>
          Cinq voitures par marque. Débloque les cinq pour obtenir le badge.
        </Text>

        <View style={styles.views}>
          <ChipRow
            chips={VIEWS}
            value={view}
            onChange={(next) => {
              // Which reading players actually use. If nobody ever leaves the
              // marques, the flat sheet is a screen we are paying to maintain.
              if (next !== view) track(events.collectionsViewChanged, { view: next });
              setView(next);
            }}
          />
        </View>

        {view === 'brands' ? (
          <View style={styles.section}>
            <SectionHeader
              title="Marques"
              trailing={`${stats.completedBrands} / ${BRANDS.length} complètes`}
            />

            <View style={styles.filters}>
              <ChipRow chips={BRAND_FILTERS} value={brandFilter} onChange={setBrandFilter} />
            </View>

            {shownBrands.length === 0 ? (
              <Text variant="body" tone="tertiary">
                {BRAND_EMPTY[brandFilter]}
              </Text>
            ) : (
              <View style={styles.rows}>
                {shownBrands.map((brand) => (
                  <BrandRow
                    key={brand.id}
                    brand={brand}
                    progress={stats.brands[brand.id]}
                    onPress={() => {
                      // Which brands players actually open, against how far along
                      // they are. A brand nobody opens at 0/5 is a brand nobody is
                      // chasing.
                      track(events.collectionOpened, {
                        brand_id: brand.id,
                        make: brand.name,
                        owned: stats.brands[brand.id].owned,
                        total: stats.brands[brand.id].total,
                        complete: stats.brands[brand.id].complete,
                        source: 'list',
                      });
                      router.push(`/collection/${brand.id}`);
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <SectionHeader
              title="Catalogue"
              trailing={`${formatNumber(entryByCarId.size)} / ${formatNumber(CARS.length)}`}
            />

            <View style={styles.filters}>
              <ChipRow chips={CAR_FILTERS} value={carFilter} onChange={setCarFilter} />
            </View>

            {shownCars.length === 0 ? (
              <Text variant="body" tone="tertiary">
                {CAR_EMPTY[carFilter]}
              </Text>
            ) : (
              <View style={styles.grid}>
                {shownCars.map((car) => {
                  const entry = entryByCarId.get(car.id);

                  return (
                    <View key={car.id} style={styles.cell}>
                      <CatalogueTile
                        car={car}
                        entry={entry}
                        onPress={() => {
                          if (entry) {
                            router.push(`/car/${entry.id}`);
                            return;
                          }

                          // A tap on a locked tile is a player asking "what is
                          // this car?" — the same question the brand pages
                          // measure, so it is the same event with the view it
                          // came from attached.
                          track(events.lockedSlotTapped, {
                            brand_id: car.brandId,
                            car_id: car.id,
                            rarity: car.rarity,
                            slot: (CARS_BY_BRAND[car.brandId] ?? []).indexOf(car) + 1,
                            owned: stats.brands[car.brandId]?.owned ?? 0,
                            source: 'catalogue',
                          });
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </Screen>
    </TabSwipe>
  );
}

const styles = StyleSheet.create({
  intro: {
    maxWidth: 300,
  },
  views: {
    marginTop: spacing.lg,
  },
  section: {
    marginTop: spacing.xxl,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  rows: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xl,
  },
  cell: {
    width: gridItemWidth(COLUMNS),
  },
});
