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

/** One car sitting in the user's garage. */
export interface GarageEntry {
  id: string;
  /** null when the vision model found something not in our catalogue. */
  carId: string | null;
  brandId: string | null;
  make: string;
  model: string;
  year: number | null;
  rarity: Rarity;
  /** Local uri of the photo the user took. */
  photoUri: string | null;
  discoveredAt: string;
  xp: number;
  confidence: number;
  /** Row id in Supabase once pushed. null/undefined = not synced yet. */
  remoteId?: string | null;
  /** Path inside the `scans` bucket, when the photo was uploaded. */
  photoPath?: string | null;
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
}
