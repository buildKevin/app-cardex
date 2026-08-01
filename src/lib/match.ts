import { BRANDS, BRANDS_BY_ID } from '../data/brands';
import { CARS, CARS_BY_ID } from '../data/cars';
import type { Brand, Car, DiscoveredCar, VisionResult } from '../data/types';

/** Lowercase, strip accents, collapse everything that isn't a letter or digit. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Tidies a model name that came straight from the vision model, for the cases
 * where we have nothing better to display.
 *
 * This only fixes whitespace, stray punctuation and runaway length — it cannot
 * merge genuinely different spellings, so "Golf 8" and "Golf VIII" still land
 * as two distinct entries. Growing the catalogue is the real fix.
 */
export function cleanModelName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—.,;:]+|[\s\-–—.,;:]+$/g, '')
    .slice(0, 40)
    .trim();
}

export interface ResolvedScan {
  brand?: Brand;
  car?: Car;
  /** Set instead of `car` when the server rated a car we do not list. */
  discovered?: DiscoveredCar;
}

/**
 * Longest matching alias wins, exact match first — never array order.
 *
 * Relying on the order of BRANDS was a latent bug: "lamborghini" contains "mb",
 * so a short alias on an unrelated brand could hijack a make simply by being
 * declared earlier. Scoring by specificity makes the verdict independent of
 * declaration order, which is also what lets the SQL side agree with us.
 */
function matchBrand(make: string): Brand | undefined {
  const needle = normalize(make);
  if (!needle) return undefined;

  let best: { brand: Brand; score: number } | undefined;

  for (const brand of BRANDS) {
    for (const candidate of [brand.name, ...brand.aliases].map(normalize)) {
      if (!candidate) continue;
      const hit = needle === candidate || needle.includes(candidate) || candidate.includes(needle);
      if (!hit) continue;
      const score = candidate.length + (needle === candidate ? 100 : 0);
      if (!best || score > best.score) best = { brand, score };
    }
  }

  return best?.brand;
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
 * Turn the raw vision output into catalogue data. Every field is optional: an
 * unknown make still lands in the garage, it just won't fill a collection.
 *
 * When the server already ruled (`serverCarId`), that verdict wins. The server
 * owns the scan counter, so letting the client reach its own conclusion is how
 * a player ends up charged for a scan the app then shows as unmatched. Local
 * matching stays for demo mode and the direct-OpenAI dev path, where there is
 * no server and no accounting.
 */
export function resolveScan(result: VisionResult): ResolvedScan {
  if (result.serverCarId !== undefined) {
    const car = result.serverCarId ? CARS_BY_ID[result.serverCarId] : undefined;
    if (car) return { brand: BRANDS_BY_ID[car.brandId], car };

    // The server said "no match", or named a car this app build does not know
    // (catalogue newer than the bundle). Either way we must not invent a match,
    // but there may be a community fiche for it, and we can still name the
    // brand for display. The server's brand is preferred over our own guess for
    // the same reason its match is: it read the catalogue as it is now.
    const discovered = result.serverDiscovered ?? undefined;
    const brand =
      (discovered?.brandId ? BRANDS_BY_ID[discovered.brandId] : undefined) ?? matchBrand(result.make);
    return { brand, discovered };
  }

  const brand = matchBrand(result.make);
  if (!brand) return {};
  return { brand, car: matchCar(brand, result.model) };
}
