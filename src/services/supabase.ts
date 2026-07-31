import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ENV, hasSupabase } from './env';

/** null when no Supabase project is configured — the app then stays local-only. */
export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export { hasSupabase };
