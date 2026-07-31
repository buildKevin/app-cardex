import { BRANDS } from '../data/brands';
import { CARS } from '../data/cars';
import type { Brand, Car, VisionResult } from '../data/types';

/** Lowercase, strip accents, collapse everything that isn't a letter or digit. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ResolvedScan {
  brand?: Brand;
  car?: Car;
}

function matchBrand(make: string): Brand | undefined {
  const needle = normalize(make);
  if (!needle) return undefined;

  return BRANDS.find((brand) => {
    const candidates = [brand.name, ...brand.aliases].map(normalize);
    return candidates.some(
      (candidate) => needle === candidate || needle.includes(candidate) || candidate.includes(needle),
    );
  });
}

function matchCar(brand: Brand, model: string): Car | undefined {
  const needle = normalize(model);
  if (!needle) return undefined;

  const pool = CARS.filter((car) => car.brandId === brand.id);
  let best: { car: Car; score: number } | undefined;

  for (const car of pool) {
    for (const candidate of [car.model, ...car.aliases].map(normalize)) {
      if (!candidate) continue;
      // Longest matching alias wins, so "golf gti" beats "golf".
      const hit = needle === candidate || needle.includes(candidate) || candidate.includes(needle);
      if (!hit) continue;
      const score = candidate.length + (needle === candidate ? 100 : 0);
      if (!best || score > best.score) best = { car, score };
    }
  }

  return best?.car;
}

/**
 * Turn the raw vision output into catalogue data. Both fields are optional:
 * an unknown make still lands in the garage, it just won't fill a collection.
 */
export function resolveScan(result: VisionResult): ResolvedScan {
  const brand = matchBrand(result.make);
  if (!brand) return {};
  return { brand, car: matchCar(brand, result.model) };
}
