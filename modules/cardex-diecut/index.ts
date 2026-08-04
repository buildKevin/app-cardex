import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface CutOutResult {
  /** Local `file://` uri of the written PNG, always 1024². */
  uri: string;
}

declare class CardexDiecutModule extends NativeModule {
  /** False below iOS 17, where Vision has no subject-lift API at all. */
  isAvailable(): boolean;
  /**
   * Writes the die-cut sticker for `sourceUri` to `destinationUri`.
   *
   * Rejects with `no_subject` when Vision finds nothing to lift — the player
   * framing badly, not a bug.
   */
  cutOut(sourceUri: string, destinationUri: string): Promise<CutOutResult>;
}

/**
 * `requireOptionalNativeModule` rather than `requireNativeModule`, which is the
 * point: it answers `null` instead of throwing where the pod is not installed —
 * Expo Go, the web bundle, or any build made before this module existed. That is
 * the same property the lazy `require()` around the purchase modules buys, minus
 * the try/catch, so nothing here has to be imported late.
 */
export default requireOptionalNativeModule<CardexDiecutModule>('CardexDiecut');
