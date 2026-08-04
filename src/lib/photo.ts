import type { GarageEntry } from '../data/types';

/**
 * Which picture an entry shows — one module, because eight screens render an
 * entry's picture and a rule spelled out eight times is a rule that drifts.
 *
 * There are three pictures now, and one rule: **the best sticker wins, and
 * neither of them destroys the photograph.**
 *
 * - `styledPhotoUri` — the AI redraw. Paid, Pro only, thirty seconds.
 * - `diecutUri` — the free die-cut, lifted out on the device in 200 ms. Every
 *   car gets one, which is why a garage no longer looks like a camera roll.
 * - `photoUri` — the player's own photograph, kept always.
 *
 * A garage whose grid shows stickers under a hero showing a snapshot reads as two
 * half-finished apps; splitting this rule by screen was tried and reverted. The
 * fiche is the one screen that also offers the photograph, through an explicit
 * toggle.
 *
 * `styledPhotoUri` keeps its name: the column behind it is `styled_photo_path`,
 * and a rename crossing Postgres, the sync layer and the store is worth doing on
 * its own rather than inside a feature change.
 */
type Pictured = Pick<GarageEntry, 'photoUri' | 'styledPhotoUri' | 'diecutUri'>;

/**
 * The redraw where the player paid for one, the die-cut everywhere else, the
 * photograph until either exists.
 *
 * The order is not negotiable: a redraw the player waited half a minute and spent
 * Pro on must never lose to a die-cut rebuilt behind it on the next launch.
 */
export function displayPhoto(entry: Pictured): string | null {
  return entry.styledPhotoUri ?? entry.diecutUri ?? entry.photoUri ?? null;
}

/**
 * The player's own photograph, whatever else exists. Only two screens want it:
 * the fiche's comparison toggle, and the sticker screen showing what is about to
 * be redrawn.
 */
export function originalPhoto(entry: Pictured): string | null {
  return entry.photoUri ?? null;
}

/**
 * True when the entry has a sticker as well, so a screen can compare them.
 *
 * Either kind counts. Since the die-cut is made at the end of every scan this is
 * now true almost everywhere, which is the intended outcome: « voilà ta photo,
 * voilà ton sticker » is worth showing on every car, not on the rare one.
 */
export function hasBothPhotos(entry: Pictured): boolean {
  return Boolean((entry.styledPhotoUri || entry.diecutUri) && entry.photoUri);
}

/**
 * Whether the picture a screen resolved is a sticker, and so has to be shown
 * whole rather than cropped to fill.
 *
 * A sticker is a die-cut object with a margin around it: `cover` crops its edges
 * off, which is the one thing a die-cut edge cannot survive. A photograph is the
 * opposite — `contain` leaves it floating in a letterboxed plate. The same flag
 * drops the grey plate behind it, which would put the object back in the box the
 * die-cut took it out of.
 *
 * Both kinds answer true, and they have to: the point of lifting the car out on
 * the device is that a free player's grid reads as a collection, and a die-cut
 * cropped with `cover` loses exactly the white edge that makes it one.
 */
export function isSticker(entry: Pictured, uri: string | null): boolean {
  if (!uri) return false;
  return uri === entry.styledPhotoUri || uri === entry.diecutUri;
}
