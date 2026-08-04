import { File, Paths } from 'expo-file-system';

import { createId } from '../lib/id';
import { signPhotoPath } from './sync';

/**
 * Saving a sticker into the system photo library.
 *
 * `expo-media-library` is a native module, so it is missing on web, in Expo Go
 * and — the case that actually bites — on any build made before its pod was
 * installed. Same lazy `require` as the purchase modules and the image picker:
 * the screens hide the button instead of crashing, and the app keeps its
 * every-service-degrades-to-a-no-op property.
 */

type MediaLibrarySdk = typeof import('expo-media-library');

let sdk: MediaLibrarySdk | null = null;
let sdkLoadAttempted = false;

function loadSdk(): MediaLibrarySdk | null {
  if (!sdkLoadAttempted) {
    sdkLoadAttempted = true;
    try {
      sdk = require('expo-media-library');
    } catch {
      sdk = null;
    }
  }
  return sdk;
}

/** True when the native module is present — false on Expo Go, web, stale builds. */
export function isGalleryAvailable(): boolean {
  return loadSdk() != null;
}

export type GallerySaveResult = 'saved' | 'denied' | 'unavailable';

/**
 * Puts a picture into the photo library, whatever kind of uri the entry holds.
 *
 * Usually the sticker is already a local file — `persistStyledPhoto` put it
 * there at generation — but right after a restore it is still a signed URL, and
 * the library can only ingest files, so that case downloads to cache first. The
 * extension comes from the stored path for the same reason it does in
 * `persistStyledPhoto`: Gemini answers in PNG and OpenAI in JPEG.
 *
 * Write-only permission, deliberately: iOS grants "add to library" without the
 * picker-style access sheet, and adding is all this feature does.
 */
export async function saveToGallery(
  uri: string,
  remotePath?: string | null,
): Promise<GallerySaveResult> {
  const media = loadSdk();
  if (!media) return 'unavailable';

  const permission = await media.requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';

  // `exists` and not just the scheme: a local uri whose file is gone (a purge,
  // a failed copy) can still be re-signed from the remote path below, and
  // handing the dead uri to the library would only ever throw.
  if (uri.startsWith('file:') && new File(uri).exists) {
    await media.saveToLibraryAsync(uri);
    return 'saved';
  }

  // A remote uri is a signed URL pulled at restore, and it lives in the store
  // for as long as the entry does — `mergeRemote` never re-signs it, so by the
  // time the player taps « Enregistrer » it has usually expired. `expo-image`
  // keeps showing the picture from its cache, which is what made this fail
  // invisibly: the sticker on screen looked fine while the URL behind it was
  // dead. The stored path can always be re-signed; the stored URL cannot be
  // trusted. Falls back to the stored URL when re-signing fails (offline, or a
  // key-less build), where it still works for the first day.
  const fresh = remotePath ? await signPhotoPath(remotePath) : null;
  const extension = remotePath?.endsWith('.png') ? 'png' : 'jpg';
  const temp = await File.downloadFileAsync(
    fresh ?? uri,
    new File(Paths.cache, `${createId()}.${extension}`),
  );
  try {
    await media.saveToLibraryAsync(temp.uri);
  } finally {
    try {
      temp.delete();
    } catch {
      // Nothing to clean up.
    }
  }
  return 'saved';
}
