import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { createId } from '../lib/id';
import { supabase } from './supabase';

/**
 * Apple is the only real provider. Google was offered once and could never have
 * worked: the hosted project reports `google: false` on `/auth/v1/settings`, so
 * the button opened an OAuth URL for a provider GoTrue refuses. It was invisible
 * in development because the old `signIn()` fell back to an anonymous session
 * under `__DEV__` — the one build where a broken button looks fine.
 */
export type Provider = 'apple';

export class SignInCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SignInCancelled';
  }
}

/**
 * Whether to offer the native Apple button. Apple requires the native flow
 * rather than a web redirect when the app offers other social logins
 * (App Store Review Guideline 4.8), so this drives what onboarding renders.
 *
 * True on every iOS build, and not a capability probe any more.
 * `AppleAuthentication.isAvailableAsync()` looks like the right question but
 * answers a narrower one: it reports false when the *binary* carries no
 * `com.apple.developer.applesignin` entitlement, which is exactly what a
 * simulator build made before `ios.usesAppleSignIn` was set looks like. It hid
 * the Apple button on a dev build here while Google stayed — which is both the
 * confusing direction for us and the expensive one for review. So iOS always
 * offers it, and `signInWithApple` below surfaces its own error if the build
 * really cannot. `npm run verify:release` is what guarantees the entitlement is
 * configured before a store build; a missing one now fails loudly on tap
 * instead of silently removing the button.
 */
export function isAppleSignInAvailable(): boolean {
  return Platform.OS === 'ios';
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
