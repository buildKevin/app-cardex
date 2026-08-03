import type { GarageEntry } from '../data/types';

/**
 * Which picture an entry shows — one module, because eight screens render an
 * entry's picture and a rule spelled out eight times is a rule that drifts.
 *
 * There are two answers now, and the split is deliberate. The rendering used to
 * be a nicer photograph of the same car, so it simply won everywhere. It is a
 * sticker now: a clean object on a transparent ground, uniform with every other
 * sticker. That makes it right where uniformity *is* the effect — a grid, the
 * showcase — and wrong where the screen exists to show the moment the player
 * had: the hero on the garage, the fiche, the reveal after a scan.
 *
 * `styledPhotoUri` keeps its name: the column behind it is `styled_photo_path`,
 * and a rename crossing Postgres, the sync layer and the store is worth doing on
 * its own rather than inside a feature change.
 */
type Pictured = Pick<GarageEntry, 'photoUri' | 'styledPhotoUri'>;

/** The photograph the player actually took. Hero, fiche, reveal. */
export function displayPhoto(entry: Pictured): string | null {
  return entry.photoUri ?? entry.styledPhotoUri ?? null;
}

/** The sticker, falling back to the photo until one has been generated. */
export function displaySticker(entry: Pictured): string | null {
  return entry.styledPhotoUri ?? entry.photoUri ?? null;
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
