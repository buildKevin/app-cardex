import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { createId } from '../lib/id';

/** Wide enough for the vision model, small enough to upload on mobile data. */
const MAX_WIDTH = 1024;
const QUALITY = 0.7;
const DIR_NAME = 'photos';

export interface PreparedPhoto {
  /** JPEG payload for the vision model. */
  base64: string;
  /** Persistent local uri to display on the card. */
  uri: string;
}

function photosDirectory(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Shrinks the camera output, then keeps a copy outside the cache so garage
 * photos survive a low-storage cleanup.
 */
export async function preparePhoto(sourceUri: string): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: MAX_WIDTH });

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: QUALITY,
    base64: true,
  });

  let uri = result.uri;
  try {
    const destination = new File(photosDirectory(), `${createId()}.jpg`);
    await new File(result.uri).copy(destination);
    uri = destination.uri;
  } catch (error) {
    // Non-fatal: the cache uri still works for this session.
    if (__DEV__) console.warn('[photo] could not persist photo', error);
  }

  return { base64: result.base64 ?? '', uri };
}

export function deletePhoto(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to clean up.
  }
}
