import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BRANDS } from '../data/brands';
import type { Brand } from '../data/types';
import { normalize } from '../lib/match';
import { colors, gridItemWidth, radii, spacing } from '../theme';
import { BrandLogo } from './BrandLogo';
import { Text } from './Text';

interface BrandPickerProps {
  onPick: (brand: Brand) => void;
  /** What was typed, when the catalogue has no such brand. */
  onFree: (label: string) => void;
}

/**
 * Brands whose name or alias matches what has been typed, best first.
 *
 * Ranked rather than filtered in declaration order, for the same reason
 * `matchBrand` is: typing "m" should offer Maserati and Mini before
 * Lamborghini, which merely *contains* an m. Exact beats prefix beats
 * substring, and aliases are searched too — so "vw" finds Volkswagen and "range
 * rover" finds Land Rover.
 */
function searchBrands(query: string): Brand[] {
  const needle = normalize(query);
  if (!needle) return BRANDS;

  const scored: { brand: Brand; score: number }[] = [];

  for (const brand of BRANDS) {
    let best = 0;
    for (const candidate of [brand.name, ...brand.aliases].map(normalize)) {
      if (!candidate) continue;
      if (candidate === needle) best = Math.max(best, 3);
      else if (candidate.startsWith(needle)) best = Math.max(best, 2);
      else if (candidate.includes(needle)) best = Math.max(best, 1);
    }
    if (best) scored.push({ brand, score: best });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.brand.name.localeCompare(b.brand.name))
    .map((entry) => entry.brand);
}

/**
 * The one question that has to be answerable in a single tap, and also by a
 * player whose brand we do not list.
 *
 * The grid comes first because twenty-five marks are a better opening than a
 * blank field — but the catalogue is twenty-five brands and the road is not, so
 * the search doubles as the escape hatch: whatever is typed can always be
 * accepted as-is. That answer still goes through `matchBrand` afterwards, so
 * typing "vw" lands in the Volkswagen collection rather than inventing a brand.
 */
export function BrandPicker({ onPick, onFree }: BrandPickerProps) {
  const [query, setQuery] = useState('');

  // gridItemWidth, never a percentage — three cells at 33% round past 100% and
  // the row collapses to one column.
  const width = gridItemWidth(3);
  const value = query.trim();
  const matches = searchBrands(query);
  /** Nothing to offer beyond the tiles when a tile already says exactly this. */
  const named = matches.some((brand) => normalize(brand.name) === normalize(value));

  return (
    <View style={styles.root}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Cherche ta marque"
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.text}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={26}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (matches.length === 1) onPick(matches[0]);
          else if (value) onFree(value);
        }}
        style={styles.search}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {matches.map((brand) => (
          <Pressable
            key={brand.id}
            accessibilityRole="button"
            accessibilityLabel={brand.name}
            onPress={() => onPick(brand)}
            style={[styles.tile, { width }]}
          >
            <BrandLogo brandId={brand.id} name={brand.name} size={28} framed={false} />
            <Text variant="caption" tone="secondary" center numberOfLines={1}>
              {brand.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {value && !named ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Utiliser ${value}`}
          onPress={() => onFree(value)}
          style={styles.free}
        >
          <Text variant="bodyMedium" color={colors.highlight}>
            Je roule en « {value} »
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  search: {
    height: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  /** Three rows visible, the rest scrolls — the dock must not eat the transcript. */
  scroll: {
    maxHeight: 268,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    height: 82,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  free: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
});
