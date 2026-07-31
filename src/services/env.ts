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
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
} as const;

export const hasSupabase = Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey);
export const hasOpenAI = Boolean(ENV.openaiKey);
export const hasPostHog = Boolean(ENV.posthogKey);
