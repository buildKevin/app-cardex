import type { Brand, Car, GarageEntry } from '../data/types';

/**
 * The specs to show for one garage entry, whatever they came from.
 *
 * There are three possible sources — the curated catalogue, the community fiche
 * the server wrote for a car we do not list, and nothing at all — and both the
 * reveal and the detail screen need all three. Resolving it once here keeps the
 * `car ?? discovered ?? brand ?? '—'` ladder out of the JSX, where getting the
 * order wrong shows a brand's country as if it were the car's.
 */
export interface Fiche {
  model: string;
  generation: string | null;
  /** Formatted, because the two sources carry different year shapes. */
  years: string | null;
  power: number | null;
  country: string | null;
  priceNew: number | null;
  source: 'catalogue' | 'community' | 'unknown';
}

function formatRange(from: number | null, to: number | null): string | null {
  if (!from) return null;
  return to ? `${from} – ${to}` : `${from} –`;
}

export function entryFiche(
  entry: GarageEntry,
  car: Car | undefined,
  brand: Brand | undefined,
): Fiche {
  if (car) {
    return {
      model: car.model,
      generation: car.generation,
      years: formatRange(car.yearFrom, car.yearTo),
      power: car.power,
      country: car.country,
      priceNew: car.priceNew,
      source: 'catalogue',
    };
  }

  const fiche = entry.discovered;
  if (fiche) {
    return {
      model: fiche.model,
      generation: fiche.generation,
      years: formatRange(fiche.yearFrom, fiche.yearTo),
      power: fiche.power,
      country: fiche.country ?? brand?.country ?? null,
      priceNew: fiche.priceNew,
      source: 'community',
    };
  }

  return {
    model: entry.model,
    generation: null,
    years: null,
    power: null,
    country: brand?.country ?? null,
    priceNew: null,
    source: 'unknown',
  };
}
