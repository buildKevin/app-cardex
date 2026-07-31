import { CARS_BY_BRAND } from '../data/cars';
import { colors } from '../theme';
import type { Rarity } from '../data/types';

export const RARITY_XP: Record<Rarity, number> = {
  common: 10,
  rare: 25,
  epic: 75,
  legendary: 200,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export function rarityColor(rarity: Rarity): string {
  return colors.rarity[rarity];
}

export function xpForRarity(rarity: Rarity): number {
  return RARITY_XP[rarity];
}

/**
 * Rarity to assume for a car we recognised the brand of but not the model.
 *
 * Falling back to `common` punished exactly the best moment in the game: an
 * uncatalogued Ferrari paid 10 XP. This takes the median rarity of the brand's
 * catalogue instead, so an unknown Ferrari lands on legendary and an unknown
 * Dacia on common. Median rather than max keeps a single exotic entry from
 * inflating a whole mainstream brand, and errs low on ties.
 */
export function brandBaselineRarity(brandId: string | null | undefined): Rarity {
  if (!brandId) return 'common';

  const catalogue = CARS_BY_BRAND[brandId];
  if (!catalogue?.length) return 'common';

  const tiers = catalogue
    .map((car) => RARITY_ORDER.indexOf(car.rarity))
    .sort((a, b) => a - b);

  return RARITY_ORDER[tiers[Math.floor((tiers.length - 1) / 2)]];
}
