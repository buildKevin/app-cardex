import { File } from 'expo-file-system';

import type { DiscoveredCar, GarageEntry } from '../data/types';
import { supabase } from './supabase';

/**
 * Garage sync. The device stays the working copy; Supabase is the archive.
 *
 * Without this a Founder who reinstalls loses the collection they paid for —
 * RevenueCat restores the entitlement, but the cars only ever existed in
 * AsyncStorage. Everything here is best-effort: a failed sync must never block
 * a scan, so callers fire and forget and the local entry simply stays unsynced
 * until the next attempt.
 */

const BUCKET = 'scans';
/** Long enough to browse the garage without re-signing on every render. */
const SIGNED_URL_TTL = 60 * 60 * 24;

export interface PushResult {
  remoteId: string;
  photoPath: string | null;
}

async function uploadPhoto(userId: string, entry: GarageEntry): Promise<string | null> {
  if (!entry.photoUri || !supabase) return null;

  try {
    const file = new File(entry.photoUri);
    if (!file.exists) return null;

    const path = `${userId}/${entry.id}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, await file.bytes(), { contentType: 'image/jpeg', upsert: true });

    return error ? null : path;
  } catch {
    // A missing or unreadable photo is not worth failing the row for.
    return null;
  }
}

/** The embedded `discovered_cars` row, back into the local shape. */
function ficheFromRow(row: unknown): DiscoveredCar | null {
  if (!row || typeof row !== 'object') return null;
  const fiche = row as Record<string, any>;

  return {
    id: fiche.id,
    brandId: fiche.collection_id ?? null,
    make: fiche.make,
    model: fiche.model,
    generation: fiche.generation ?? null,
    yearFrom: fiche.year_from ?? null,
    yearTo: fiche.year_to ?? null,
    power: fiche.power ?? null,
    country: fiche.country ?? null,
    priceNew: fiche.price_new ?? null,
    rarity: fiche.rarity,
    status: fiche.status,
  };
}

/** Sends one entry up. Returns null when it could not be stored. */
export async function pushEntry(userId: string, entry: GarageEntry): Promise<PushResult | null> {
  if (!supabase) return null;

  const photoPath = await uploadPhoto(userId, entry);

  const { data, error } = await supabase
    .from('garage')
    .insert({
      user_id: userId,
      car_id: entry.carId,
      discovered_car_id: entry.discovered?.id ?? null,
      collection_id: entry.brandId,
      make: entry.make,
      model: entry.model,
      year: entry.year,
      rarity: entry.rarity,
      photo_path: photoPath,
      xp: entry.xp,
      confidence: entry.confidence,
      discovered_at: entry.discoveredAt,
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return { remoteId: data.id as string, photoPath };
}

/**
 * Everything stored for this account, as local entries.
 *
 * Photos come back as signed URLs because the bucket is private. The local file
 * is preferred when it still exists — it loads instantly and costs nothing.
 */
export async function pullGarage(userId: string): Promise<GarageEntry[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('garage')
    // The embed brings the community specs back on a reinstall, not just the
    // name. A deleted fiche embeds as null: the car keeps its name, rarity and
    // XP, and only loses the spec rows. Written as one literal because
    // supabase-js parses this string at the type level and a concatenated one
    // degrades to an error type.
    .select(
      'id, car_id, collection_id, make, model, year, rarity, photo_path, xp, confidence, discovered_at, discovered_cars(id, collection_id, make, model, generation, year_from, year_to, power, country, price_new, rarity, status)',
    )
    .eq('user_id', userId)
    .order('discovered_at', { ascending: false });

  if (error || !data) return [];

  const paths = data.map((row) => row.photo_path).filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();

  if (paths.length) {
    const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
    urls?.forEach((entry) => {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    });
  }

  return data.map((row) => ({
    id: row.id as string,
    remoteId: row.id as string,
    carId: row.car_id,
    brandId: row.collection_id,
    discovered: ficheFromRow(row.discovered_cars),
    make: row.make,
    model: row.model,
    year: row.year,
    rarity: row.rarity,
    photoUri: row.photo_path ? (signed.get(row.photo_path) ?? null) : null,
    photoPath: row.photo_path,
    discoveredAt: row.discovered_at,
    xp: row.xp,
    confidence: row.confidence,
  }));
}

export async function deleteRemoteEntry(remoteId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('garage').delete().eq('id', remoteId);
}
