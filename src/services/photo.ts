import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { createId } from '../lib/id';
import { captureError, events, track } from './analytics';

/** Wide enough for the vision model, small enough to upload on mobile data. */
const MAX_WIDTH = 1024;
const QUALITY = 0.7;
const DIR_NAME = 'photos';
/** AI renderings, kept apart so a purge can tell them from the originals. */
const STYLED_DIR_NAME = 'styled';

/** The avatar is never shown larger than 64pt, so this is generous already. */
const AVATAR_WIDTH = 256;
const AVATAR_DIR_NAME = 'avatars';

export interface PreparedPhoto {
  /** JPEG payload for the vision model. */
  base64: string;
  /** Persistent local uri to display on the card. */
  uri: string;
}

type ImagePickerSdk = typeof import('expo-image-picker');

let picker: ImagePickerSdk | null = null;
let pickerLoadAttempted = false;

/**
 * `expo-image-picker` calls `requireNativeModule` while it is being imported, so
 * a top-level import takes the whole screen down on any build made before the
 * pod was installed. Same lazy `require` as the purchase modules.
 */
function loadPicker(): ImagePickerSdk | null {
  if (!pickerLoadAttempted) {
    pickerLoadAttempted = true;
    try {
      picker = require('expo-image-picker');
    } catch {
      picker = null;
    }
  }
  return picker;
}

export type PickedImage =
  | { status: 'picked'; uri: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * Opens the system picker or the camera and returns a cache uri. Cropping is on
 * and square, because every place we show a picked image is a circle.
 */
export async function pickImage(source: 'library' | 'camera'): Promise<PickedImage> {
  const sdk = loadPicker();
  if (!sdk) return { status: 'unavailable' };

  // The library needs no permission on SDK 57 — it goes through the system
  // picker, which hands back one image without granting access to the rest.
  if (source === 'camera') {
    const permission = await sdk.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }

  const options: import('expo-image-picker').ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };

  const result =
    source === 'camera'
      ? await sdk.launchCameraAsync(options)
      : await sdk.launchImageLibraryAsync(options);

  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { status: 'picked', uri: asset.uri } : { status: 'cancelled' };
}

function documentDirectory(name: string): Directory {
  const dir = new Directory(Paths.document, name);
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
    const destination = new File(documentDirectory(DIR_NAME), `${createId()}.jpg`);
    await new File(result.uri).copy(destination);
    uri = destination.uri;
  } catch (error) {
    // Non-fatal *this session*: the cache uri works until the OS reclaims it, and
    // then the card loses its photo. Silent until now, which is why nobody knew
    // whether a garage full of silhouettes was this or a failed sync.
    if (__DEV__) console.warn('[photo] could not persist photo', error);
    track(events.photoFailed, { stage: 'persist_photo' });
    captureError(error, { stage: 'persist_photo' });
  }

  return { base64: result.base64 ?? '', uri };
}

/**
 * Same idea as `preparePhoto`, minus the base64: nothing uploads an avatar, it
 * only has to survive as a small file next to the garage photos. Returns null
 * when the copy fails, because a cache uri would break on the next launch —
 * and a broken avatar is worse than no avatar.
 */
export async function prepareAvatar(sourceUri: string): Promise<string | null> {
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: AVATAR_WIDTH });

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });

  try {
    const destination = new File(documentDirectory(AVATAR_DIR_NAME), `${createId()}.jpg`);
    await new File(result.uri).copy(destination);
    return destination.uri;
  } catch (error) {
    if (__DEV__) console.warn('[photo] could not persist avatar', error);
    captureError(error, { stage: 'persist_avatar' });
    return null;
  }
}

/**
 * Downloads an AI rendering next to the garage photos.
 *
 * The edge function hands back a signed URL that expires in a day, and the
 * rendering is what every screen shows from now on — so relying on that URL
 * would mean a player's picture silently breaking tomorrow, until the next
 * sign-in re-signed it. Falls back to the remote URL when the copy fails: a
 * picture that works today beats no picture at all.
 */
export async function persistStyledPhoto(url: string, remotePath?: string): Promise<string> {
  try {
    // Gemini answers in PNG and OpenAI in JPEG, so the extension comes from the
    // stored path rather than being assumed.
    const extension = remotePath?.endsWith('.png') ? 'png' : 'jpg';
    const destination = new File(documentDirectory(STYLED_DIR_NAME), `${createId()}.${extension}`);
    const file = await File.downloadFileAsync(url, destination);
    return file.uri;
  } catch (error) {
    if (__DEV__) console.warn('[photo] could not persist rendering', error);
    // The fallback is the signed URL, which expires tomorrow — so this is a
    // rendering the player paid for that will break in a day. It has to be loud.
    track(events.photoFailed, { stage: 'persist_styled_photo' });
    captureError(error, { stage: 'persist_styled_photo' });
    return url;
  }
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
