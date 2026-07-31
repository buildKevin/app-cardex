import { ENV, hasPostHog } from './env';

type Props = Record<string, unknown>;

let client: { capture: Function; identify: Function; reset: Function } | null = null;

/** Safe to call more than once. No-ops when EXPO_PUBLIC_POSTHOG_KEY is empty. */
export function initAnalytics(): void {
  if (client || !hasPostHog) return;
  try {
    const { PostHog } = require('posthog-react-native');
    client = new PostHog(ENV.posthogKey, { host: ENV.posthogHost });
  } catch (error) {
    if (__DEV__) console.warn('[analytics] PostHog unavailable', error);
  }
}

export function track(event: string, props?: Props): void {
  if (__DEV__ && !client) console.log('[analytics]', event, props ?? {});
  client?.capture(event, props);
}

export function identify(userId: string, props?: Props): void {
  client?.identify(userId, props);
}

export function resetAnalytics(): void {
  client?.reset();
}

/** The whole funnel in one place, so event names never drift. */
export const events = {
  onboardingStarted: 'onboarding_started',
  onboardingCompleted: 'onboarding_completed',
  signedIn: 'signed_in',
  signedOut: 'signed_out',
  accountDeleted: 'account_deleted',
  paywallViewed: 'paywall_viewed',
  paywallDismissed: 'paywall_dismissed',
  purchaseStarted: 'purchase_started',
  purchaseCompleted: 'purchase_completed',
  purchaseFailed: 'purchase_failed',
  scanStarted: 'scan_started',
  scanSucceeded: 'scan_succeeded',
  scanFailed: 'scan_failed',
  scanBlockedByLimit: 'scan_blocked_by_limit',
  carRevealed: 'car_revealed',
  collectionCompleted: 'collection_completed',
  badgeUnlocked: 'badge_unlocked',
  showcaseUpdated: 'showcase_updated',
} as const;
