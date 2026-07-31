/**
 * Everything that must be filled in before a build can go to the App Store.
 *
 * Kept in one module so `npm run verify:release` can check it without parsing
 * screens, and so there is a single place to look when review asks where the
 * privacy policy lives.
 */

/** Public pages. Apple requires both to be reachable, and links to them in-app. */
export const LEGAL = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  support: process.env.EXPO_PUBLIC_SUPPORT_URL ?? '',
} as const;

export const hasLegalLinks = Boolean(LEGAL.terms && LEGAL.privacy);

/**
 * True when this build would ship simulated scans.
 *
 * The demo mode exists so the app runs with an empty .env, which is genuinely
 * useful in development and completely unacceptable in the store: the "AI"
 * invents a plausible car from the catalogue. `identifyCar` refuses to run in
 * that state outside development, and `verify:release` catches it earlier.
 */
export const isReleaseMisconfigured = (visionMode: string): boolean =>
  !__DEV__ && visionMode === 'mock';
