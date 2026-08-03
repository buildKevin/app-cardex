import type { Brand, Car, Rarity } from '../data/types';
import { formatPower } from './format';
import { RARITY_LABEL } from './rarity';

/**
 * What the app says back while a player is naming their own car.
 *
 * Onboarding asks three questions and reacts to every answer, because the point
 * of the whole screen is that the player feels *recognised* before they have
 * scanned anything. A reaction that could be printed under any answer — "super
 * choix !" — does the opposite: it proves nobody read the answer.
 *
 * So one line per catalogue brand, written by hand. Twenty-five lines is cheap
 * next to the thing they buy: the first thirty seconds of the app. The country
 * fallback below exists for a brand added to `BRANDS` without a line here, and
 * an unknown make gets the honest answer instead of a fake compliment.
 *
 * The model reaction is *not* hand-written — 126 catalogue cars would drift out
 * of date the moment someone edits `cars.ts`. It is derived from the row, which
 * makes it specific for free: rarity, power and years all come from the fiche
 * the player is about to unlock.
 *
 * `*asterisks*` mark the words drawn in `colors.highlight`; `Bubble` in
 * `app/onboarding.tsx` parses them. Everything a player types has its own
 * asterisks stripped before it reaches these strings, so a marker here is always
 * ours.
 */
const BRAND_LINES: Record<string, string> = {
  ferrari: '*Ferrari*. Italienne, rouge, et tout le monde tourne la tête. On démarre fort.',
  lamborghini: '*Lamborghini*. Italienne, taillée à la serpe, zéro discrétion. J’adore.',
  porsche: '*Porsche*. Allemande, précise au millimètre. Le choix des gens sérieux.',
  bmw: '*BMW*. Allemande, propulsion, et ce petit côté agressif comme on aime.',
  mercedes: '*Mercedes*. Allemande, large et calme. Ça impose sans avoir à crier.',
  audi: '*Audi*. Allemande, nette, quatre anneaux et pas une faute de goût.',
  volkswagen: '*Volkswagen*. Allemande, solide, indéboulonnable. La valeur sûre.',
  tesla: '*Tesla*. Américaine, silencieuse, et elle surprend tout le monde au feu rouge.',
  ford: '*Ford*. Américaine, franche, un peu brute. Ça se respecte.',
  toyota: '*Toyota*. Japonaise, increvable. Elle roulera encore quand on sera vieux.',
  renault: '*Renault*. Française, maligne, et un sacré palmarès en sport. Chez nous.',
  peugeot: '*Peugeot*. Française, du félin dans le coup de crayon. Bon goût.',
  citroen: '*Citroën*. Française, confortable, et toujours un peu à part. Ça me plaît.',
  dacia: '*Dacia*. Roumaine, sans chichi, tout l’argent est passé dans l’essentiel. Respect.',
  fiat: '*Fiat*. Italienne, joyeuse, imbattable en ville. Un caractère de chien.',
  'alfa-romeo':
    '*Alfa Romeo*. Italienne, du cœur et du bruit. Une histoire d’amour, pas de raison.',
  maserati: '*Maserati*. Italienne, rare, et le son avant tout. Chapeau.',
  mini: '*Mini*. Anglaise, minuscule et joueuse. Elle vire comme un kart.',
  'land-rover': '*Land Rover*. Anglaise, carrée, elle passe partout. L’autorité tranquille.',
  'aston-martin': '*Aston Martin*. Anglaise, élégante, sans doute la plus classe de la liste.',
  mclaren: '*McLaren*. Anglaise, née sur circuit. Ce n’est pas une voiture, c’est un scalpel.',
  volvo: '*Volvo*. Suédoise, sobre, et la plus rassurante du lot. Assumé.',
  nissan: '*Nissan*. Japonaise, avec quelques légendes au garage. Bon réflexe.',
  hyundai: '*Hyundai*. Coréenne, moderne, et devenue vraiment bonne. Sérieusement.',
  kia: '*Kia*. Coréenne, bien dessinée, et un rapport qualité-prix presque indécent.',
};

/** The line said back when the player names their brand. */
export function brandReaction(brand: Brand | null | undefined, typed: string): string {
  if (!brand) {
    return `*${typed}* ? Tu sors du lot, et celle-là n’est même pas encore à notre catalogue.`;
  }
  return BRAND_LINES[brand.id] ?? `*${brand.name}* — ${brand.country}. Bon choix, sincèrement.`;
}

const RARITY_LINES: Record<Rarity, string> = {
  common: 'Celle qu’on croise pour de vrai, et c’est tout le principe du jeu.',
  rare: 'Bon goût, sincèrement.',
  epic: 'Très joli choix, on ne va pas se mentir.',
  legendary: '*Légendaire*, rien que ça. Tu commences par le sommet.',
};

/** The line said back when the player names their model. */
export function carReaction(car: Car | undefined, typed: string): string {
  if (!car) {
    return `*${typed}*. Pas encore au catalogue celle-là — je la note, et elle rejoint quand même ton garage.`;
  }
  return `Une *${car.model}*. ${RARITY_LINES[car.rarity]}`;
}

/**
 * The fiche in one line, right after the reaction. This is the moment the app
 * proves it knows the car rather than just repeating its name back.
 *
 * Not `formatYears`: it renders a car still in production as "2020 –", which is
 * a table cell, not a sentence — between two middots it reads as a typo.
 */
export function carSpecLine(car: Car | undefined): string | null {
  if (!car) return null;
  const years = car.yearTo ? `${car.yearFrom} – ${car.yearTo}` : `depuis ${car.yearFrom}`;
  return `*${formatPower(car.power)}* · ${years} · *${RARITY_LABEL[car.rarity]}*`;
}
