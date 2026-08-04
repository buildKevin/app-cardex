import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getCar } from '../data/cars';
import type { GarageEntry, Rarity, VisionResult } from '../data/types';
import { createId } from '../lib/id';
import { cleanModelName, resolveScan } from '../lib/match';
import { brandBaselineRarity, xpForRarity } from '../lib/rarity';
import { computeStats, type Stats } from '../lib/stats';

/** Free tier ceiling. */
export const FREE_SCAN_LIMIT = 10;
export const SHOWCASE_SIZE = 3;

/**
 * AI redraws offered before the paywall. None: « Embellir » is a Pro feature.
 *
 * It used to be one for the lifetime of the account, because a paywall on a
 * feature nobody had seen sells nothing. The on-device die-cut is that
 * demonstration now — free, unlimited, on every car — so what the paywall asks
 * for is an upgrade to a sticker the player can already see, rather than access
 * to a feature they have to take on trust.
 *
 * Mirrors `begin_restyle()`, which owns the truth and refuses at zero.
 */
export const FREE_RESTYLE_LIMIT = 0;
/** Pro's monthly allowance. Mirrors `begin_restyle()`, which owns the truth. */
export const PRO_RESTYLE_LIMIT = 30;

interface Profile {
  username: string;
  accountId: string | null;
  email: string | null;
  /** Local file uri of the picked avatar, null for the initials fallback. */
  avatarUri: string | null;
  /** How the account was created, shown in the profile. */
  /** `anonymous` is a real Supabase user; `local` exists only on the device. */
  provider: 'apple' | 'google' | 'local' | 'anonymous' | null;
}

interface GameState {
  hydrated: boolean;
  onboarded: boolean;
  /**
   * Cache of the CarDex Pro entitlement. RevenueCat's CustomerInfo is the
   * source of truth; this only exists so the UI does not flicker while the
   * first customer-info fetch is in flight.
   */
  isPro: boolean;
  /** Counts every scan attempt that reached the vision model. */
  scanCount: number;
  /**
   * Successful photo restyles. A UX mirror only — `begin_restyle()` in Postgres
   * is what actually refuses, exactly like the scan counter.
   */
  restyleCount: number;
  garage: GarageEntry[];
  /** Garage entry ids, max SHOWCASE_SIZE. */
  showcase: string[];
  profile: Profile;

  completeOnboarding: () => void;
  setPro: (value: boolean) => void;
  setAccount: (accountId: string | null, email: string | null, provider: Profile['provider']) => void;
  setUsername: (username: string) => void;
  /** Local uri of the avatar picture, or null to fall back to the initials. */
  setAvatar: (uri: string | null) => void;
  consumeScan: () => void;
  consumeRestyle: () => void;
  addScan: (result: VisionResult, photoUri: string | null) => GarageEntry;
  /** Attaches the AI rendering to an entry, keeping the original photo. */
  setStyledPhoto: (entryId: string, uri: string, path: string | null) => void;
  /**
   * Attaches the on-device die-cut. No `path` argument, and that is the whole
   * design: this sticker is never uploaded, because it is derived from a photo
   * the bucket already holds and costs nothing to rebuild.
   */
  setDiecut: (entryId: string, uri: string) => void;
  toggleShowcase: (entryId: string) => void;
  removeEntry: (entryId: string) => void;
  /** Drops the session and returns to onboarding, keeping the local garage. */
  signOutLocal: () => void;
  /** Records that an entry now exists server-side. */
  markSynced: (entryId: string, remoteId: string, photoPath: string | null) => void;
  /** Adds server rows we do not have locally, newest first. */
  mergeRemote: (entries: GarageEntry[]) => void;
  /** Empties the garage and the scan counter, keeping the account. */
  resetGarage: () => void;
  reset: () => void;
}

const initialProfile: Profile = {
  username: 'Collectionneur',
  accountId: null,
  email: null,
  avatarUri: null,
  provider: null,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      onboarded: false,
      isPro: false,
      scanCount: 0,
      restyleCount: 0,
      garage: [],
      showcase: [],
      profile: initialProfile,

      completeOnboarding: () => set({ onboarded: true }),

      setPro: (value) => set({ isPro: value }),

      setAccount: (accountId, email, provider) =>
        set((state) => ({
          profile: { ...state.profile, accountId, email, provider },
          // The free sticker is an *account* allowance — `begin_restyle()` counts
          // it per `users` row — while this counter lives on the device. Left to
          // carry over, a brand-new account signing in on a device that had
          // already spent one found its own welcome sticker refused by a mirror
          // that knew nothing about it, and onboarding silently handed back the
          // plain photograph. Nothing is opened up by resetting it: the server
          // grants the allowance per user row either way, and it is still the
          // only thing that can refuse.
          restyleCount:
            accountId && accountId !== state.profile.accountId ? 0 : state.restyleCount,
        })),

      setUsername: (username) =>
        set((state) => ({ profile: { ...state.profile, username: username.trim() || 'Collectionneur' } })),

      setAvatar: (uri) => set((state) => ({ profile: { ...state.profile, avatarUri: uri } })),

      consumeScan: () => set((state) => ({ scanCount: state.scanCount + 1 })),

      consumeRestyle: () => set((state) => ({ restyleCount: state.restyleCount + 1 })),

      addScan: (result, photoUri) => {
        const { car, brand, discovered } = resolveScan(result);
        // Three tiers of answer, best first: our catalogue, then the community
        // fiche the server wrote for a car we do not list, then — when nobody
        // could rate the car at all — the brand's typical tier rather than the
        // floor, so recognising a Ferrari we do not list still feels like one.
        const rarity: Rarity = car?.rarity ?? discovered?.rarity ?? brandBaselineRarity(brand?.id);

        const entry: GarageEntry = {
          id: createId(),
          carId: car?.id ?? null,
          brandId: brand?.id ?? null,
          discovered: discovered ?? null,
          make: brand?.name ?? discovered?.make ?? cleanModelName(result.make),
          model: car?.model ?? discovered?.model ?? cleanModelName(result.model),
          year: result.year ?? car?.yearFrom ?? discovered?.yearFrom ?? null,
          rarity,
          photoUri,
          discoveredAt: new Date().toISOString(),
          xp: xpForRarity(rarity),
          confidence: result.confidence,
        };

        set((state) => ({ garage: [entry, ...state.garage] }));
        return entry;
      },

      setStyledPhoto: (entryId, uri, path) =>
        set((state) => ({
          garage: state.garage.map((entry) =>
            entry.id === entryId ? { ...entry, styledPhotoUri: uri, styledPhotoPath: path } : entry,
          ),
        })),

      setDiecut: (entryId, uri) =>
        set((state) => ({
          garage: state.garage.map((entry) =>
            entry.id === entryId ? { ...entry, diecutUri: uri } : entry,
          ),
        })),

      toggleShowcase: (entryId) =>
        set((state) => {
          if (state.showcase.includes(entryId)) {
            return { showcase: state.showcase.filter((id) => id !== entryId) };
          }
          if (state.showcase.length >= SHOWCASE_SIZE) return state;
          return { showcase: [...state.showcase, entryId] };
        }),

      removeEntry: (entryId) =>
        set((state) => ({
          garage: state.garage.filter((entry) => entry.id !== entryId),
          showcase: state.showcase.filter((id) => id !== entryId),
        })),

      markSynced: (entryId, remoteId, photoPath) =>
        set((state) => ({
          garage: state.garage.map((entry) =>
            entry.id === entryId ? { ...entry, remoteId, photoPath } : entry,
          ),
        })),

      mergeRemote: (entries) =>
        set((state) => {
          // Match on remoteId so a row we pushed ourselves is never duplicated.
          const known = new Set(
            state.garage.map((entry) => entry.remoteId).filter(Boolean) as string[],
          );
          const incoming = entries.filter((entry) => entry.remoteId && !known.has(entry.remoteId));
          if (incoming.length === 0) return state;

          const merged = [...state.garage, ...incoming].sort(
            (a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt),
          );
          return { garage: merged };
        }),

      // `restyleCount` deliberately survives: the free rendering is an account
      // allowance, not garage state, and the server would refuse a second one
      // anyway. Clearing it here would only show a button that leads to a 402.
      resetGarage: () => set({ garage: [], showcase: [], scanCount: 0 }),

      signOutLocal: () =>
        set((state) => ({
          onboarded: false,
          profile: {
            ...initialProfile,
            username: state.profile.username,
            avatarUri: state.profile.avatarUri,
          },
        })),

      reset: () =>
        set({
          onboarded: false,
          isPro: false,
          scanCount: 0,
          restyleCount: 0,
          garage: [],
          showcase: [],
          profile: initialProfile,
        }),
    }),
    {
      name: 'cardex-v1',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * State written by an older build is missing fields added since. Without a
       * migration the profile showed "Connexion : Aucune" next to a real
       * account id, which is the kind of small lie that erodes trust in an
       * account screen.
       */
      migrate: (persisted, version) => {
        const state = persisted as Partial<GameState> | undefined;
        if (!state) return persisted as GameState;

        if (version < 2 && state.profile && state.profile.provider === undefined) {
          state.profile = {
            ...state.profile,
            provider: state.profile.accountId ? 'local' : null,
          };
        }

        // v3 renamed the Founder lifetime purchase to the CarDex Pro
        // entitlement. Carry the old flag over so an existing buyer is not
        // shown a paywall on first launch after the update — RevenueCat
        // corrects it either way as soon as CustomerInfo arrives.
        if (version < 3) {
          const legacy = (state as Record<string, unknown>).isFounder;
          if (typeof legacy === 'boolean') {
            state.isPro = legacy;
            delete (state as Record<string, unknown>).isFounder;
          }
        }

        // v4 added the avatar picture. An older profile simply has none.
        if (version < 4 && state.profile && state.profile.avatarUri === undefined) {
          state.profile = { ...state.profile, avatarUri: null };
        }

        return state as GameState;
      },
      // Explicit allow-list: `hydrated` is runtime-only, and listing the data
      // keys keeps new actions from ever landing in storage.
      partialize: (state) => ({
        onboarded: state.onboarded,
        isPro: state.isPro,
        scanCount: state.scanCount,
        // No migration needed: zustand shallow-merges persisted over initial
        // state, so a build that predates this key rehydrates it at 0.
        restyleCount: state.restyleCount,
        garage: state.garage,
        showcase: state.showcase,
        profile: state.profile,
      }),
      onRehydrateStorage: () => (state) => {
        useGameStore.setState({ hydrated: true });
        return state;
      },
    },
  ),
);

/** Scans left on the free tier, or Infinity for Pro. */
export function scansLeft(state: Pick<GameState, 'isPro' | 'scanCount'>): number {
  if (state.isPro) return Infinity;
  return Math.max(0, FREE_SCAN_LIMIT - state.scanCount);
}

export function useScansLeft(): number {
  return useGameStore((state) => scansLeft(state));
}

/**
 * Restyles left before the paywall.
 *
 * Infinity for Pro on purpose: the monthly allowance is a server-side window
 * this store does not track, and blocking a subscriber locally on a counter we
 * cannot reset correctly would lock out a paying player. Pro sees the button,
 * and the rare 402 at 30/30 is handled where the call is made.
 */
export function restylesLeft(state: Pick<GameState, 'isPro' | 'restyleCount'>): number {
  if (state.isPro) return Infinity;
  return Math.max(0, FREE_RESTYLE_LIMIT - state.restyleCount);
}

export function useRestylesLeft(): number {
  return useGameStore((state) => restylesLeft(state));
}

export function useStats(): Stats {
  const garage = useGameStore((state) => state.garage);
  const scanCount = useGameStore((state) => state.scanCount);
  return computeStats(garage, scanCount);
}

export function useGarageEntry(entryId: string | undefined) {
  return useGameStore((state) => state.garage.find((entry) => entry.id === entryId));
}

/** The catalogue row behind a garage entry, when there is one. */
export function useEntryCar(entryId: string | undefined) {
  const entry = useGarageEntry(entryId);
  return { entry, car: getCar(entry?.carId) };
}
