import CardexDiecut from '../../modules/cardex-diecut';

import { captureError, events, track } from './analytics';
import { newDiecutPath } from './photo';

/**
 * The free sticker: the car lifted off its background on the device, with a
 * die-cut white edge, in a couple of hundred milliseconds and for nothing.
 *
 * This is what every car in the garage now shows. The AI redraw — `restyle.ts`,
 * thirty seconds, billed, and Pro-only — sits on top of it as the paid upgrade,
 * which is why the two live in separate modules and write to separate fields.
 *
 * Nothing here is stored server-side. The die-cut is *derived* from a photo that
 * is already in the `scans` bucket, so archiving it would be paying storage and
 * egress for an image we can rebuild for free — a reinstall pulls the photo back
 * and this rebuilds the sticker on first display.
 */

/** Why a car kept its photograph. */
export type DiecutFailure =
  /** No native module: Expo Go, the web bundle, or iOS 16 and below. */
  | 'unavailable'
  /** Vision found nothing to lift — bad framing, not a bug. */
  | 'no_subject'
  /** Vision or Core Image gave up, or the file could not be written. */
  | 'failed';

let supported: boolean | null = null;

/**
 * Whether this device can cut out at all.
 *
 * Memoised behind a function rather than resolved at import: the answer costs a
 * native call, and a module that ran native code while it was being imported is
 * exactly the shape that takes a screen down on a build made before the pod
 * existed.
 */
export function diecutAvailable(): boolean {
  if (supported === null) {
    try {
      supported = CardexDiecut?.isAvailable() ?? false;
    } catch {
      supported = false;
    }
  }
  return supported;
}

export interface DiecutOptions {
  /**
   * Whether a failure is worth an event. True at the end of a scan, which is the
   * once-per-car measurement; false in the backfill, which retries the same
   * unliftable photo on every cold start and would otherwise report
   * `diecut_failed` once per launch per car for the rest of that car's life.
   */
  measure?: boolean;
}

/**
 * Cuts `photoUri` out and returns the sticker's local uri, or null.
 *
 * Null is a supported answer, not an error: the caller keeps the photograph and
 * the card looks the way it did before the feature existed. That is the same
 * property every external service in this app has, and it is what lets the whole
 * thing run in Expo Go and on an iOS 16 device.
 */
export async function createDiecut(
  photoUri: string,
  { measure = true }: DiecutOptions = {},
): Promise<string | null> {
  if (!diecutAvailable() || !CardexDiecut) {
    if (measure) report('unavailable');
    return null;
  }

  try {
    const result = await CardexDiecut.cutOut(photoUri, newDiecutPath());
    return result.uri;
  } catch (caught) {
    const reason: DiecutFailure = isNoSubject(caught) ? 'no_subject' : 'failed';
    if (measure) report(reason, reason === 'failed' ? caught : undefined);
    return null;
  }
}

/**
 * The Swift side rejects with its `reason` string, and this is the one failure
 * that is not ours: a passer-by in the frame, or a car too small in it.
 */
function isNoSubject(caught: unknown): boolean {
  const message = caught instanceof Error ? caught.message : String(caught);
  return message.toLowerCase().includes('no subject');
}

/**
 * `no_subject` is counted but never filed as an exception — same call as `no_car`
 * on the vision side: that is the player framing badly, and filing it would bury
 * the failures that are actually ours.
 */
function report(reason: DiecutFailure, error?: unknown): void {
  track(events.diecutFailed, { reason });
  if (error !== undefined) captureError(error, { stage: 'diecut', reason });
}
