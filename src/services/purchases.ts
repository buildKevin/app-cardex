import { Platform } from 'react-native';

import { ENV } from './env';

import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

/**
 * RevenueCat integration.
 *
 * Two rules shape this file:
 *
 * 1. The native modules are loaded lazily. A top-level import of
 *    `react-native-purchases-ui` throws in Expo Go and on web, and this app has
 *    to keep running with an empty `.env` (see AGENTS.md). Everything here
 *    degrades to a no-op instead of throwing.
 * 2. `CustomerInfo` from RevenueCat is the source of truth for Pro, never local
 *    state. The store flag is a cache of the last thing RevenueCat told us.
 */

/**
 * Entitlement identifier — must match the RevenueCat dashboard exactly,
 * including case. The dashboard shows a display name ("CarDex Pro") next to the
 * identifier; it is the *identifier* that belongs here. Override without a code
 * change via EXPO_PUBLIC_REVENUECAT_ENTITLEMENT.
 */
export const PRO_ENTITLEMENT = ENV.revenueCatEntitlement;

/** Offering used when RevenueCat has no `current` offering set. */
export const PRO_OFFERING = 'default';

/** Product identifiers configured in the RevenueCat dashboard. */
export const PRO_PRODUCTS = {
  lifetime: 'lifetime',
  yearly: 'yearly',
  monthly: 'monthly',
} as const;

export type PlanKey = keyof typeof PRO_PRODUCTS;

/**
 * The Test Store key works on every platform at once, so it wins when present.
 * Store keys are per-platform and are what ships.
 */
const apiKey =
  ENV.revenueCatTest ||
  Platform.select({ ios: ENV.revenueCatIos, android: ENV.revenueCatAndroid, default: '' }) ||
  '';

export const isTestStore = Boolean(ENV.revenueCatTest) && apiKey === ENV.revenueCatTest;

type PurchasesSdk = typeof import('react-native-purchases').default;
type PurchasesUiSdk = typeof import('react-native-purchases-ui').default;

let sdk: PurchasesSdk | null = null;
let ui: PurchasesUiSdk | null = null;
let sdkLoadAttempted = false;
let uiLoadAttempted = false;
let configured = false;

function loadSdk(): PurchasesSdk | null {
  if (!sdkLoadAttempted) {
    sdkLoadAttempted = true;
    try {
      sdk = require('react-native-purchases').default;
    } catch {
      // Native module missing (Expo Go / web) — callers fall back.
      sdk = null;
    }
  }
  return sdk;
}

/** `react-native-purchases-ui` has no Expo Go preview mode, so guard it separately. */
function loadUi(): PurchasesUiSdk | null {
  if (!uiLoadAttempted) {
    uiLoadAttempted = true;
    try {
      ui = require('react-native-purchases-ui').default;
    } catch {
      ui = null;
    }
  }
  return ui;
}

/** True when an API key exists and the native module is present. */
export function isPurchasesAvailable(): boolean {
  return Boolean(apiKey) && Boolean(loadSdk());
}

/** True once `configurePurchases()` has actually run. */
export function isPurchasesConfigured(): boolean {
  return configured;
}

/** True when RevenueCat's own paywall and Customer Center UI can be presented. */
export function isPurchasesUiAvailable(): boolean {
  return configured && Boolean(loadUi());
}

/**
 * The `RevenueCatUI` class, or null when it cannot be used. Screens need it for
 * the embedded `<RevenueCatUI.Paywall>` component, which — unlike
 * `presentProPaywall()` — renders inside an existing route instead of pushing
 * its own modal over it.
 */
export function getPurchasesUi(): PurchasesUiSdk | null {
  return configured ? loadUi() : null;
}

/**
 * Configures the SDK. Safe to call more than once — RevenueCat only tolerates a
 * single `configure()` per process, so repeat calls are dropped.
 *
 * @param appUserID Your own stable user id (the Supabase user id here). Omit it
 *   to let RevenueCat mint an anonymous id, which `identifyPurchaser()` can
 *   later merge into the real account on sign-in.
 */
export function configurePurchases(appUserID?: string | null): boolean {
  if (configured) return true;

  const Purchases = loadSdk();
  if (!apiKey || !Purchases) return false;

  try {
    // Log level before configure, or the configuration itself goes unlogged.
    Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey, appUserID: appUserID ?? null });
    configured = true;

    if (__DEV__ && isTestStore) {
      console.warn(
        '[purchases] Test Store key in use — purchases are simulated and must never ship.',
      );
    }
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[purchases] configure failed', error);
    return false;
  }
}

/**
 * Subscribes to entitlement changes. RevenueCat pushes a fresh `CustomerInfo`
 * on purchase, restore, renewal, expiry and app foreground, so this is how Pro
 * turns off by itself when a subscription lapses — polling would not catch it.
 *
 * Returns an unsubscribe function.
 */
export function onCustomerInfo(listener: (info: CustomerInfo) => void): () => void {
  const Purchases = loadSdk();
  if (!configured || !Purchases) return () => {};

  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(listener);
    } catch {
      // Listener already gone — nothing to do.
    }
  };
}

/** Latest customer info, or null when purchases are unavailable. */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  const Purchases = loadSdk();
  if (!configured || !Purchases) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    if (__DEV__) console.warn('[purchases] getCustomerInfo failed', error);
    return null;
  }
}

/**
 * Whether the Pro entitlement is active in the given customer info.
 *
 * A misspelled entitlement identifier is otherwise invisible: every check just
 * returns false and the paywall reappears after a successful purchase. The dev
 * warning names the identifiers RevenueCat actually returned.
 */
export function isProActive(info: CustomerInfo | null): boolean {
  if (!info) return false;

  const active = info.entitlements.active;
  if (active[PRO_ENTITLEMENT]) return true;

  if (__DEV__) {
    const found = Object.keys(active);
    if (found.length > 0) {
      console.warn(
        `[purchases] entitlement "${PRO_ENTITLEMENT}" not found. Active: ${found.join(', ')}. ` +
          'Fix the identifier in the dashboard or set EXPO_PUBLIC_REVENUECAT_ENTITLEMENT.',
      );
    }
  }
  return false;
}

/** Convenience: fetches customer info and reports whether Pro is active. */
export async function hasProEntitlement(): Promise<boolean> {
  return isProActive(await getCustomerInfo());
}

/** Details worth showing on an account screen. */
export interface ProStatus {
  isPro: boolean;
  /** Product that unlocked Pro, e.g. `yearly`. */
  productIdentifier: string | null;
  /** False once the customer has cancelled but not yet expired. */
  willRenew: boolean;
  /** ISO date, or null for a lifetime purchase. */
  expiresAt: string | null;
  /** True while in an introductory or free-trial period. */
  isTrial: boolean;
  /** Deep link to the store's subscription management screen. */
  managementUrl: string | null;
}

export function readProStatus(info: CustomerInfo | null): ProStatus {
  const entitlement = info?.entitlements.active[PRO_ENTITLEMENT] ?? null;
  return {
    isPro: Boolean(entitlement),
    productIdentifier: entitlement?.productIdentifier ?? null,
    willRenew: entitlement?.willRenew ?? false,
    expiresAt: entitlement?.expirationDate ?? null,
    isTrial: entitlement?.periodType === 'TRIAL',
    managementUrl: info?.managementURL ?? null,
  };
}

/** The offering to sell from: whatever the dashboard marks current. */
export async function getProOffering(): Promise<PurchasesOffering | null> {
  const Purchases = loadSdk();
  if (!configured || !Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? offerings.all[PRO_OFFERING] ?? null;
  } catch (error) {
    if (__DEV__) console.warn('[purchases] getOfferings failed', error);
    return null;
  }
}

export interface Plan {
  key: PlanKey;
  package: PurchasesPackage;
  /** Already localised and currency-formatted by the store. */
  priceString: string;
  /** True for the one-off lifetime product, which never renews. */
  isLifetime: boolean;
}

/**
 * Resolves the three plans out of an offering.
 *
 * Package *type* is checked before product identifier because the type is what
 * RevenueCat guarantees for the built-in `$rc_lifetime` / `$rc_annual` /
 * `$rc_monthly` package identifiers; the product id fallback covers offerings
 * built with custom packages.
 */
export function readPlans(offering: PurchasesOffering | null): Plan[] {
  if (!offering) return [];

  const byType: Record<PlanKey, PurchasesPackage | null> = {
    lifetime: offering.lifetime,
    yearly: offering.annual,
    monthly: offering.monthly,
  };

  const plans: Plan[] = [];
  for (const key of ['lifetime', 'yearly', 'monthly'] as PlanKey[]) {
    const pkg =
      byType[key] ??
      offering.availablePackages.find((p) => p.product.identifier === PRO_PRODUCTS[key]) ??
      null;

    if (pkg) {
      plans.push({
        key,
        package: pkg,
        priceString: pkg.product.priceString,
        isLifetime: key === 'lifetime',
      });
    }
  }
  return plans;
}

/** Offering plus its resolved plans, in one call. */
export async function getProPlans(): Promise<Plan[]> {
  return readPlans(await getProOffering());
}

export type PurchaseOutcome =
  | { status: 'purchased'; customerInfo: CustomerInfo }
  /** Bought, but the entitlement did not turn on — almost always a dashboard mismatch. */
  | { status: 'not_entitled'; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  /** Payment awaiting approval (Ask to Buy, SEPA). Grant nothing yet. */
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string; code?: string };

/**
 * `PURCHASES_ERROR_CODE` values are numeric strings ("1", "20", …) but the
 * native bridge may hand back a number, so compare on a normalised string.
 */
function errorCode(error: any): string {
  return error?.code == null ? '' : String(error.code);
}

/**
 * User-facing French for the error codes worth distinguishing. Anything not
 * listed gets the generic message — a precise but unhelpful string is worse
 * than a vague, actionable one.
 */
function messageForError(Purchases: PurchasesSdk, code: string): string {
  const codes = Purchases.PURCHASES_ERROR_CODE;
  switch (code) {
    case codes.PURCHASE_NOT_ALLOWED_ERROR:
      return 'Les achats sont désactivés sur cet appareil. Vérifie les restrictions dans Réglages.';
    case codes.PRODUCT_ALREADY_PURCHASED_ERROR:
      return 'Tu possèdes déjà cet abonnement. Utilise « Restaurer un achat ».';
    case codes.NETWORK_ERROR:
    case codes.OFFLINE_CONNECTION_ERROR:
      return 'Connexion indisponible. Réessaie une fois en ligne.';
    case codes.STORE_PROBLEM_ERROR:
      return 'Le store ne répond pas. Réessaie dans quelques minutes.';
    case codes.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return 'Cet abonnement n’est pas disponible dans ta région.';
    case codes.INELIGIBLE_ERROR:
      return 'Tu n’es pas éligible à cette offre.';
    case codes.CONFIGURATION_ERROR:
      return 'Configuration des achats incomplète. Contacte-nous si cela persiste.';
    case codes.TEST_STORE_SIMULATED_PURCHASE_ERROR:
      return 'Échec d’achat simulé (Test Store).';
    default:
      return 'L’achat n’a pas pu aboutir. Réessaie dans un instant.';
  }
}

/**
 * Buys a package and reports what happened.
 *
 * The entitlement is re-read from the returned `customerInfo` rather than
 * assumed: a completed transaction and an unlocked entitlement are not the same
 * event, and only the second one should unlock the app.
 */
export async function purchasePlan(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  const Purchases = loadSdk();
  if (!configured || !Purchases) return { status: 'unavailable' };

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return isProActive(customerInfo)
      ? { status: 'purchased', customerInfo }
      : { status: 'not_entitled', customerInfo };
  } catch (error: any) {
    const codes = Purchases.PURCHASES_ERROR_CODE;
    const code = errorCode(error);

    // A cancel is not a failure — never show an alert for it.
    if (code === codes.PURCHASE_CANCELLED_ERROR || error?.userCancelled) {
      return { status: 'cancelled' };
    }
    // Ask to Buy / SEPA: the transaction may still succeed later, and the
    // customer info listener is what will unlock Pro when it does.
    if (code === codes.PAYMENT_PENDING_ERROR) return { status: 'pending' };

    if (__DEV__) console.warn('[purchases] purchase failed', error);
    return { status: 'error', message: messageForError(Purchases, code), code };
  }
}

/** Restores previous purchases. Returns true when Pro came back. */
export async function restorePurchases(): Promise<boolean> {
  const Purchases = loadSdk();
  if (!configured || !Purchases) return false;
  try {
    return isProActive(await Purchases.restorePurchases());
  } catch (error) {
    if (__DEV__) console.warn('[purchases] restore failed', error);
    return false;
  }
}

/**
 * Links purchases to your own user id after sign-in.
 *
 * Called with the Supabase user id so the RevenueCat webhook can write
 * `is_pro` on the right `public.users` row — without it, the server-side scan
 * limit keeps blocking a paying customer.
 */
export async function identifyPurchaser(appUserID: string): Promise<CustomerInfo | null> {
  const Purchases = loadSdk();
  if (!configured || !Purchases || !appUserID) return null;
  try {
    const { customerInfo } = await Purchases.logIn(appUserID);
    return customerInfo;
  } catch (error) {
    if (__DEV__) console.warn('[purchases] logIn failed', error);
    return null;
  }
}

/** Returns to an anonymous id on sign-out, so the next user starts clean. */
export async function resetPurchaser(): Promise<void> {
  const Purchases = loadSdk();
  if (!configured || !Purchases) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    // Already anonymous — RevenueCat rejects logOut and that is fine.
    if (__DEV__) console.warn('[purchases] logOut skipped', error);
  }
}

export type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'not_presented' | 'error';

/**
 * Presents the paywall designed in the RevenueCat dashboard (Paywalls v2).
 *
 * Keeping the design server-side means price, copy and layout change without an
 * App Store release. Returns `not_presented` when the UI package is missing, so
 * the caller can fall back to the in-app paywall.
 */
export async function presentProPaywall(options?: {
  /** Show only if Pro is not already active. */
  ifNeeded?: boolean;
  offering?: PurchasesOffering | null;
  displayCloseButton?: boolean;
}): Promise<PaywallResult> {
  const RevenueCatUI = loadUi();
  if (!configured || !RevenueCatUI) return 'not_presented';

  try {
    const offering = options?.offering ?? undefined;
    const displayCloseButton = options?.displayCloseButton ?? true;

    const result = options?.ifNeeded
      ? await RevenueCatUI.presentPaywallIfNeeded({
          requiredEntitlementIdentifier: PRO_ENTITLEMENT,
          offering,
          displayCloseButton,
        })
      : await RevenueCatUI.presentPaywall({ offering, displayCloseButton });

    switch (result) {
      case 'PURCHASED':
        return 'purchased';
      case 'RESTORED':
        return 'restored';
      case 'CANCELLED':
        return 'cancelled';
      case 'NOT_PRESENTED':
        return 'not_presented';
      default:
        return 'error';
    }
  } catch (error) {
    if (__DEV__) console.warn('[purchases] paywall failed', error);
    return 'error';
  }
}

/**
 * Presents the Customer Center: cancel, change plan, request a refund, restore.
 *
 * Apple requires a way to manage a subscription from inside the app, and this
 * covers it without us building an account screen for every store.
 * Returns false when the UI package is unavailable, so the caller can fall back
 * to `managementURL`.
 */
export async function presentCustomerCenter(callbacks?: {
  onRestoreCompleted?: (info: CustomerInfo) => void;
  onShowingManageSubscriptions?: () => void;
  onFeedbackSurveyCompleted?: (optionId: string) => void;
}): Promise<boolean> {
  const RevenueCatUI = loadUi();
  if (!configured || !RevenueCatUI) return false;

  try {
    await RevenueCatUI.presentCustomerCenter({
      callbacks: {
        onRestoreCompleted: ({ customerInfo }) => callbacks?.onRestoreCompleted?.(customerInfo),
        onShowingManageSubscriptions: () => callbacks?.onShowingManageSubscriptions?.(),
        onFeedbackSurveyCompleted: ({ feedbackSurveyOptionId }) =>
          callbacks?.onFeedbackSurveyCompleted?.(feedbackSurveyOptionId),
      },
    });
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[purchases] customer center failed', error);
    return false;
  }
}
