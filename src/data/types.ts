export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Brand {
  id: string;
  name: string;
  country: string;
  /** Lowercase spellings the vision model might return. */
  aliases: string[];
}

export interface Car {
  id: string;
  brandId: string;
  model: string;
  generation: string;
  yearFrom: number;
  /** null = still produced. */
  yearTo: number | null;
  /** Horsepower of the reference version. */
  power: number;
  country: string;
  /** Approximate new price in EUR. */
  priceNew: number;
  rarity: Rarity;
  /** Lowercase spellings the vision model might return. */
  aliases: string[];
}

/**
 * A car the model rated because our catalogue had no entry for it.
 *
 * Written once, on the first sighting, and served verbatim to everyone who
 * scans it afterwards — a rarity recomputed per scan would hand two players
 * different XP for the same car, which is the whole reason this table exists.
 *
 * Every spec is nullable: the model is allowed to admit it does not know one,
 * and a hole is cheaper than an invention.
 */
export interface DiscoveredCar {
  id: string;
  /** Set when the make matched a brand we already list. */
  brandId: string | null;
  make: string;
  model: string;
  generation: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  power: number | null;
  country: string | null;
  priceNew: number | null;
  /** Capped at `epic` until reviewed — see `proposedRarity`. */
  rarity: Rarity;
  /** 'pending' until a second, independent scan agreed on make + model. */
  status: 'pending' | 'confirmed';
}

/** One car sitting in the user's garage. */
export interface GarageEntry {
  id: string;
  /** null when the vision model found something not in our catalogue. */
  carId: string | null;
  brandId: string | null;
  /**
   * The community fiche behind this entry, when the catalogue had none.
   *
   * A snapshot, deliberately: correcting a fiche later must not silently
   * rewrite the specs a player already saw, just as it never rewrites `xp`.
   */
  discovered?: DiscoveredCar | null;
  make: string;
  model: string;
  year: number | null;
  rarity: Rarity;
  /** Local uri of the photo the user took. */
  photoUri: string | null;
  /**
   * The AI rendering, when the player asked for one. Never replaces `photoUri`:
   * the original stays so the fiche can toggle back to it, and so a re-render
   * always starts from the photograph rather than from a previous rendering.
   */
  styledPhotoUri?: string | null;
  discoveredAt: string;
  xp: number;
  confidence: number;
  /** Row id in Supabase once pushed. null/undefined = not synced yet. */
  remoteId?: string | null;
  /** Path inside the `scans` bucket, when the photo was uploaded. */
  photoPath?: string | null;
  /** Path inside the `scans` bucket for the rendering, when one exists. */
  styledPhotoPath?: string | null;
}

/** What the vision model is allowed to return — nothing more. */
export interface VisionResult {
  make: string;
  model: string;
  generation: string | null;
  year: number | null;
  confidence: number;
  /**
   * Catalogue id as decided by the server, when a server was involved.
   *
   * `undefined` means nobody authoritative has ruled (demo mode, or the direct
   * OpenAI dev path) and the client should match locally. `null` means the
   * server looked and found nothing — which is a verdict, not an absence.
   */
  serverCarId?: string | null;
  /**
   * Fiche the server produced for a car absent from the catalogue.
   *
   * Same convention as `serverCarId`: `undefined` when no server was involved,
   * `null` when the server tried and the model could not rate the car.
   */
  serverDiscovered?: DiscoveredCar | null;
}
