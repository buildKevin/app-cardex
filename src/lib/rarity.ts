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
