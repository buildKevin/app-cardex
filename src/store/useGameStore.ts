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

interface Profile {
  username: string;
  accountId: string | null;
  email: string | null;
  /** How the account was created, shown in the profile. */
  provider: 'apple' | 'google' | 'local' | null;
}

interface GameState {
  hydrated: boolean;
  onboarded: boolean;
  isFounder: boolean;
  /** Counts every scan attempt that reached the vision model. */
  scanCount: number;
  garage: GarageEntry[];
  /** Garage entry ids, max SHOWCASE_SIZE. */
  showcase: string[];
  profile: Profile;

  completeOnboarding: () => void;
  setFounder: (value: boolean) => void;
  setAccount: (accountId: string | null, email: string | null, provider: Profile['provider']) => void;
  setUsername: (username: string) => void;
  consumeScan: () => void;
  addScan: (result: VisionResult, photoUri: string | null) => GarageEntry;
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
  provider: null,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      onboarded: false,
      isFounder: false,
      scanCount: 0,
      garage: [],
      showcase: [],
      profile: initialProfile,

      completeOnboarding: () => set({ onboarded: true }),

      setFounder: (value) => set({ isFounder: value }),

      setAccount: (accountId, email, provider) =>
        set((state) => ({ profile: { ...state.profile, accountId, email, provider } })),

      setUsername: (username) =>
        set((state) => ({ profile: { ...state.profile, username: username.trim() || 'Collectionneur' } })),

      consumeScan: () => set((state) => ({ scanCount: state.scanCount + 1 })),

      addScan: (result, photoUri) => {
        const { car, brand } = resolveScan(result);
        // An uncatalogued car inherits its brand's typical tier rather than the
        // floor, so recognising a Ferrari we do not list still feels like one.
        const rarity: Rarity = car?.rarity ?? brandBaselineRarity(brand?.id);

        const entry: GarageEntry = {
          id: createId(),
          carId: car?.id ?? null,
          brandId: brand?.id ?? null,
          make: brand?.name ?? cleanModelName(result.make),
          model: car?.model ?? cleanModelName(result.model),
          year: result.year ?? car?.yearFrom ?? null,
          rarity,
          photoUri,
          discoveredAt: new Date().toISOString(),
          xp: xpForRarity(rarity),
          confidence: result.confidence,
        };

        set((state) => ({ garage: [entry, ...state.garage] }));
        return entry;
      },

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

      resetGarage: () => set({ garage: [], showcase: [], scanCount: 0 }),

      signOutLocal: () =>
        set((state) => ({
          onboarded: false,
          profile: { ...initialProfile, username: state.profile.username },
        })),

      reset: () =>
        set({
          onboarded: false,
          isFounder: false,
          scanCount: 0,
          garage: [],
          showcase: [],
          profile: initialProfile,
        }),
    }),
    {
      name: 'cardex-v1',
      version: 2,
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

        return state as GameState;
      },
      // Explicit allow-list: `hydrated` is runtime-only, and listing the data
      // keys keeps new actions from ever landing in storage.
      partialize: (state) => ({
        onboarded: state.onboarded,
        isFounder: state.isFounder,
        scanCount: state.scanCount,
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

/** Scans left on the free tier, or Infinity for Founders. */
export function scansLeft(state: Pick<GameState, 'isFounder' | 'scanCount'>): number {
  if (state.isFounder) return Infinity;
  return Math.max(0, FREE_SCAN_LIMIT - state.scanCount);
}

export function useScansLeft(): number {
  return useGameStore((state) => scansLeft(state));
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
