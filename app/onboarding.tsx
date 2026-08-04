import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandPicker } from '../src/components/BrandPicker';
import { Button } from '../src/components/Button';
import { CarSilhouette } from '../src/components/CarSilhouette';
import { Glow } from '../src/components/Glow';
import { RarityTag } from '../src/components/RarityTag';
import { StickerReveal } from '../src/components/StickerReveal';
import { Text } from '../src/components/Text';
import { CARS_BY_BRAND } from '../src/data/cars';
import { ONBOARDING_DEMO } from '../src/data/onboardingDemo';
import type { Brand, Car, GarageEntry } from '../src/data/types';
import { armGarageDoor, armWelcomePaywall } from '../src/lib/welcome';
import { resolveScan } from '../src/lib/match';
import { brandReaction, carReaction, carSpecLine } from '../src/lib/onboardingBanter';
import { displayPhoto, isSticker, originalPhoto } from '../src/lib/photo';
import { rarityColor } from '../src/lib/rarity';
import { breadcrumb, captureError, events, identify, track } from '../src/services/analytics';
import {
  SignInCancelled,
  continueWithoutAccount,
  isAppleSignInAvailable,
  signIn,
  signInWithApple,
  type Account,
  type Provider,
} from '../src/services/auth';
import { createDiecut } from '../src/services/diecut';
import { pickImage, preparePhoto } from '../src/services/photo';
import { restoreGarage } from '../src/services/restoreGarage';
import { pushEntry } from '../src/services/sync';
import { useGameStore, useGarageEntry } from '../src/store/useGameStore';
import { colors, fonts, gutter, motion, radii, shadow, spacing, type, withAlpha } from '../src/theme';

/**
 * Onboarding, as a conversation.
 *
 * It used to be three swipeable slides explaining the game, and slides are the
 * one thing a player will not read. This asks instead — prénom, marque, modèle,
 * photo — reacts to every answer, and ends by handing back the player's own car
 * redrawn as a sticker. Nobody arrives in an empty garage any more: they arrive
 * holding card number one, and it is *theirs*.
 *
 * Two constraints fix the order of the steps, and neither is negotiable:
 *
 * - The sticker comes from `restyle-photo`, which authenticates its caller and
 *   reads the photo out of the `scans` bucket by garage row id. The account and
 *   the pushed row both have to exist before the image call, which is why the
 *   sign-in sits between the photo and the sticker instead of at the start. It
 *   reads better there anyway: the reward is already on screen, and the account
 *   is what keeps it.
 * - The declared car becomes a garage entry only when there is a photo. A
 *   photo-less card can never be turned into a sticker, so it would be the one
 *   card in the garage with a permanently dead button on it.
 *
 * Between the third question and the photo sits a *demonstration*, on a car that
 * is not the player's: a photograph, the die-cut sticker it becomes by itself, and
 * — one tap on « Sublimer » — the redraw that CarDex Pro buys. Three bundled
 * assets, no vision call, no image call, no scan charged; see
 * `src/data/onboardingDemo.ts`. It sits *before* the photo rather than on the
 * player's own card at the end, for two reasons. The player has nothing to lose
 * yet, so a demo here costs them nothing and no allowance is spent; and it is
 * what turns « montre-la moi » from a request into an offer — they have already
 * seen what they get back. The paid half being shown on somebody else's car is
 * the point too: what Pro is sold on later is the difference they watched happen,
 * not a feature described to them.
 *
 * There is one way past all of it, on the first step: a player who already has an
 * account jumps straight to the sign-in, because the three questions exist to
 * build a first card for somebody who has none. A reinstall answering them again
 * before it can reach a sign-in button is a player locked out of their own
 * garage, and it is their garage the screen then waits for instead of a sticker.
 *
 * The car is *declared*, not identified: no vision call happens here and no scan
 * is charged. `addScan` is still what creates it, because it owns the catalogue
 * resolution every other card goes through — a "my car" that resolved its brand
 * differently from a scanned one would quietly break collections.
 *
 * It also spends the free sticker (`FREE_RESTYLE_LIMIT`, one per account for the
 * lifetime of the account). That is the trade this screen makes on purpose: the
 * allowance exists to sell Pro on the *second* click, and the second click is
 * now the first car a player scans themselves, while they have just seen what
 * the first one looks like.
 */

type Step = 'name' | 'brand' | 'model' | 'demo' | 'photo' | 'auth' | 'working' | 'done';

/**
 * Where the demonstration is up to.
 *
 * `cut` is the free sticker, which arrives by itself; `redrawn` is the paid one,
 * which arrives only if the player asks for it. Nothing is generated in either
 * case — the phase picks which of two bundled pictures the card is showing.
 */
type DemoPhase = 'cut' | 'working' | 'redrawn';

interface Line {
  id: string;
  from: 'app' | 'me';
  /**
   * `*asterisks*` mark the words drawn in `colors.highlight` — see `Bubble`.
   * Written as markers inside the copy rather than passed as a separate list of
   * fragments, so every line in this file and in `onboardingBanter` stays a
   * plain readable string.
   */
  text?: string;
  /** A photo answer: the player showing their car rather than typing. */
  photo?: string;
  /**
   * The demonstration card, rather than a bubble.
   *
   * It lives in the transcript instead of in the dock because it is the app
   * *showing* the player something in the middle of a conversation — and because
   * the transcript is what scrolls, so the card cannot end up half off screen
   * above a dock that grew.
   */
  demo?: true;
  /** Stagger, so two lines in a row land like someone talking. */
  delay: number;
}

const OPENING: Line[] = [
  { id: 'hello', from: 'app', text: 'Salut. Ici *CarDex*.', delay: 140 },
  {
    id: 'ask-name',
    from: 'app',
    text: 'Avant de te lâcher dans la rue, trois questions. On commence facile : *c’est quoi ton prénom* ?',
    delay: 460,
  },
];

/**
 * The demonstration, in four beats.
 *
 * Written on somebody else's car on purpose: the player has answered three
 * questions and has nothing in their hands yet, so this is the first thing the
 * app gives rather than asks. `INTRO` replaces the old « Maintenant montre-la
 * moi » — that request moved to `DEMO_EXIT`, after the player has seen what they
 * would get back for it.
 */
const DEMO_INTRO = 'Avant que tu me montres la tienne, regarde ce que je fais *d’une photo*.';

/** Said once the die-cut has landed, and it is what points at the button. */
const DEMO_CUT = [
  'Ça, c’est *gratuit* et automatique, sur chaque voiture que tu scannes.',
  'Maintenant appuie sur *Sublimer*, et regarde la différence.',
];

/**
 * Said once the redraw has landed. It names the price honestly — the paywall
 * arrives minutes later and a demonstration that hid which half was paid would
 * make that arrival feel like a bait.
 */
const DEMO_REDRAWN = [
  'Même voiture, même angle, même couleur — juste *redessinée*. C’est ce que fait « Embellir », avec *CarDex Pro*.',
  'Le sticker découpé, lui, est gratuit et sur *toutes* tes voitures.',
];

/** The request the demo earned, on the way to the photo step. */
const DEMO_EXIT =
  'Allez — *montre-moi la tienne*. Une photo, et je t’en fais un sticker comme celui-là.';

/**
 * What the card says under the sticker it is showing.
 *
 * On the card rather than in a bubble: the bubbles scroll away and this is a
 * label on an object, not a thing somebody said. It is also the only place the
 * free/paid split is stated next to the picture it applies to.
 */
const DEMO_FREE_CAPTION =
  'Sticker découpé sur ton téléphone, en une seconde. Gratuit, sur chaque voiture.';

const DEMO_CAPTION: Record<DemoPhase, string> = {
  cut: DEMO_FREE_CAPTION,
  // Unchanged while the fake generation runs: the veil is over the picture this
  // label describes, and swapping it early would announce the redraw before it
  // exists.
  working: DEMO_FREE_CAPTION,
  redrawn: 'Sticker redessiné par l’IA. Réservé à CarDex Pro.',
};

/**
 * The fake wait, and it is fake: nothing is being generated. Short enough to
 * read as a demo rather than as the real thing, which is why the button's own
 * caption says how long it takes on a real car instead — a demo that pretended
 * to be instant would set up the thirty seconds as a disappointment.
 */
const DEMO_WORKING = [
  'L’IA relit la photo…',
  'Elle redessine la carrosserie…',
  'Vernis, lumière, découpe…',
];

/** Said right before the sign-in step, so it is obvious what it buys. */
const ACCOUNT_GATE =
  'Il me faut juste *un compte* pour la garder au chaud — sinon elle disparaît avec l’appli.';

/**
 * Said to a player who already has an account, on the way straight to the
 * sign-in. The three questions exist to hand a new player their first card; a
 * returning one already owns a garage, and asking them to declare a car they
 * declared months ago before letting them near a sign-in button is a wall.
 */
const RETURNING = [
  'Ah, un habitué.',
  'Connecte-toi et je te *rends ton garage* — les questions, tu y as déjà répondu.',
];

/** Why a generation did not happen, in the app's own voice. Never a dead end. */
/**
 * Why the card is showing a photograph rather than a sticker.
 *
 * One line now instead of five. The sticker is cut out on the device, so none of
 * the old excuses can happen any more — there is no allowance to have spent, no
 * upload to have failed, no key to be missing, and no model to have given up.
 * What is left is the only failure the die-cut has: nothing in the frame it could
 * take to be a car.
 */
const STICKER_EXCUSE: Record<string, string> = {
  no_subject:
    'Je n’ai pas réussi à détacher ta voiture du fond — trop de monde autour, sans doute. Ta photo fait l’affaire, et ta voiture est bien dans ton garage.',
};

/**
 * Resolves an answer exactly the way the garage entry will.
 *
 * Routed through `resolveScan` rather than a local lookup because that is what
 * `addScan` calls: the brand we compliment is then, by construction, the brand
 * the card lands in. A reaction naming a brand the entry failed to match would
 * be the app contradicting itself two taps later.
 */
function resolveDeclared(make: string, model: string) {
  return resolveScan({ make, model, generation: null, year: null, confidence: 1 });
}

/**
 * An answer, trimmed and stripped of the one character the copy reserves.
 *
 * A player's words get interpolated into app lines (`Enchanté *Kevin*.`), and an
 * asterisk typed into the name field would open a highlight run that swallows
 * the rest of the sentence. Stripping here means every marker downstream is ours.
 */
function plain(value: string): string {
  return value.replace(/\*/g, '').trim();
}

/**
 * What the payoff says when there is no card to show.
 *
 * Counting the restored cars out loud is the point of the first case: "ton
 * garage est prêt" over an empty silhouette is exactly what a *failed* restore
 * would also look like, and the returning player has no other way to tell.
 *
 * Which is also why the empty case is split. A player who told us they already
 * have an account and got nothing back has almost always signed in with the
 * other provider — the garage is on the Apple id and they tapped Google — and
 * that is a fixable mistake if we say so instead of showing them an empty room.
 */
function emptyPayoffCopy(returning: boolean, restored: number, name: string): string {
  if (restored === 1) {
    return 'Content de te revoir. Ta voiture t’attend dans le garage, et la rue en a d’autres.';
  }
  if (restored > 1) {
    return `Content de te revoir. Tes ${restored} voitures t’attendent dans le garage, et la rue en a d’autres.`;
  }
  if (returning) {
    return 'Je n’ai rien trouvé sur ce compte. Si ton garage est sur un autre, déconnecte-toi depuis ton profil et reconnecte-toi avec celui-là.';
  }
  return `À toi de jouer, ${name || 'collectionneur'}. Cadre une voiture dans la rue et elle rejoint ton garage.`;
}

/**
 * The restored cars the payoff can put on screen, stickers first.
 *
 * "Tes 3 voitures t'attendent dans le garage" over an empty silhouette asks the
 * player to take our word for it — showing the cars themselves is the proof, and
 * the stickers among them are the things the player *made*, which is why they
 * outrank plain photographs here. Stable sort, so within each group the pull's
 * own recency order survives. Capped because this is a glimpse of the garage,
 * not the garage: the button below is the way in.
 */
function restoredPreview(garage: GarageEntry[]): GarageEntry[] {
  return garage
    .filter((entry) => displayPhoto(entry) != null)
    .sort((a, b) => Number(Boolean(b.styledPhotoUri)) - Number(Boolean(a.styledPhotoUri)))
    .slice(0, PAYOFF_FAN_TILT.length);
}

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const transcript = useRef<ScrollView>(null);
  const nextId = useRef(OPENING.length);

  const [step, setStep] = useState<Step>('name');
  const [lines, setLines] = useState<Line[]>(OPENING);

  const [name, setName] = useState('');
  /**
   * The model step's free-text answer. The brand step needs none: `BrandPicker`
   * owns its own search field, which doubles as its escape hatch.
   */
  const [typed, setTyped] = useState('');
  const [typingFree, setTypingFree] = useState(false);

  const [brand, setBrand] = useState<Brand | null>(null);
  const [make, setMake] = useState('');
  const [car, setCar] = useState<Car | undefined>(undefined);
  const [model, setModel] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [demoPhase, setDemoPhase] = useState<DemoPhase>('cut');
  /**
   * Whether the demonstration card is in the transcript yet.
   *
   * State rather than a ref, because two effects need it: the one that puts the
   * card there — where it also makes the insert idempotent, and the card's id is
   * fixed so a second copy would collide on that key as well as burst twice — and
   * the one that waits for the sticker to land before saying anything about it.
   */
  const [demoShown, setDemoShown] = useState(false);

  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Provider | 'skip' | null>(null);
  const [entryId, setEntryId] = useState<string | undefined>(undefined);
  /**
   * Why there is no sticker on the card, when there is none.
   *
   * State rather than one more `say()`: everything the conversation said is gone
   * by the time the payoff draws, so a refused or failed generation used to end
   * on a card showing the raw photograph with nothing anywhere explaining it —
   * indistinguishable from the feature simply not working.
   */
  const [excuse, setExcuse] = useState<string | null>(null);
  /**
   * The player took the "already have an account" door. It changes what there is
   * to wait for — a garage to pull rather than a sticker to draw — and what the
   * payoff is allowed to claim.
   */
  const [returning, setReturning] = useState(false);
  /** Cars actually pulled back, so the payoff can count them instead of guessing. */
  const [restored, setRestored] = useState(0);

  // Synchronous, so the Apple button is there on the first paint of the sign-in
  // step rather than appearing a frame late — see the note on it in `auth.ts`.
  const appleAvailable = isAppleSignInAvailable();

  const entry = useGarageEntry(entryId);
  // The whole garage, for the returning payoff: the cars `restoreGarage` just
  // merged are the only proof the restore worked that the player can recognise.
  const garage = useGameStore((state) => state.garage);

  const completeOnboarding = useGameStore((state) => state.completeOnboarding);
  const setAccount = useGameStore((state) => state.setAccount);
  const setUsername = useGameStore((state) => state.setUsername);
  const addScan = useGameStore((state) => state.addScan);
  const markSynced = useGameStore((state) => state.markSynced);
  const setDiecut = useGameStore((state) => state.setDiecut);

  useEffect(() => {
    track(events.onboardingStarted);
  }, []);

  // Where the conversation loses people, which is the only thing that would make
  // us cut a question. Fires for `name` on arrival, alongside the start event.
  useEffect(() => {
    track(events.onboardingStepViewed, { step });
  }, [step]);

  const say = useCallback((...texts: string[]) => {
    const items: Line[] = texts.map((text, index) => ({
      id: String(nextId.current++),
      from: 'app',
      text,
      delay: 220 + index * 320,
    }));
    setLines((previous) => [...previous, ...items]);
  }, []);

  const reply = useCallback((text?: string, photo?: string) => {
    const item: Line = { id: String(nextId.current++), from: 'me', text, photo, delay: 0 };
    setLines((previous) => [...previous, item]);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  /** Leaves a step, taking the free-text field with it. */
  const advance = (next: Step) => {
    setTyped('');
    setTypingFree(false);
    setStep(next);
  };

  // ── The demonstration ──────────────────────────────────────────────────────

  /**
   * Puts the card in the transcript, a beat after the line that announced it.
   *
   * Mounted late rather than faded in late, and that distinction is the whole
   * reason this is a timer instead of an `entering` delay: `StickerReveal` starts
   * its burst from a mount effect, so a card that exists but is still invisible
   * would blow the photograph apart behind a fade and hand the player the sticker
   * with no explosion at all.
   */
  useEffect(() => {
    if (step !== 'demo' || demoShown) return;

    const timer = setTimeout(() => {
      setDemoShown(true);
      setLines((previous) => [...previous, { id: 'demo', from: 'app', demo: true, delay: 0 }]);
    }, DEMO_CARD_IN);
    return () => clearTimeout(timer);
  }, [step, demoShown]);

  /**
   * Talks over each sticker once it has actually landed.
   *
   * One rule for both bursts: the card holds its current picture for
   * `motion.reveal`, flashes, and only then is there anything to comment on. A
   * line arriving during the hold would be pointing at the picture the burst is
   * about to destroy.
   *
   * Guarded on the step as well as the phase, so a player who walks out of the
   * demo in the second before these land is not told to press a button that is no
   * longer on screen.
   */
  useEffect(() => {
    if (step !== 'demo' || !demoShown || demoPhase === 'working') return;

    const timer = setTimeout(
      () => say(...(demoPhase === 'cut' ? DEMO_CUT : DEMO_REDRAWN)),
      motion.reveal + motion.flash + motion.base,
    );
    return () => clearTimeout(timer);
  }, [step, demoShown, demoPhase, say]);

  /** The fake generation, which is a timer and nothing else. */
  useEffect(() => {
    if (demoPhase !== 'working') return;
    const timer = setTimeout(() => setDemoPhase('redrawn'), DEMO_WORK_MS);
    return () => clearTimeout(timer);
  }, [demoPhase]);

  const sublimate = () => {
    if (demoPhase !== 'cut') return;
    setDemoPhase('working');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Never a `restyle_*` event: nothing was generated, nothing was billed, and
    // one demo tap per install landing in `restyle_started` would flatten the
    // conversion rate of the paid funnel to nothing. See `events`.
    track(events.onboardingDemoEnhanced, {
      make: ONBOARDING_DEMO.make,
      model: ONBOARDING_DEMO.model,
    });
  };

  /** Both ways out of the demo end on the same request. */
  const leaveDemo = () => {
    say(DEMO_EXIT);
    advance('photo');
  };

  const skipDemo = () => {
    track(events.onboardingDemoSkipped, { phase: demoPhase });
    leaveDemo();
  };

  // ── The three questions ────────────────────────────────────────────────────

  const submitName = () => {
    const value = plain(name);
    if (!value) return;

    // Written to the store now rather than at the end: it is the answer to the
    // first question, and the profile should carry it even if the player closes
    // the app on the second.
    setUsername(value);
    reply(value);
    say(`Enchanté *${value}*.`, 'Et toi, *tu roules en quoi* ?');
    advance('brand');
  };

  /**
   * The way past the three questions, for someone who has answered them before.
   *
   * Goes straight to the same sign-in step the conversation ends on — there is
   * only one, and a second set of buttons somewhere else would be a second thing
   * to keep working. No card is declared, so `build` finds nothing to draw and
   * waits on the garage instead.
   */
  const chooseReturning = () => {
    setReturning(true);
    reply('J’ai déjà un compte');
    say(...RETURNING);
    advance('auth');
    track(events.onboardingReturningChosen);
  };

  const chooseBrand = (picked: Brand | null, label: string) => {
    const value = plain(label);
    if (!value) return;

    // A typed answer still goes through the matcher: "vw" lands in the
    // Volkswagen collection rather than inventing a twenty-sixth brand.
    const resolved = picked ?? resolveDeclared(value, '').brand ?? null;
    setBrand(resolved);
    setMake(resolved?.name ?? value);

    reply(value);
    say(brandReaction(resolved, value), 'Et c’est *quel modèle* ?');
    advance('model');
  };

  const chooseModel = (picked: Car | undefined, label: string) => {
    const value = plain(label);
    if (!value) return;

    const resolved = picked ?? resolveDeclared(make, value).car;
    const chosen = resolved?.model ?? value;
    const spec = carSpecLine(resolved);
    setCar(resolved);
    setModel(chosen);

    reply(value);
    // The request for a photo used to be the third line here. It is `DEMO_EXIT`
    // now, on the far side of the demonstration: asking after showing what comes
    // back is a different question from asking before.
    say(carReaction(resolved, value), ...(spec ? [spec] : []), DEMO_INTRO);
    advance('demo');

    // Fired here rather than at the end: a player who drops out on the photo
    // still told us what they drive, and every unmatched pair is a car our
    // players own that the catalogue cannot name.
    track(events.onboardingCarDeclared, {
      make,
      model: chosen,
      brand_id: resolved?.brandId ?? brand?.id ?? null,
      car_id: resolved?.id ?? null,
      matched: resolved != null,
      brand_matched: (resolved?.brandId ?? brand?.id ?? null) != null,
      raw_model: resolved ? undefined : value,
    });
  };

  // ── The photo ──────────────────────────────────────────────────────────────

  const skipPhoto = () => {
    if (photoUri) return;
    say('Comme tu veux. Tu la scanneras dans la rue, ça compte double en fierté.', ACCOUNT_GATE);
    advance('auth');
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    if (busy) return;
    setBusy(true);

    try {
      // No cropper: on iOS it only ever cuts a square, and a square cut out of a
      // car photo loses the nose or the tail — the two things that make the
      // sticker recognisable as that car.
      const picked = await pickImage(source, { crop: false });

      if (picked.status === 'denied') {
        say(
          'Sans l’appareil photo je ne peux rien dessiner. Prends-en une dans ta galerie à la place.',
        );
        return;
      }
      if (picked.status === 'unavailable') {
        say('Impossible d’ouvrir tes photos sur cette version. On verra ça dans le garage.');
        skipPhoto();
        return;
      }
      if (picked.status !== 'picked') return;

      breadcrumb('onboarding: preparing the photo');
      const photo = await preparePhoto(picked.uri);
      setPhotoUri(photo.uri);
      reply(undefined, photo.uri);
      say(
        'Voilà donc la bête. Je te la *découpe en sticker*, ça prend une seconde.',
        ACCOUNT_GATE,
      );
      advance('auth');
    } catch (error) {
      captureError(error, { stage: 'onboarding_photo' });
      say('Cette photo n’est pas passée. Réessaie, ou on verra ça plus tard.');
    } finally {
      setBusy(false);
    }
  };

  // ── The sticker, then the account ──────────────────────────────────────────

  /**
   * Everything that happens once there is an account: the card, the sticker, the
   * push, the restore. Sequential on purpose — each step needs what the one
   * before it produced, and the player is watching a single line of progress.
   *
   * The order used to be the other way round, because the sticker was an image
   * model behind an authenticated edge function and needed the pushed row before
   * it could run. It is cut out on the device now, so it comes first: it is the
   * one step that cannot fail for a network reason, and it is the payoff.
   *
   * That reordering also cost the restore its cover. `restoreGarage` used to be
   * fired without being awaited and ride along inside the thirty seconds the
   * image model took; with those seconds gone there is nothing left to hide it
   * behind, so it is awaited outright below — on every path, not just the one
   * without a card.
   */
  const build = async (account: Account) => {
    setStep('working');

    // No photo means no card: see the note at the top of the file. The account
    // work below still has to happen — a returning player who skipped the photo
    // is exactly the player whose garage needs restoring.
    const created = photoUri
      ? // No vision call and no scan charged — the player is the source. The
        // resolution still goes through the store so this card lands in the
        // same collection a scanned one would.
        addScan(
          { make, model, generation: car?.generation ?? null, year: null, confidence: 1 },
          photoUri,
        )
      : null;

    if (created && photoUri) {
      setEntryId(created.id);

      // Not narrated, because there is nothing to narrate: by the time a line
      // like « laisse-moi une trentaine de secondes » had been read, the sticker
      // would already be sitting behind it.
      const diecut = await createDiecut(photoUri);
      if (diecut) setDiecut(created.id, diecut);
      else setExcuse(STICKER_EXCUSE.no_subject);
    }

    // A local account has no server to push to. It *does* get its sticker now —
    // the die-cut never needed one — which is the first time this ending has
    // handed the player a card that looks like everybody else's.
    if (account.provider === 'local') {
      setStep('done');
      return;
    }

    if (created) {
      try {
        breadcrumb('onboarding: pushing the first entry');
        const pushed = await pushEntry(account.id, created);
        if (pushed) markSynced(created.id, pushed.remoteId, pushed.photoPath);
        else track(events.syncFailed, { stage: 'push_entry', source: 'onboarding' });
      } catch (error) {
        captureError(error, { stage: 'onboarding_push' });
      }
    }

    // Awaited, and started only now: `restoreGarage` pushes everything unsynced,
    // so kicking it off before `markSynced` would race our own insert and hand a
    // returning player two copies of the car they just declared.
    //
    // The `await` is what changed. It used to be fired and left running on the
    // card path, because the payoff was thirty seconds away and the restore
    // finished inside them; now the payoff is two hundred milliseconds away, and
    // a screen that announced « ton garage est revenu » while the fetch was still
    // in flight would be counting cars it did not have yet.
    try {
      breadcrumb('onboarding: restoring the garage');
      const result = await restoreGarage(account.id);
      track(events.garageRestored, result);
      setRestored(result?.pulled ?? 0);
    } catch (error) {
      captureError(error, { stage: 'restore_garage' });
    }

    setStep('done');
  };

  const finish = async (account: Account) => {
    setAccount(account.id, account.email, account.provider);
    // Apple's `suggestedName` is deliberately ignored now: the player typed
    // their own name as the very first thing they did, and overwriting it with
    // the name on their Apple ID would undo the one answer given by hand.
    identify(account.id, {
      provider: account.provider,
      // Not the address: whether a provider hands one over is what tells us if
      // Apple's private relay costs us the ability to contact anyone.
      has_email: Boolean(account.email),
      apple_available: appleAvailable,
    });
    track(events.signedIn, { provider: account.provider, has_email: Boolean(account.email) });

    completeOnboarding();
    track(events.onboardingCompleted, {
      provider: account.provider,
      // Both values mean "skipped": `anonymous` on a configured project,
      // `local` only when there is none, or when anonymous sign-ins are off.
      skipped_account: account.provider === 'local' || account.provider === 'anonymous',
      brand_id: brand?.id ?? null,
      car_id: car?.id ?? null,
      matched: car != null,
      has_photo: photoUri != null,
      // A reinstall completing onboarding is not an acquisition, and averaging the
      // two hides both.
      returning,
    });

    // The account is made and onboarding is over; whatever happens to the card
    // from here, the player must not be sent back to the sign-in buttons.
    try {
      await build(account);
    } catch (error) {
      captureError(error, { stage: 'onboarding_build' });
      setStep('done');
    }
  };

  const run = async (key: Provider | 'skip', task: () => Promise<Account>) => {
    setPending(key);
    track(events.signInStarted, { provider: key });
    try {
      await finish(await task());
    } catch (error: any) {
      // Backing out of the Apple sheet is not a failure worth an alert.
      if (error instanceof SignInCancelled) {
        track(events.signInCancelled, { provider: key });
      } else {
        // Both, on purpose: the event is what a funnel counts, the exception is
        // what says why — a refused Apple token and a dead network fail
        // identically from here.
        track(events.signInFailed, { provider: key, reason: error?.message });
        captureError(error, { stage: 'sign_in', provider: key });
        Alert.alert('Connexion impossible', error?.message ?? 'Réessaie dans un instant.');
      }
    } finally {
      setPending(null);
    }
  };

  /**
   * Skipping has to stay possible — requiring an account would fall foul of
   * Guideline 5.1.1(i) — but it cannot mean "no server account".
   * `continueWithoutAccount` creates an anonymous Supabase user, which is what
   * both the scan endpoint and the sticker need; see the note on it.
   */
  const onSkip = () => run('skip', continueWithoutAccount);

  // ── The payoff ─────────────────────────────────────────────────────────────

  if (step === 'done') {
    const photo = entry ? displayPhoto(entry) : null;
    const sticker = Boolean(entry && isSticker(entry, photo));
    const accent = entry ? rarityColor(entry.rarity) : colors.accent;
    const preview = !entry && restored > 0 ? restoredPreview(garage) : [];

    const overline = entry
      ? 'Ta première carte'
      : restored > 0
        ? 'Ton garage est revenu'
        : returning
          ? 'Rien à récupérer'
          : 'Ton garage est prêt';

    /**
     * Leaves through the door, into the garage — not into the paywall.
     *
     * "Entrer dans mon garage" used to land on a price list, which made
     * dismissing one the first thing a player did with the app and the last thing
     * they did with the sticker they had just been given. The offer follows them
     * in a few seconds later instead; both requests travel in module flags,
     * because this screen is gone by the time the garage mounts.
     */
    const leave = () => {
      armGarageDoor();
      armWelcomePaywall();
      router.replace('/(tabs)');
    };

    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.payoff, { paddingTop: insets.top + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.glow} pointerEvents="none">
          <Glow color={accent} width={PAYOFF_GLOW} />
        </View>

        <Animated.View entering={FadeIn.duration(motion.base)}>
          <Text variant="overline" tone="tertiary" uppercase center>
            {overline}
          </Text>
        </Animated.View>

        {/* No card without a photo, and no empty frame either: a bordered plate
            around a silhouette reads as a card that failed to load. A returning
            player gets the next best thing to a card — the cars the restore
            just brought back. */}
        {entry ? (
          <Animated.View
            entering={ZoomIn.delay(80).duration(motion.reveal)}
            style={[styles.card, { borderColor: withAlpha(accent, 0.27) }]}
          >
            {/* The photograph is held, blown apart, and the sticker lands in the
                hole. `originalPhoto` rather than the resolved picture, because
                the whole point is showing what it *was* first. */}
            <StickerReveal
              before={originalPhoto(entry)}
              after={sticker ? photo : null}
              accent={accent}
              radius={radii.xl}
              style={styles.media}
            />

            <View style={styles.cardBody}>
              <Text variant="label" tone="secondary" uppercase>
                {entry.make}
              </Text>
              <Text variant="title">{entry.model}</Text>
              <View style={styles.cardRow}>
                <RarityTag rarity={entry.rarity} size="md" />
                <Text variant="label" tone="tertiary">
                  +{entry.xp} XP
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : preview.length ? (
          /* The returning player's cars, back from the server — stickers loose
             on the canvas, photographs on their plate, exactly the rule the
             garage grid draws them by. Fanned rather than gridded: this is the
             garage waving through the door, not the garage. */
          <View style={styles.fan}>
            {preview.map((item, index) => {
              const face = displayPhoto(item);
              if (!face) return null;
              const cut = isSticker(item, face);
              return (
                <Animated.View
                  key={item.id}
                  entering={ZoomIn.delay(120 + index * 140).duration(motion.reveal)}
                  style={[
                    styles.fanItem,
                    { transform: [{ rotate: `${PAYOFF_FAN_TILT[index]}deg` }] },
                  ]}
                >
                  <View style={[styles.fanPlate, cut && styles.fanPlateSticker]}>
                    {/* Clipping is for a photo bleeding to the plate's edge; on
                        the plate itself it would eat the shadow. */}
                    <View style={[styles.fanClip, cut && styles.fanClipOpen]}>
                      <Image
                        source={{ uri: face }}
                        style={[StyleSheet.absoluteFill, cut && styles.fanSticker]}
                        // A die-cut sticker cropped to fill is a die-cut sticker
                        // with its edge cut off.
                        contentFit={cut ? 'contain' : 'cover'}
                        transition={220}
                      />
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        ) : (
          <Animated.View entering={FadeIn.delay(80).duration(motion.slow)} style={styles.emptyArt}>
            <CarSilhouette width={PAYOFF_SILHOUETTE} color={colors.silhouette} />
          </Animated.View>
        )}

        {/* Why the card is showing a photograph rather than a sticker. Under the
            card, because that is the thing it is about — and never a dead end:
            every one of these lines points at the fiche, where the button is. */}
        {excuse ? (
          <Animated.View
            entering={FadeInDown.delay(300).duration(motion.base)}
            style={styles.excuse}
          >
            <Text variant="caption" tone="tertiary" center>
              {excuse}
            </Text>
          </Animated.View>
        ) : null}

        <Animated.View
          entering={FadeInDown.delay(360).duration(motion.base)}
          style={styles.payoffCopy}
        >
          <Text variant="body" tone="secondary" center>
            {entry
              ? `Elle est à toi, ${name || 'collectionneur'}. Maintenant chaque voiture que tu croises dans la rue peut rejoindre celle-là.`
              : emptyPayoffCopy(returning, restored, name)}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(440).duration(motion.base)}
          style={[styles.payoffFooter, { paddingBottom: insets.bottom + spacing.xl }]}
        >
          <Button label="Entrer dans mon garage" size="lg" onPress={leave} />
        </Animated.View>
      </ScrollView>
    );
  }

  // ── The conversation ───────────────────────────────────────────────────────

  const models = brand ? (CARS_BY_BRAND[brand.id] ?? []) : [];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={transcript}
        style={styles.transcript}
        contentContainerStyle={[styles.lines, { paddingTop: insets.top + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => transcript.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {lines.map((line) =>
          line.demo ? (
            <DemoCard key={line.id} phase={demoPhase} />
          ) : (
            <Bubble key={line.id} line={line} />
          ),
        )}

        {step === 'working' ? (
          <Working label={returning ? 'Je récupère ton garage…' : 'Je découpe ta voiture…'} />
        ) : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + spacing.lg }]}>
        {step === 'name' ? (
          <>
            <FreeText
              value={name}
              onChange={setName}
              onSubmit={submitName}
              placeholder="Ton prénom"
              maxLength={22}
            />

            {/* The returning player's door, and it has to be on the very first
                step: the questions build a card for someone who does not have one
                yet, and a reinstall that has to answer all three before it can
                reach a sign-in button is a player locked out of their own garage.
                Ghost and set apart, because for everyone else it is not the
                answer to the question on screen. */}
            <Button
              label="J’ai déjà un compte"
              variant="ghost"
              size="md"
              onPress={chooseReturning}
              style={styles.skip}
            />
          </>
        ) : null}

        {step === 'brand' ? (
          <BrandPicker
            onPick={(picked) => chooseBrand(picked, picked.name)}
            onFree={(label) => chooseBrand(null, label)}
          />
        ) : null}

        {/* No catalogue for the brand means no chips to show, so the field is
            the only control — the same one the "Autre modèle" chip reveals. */}
        {step === 'model' ? (
          <View style={styles.stack}>
            {models.length && !typingFree ? (
              <View style={styles.chips}>
                {models.map((item) => (
                  <Chip
                    key={item.id}
                    label={item.model}
                    onPress={() => chooseModel(item, item.model)}
                  />
                ))}
                <Chip label="Autre modèle" muted onPress={() => setTypingFree(true)} />
              </View>
            ) : (
              <FreeText
                value={typed}
                onChange={setTyped}
                onSubmit={() => chooseModel(undefined, typed)}
                placeholder="Ton modèle"
                maxLength={30}
              />
            )}
          </View>
        ) : null}

        {/* Nothing to press until the card is on screen: a « Sublimer » button
            sitting under a transcript that has not shown the sticker yet is a
            button for a picture nobody has seen. */}
        {step === 'demo' && demoShown ? (
          <Animated.View entering={FadeInDown.duration(motion.base)}>
            {demoPhase === 'redrawn' ? (
              <Button label="Montrer ma voiture" size="lg" onPress={leaveDemo} />
            ) : (
              <>
                <Button
                  label={demoPhase === 'working' ? 'L’IA dessine…' : 'Sublimer ce sticker'}
                  // The real thing takes half a minute and this demo takes two
                  // seconds, so the caption is where the honest number goes —
                  // otherwise the first real « Embellir » reads as a regression.
                  caption={
                    demoPhase === 'working'
                      ? undefined
                      : 'Une trentaine de secondes sur ta voiture'
                  }
                  onPress={sublimate}
                  loading={demoPhase === 'working'}
                />

                {/* Only in `cut`: skipping mid-generation would leave the fake
                    wait running behind a screen the player has left. */}
                {demoPhase === 'cut' ? (
                  <Button
                    label="Passer"
                    variant="ghost"
                    size="md"
                    onPress={skipDemo}
                    style={styles.skip}
                  />
                ) : null}
              </>
            )}
          </Animated.View>
        ) : null}

        {step === 'photo' ? (
          <View style={styles.actions}>
            <Button
              label="Prendre la photo"
              caption="Toute la voiture dans le cadre"
              onPress={() => addPhoto('camera')}
              loading={busy}
            />
            <Button
              label="Choisir dans mes photos"
              variant="secondary"
              size="md"
              onPress={() => addPhoto('library')}
              disabled={busy}
            />
            <Button
              label="Plus tard"
              variant="ghost"
              size="md"
              onPress={skipPhoto}
              disabled={busy}
            />
          </View>
        ) : null}

        {step === 'auth' ? (
          <Animated.View entering={FadeInDown.duration(motion.base)}>
            <View style={styles.actions}>
              {/* Apple's own button: its wording, logo and proportions are part
                  of what the review checks, so it is not restyled — only the one
                  choice Apple leaves us. BLACK, because the canvas is white now:
                  the WHITE style dates from the black canvas and rendered as an
                  invisible plate, and black also matches every other primary
                  action in the app. */}
              {appleAvailable ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radii.md}
                  style={styles.appleButton}
                  onPress={() => run('apple', signInWithApple)}
                />
              ) : null}

              <Button
                label="Continuer avec Google"
                variant={appleAvailable ? 'secondary' : 'primary'}
                onPress={() => run('google', () => signIn('google'))}
                loading={pending === 'google'}
                disabled={pending !== null}
              />
            </View>

            {/* Set apart, not stacked: it is the way *past* the two accounts,
                not a third one, and a ghost button sitting in the same rhythm as
                them reads as an equal option. */}
            <Button
              label="Continuer sans compte"
              variant="ghost"
              size="md"
              onPress={onSkip}
              loading={pending === 'skip'}
              disabled={pending !== null}
              style={styles.skip}
            />
          </Animated.View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * One turn of the conversation.
 *
 * Two things carry the colour, and both exist so the player can tell at a glance
 * what is being asked of them: the words between `*asterisks*`, and the tint on
 * a bubble that ends in a question mark. A screen of identical grey bubbles
 * reads as a story to skim; one tinted bubble reads as a question to answer.
 */
function Bubble({ line }: { line: Line }) {
  const mine = line.from === 'me';
  const asks = !mine && Boolean(line.text?.trimEnd().endsWith('?'));

  // Odd indices are the captured runs — `split` on a capturing group alternates
  // plain text and match.
  const parts = (line.text ?? '').split(/\*([^*]+)\*/g);

  return (
    <Animated.View
      entering={FadeInDown.delay(line.delay).duration(motion.base)}
      style={[
        styles.bubble,
        mine ? styles.bubbleMine : styles.bubbleApp,
        asks && styles.bubbleAsk,
      ]}
    >
      {line.photo ? (
        <Image
          source={{ uri: line.photo }}
          style={styles.bubblePhoto}
          contentFit="cover"
          transition={220}
        />
      ) : (
        <Text variant="body" color={mine ? colors.textInverted : colors.text}>
          {parts.map((part, index) =>
            index % 2 === 1 ? (
              <Text
                key={index}
                variant="bodyMedium"
                color={mine ? colors.textInverted : colors.highlight}
              >
                {part}
              </Text>
            ) : (
              part
            ),
          )}
        </Text>
      )}
    </Animated.View>
  );
}

/**
 * The demonstration, as a card in the middle of the conversation.
 *
 * It is built out of the same pieces as a real one — `StickerReveal`, the rarity
 * tag, the XP line — because the point is that the player recognises this card
 * again ten seconds later holding their own. Twice over, so the free half and the
 * paid half are the same object changing rather than two screens:
 *
 * - `cut` blows the *photograph* apart and lands the die-cut. That is the scan,
 *   compressed: it happens by itself, and it is what every car will look like.
 * - `redrawn` blows the *die-cut* apart and lands the redraw, which is why
 *   `beforeFit` exists — a sticker cropped to fill loses the white edge that
 *   makes it one.
 *
 * Nothing here is generated. All three pictures ship in the bundle; see
 * `src/data/onboardingDemo.ts`.
 */
function DemoCard({ phase }: { phase: DemoPhase }) {
  const accent = rarityColor(ONBOARDING_DEMO.rarity);
  const redrawn = phase === 'redrawn';

  // Same slow breathing as the scanner and the restyle screen, over the picture
  // that is about to be replaced.
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (phase !== 'working') return;
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [phase, sweep]);
  const sweepStyle = useAnimatedStyle(() => ({ opacity: 0.2 + sweep.value * 0.4 }));

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.base)}
      style={[styles.demoCard, { borderColor: withAlpha(accent, 0.27) }]}
    >
      <View style={styles.demoMedia}>
        {/* Remounted between the two phases on purpose: `StickerReveal` plays its
            burst from a mount effect, so the second reveal needs a new instance
            rather than new props. */}
        <StickerReveal
          key={redrawn ? 'redrawn' : 'cut'}
          before={redrawn ? ONBOARDING_DEMO.diecut : ONBOARDING_DEMO.photo}
          after={redrawn ? ONBOARDING_DEMO.redraw : ONBOARDING_DEMO.diecut}
          beforeFit={redrawn ? 'contain' : 'cover'}
          accent={accent}
          radius={radii.xl}
        />

        {phase === 'working' ? (
          <>
            <Animated.View style={[styles.demoVeil, sweepStyle]} pointerEvents="none" />
            <View style={styles.demoWorking} pointerEvents="none">
              <DemoWorking />
            </View>
          </>
        ) : null}

        {/* Said on the picture, not in a bubble: the bubbles scroll away, and a
            card the player might mistake for a car they own must carry the word
            « exemple » for as long as it is on screen. */}
        <View style={styles.demoPill}>
          <Text variant="overline" tone="secondary" uppercase>
            Exemple
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text variant="label" tone="secondary" uppercase>
          {ONBOARDING_DEMO.make}
        </Text>
        <Text variant="title">{ONBOARDING_DEMO.model}</Text>
        <View style={styles.cardRow}>
          <RarityTag rarity={ONBOARDING_DEMO.rarity} size="md" />
          <Text variant="label" tone="tertiary">
            +{ONBOARDING_DEMO.xp} XP
          </Text>
        </View>
        <Text variant="caption" tone="tertiary" style={styles.demoCaption}>
          {DEMO_CAPTION[phase]}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * The fake work, one line at a time.
 *
 * Advances so the last line is still on screen when the burst arrives, and does
 * not loop: the whole thing lasts `DEMO_WORK_MS`, and a list coming round twice
 * inside two seconds reads as a stutter.
 */
function DemoWorking() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => Math.min(current + 1, DEMO_WORKING.length - 1)),
      DEMO_WORK_MS / DEMO_WORKING.length,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <Animated.View key={index} entering={FadeIn.duration(motion.fast)}>
      <Text variant="caption" tone="secondary" center>
        {DEMO_WORKING[index]}
      </Text>
    </Animated.View>
  );
}

/**
 * The wait, whatever is being waited on — the image model drawing, or a garage
 * coming back down the wire. Half a minute is long enough that a static line
 * reads as a frozen app, hence the same slow breathing as the scanner.
 */
function Working({ label }: { label: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: 0.3 + pulse.value * 0.7 }));

  return (
    <Animated.View
      entering={FadeIn.duration(motion.base)}
      style={[styles.bubble, styles.bubbleApp]}
    >
      <Animated.View style={style}>
        <Text variant="body" tone="secondary">
          {label}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/** A one-line answer plus its confirm button, the same shape at every step. */
function FreeText({
  value,
  onChange,
  onSubmit,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  maxLength: number;
}) {
  return (
    <View style={styles.field}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.text}
        returnKeyType="done"
        style={styles.input}
      />
      <Button label="Continuer" onPress={onSubmit} disabled={!value.trim()} />
    </View>
  );
}

function Chip({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, muted && styles.chipMuted]}
    >
      <Text variant="bodyMedium" tone={muted ? 'tertiary' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * How long after the line announcing it the demonstration card appears.
 *
 * `say()` staggers its lines 320 ms apart from a 220 ms head start, and the line
 * that introduces the demo is the third of three — so this is that last line,
 * plus a beat to read it.
 */
const DEMO_CARD_IN = 220 + 2 * 320 + 320;
/** How long the fake generation takes. See `DEMO_WORKING`. */
const DEMO_WORK_MS = 2400;

const PAYOFF_GLOW = 520;
const PAYOFF_SILHOUETTE = 180;
/** One tilt per card in the restored fan — its length is also the cap. */
const PAYOFF_FAN_TILT = [-7, 4, -3];
const PAYOFF_FAN_CARD = 124;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  transcript: {
    flex: 1,
  },
  lines: {
    // Bottom-anchored, like every conversation: `flexGrow` lets the short early
    // transcript sit just above the dock instead of hanging from the status bar,
    // and stops mattering as soon as the content is taller than the viewport.
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: gutter,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  bubbleApp: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radii.sm,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderBottomRightRadius: radii.sm,
  },
  /** The bubble holding a question the player has to answer right now. */
  bubbleAsk: {
    backgroundColor: withAlpha(colors.highlight, 0.09),
  },
  bubblePhoto: {
    width: 132,
    height: 132,
    borderRadius: radii.md,
  },
  dock: {
    paddingHorizontal: gutter,
    paddingTop: spacing.lg,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stack: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.md,
  },
  input: {
    ...type.title,
    fontFamily: fonts.semibold,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  chipMuted: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  actions: {
    gap: spacing.md,
  },
  appleButton: {
    height: 54,
    width: '100%',
  },
  skip: {
    marginTop: spacing.xl,
  },

  // ── The demonstration ─────────────────────────────────────────────────────
  /**
   * Full width, unlike a bubble: this is the app putting an object on the table
   * rather than saying something, and 84% of the transcript would read as a
   * screenshot somebody pasted into the chat.
   */
  demoCard: {
    alignSelf: 'stretch',
    marginVertical: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    // No `overflow: hidden`: the burst inside `StickerReveal` is supposed to
    // escape the card, and the picture rounds its own top corners.
  },
  demoMedia: {
    width: '100%',
  },
  demoVeil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  demoWorking: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  demoPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: withAlpha(colors.bg, 0.82),
  },
  demoCaption: {
    marginTop: spacing.sm,
  },

  // ── Payoff ────────────────────────────────────────────────────────────────
  payoff: {
    flexGrow: 1,
    paddingHorizontal: gutter,
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    top: -PAYOFF_GLOW * 0.25,
    alignSelf: 'center',
  },
  card: {
    width: '100%',
    marginTop: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    // No `overflow: hidden`, deliberately: the burst inside `StickerReveal` is
    // supposed to escape the card. The picture rounds its own top corners.
  },
  media: {
    width: '100%',
  },
  emptyArt: {
    marginTop: spacing.xxxl,
    alignItems: 'center',
  },
  fan: {
    marginTop: spacing.xxxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanItem: {
    width: PAYOFF_FAN_CARD,
    height: PAYOFF_FAN_CARD,
    // Overlapping like stickers slapped on a case, not cells in a grid.
    marginHorizontal: -spacing.md,
  },
  fanPlate: {
    flex: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  /**
   * Same rule as the garage grid: a sticker is already an object with its own
   * outline, and a grey plate behind it puts it back in the box the die-cut
   * took it out of. The shadow moves onto the image, where it follows the
   * silhouette.
   */
  fanPlateSticker: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  fanClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  fanClipOpen: {
    overflow: 'visible',
  },
  fanSticker: {
    ...shadow.card,
  },
  cardBody: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  excuse: {
    marginTop: spacing.lg,
    maxWidth: 320,
  },
  payoffCopy: {
    marginTop: spacing.xl,
    maxWidth: 320,
  },
  payoffFooter: {
    width: '100%',
    marginTop: 'auto',
    paddingTop: spacing.xl,
  },
});
