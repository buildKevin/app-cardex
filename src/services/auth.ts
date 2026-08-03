import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { createId } from '../lib/id';
import { supabase } from './supabase';

export type Provider = 'apple' | 'google';

export class SignInCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SignInCancelled';
  }
}

/**
 * Whether the native Apple button can be shown. Apple requires the native flow
 * rather than a web redirect when the app offers other social logins
 * (App Store Review Guideline 4.8), so this drives what onboarding renders.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Native Sign in with Apple, exchanged for a Supabase session.
 *
 * Apple only discloses the name and e-mail on the very first authorisation, so
 * whatever arrives here is the only chance to capture them.
 */
export async function signInWithApple(): Promise<Account> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error: any) {
    if (error?.code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
    throw new Error("Connexion Apple impossible");
  }

  if (!credential.identityToken) throw new Error('Réponse Apple incomplète');

  const suggestedName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  // No Supabase project: keep the Apple identity locally so the profile is
  // still truthful about how the account was created.
  if (!supabase) {
    return {
      id: credential.user ?? createId(),
      email: credential.email ?? null,
      provider: 'apple',
      suggestedName: suggestedName || undefined,
    };
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error || !data.user) throw new Error(error?.message ?? 'Session Apple refusée');

  return {
    id: data.user.id,
    email: data.user.email ?? credential.email ?? null,
    provider: 'apple',
    suggestedName: suggestedName || undefined,
  };
}

export interface Account {
  id: string;
  email: string | null;
  /**
   * `anonymous` and `local` are not the same thing, and the difference decides
   * whether the player can scan at all. `anonymous` is a real Supabase user, so
   * it has a JWT and a `public.users` row; `local` is an id that exists only on
   * the device, which is all we can offer when there is no project configured.
   */
  provider: Provider | 'local' | 'anonymous';
  /** Apple hands over the real name once, on first authorisation only. */
  suggestedName?: string;
}

/**
 * Local Supabase has no OAuth providers configured, so in development we fall
 * back to an anonymous session. That still creates a real auth user (and so a
 * real `public.users` row), which is what the server-side scan counter needs —
 * unlike the purely local account used when there is no Supabase at all.
 */
async function signInAnonymously(provider: Account['provider']): Promise<Account> {
  const { data, error } = await supabase!.auth.signInAnonymously();
  if (error || !data.user) throw new Error(error?.message ?? 'Connexion anonyme impossible');
  return { id: data.user.id, email: null, provider };
}

/**
 * "Continue without an account".
 *
 * It has to create a real anonymous Supabase user, not just a device-local id,
 * because identification is a server call: `identify-car` resolves its caller
 * with `auth.getUser()` and answers 401 to anything that is not a user token.
 * A local-only account therefore cannot scan — the app's whole point fails on
 * the first tap, which is both a dead end for the player and a rejection for a
 * reviewer who takes the skip button at its word.
 *
 * The anonymous user is also what gives `begin_scan()` a row to count against,
 * so the half of the free-scan limit that a client cannot bypass keeps working
 * for players who never sign in.
 *
 * Degrades to a local id in two cases, rather than blocking the button: no
 * Supabase project at all (the empty-`.env` property), and anonymous sign-ins
 * disabled on the project. In the second case scanning will still fail, but it
 * fails at the scan with its own message instead of trapping the player in
 * onboarding.
 */
export async function continueWithoutAccount(): Promise<Account> {
  if (!supabase) return { id: createId(), email: null, provider: 'local' };

  try {
    return await signInAnonymously('anonymous');
  } catch {
    return { id: createId(), email: null, provider: 'local' };
  }
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

  if ((error || !data.url) && __DEV__) return signInAnonymously(provider);
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

export type DeleteOutcome = 'deleted' | 'local_only' | 'error';

/**
 * Erases the account server-side, then drops the local session.
 *
 * Removing an auth user needs the service_role key, so the work happens in the
 * `delete-account` edge function. With no Supabase configured there is no
 * remote account to erase and we report `local_only` so the caller can still
 * wipe the device.
 */
export async function deleteAccount(): Promise<DeleteOutcome> {
  if (!supabase) return 'local_only';

  try {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) return 'error';
    await supabase.auth.signOut();
    return 'deleted';
  } catch {
    return 'error';
  }
}

export async function getAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    // Supabase reports `anonymous` here for a user created by
    // `signInAnonymously`, which is exactly the value the union now carries.
    provider: (data.user.app_metadata?.provider as Account['provider']) ?? 'local',
  };
}
