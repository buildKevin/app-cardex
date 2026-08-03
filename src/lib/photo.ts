import type { GarageEntry } from '../data/types';

/**
 * Which picture an entry shows — one module, because eight screens render an
 * entry's picture and a rule spelled out eight times is a rule that drifts.
 *
 * One rule: the sticker wins wherever it exists. The player asked for it
 * precisely so the car would look like that everywhere, and a garage where the
 * grid shows stickers while the screen above it shows snapshots reads as two
 * half-finished apps. The fiche is the one screen that also offers the
 * photograph, through an explicit toggle.
 *
 * `styledPhotoUri` keeps its name: the column behind it is `styled_photo_path`,
 * and a rename crossing Postgres, the sync layer and the store is worth doing on
 * its own rather than inside a feature change.
 */
type Pictured = Pick<GarageEntry, 'photoUri' | 'styledPhotoUri'>;

/** The sticker where one exists, the photograph until then. */
export function displayPhoto(entry: Pictured): string | null {
  return entry.styledPhotoUri ?? entry.photoUri ?? null;
}

/**
 * The player's own photograph, whatever else exists. Only two screens want it:
 * the fiche's comparison toggle, and the sticker screen showing what is about to
 * be redrawn.
 */
export function originalPhoto(entry: Pictured): string | null {
  return entry.photoUri ?? null;
}

/** True when the entry has a sticker as well, so a screen can compare them. */
export function hasBothPhotos(entry: Pictured): boolean {
  return Boolean(entry.styledPhotoUri && entry.photoUri);
}

/**
 * Whether the picture a screen resolved is the sticker, and so has to be shown
 * whole rather than cropped to fill.
 *
 * A sticker is a die-cut object with a margin around it: `cover` crops its edges
 * off, which is the one thing a die-cut edge cannot survive. A photograph is the
 * opposite — `contain` leaves it floating in a letterboxed plate.
 */
export function isSticker(entry: Pictured, uri: string | null): boolean {
  return Boolean(uri && entry.styledPhotoUri && uri === entry.styledPhotoUri);
}
