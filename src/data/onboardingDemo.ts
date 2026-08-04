import { getBrand } from './brands';
import { getCar } from './cars';
import { xpForRarity } from '../lib/rarity';
import type { Rarity } from './types';

/**
 * The car the onboarding demo shows, and its three pictures.
 *
 * The demo runs *before* the player has handed over a photo, so there is nothing
 * to detour and nothing to redraw: no Vision call, no image call, no scan
 * charged. The three pictures are bundled assets, generated once — see
 * `assets/onboarding/README.md` for how, and why the die-cut in particular must
 * come out of `scripts/diecut-asset.swift` rather than a screenshot.
 *
 * The labels are read off the catalogue rather than typed here. The demo card is
 * pixel-for-pixel the card the player will get, and a hard-coded « EPIC · +40 XP »
 * would be the one card in the app whose rarity could drift away from the fiche
 * behind it the next time `cars.ts` is edited.
 */
const DEMO_CAR_ID = 'porsche-911';

const car = getCar(DEMO_CAR_ID);
const brand = getBrand(car?.brandId);

export interface OnboardingDemo {
  /** Brand name, as the card's overline. */
  make: string;
  model: string;
  rarity: Rarity;
  xp: number;
  /** The photograph — what a player would shoot in the street. */
  photo: number;
  /** The free sticker: lifted off its background on the device, white edge. */
  diecut: number;
  /** The paid sticker: redrawn by the image model behind « Embellir ». */
  redraw: number;
}

/**
 * Falls back to the literal rather than throwing on a missing catalogue row: the
 * demo is the second thing a new player ever sees, and a renamed car id must not
 * be able to take the whole onboarding down. The fallback is deliberately the
 * same car the pictures show.
 */
export const ONBOARDING_DEMO: OnboardingDemo = {
  make: brand?.name ?? 'Porsche',
  model: car?.model ?? '911 Carrera',
  rarity: car?.rarity ?? 'epic',
  xp: xpForRarity(car?.rarity ?? 'epic'),
  photo: require('../../assets/onboarding/demo-photo.jpg'),
  diecut: require('../../assets/onboarding/demo-diecut.png'),
  redraw: require('../../assets/onboarding/demo-redraw.png'),
};
