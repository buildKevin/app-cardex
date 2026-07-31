import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getCar } from '../data/cars';
import type { GarageEntry, Rarity, VisionResult } from '../data/types';
import { createId } from '../lib/id';
import { resolveScan } from '../lib/match';
import { xpForRarity } from '../lib/rarity';
import { computeStats, type Stats } from '../lib/stats';

/** Free tier ceiling. */
export const FREE_SCAN_LIMIT = 10;
export const SHOWCASE_SIZE = 3;

interface Profile {
  username: string;
  accountId: string | null;
  email: string | null;
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
  setAccount: (accountId: string | null, email: string | null) => void;
  setUsername: (username: string) => void;
  consumeScan: () => void;
  addScan: (result: VisionResult, photoUri: string | null) => GarageEntry;
  toggleShowcase: (entryId: string) => void;
  removeEntry: (entryId: string) => void;
  reset: () => void;
}

const initialProfile: Profile = { username: 'Collectionneur', accountId: null, email: null };

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

      setAccount: (accountId, email) =>
        set((state) => ({ profile: { ...state.profile, accountId, email } })),

      setUsername: (username) =>
        set((state) => ({ profile: { ...state.profile, username: username.trim() || 'Collectionneur' } })),

      consumeScan: () => set((state) => ({ scanCount: state.scanCount + 1 })),

      addScan: (result, photoUri) => {
        const { car, brand } = resolveScan(result);
        const rarity: Rarity = car?.rarity ?? 'common';

        const entry: GarageEntry = {
          id: createId(),
          carId: car?.id ?? null,
          brandId: brand?.id ?? null,
          make: brand?.name ?? result.make,
          model: car?.model ?? result.model,
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
      storage: createJSONStorage(() => AsyncStorage),
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
