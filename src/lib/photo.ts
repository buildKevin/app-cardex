import type { GarageEntry } from '../data/types';

/**
 * Which picture an entry shows.
 *
 * The rendering wins wherever one exists: the player asked for it precisely so
 * the car would look like that in the garage, on the profile and in the
 * showcase. The fiche is the one screen that also offers the original, through
 * an explicit toggle.
 *
 * One helper because eight screens render an entry's photo, and a rule spelled
 * out eight times is a rule that drifts — the first divergence would be a
 * showcase still showing the raw snapshot after a restyle.
 */
export function displayPhoto(entry: Pick<GarageEntry, 'photoUri' | 'styledPhotoUri'>): string | null {
  return entry.styledPhotoUri ?? entry.photoUri;
}

/** True when the entry has both, so a screen can offer the comparison. */
export function hasBothPhotos(
  entry: Pick<GarageEntry, 'photoUri' | 'styledPhotoUri'>,
): boolean {
  return Boolean(entry.styledPhotoUri && entry.photoUri);
}
