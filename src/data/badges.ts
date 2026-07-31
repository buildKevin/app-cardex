import type { Stats } from '../lib/stats';
import { BRANDS } from './brands';
import { COLLECTION_SIZE } from './cars';

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  target: number;
  value: (stats: Stats) => number;
  brandId?: string;
}

const BRAND_BADGES: BadgeDef[] = BRANDS.map((brand) => ({
  id: `collector-${brand.id}`,
  name: `${brand.name} Collector`,
  description: `Réunis les ${COLLECTION_SIZE} ${brand.name}`,
  target: COLLECTION_SIZE,
  brandId: brand.id,
  value: (stats) => stats.brands[brand.id]?.owned ?? 0,
}));

const MILESTONE_BADGES: BadgeDef[] = [
  {
    id: 'cars-100',
    name: '100 voitures',
    description: 'Ajoute 100 voitures à ton garage',
    target: 100,
    value: (stats) => stats.cars,
  },
  {
    id: 'legendary-10',
    name: '10 Legendary',
    description: 'Découvre 10 voitures Legendary',
    target: 10,
    value: (stats) => stats.rarityCounts.legendary,
  },
  {
    id: 'scans-50',
    name: '50 scans',
    description: 'Lance 50 scans',
    target: 50,
    value: (stats) => stats.scans,
  },
  {
    id: 'xp-1000',
    name: '1000 XP',
    description: 'Accumule 1000 XP',
    target: 1000,
    value: (stats) => stats.xp,
  },
];

export const BADGES: BadgeDef[] = [...MILESTONE_BADGES, ...BRAND_BADGES];

export interface BadgeState {
  def: BadgeDef;
  value: number;
  unlocked: boolean;
  ratio: number;
}

export function badgeStates(stats: Stats): BadgeState[] {
  return BADGES.map((def) => {
    const value = def.value(stats);
    return {
      def,
      value,
      unlocked: value >= def.target,
      ratio: Math.min(1, value / def.target),
    };
  });
}

/**
 * Earned first, then closest to being earned. One badge per brand means the
 * tail is always a wall of untouched 0 / 5, which is the least useful thing to
 * show — especially in the profile, where only the first few are visible.
 */
export function rankBadges(badges: BadgeState[]): BadgeState[] {
  return [...badges].sort(
    (a, b) => Number(b.unlocked) - Number(a.unlocked) || b.ratio - a.ratio,
  );
}

export function unlockedBadgeCount(stats: Stats): number {
  return badgeStates(stats).filter((badge) => badge.unlocked).length;
}
