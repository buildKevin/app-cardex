import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandRow } from '../../src/components/BrandRow';
import { ChipRow, type Chip } from '../../src/components/ChipRow';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TabSwitcher } from '../../src/components/TabSwitcher';
import { Text } from '../../src/components/Text';
import { BRANDS } from '../../src/data/brands';
import { events, track } from '../../src/services/analytics';
import { useStats } from '../../src/store/useGameStore';
import { spacing } from '../../src/theme';

type Filter = 'all' | 'active' | 'complete';

const FILTERS: Chip<Filter>[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'active', label: 'En cours' },
  { value: 'complete', label: 'Complètes' },
];

const EMPTY: Record<Filter, string> = {
  all: '',
  active: 'Aucune collection commencée. Scanne une voiture et sa marque apparaît ici.',
  complete: 'Aucune collection terminée. Il faut les cinq voitures d’une marque.',
};

export default function Collections() {
  const router = useRouter();
  const stats = useStats();
  const [filter, setFilter] = useState<Filter>('all');

  // Started collections first, then untouched ones — completed drop to the end.
  const ordered = [...BRANDS].sort((a, b) => {
    const pa = stats.brands[a.id];
    const pb = stats.brands[b.id];
    const rank = (owned: number, complete: boolean) => (complete ? 2 : owned > 0 ? 0 : 1);
    const diff = rank(pa.owned, pa.complete) - rank(pb.owned, pb.complete);
    if (diff !== 0) return diff;
    return pb.owned - pa.owned || a.name.localeCompare(b.name);
  });

  const shown = ordered.filter((brand) => {
    const progress = stats.brands[brand.id];
    if (filter === 'active') return progress.owned > 0 && !progress.complete;
    if (filter === 'complete') return progress.complete;
    return true;
  });

  return (
    <Screen scroll>
      <TabSwitcher />

      <Text variant="body" tone="secondary" style={styles.intro}>
        Cinq voitures par marque. Débloque les cinq pour obtenir le badge.
      </Text>

      <View style={styles.filters}>
        <ChipRow chips={FILTERS} value={filter} onChange={setFilter} />
      </View>

      <View style={styles.list}>
        <SectionHeader
          title="Marques"
          trailing={`${stats.completedBrands} / ${BRANDS.length} complètes`}
        />

        {shown.length === 0 ? (
          <Text variant="body" tone="tertiary">
            {EMPTY[filter]}
          </Text>
        ) : (
          <View style={styles.rows}>
            {shown.map((brand) => (
              <BrandRow
                key={brand.id}
                brand={brand}
                progress={stats.brands[brand.id]}
                onPress={() => {
                  // Which brands players actually open, against how far along they
                  // are. A brand nobody opens at 0/5 is a brand nobody is chasing.
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    maxWidth: 300,
  },
  filters: {
    marginTop: spacing.lg,
  },
  list: {
    marginTop: spacing.xxl,
  },
  rows: {
    gap: spacing.md,
  },
});
