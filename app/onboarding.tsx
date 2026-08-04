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
import { persistStyledPhoto, pickImage, preparePhoto } from '../src/services/photo';
import { restoreGarage } from '../src/services/restoreGarage';
import { RestyleError, restyleAvailable, restylePhoto } from '../src/services/restyle';
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

type Step = 'name' | 'brand' | 'model' | 'photo' | 'auth' | 'working' | 'done';

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
const STICKER_EXCUSE: Record<string, string> = {
  limit: 'Ton sticker offert est déjà passé — mais ta voiture, elle, est bien dans ton garage.',
  not_synced:
    'Je n’ai pas réussi à mettre ta photo à l’abri. Ta voiture est dans ton garage, le sticker t’attend sur sa fiche.',
  network:
    'Réseau coupé au mauvais moment. Ta voiture est dans ton garage, tu pourras retenter le sticker depuis sa fiche.',
  failed:
    'Mon crayon a dérapé sur ce coup-là. Ta voiture est dans ton garage — retente le sticker depuis sa fiche, ça ne t’a rien coûté.',
  unconfigured:
    'Les stickers ne sont pas dispos sur cette version. Ta voiture est dans ton garage.',
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
  const setStyledPhoto = useGameStore((state) => state.setStyledPhoto);
  const consumeRestyle = useGameStore((state) => state.consumeRestyle);
  const isPro = useGameStore((state) => state.isPro);

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
    say(
      carReaction(resolved, value),
      ...(spec ? [spec] : []),
      'Maintenant *montre-la moi*. Une photo, et je t’en fais un *sticker de collection*.',
    );
    advance('photo');

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
        'Voilà donc la bête. Je te la transforme en sticker, *cadeau de bienvenue*.',
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

  // ── Account, then the sticker ──────────────────────────────────────────────

  /**
   * Everything that happens once there is an account: the card, the push, the
   * sticker. Sequential on purpose — each step needs what the one before it
   * produced, and the player is watching a single line of progress.
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

    if (created) {
      setEntryId(created.id);
      say('C’est parti. Laisse-moi *une trentaine de secondes*.');
    }

    // A local account has no server to push to, and so no sticker either. The
    // app has to run with an empty `.env`, so this is a supported ending.
    if (account.provider === 'local') {
      setStep('done');
      return;
    }

    let remoteId: string | null = null;
    if (created) {
      try {
        breadcrumb('onboarding: pushing the first entry');
        const pushed = await pushEntry(account.id, created);
        if (pushed) {
          markSynced(created.id, pushed.remoteId, pushed.photoPath);
          remoteId = pushed.remoteId;
        } else {
          track(events.syncFailed, { stage: 'push_entry', source: 'onboarding' });
        }
      } catch (error) {
        captureError(error, { stage: 'onboarding_push' });
      }
    }

    // Started only now: `restoreGarage` pushes everything unsynced, so kicking it
    // off before `markSynced` would race our own insert and hand a returning
    // player two copies of the car they just declared.
    const restore = restoreGarage(account.id)
      .then((result) => {
        track(events.garageRestored, result);
        return result;
      })
      .catch((error) => {
        captureError(error, { stage: 'restore_garage' });
        return null;
      });

    // With no card to draw there is nothing else coming, and the payoff is about
    // to tell the player their garage is back — so this is the one path that
    // waits for it. Behind a card, the sticker call is the wait and the restore
    // rides along inside it.
    if (!created) {
      const result = await restore;
      setRestored(result?.pulled ?? 0);
      setStep('done');
      return;
    }

    // The allowance is deliberately *not* pre-checked here. `begin_restyle()`
    // owns it and refuses before the image call, so asking costs a round trip and
    // never a generation — whereas `restylesLeft` is a per-device mirror that
    // knows nothing about the account that signed in three lines ago. It is the
    // wrong authority at exactly the moment the account is new.
    if (!restyleAvailable || !remoteId) {
      setExcuse(restyleAvailable ? STICKER_EXCUSE.not_synced : STICKER_EXCUSE.unconfigured);
      setStep('done');
      return;
    }

    const startedAt = Date.now();
    track(events.restyleStarted, {
      source: 'onboarding',
      is_pro: isPro,
      already_styled: false,
      rarity: created.rarity,
    });

    try {
      breadcrumb('onboarding: calling the image model');
      const result = await restylePhoto(remoteId);
      // The signed URL expires tomorrow, and this picture is now the card's face.
      const uri = await persistStyledPhoto(result.uri, result.path);

      setStyledPhoto(created.id, uri, result.path);
      consumeRestyle();
      track(events.restyleSucceeded, {
        source: 'onboarding',
        make: created.make,
        model: created.model,
        rarity: created.rarity,
        is_pro: isPro,
        duration_ms: Date.now() - startedAt,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (caught) {
      const code = caught instanceof RestyleError ? caught.code : 'network';

      if (code === 'limit') {
        track(events.restyleBlockedByLimit, { source: 'onboarding' });
        // The server is the authority and it just said the allowance is spent, so
        // the mirror says so too. Without this the fiche would keep advertising a
        // free sticker that answers 402 on every tap.
        consumeRestyle();
      } else {
        track(events.restyleFailed, {
          source: 'onboarding',
          code,
          is_pro: isPro,
          duration_ms: Date.now() - startedAt,
        });
        captureError(caught, { stage: 'onboarding_restyle', code });
      }

      setExcuse(STICKER_EXCUSE[code] ?? STICKER_EXCUSE.network);
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
        {lines.map((line) => (
          <Bubble key={line.id} line={line} />
        ))}

        {step === 'working' ? (
          <Working label={returning ? 'Je récupère ton garage…' : 'Je dessine ta voiture…'} />
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
