import { Platform } from 'react-native';

import { ENV } from './env';

export const FOUNDER_ENTITLEMENT = 'founder';
export const FOUNDER_OFFERING = 'founder';
/** Fallback shown before RevenueCat has loaded — keep in sync with the store price. */
export const FOUNDER_FALLBACK_PRICE = '9,99 €';

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'unavailable' | 'error';

const apiKey = Platform.select({
  ios: ENV.revenueCatIos,
  android: ENV.revenueCatAndroid,
  default: '',
});

let sdk: any = null;
let configured = false;

function loadSdk(): any {
  if (sdk) return sdk;
  try {
    sdk = require('react-native-purchases').default;
  } catch {
    // Native module missing (Expo Go / web) — the caller falls back.
    sdk = null;
  }
  return sdk;
}

export function isPurchasesAvailable(): boolean {
  return Boolean(apiKey) && Boolean(loadSdk());
}

export async function configurePurchases(): Promise<void> {
  if (configured || !isPurchasesAvailable()) return;
  try {
    await loadSdk().configure({ apiKey });
    configured = true;
  } catch (error) {
    if (__DEV__) console.warn('[purchases] configure failed', error);
  }
}

/** Localised price of the Founder product, or null when unavailable. */
export async function getFounderPrice(): Promise<string | null> {
  if (!configured) return null;
  try {
    const offerings = await loadSdk().getOfferings();
    const offering = offerings.all?.[FOUNDER_OFFERING] ?? offerings.current;
    const pkg = offering?.lifetime ?? offering?.availablePackages?.[0];
    return pkg?.product?.priceString ?? null;
  } catch {
    return null;
  }
}

export async function purchaseFounder(): Promise<PurchaseOutcome> {
  if (!configured) return 'unavailable';
  try {
    const Purchases = loadSdk();
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all?.[FOUNDER_OFFERING] ?? offerings.current;
    const pkg = offering?.lifetime ?? offering?.availablePackages?.[0];
    if (!pkg) return 'unavailable';

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo.entitlements.active[FOUNDER_ENTITLEMENT] ? 'purchased' : 'error';
  } catch (error: any) {
    if (error?.userCancelled) return 'cancelled';
    if (__DEV__) console.warn('[purchases] purchase failed', error);
    return 'error';
  }
}

/** Returns true when the Founder entitlement is active after restoring. */
export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    const customerInfo = await loadSdk().restorePurchases();
    return Boolean(customerInfo.entitlements.active[FOUNDER_ENTITLEMENT]);
  } catch {
    return false;
  }
}

export async function hasFounderEntitlement(): Promise<boolean> {
  if (!configured) return false;
  try {
    const customerInfo = await loadSdk().getCustomerInfo();
    return Boolean(customerInfo.entitlements.active[FOUNDER_ENTITLEMENT]);
  } catch {
    return false;
  }
}
