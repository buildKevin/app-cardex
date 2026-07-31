import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { createId } from '../lib/id';
import { supabase } from './supabase';

export type Provider = 'apple' | 'google';

export interface Account {
  id: string;
  email: string | null;
  provider: Provider | 'local';
}

/**
 * Signs in through Supabase OAuth when a project is configured, and falls back
 * to a local-only account otherwise so the MVP is always playable.
 */
export async function signIn(provider: Provider): Promise<Account> {
  if (!supabase) return { id: createId(), email: null, provider: 'local' };

  const redirectTo = Linking.createURL('/auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error(error?.message ?? 'OAuth indisponible');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('Connexion annulée');

  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== 'string') throw new Error('Réponse OAuth invalide');

  const { data: session, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !session.user) throw new Error(exchangeError?.message ?? 'Session invalide');

  return { id: session.user.id, email: session.user.email ?? null, provider };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function getAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    provider: (data.user.app_metadata?.provider as Provider) ?? 'local',
  };
}
