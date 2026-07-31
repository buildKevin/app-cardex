import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BrandRow } from '../../src/components/BrandRow';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Text } from '../../src/components/Text';
import { BRANDS } from '../../src/data/brands';
import { useStats } from '../../src/store/useGameStore';
import { spacing } from '../../src/theme';

export default function Collections() {
  const router = useRouter();
  const stats = useStats();

  // Started collections first, then untouched ones — completed drop to the end.
  const ordered = [...BRANDS].sort((a, b) => {
    const pa = stats.brands[a.id];
    const pb = stats.brands[b.id];
    const rank = (owned: number, complete: boolean) => (complete ? 2 : owned > 0 ? 0 : 1);
    const diff = rank(pa.owned, pa.complete) - rank(pb.owned, pb.complete);
    if (diff !== 0) return diff;
    return pb.owned - pa.owned || a.name.localeCompare(b.name);
  });

  return (
    <Screen scroll>
      <Text variant="display">Collections</Text>
      <Text variant="body" tone="secondary" style={styles.intro}>
        Cinq voitures par marque. Débloque les cinq pour obtenir le badge.
      </Text>

      <View style={styles.list}>
        <SectionHeader
          title="Marques"
          trailing={`${stats.completedBrands} / ${BRANDS.length} complètes`}
        />

        <View style={styles.rows}>
          {ordered.map((brand) => (
            <BrandRow
              key={brand.id}
              brand={brand}
              progress={stats.brands[brand.id]}
              onPress={() => router.push(`/collection/${brand.id}`)}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  list: {
    marginTop: spacing.xxl,
  },
  rows: {
    gap: spacing.md,
  },
});
