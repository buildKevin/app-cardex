/**
 * EXPO_PUBLIC_* vars are inlined at build time, so they must be read
 * statically — never through a computed key.
 */
export const ENV = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  openaiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
  visionModel: process.env.EXPO_PUBLIC_VISION_MODEL ?? 'gpt-4o-mini',
  revenueCatIos: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  revenueCatAndroid: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  /**
   * RevenueCat Test Store key (`test_…`). Platform-agnostic and takes priority
   * over the store keys in dev, so purchases are testable without App Store
   * Connect or the Play Console. `verify:release` refuses to ship with it.
   */
  revenueCatTest: process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? '',
  /**
   * Entitlement identifier as spelled in the RevenueCat dashboard — literally
   * `CarDex Pro`, space and capitals included, not the slug it looks like it
   * should be. The dashboard used the display name as the identifier at
   * creation, and RevenueCat forbids editing a `lookup_key` afterwards: only
   * `display_name` is mutable. Nor can a tidier `cardex_pro` be created
   * alongside it, because uniqueness is checked on the normalised form and the
   * two collide. The SDK matches this string exactly against
   * `customerInfo.entitlements.active`, so it has to be wrong here to be right.
   */
  revenueCatEntitlement: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? 'CarDex Pro',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
} as const;

export const hasSupabase = Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey);
export const hasOpenAI = Boolean(ENV.openaiKey);
export const hasPostHog = Boolean(ENV.posthogKey);
