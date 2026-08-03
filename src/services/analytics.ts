import PostHog from 'posthog-react-native';
import type { JsonType, PostHogEventProperties } from '@posthog/core';

import { ENV, hasPostHog, hasSupabase } from './env';

/**
 * Event properties, as call sites want to write them.
 *
 * `undefined` is allowed on purpose — half the properties in this app are
 * conditional (`raw_make: matched ? undefined : result.make`), and an undefined
 * key simply does not survive serialisation. The SDK's own type forbids it, so
 * `props()` below is the one place that bridges the two.
 */
export type Props = Record<string, JsonType | undefined>;

const asProperties = (value?: Props) => value as PostHogEventProperties | undefined;

/**
 * PostHog. One client, created at module load, used by every screen either
 * through the helpers below or through `usePostHog()` inside the provider.
 *
 * `disabled` rather than a null client: every method stays callable with an
 * empty `.env`, so the app runs offline exactly as before and no call site
 * needs a guard. A null client silently swallowed events *and* made
 * `usePostHog()` unusable, which is why the provider now owns this instance.
 */
export const posthog = new PostHog(ENV.posthogKey || 'phc_placeholder', {
  host: ENV.posthogHost,
  disabled: !hasPostHog,

  // Application Installed / Updated / Opened / Became Active / Backgrounded.
  // Retention and DAU are computed from these, so they are not optional.
  captureAppLifecycleEvents: true,
  // Without this a cold start counts as a new session, which inflates session
  // counts and cuts a single scan-to-reveal flow in half.
  enablePersistSessionIdAcrossRestart: true,

  /**
   * `console: false` on purpose: `PostHogErrorBoundary` in `app/_layout.tsx`
   * already reports render errors, React logs every one of them to
   * `console.error`, and leaving console capture on would file each crash twice
   * under two different fingerprints.
   */
  errorTracking: {
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
      console: false,
    },
  },

  // Mobile data and battery: batch, but not so much that a player who scans
  // once and closes the app never reports anything. The queue is persisted to
  // disk, so nothing is lost between launches.
  flushAt: 20,
  flushInterval: 10_000,

  preloadFeatureFlags: true,
  sendFeatureFlagEvent: true,
  featureFlagsRequestTimeoutMs: 10_000,

  before_send: [scrubSensitive],
});

if (__DEV__ && !hasPostHog) {
  console.error(
    'EXPO_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, ' +
      'this causes events to be silently missed. This error stops appearing once ' +
      'EXPO_PUBLIC_POSTHOG_KEY is configured',
  );
}

/**
 * Last line of defence before anything leaves the device.
 *
 * Nothing here is meant to send a photo path or a signed URL, but an exception
 * message is written by whatever threw it: a failed upload or a failed rendering
 * download carries the `scans` bucket URL, and that URL carries a token. Long
 * strings are truncated for the same reason — a base64 payload in a property is
 * always a mistake, never a measurement.
 */
function scrubSensitive(event: any): any {
  if (!event?.properties) return event;

  for (const [key, value] of Object.entries(event.properties as Props)) {
    if (typeof value !== 'string') continue;

    if (value.startsWith('file://') || value.startsWith('content://')) {
      event.properties[key] = '[local-file]';
    } else if (/^https?:\/\//.test(value) && /token=|Signature=|[?&]t=/.test(value)) {
      event.properties[key] = '[signed-url]';
    } else if (value.length > 500) {
      event.properties[key] = `${value.slice(0, 500)}…[truncated]`;
    }
  }

  return event;
}

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * The whole funnel in one place, so event names never drift.
 *
 * `snake_case`, past tense, `[object]_[verb]`. Anything added here should answer
 * a question we would actually act on — a name nobody would build an insight
 * from is noise that makes the real events harder to find.
 */
export const events = {
  // Onboarding and auth
  onboardingStarted: 'onboarding_started',
  onboardingSlideViewed: 'onboarding_slide_viewed',
  onboardingCompleted: 'onboarding_completed',
  signInStarted: 'sign_in_started',
  signInFailed: 'sign_in_failed',
  signInCancelled: 'sign_in_cancelled',
  signedIn: 'signed_in',
  signedOut: 'signed_out',
  accountDeleted: 'account_deleted',
  garageRestored: 'garage_restored',

  // Paywall and purchase
  paywallViewed: 'paywall_viewed',
  paywallDismissed: 'paywall_dismissed',
  planSelected: 'plan_selected',
  purchaseStarted: 'purchase_started',
  purchaseCompleted: 'purchase_completed',
  purchaseFailed: 'purchase_failed',
  purchaseCancelled: 'purchase_cancelled',
  purchasePending: 'purchase_pending',
  purchaseRestored: 'purchase_restored',
  restoreFailed: 'restore_failed',
  customerCenterOpened: 'customer_center_opened',
  subscriptionManaged: 'subscription_managed',
  churnSurveyCompleted: 'churn_survey_completed',
  proStatusChanged: 'pro_status_changed',

  // Scan — the core loop
  cameraPermissionRequested: 'camera_permission_requested',
  cameraPermissionAnswered: 'camera_permission_answered',
  scanStarted: 'scan_started',
  scanSucceeded: 'scan_succeeded',
  scanFailed: 'scan_failed',
  scanBlockedByLimit: 'scan_blocked_by_limit',
  scanRetried: 'scan_retried',

  // Sticker generation. Kept under the `restyle_` prefix: renaming a live event
  // splits every existing funnel in two, and the feature is the same spend and
  // the same paywall trigger it always was.
  restyleCtaTapped: 'restyle_cta_tapped',
  restyleStarted: 'restyle_started',
  restyleSucceeded: 'restyle_succeeded',
  restyleFailed: 'restyle_failed',
  restyleBlockedByLimit: 'restyle_blocked_by_limit',
  restyleReverted: 'restyle_reverted',

  // Progression — what makes a player come back
  carRevealed: 'car_revealed',
  revealDismissed: 'reveal_dismissed',
  levelReached: 'level_reached',
  collectionCompleted: 'collection_completed',
  badgeUnlocked: 'badge_unlocked',
  badgesOpened: 'badges_opened',

  // Browsing
  carOpened: 'car_opened',
  carRemoved: 'car_removed',
  photoCompared: 'photo_compared',
  collectionOpened: 'collection_opened',
  collectionsOpened: 'collections_opened',
  collectionsViewChanged: 'collections_view_changed',
  lockedSlotTapped: 'locked_slot_tapped',

  // Profile
  showcaseOpened: 'showcase_opened',
  showcaseUpdated: 'showcase_updated',
  showcaseRejected: 'showcase_rejected',
  usernameChanged: 'username_changed',
  avatarChanged: 'avatar_changed',
  avatarRemoved: 'avatar_removed',
  garageReset: 'garage_reset',
  legalLinkOpened: 'legal_link_opened',

  // Health — never fired on a happy path
  syncFailed: 'sync_failed',
  photoFailed: 'photo_failed',
} as const;

export type EventName = (typeof events)[keyof typeof events];

// ── Capture ──────────────────────────────────────────────────────────────────

export function track(event: string, props?: Props): void {
  if (__DEV__) console.log('[analytics]', event, props ?? {});
  posthog.capture(event, asProperties(props));
}

/**
 * A screen view. Expo Router gives us a URL, not a route name, so dynamic
 * segments are folded back into their template — `/car/9f3a…` becomes
 * `/car/[entryId]` — and the id travels as a property. Without that, one player
 * with forty cars produces forty screen names and `$screen` becomes unusable.
 */
const DYNAMIC_ROUTES: { prefix: string; name: string; param: string }[] = [
  { prefix: '/car/', name: '/car/[entryId]', param: 'entry_id' },
  { prefix: '/restyle/', name: '/restyle/[entryId]', param: 'entry_id' },
  { prefix: '/collection/', name: '/collection/[brandId]', param: 'brand_id' },
];

export function screen(pathname: string, props?: Props): void {
  const match = DYNAMIC_ROUTES.find((route) => pathname.startsWith(route.prefix));

  if (match) {
    const value = pathname.slice(match.prefix.length);
    posthog.screen(match.name, asProperties({ ...props, [match.param]: value }));
    return;
  }

  posthog.screen(pathname === '/' ? '/garage' : pathname, asProperties(props));
}

/**
 * An error worth a look in Error Tracking.
 *
 * Most failures in this app are caught and turned into a message on screen, so
 * they never reach the uncaught handler. Calling this from those catch blocks is
 * the only way a broken upload or a refused sign-in shows up at all.
 */
export function captureError(error: unknown, context: Props = {}): void {
  if (__DEV__) console.warn('[analytics] exception', error, context);
  posthog.captureException(
    error instanceof Error ? error : new Error(String(error)),
    asProperties(context),
  );
}

/**
 * A step on the way to a crash. Cheap, local, and attached to whatever exception
 * comes next as `$exception_steps` — which is what turns "TypeError in
 * restyle" into "TypeError in restyle, right after the entry failed to sync".
 */
export function breadcrumb(message: string, props?: Props): void {
  posthog.addExceptionStep(message, asProperties(props));
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Ties everything captured so far to this account.
 *
 * The e-mail is deliberately not sent: nothing we want to measure needs it, and
 * a `.env` key is not consent. Add it to `$set` here if you ever do want to
 * reach players from PostHog — and say so in the privacy policy first.
 */
export function identify(userId: string, props?: Props): void {
  posthog.identify(
    userId,
    asProperties({
      $set: { ...props } as Record<string, JsonType>,
      $set_once: { first_seen_at: new Date().toISOString() },
    }),
  );
}

export function resetAnalytics(): void {
  posthog.reset();
}

/**
 * Properties attached to *every* event from now on, including autocaptured
 * touches and screen views.
 *
 * This is what makes the data answerable: "do free players who never completed a
 * collection convert worse?" is a question about a scan event, not about a
 * profile screen, so the state has to ride along with the scan. Registered
 * rather than passed at each call site, because a property that has to be
 * remembered forty times is a property that will be missing somewhere.
 */
export interface PlayerContext {
  isPro: boolean;
  level: number;
  xp: number;
  cars: number;
  scansUsed: number;
  scansLeft: number;
  restylesLeft: number;
  completedBrands: number;
  badges: number;
  provider: string | null;
  hasAccount: boolean;
}

let lastContext = '';

export function syncPlayerContext(context: PlayerContext): void {
  const properties = {
    is_pro: context.isPro,
    level: context.level,
    xp: context.xp,
    cars_owned: context.cars,
    scans_used: context.scansUsed,
    // Infinity is not JSON, and a Pro player has no ceiling to report.
    scans_left: Number.isFinite(context.scansLeft) ? context.scansLeft : null,
    restyles_left: Number.isFinite(context.restylesLeft) ? context.restylesLeft : null,
    completed_brands: context.completedBrands,
    badges_unlocked: context.badges,
    auth_provider: context.provider,
    has_account: context.hasAccount,
    // Constant per build, but it is the first thing to check when the numbers
    // look wrong: a demo-mode install invents its cars.
    vision_mode: VISION_MODE,
    server_connected: hasSupabase,
  };

  // `register` writes to storage, and the store updates on every keystroke in
  // the profile name field. Only write when something actually moved.
  const snapshot = JSON.stringify(properties);
  if (snapshot === lastContext) return;
  lastContext = snapshot;

  posthog.register(properties);
}

/**
 * Duplicated from `vision.ts` rather than imported: `vision.ts` imports the
 * whole car catalogue, and analytics is loaded by the root layout before
 * anything needs it.
 */
const VISION_MODE: 'supabase' | 'openai' | 'mock' = hasSupabase
  ? 'supabase'
  : ENV.openaiKey
    ? 'openai'
    : 'mock';

// ── Feature flags ────────────────────────────────────────────────────────────

/**
 * A flag, with an explicit fallback for the two cases that are not "off":
 * flags not loaded yet on a first launch, and PostHog not configured at all.
 */
export function flagEnabled(key: string, fallback = false): boolean {
  return posthog.isFeatureEnabled(key) ?? fallback;
}

export function flagVariant(key: string): string | null {
  const value = posthog.getFeatureFlag(key);
  return typeof value === 'string' ? value : null;
}

/** Call before anything that must not read a stale flag. */
export function reloadFlags(): void {
  posthog.reloadFeatureFlags();
}

/**
 * Kept for the two remaining callers in `app/_layout.tsx`. The client is created
 * at module load now, so there is nothing left to initialise.
 *
 * @deprecated the provider owns the client — this only flushes on boot.
 */
export function initAnalytics(): void {
  posthog.flush().catch(() => {});
}
