import { BRANDS } from '../data/brands';
import { CARS_BY_BRAND, COLLECTION_SIZE } from '../data/cars';
import type { GarageEntry, Rarity } from '../data/types';
import { levelProgress, type LevelProgress } from './level';

export interface BrandProgress {
  brandId: string;
  /** Distinct catalogue cars owned for this brand. */
  owned: number;
  total: number;
  complete: boolean;
  /** Car ids owned, in catalogue order. */
  ownedCarIds: string[];
}

export interface Stats {
  cars: number;
  scans: number;
  xp: number;
  progress: LevelProgress;
  rarityCounts: Record<Rarity, number>;
  brands: Record<string, BrandProgress>;
  completedBrands: number;
}

const EMPTY_RARITY: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };

export function computeStats(garage: GarageEntry[], scans: number): Stats {
  const rarityCounts = { ...EMPTY_RARITY };
  let xp = 0;

  for (const entry of garage) {
    xp += entry.xp;
    rarityCounts[entry.rarity] += 1;
  }

  const ownedCarIds = new Set(
    garage.map((entry) => entry.carId).filter((id): id is string => Boolean(id)),
  );

  const brands: Record<string, BrandProgress> = {};
  let completedBrands = 0;

  for (const brand of BRANDS) {
    const catalogue = CARS_BY_BRAND[brand.id] ?? [];
    const owned = catalogue.filter((car) => ownedCarIds.has(car.id));
    const complete = owned.length >= COLLECTION_SIZE;
    if (complete) completedBrands += 1;
    brands[brand.id] = {
      brandId: brand.id,
      owned: owned.length,
      total: catalogue.length,
      complete,
      ownedCarIds: owned.map((car) => car.id),
    };
  }

  return {
    cars: garage.length,
    scans,
    xp,
    progress: levelProgress(xp),
    rarityCounts,
    brands,
    completedBrands,
  };
}
