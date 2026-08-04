# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

Things that already bit us on SDK 57 / RN 0.86:

- `StyleSheet.absoluteFillObject` is gone. Spread `StyleSheet.absoluteFill`.
- `expo-file-system` is class-based: `new File(...)`, `new Directory(...)`, `Paths.document`.
  `copy`/`move` are async. The old namespace lives at `expo-file-system/legacy`.
- `expo-image-manipulator` is context-based: `ImageManipulator.manipulate(uri)` →
  chain `.resize()` → `await renderAsync()` → `await saveAsync({ base64: true })`.
- `babel-preset-expo` must be a root devDependency once a `babel.config.js` exists,
  otherwise Metro cannot resolve it (it only ships nested under `expo/`).
- Reanimated 4 needs `react-native-worklets` installed and its babel plugin last.

# CarDex conventions

- **Never hardcode a style value.** Everything comes from `src/theme` —
  `colors`, `type`, `spacing`, `radii`, `motion`, `gutter`.
- **Grids use `gridItemWidth(n)`**, never percentages. Percentage widths round up
  past 100% and the row silently collapses to one column.
- **The *identification* prompt returns only** `make`, `model`, `generation`,
  `year`, `confidence`. Its answers feed `match_car_id()`, and a prompt that also
  produced specs would be a prompt whose make and model drift. Do not extend it.
  Specs come from `src/data/cars.ts`.
- **A car the catalogue does not list gets rated by a second, separate model
  call**, and the answer is stored in `discovered_cars` — written once, served
  verbatim to everyone who scans that car afterwards, so two players never get
  different XP for the same Pagani. Three rules hold it together:
  - It is **not** a row in `public.cars`. That table is regenerated from
    `seed.sql`, and a discovered car must never enlarge a brand's collection —
    otherwise a player who completed Ferrari watches the badge come off because
    someone else found one more. `stats.ts` counts collections by `carId` alone,
    which is what keeps this true; keep it that way.
  - The rating call carries **no image** and runs at temperature 0. Rarity is a
    property of the model, not of the photograph, or the same car scores
    differently in different light.
  - A fiche is **capped at `epic`** (`proposed_rarity` keeps what the model
    asked for) and stays `pending`, visible only to its discoverer, until a
    second *independent* scan agrees on make + model. Legendary is granted by
    review, never on the word of one photo.
- **A rated car costs a scan; an unrated one does not.** Both `identify-car` and
  the client mirror in `scan.tsx` charge on `car_id || discovered`. What stays
  free is the case we cannot answer at all — that is our catalogue gap, not the
  player's. XP is frozen on the garage entry at discovery, so correcting a fiche
  later never rewrites what a player already earned.
- **`revoke execute` must name all three: `from public, anon, authenticated`.**
  Two independent grants exist and each looks sufficient alone. Postgres grants
  execute to PUBLIC on every new function, which the two roles inherit, so
  naming only them is a no-op. Supabase *also* ships `alter default privileges
  … grant execute on functions to anon, authenticated, service_role`, so a
  hosted project carries an explicit grant that `from public` alone leaves
  intact. Both mistakes shipped here in turn, and the second one reached
  production: an anon key POSTing `/rest/v1/rpc/record_discovered_car` got a 200
  and wrote a fiche.
- **A local Postgres cannot prove a revoke.** The test harness has no default
  privileges, so `from public` gave a convincing `permission denied` there while
  production stayed wide open. Verify against the deployed project with the anon
  key — a 42501 from the real REST endpoint, or it is not closed.
- **`security definer` functions ignore RLS**, so a policy on a table protects
  nothing that a definer function returns. `find_discovered_car` would have
  handed any client another player's `pending` fiche despite the policy. Either
  revoke the function from clients, or do not make it definer.
- **Collection progress and badges are derived**, never stored. If you find
  yourself adding an `unlocked_badges` table, recompute from `garage` instead.
- **Every external service degrades to a no-op** when its key is missing, so the
  app always runs with an empty `.env`. Keep that property.
- **The free-scan limit is enforced twice**: client-side for UX, and in Postgres
  so it cannot be bypassed. Server side it is two-phase — `begin_scan()` before
  the model call (refuse early, never pay for a request we'd reject), then
  `commit_scan()` only if the result matched the catalogue. An uncatalogued car
  is our gap, so it never costs the player a scan.
- **`restyle-photo` generates a sticker, and takes an entry id, never an image.**
  It reads the stored photo from the `scans` bucket itself and builds the prompt
  server-side. A function that rendered whatever bytes it was handed, on whatever
  prompt it was given, is an open image generator billed to us — the ownership
  check on `garage` is what bounds the feature to a player's own cars. The
  consequence is that an entry must be synced before it can be rendered; the
  client pushes it first rather than failing. It used to drop the car into one of
  four scenes; the backdrop keys are gone, and with them the list that was
  mirrored by hand on the client and could drift from the server's.
- **There are two stickers, and only one of them costs anything.** The free one
  is cut out **on the device**: `modules/cardex-diecut` lifts the car off its
  background with Vision's `VNGenerateForegroundInstanceMaskRequest` (the *lift
  subject* of the Photos app), then grows a white die-cut edge in Core Image.
  ~200 ms, offline, no model call, nothing stored, on every car. The paid one is
  the AI redraw behind « Embellir », and it is Pro-only. Three things about the
  free one are load-bearing:
  - **It is not the npm package.** `react-native-subject-lift` wraps VisionKit's
    `ImageAnalysisInteraction`, which is the Live Text UI: it needs a long-press
    from the user and its own types admit the bitmap may not exist even then. It
    cannot run by itself at the end of a scan, which is the entire requirement.
    The Vision framework request is the headless one; they are different APIs
    with confusingly similar names.
  - **The framing is arithmetic, not prose.** The prompt *asks* the image model
    for "centred, filling most of the frame with a small even margin"; the Swift
    computes it, so it is exact on every car. Same for the 3% edge, pinned in
    canvas pixels rather than as a fraction of the source photo — otherwise two
    cars shot at different distances come back with different edges. This is the
    one place where removing the model buys quality instead of spending it.
  - **It is derived, so it is never stored.** No column, no bucket object, never
    in the sync payload. A reinstall pulls `photo_path` back down and the sticker
    is rebuilt for free — which is why storage and egress do not grow with it.
- **The best sticker wins wherever it exists, and neither destroys the
  photograph.** `src/lib/photo.ts` is the single place that decides which of the
  three pictures a screen shows — eight screens render an entry's picture, and the
  first divergence would be a showcase still showing the raw snapshot.
  `displayPhoto()` is that rule and its order is not negotiable: redraw →
  die-cut → photograph, because a redraw the player spent Pro on must never lose
  to a die-cut rebuilt behind it on the next launch. `originalPhoto()` exists for
  the only two screens that want the snapshot specifically, the fiche's comparison
  toggle and the sticker screen showing what is about to be redrawn. Splitting it
  by screen was tried and reverted: a garage whose grid shows stickers under a
  hero showing a snapshot reads as two half-finished apps. `isSticker()` decides
  `contentFit` and answers true for **both** kinds — a die-cut cropped with
  `cover` loses the edge that makes it a sticker — and the same flag drops the
  grey plate behind it, which would put the object back in the box the die-cut
  took it out of. The redraw is also copied to disk (`persistStyledPhoto`),
  because the signed URL expires in a day and that picture is now the entry's
  face.
- **`diecutUri` is a field of its own, and merging it into `styledPhotoUri` is
  the bug waiting to happen.** `RestyleCta` reads `styledPhotoUri` to decide
  whether it offers « Embellir » or « Refaire », so a die-cut landing in that slot
  would flip every card in the app to « Refaire » the moment it was scanned — an
  upgrade button advertising a re-roll of something that was never drawn — and
  pin `already_styled` to true on every event in the funnel. One picture is
  displayed; two fields decide it.
- **Sticker accounting mirrors `begin_scan`/`commit_scan`, and must.** An image
  call costs 10-40x a vision call — more now that it runs on OpenAI at
  `quality: high` — so: refuse before paying, charge only on a stored result, and
  keep `restyle_calls` as a ceiling so a failing generation cannot be retried
  forever for free. **Free gets none of it** (`p_free_limit` = 0): the paywall
  used to give one away because a paywall on a feature nobody had seen sells
  nothing, and the on-device die-cut is that demonstration now — free, unlimited,
  on every car. What « Embellir » asks the player to buy is a visible improvement
  to a sticker already in their hand, not access to a feature taken on trust.
  `begin_restyle` still rolls over only Pro's window; the reason changed rather
  than went away — free has no allowance left to roll, and the guard is what stops
  `p_free_limit` from silently becoming twelve a year if it is ever raised again.
  The `restyle_` names stay on the RPCs, the column and the PostHog events:
  renaming a live event splits every existing funnel in two, and it is the same
  spend against the same paywall it always was.
- **The die-cut fires none of the `restyle_*` events, and must not.** It happens
  by itself at the end of every scan, so counting it there would multiply
  `restyle_started` by the scan volume and drive the paid funnel's conversion rate
  to nothing. The scan event carries `has_diecut`, `diecut_failed` carries the
  reason, and the `restyle_*` events carry `method: 'redraw'` so a second method
  can never merge into that funnel silently. `diecut_failed` is fired at scan time
  only: the backfill in `<Diecuts>` retries every unliftable photo on each cold
  start, and reporting there would file one failure per launch per car for ever.
  A photo with no subject is also **not** sent to `captureError` — same call as
  `no_car`, that is the player framing badly.
- **Onboarding demonstrates both stickers before it asks for a photo, and the
  demonstration is entirely fake.** The `demo` step sits between the third
  question and the photo, and shows one car that is not the player's going
  photograph → die-cut → redraw, the last one on a tap on « Sublimer ». Three
  bundled assets (`assets/onboarding/`, indexed by `src/data/onboardingDemo.ts`):
  no vision call, no image call, no scan and no `restyle_calls` charged, so it
  costs nothing and needs no allowance — which is the only reason it can afford to
  show the paid half at all. Four things hold it:
  - **It fires `onboarding_demo_enhanced`, never `restyle_started`.** Same reason
    the die-cut fires nothing: one tap per install landing in the paid funnel
    would flatten its conversion rate. Nothing was generated and nobody was
    refused.
  - **The die-cut asset comes out of `scripts/diecut-asset.swift`**, a deliberate
    port of the module's `composeSticker`. A demo sticker with a different edge or
    margin than every real one demonstrates the wrong product; a screenshot off a
    device is whatever resolution that device had.
  - **The redraw asset is generated with `buildPrompt('transparent')` verbatim**,
    on the demo photograph, at the function's own settings. Any other prompt makes
    the demo promise a rendering the feature does not produce.
  - **It says which half is paid, on the card.** The welcome paywall arrives
    minutes later, and a demonstration that hid the price is what turns that
    arrival into a bait. `DEMO_EXIT` is also where « montre-la moi » now lives —
    asking for the photo *after* showing what comes back is a different question.
- **The prompt never names the car**, and that rule got *more* important, not
  less, when the feature became a sticker. Two mistakes shipped in the first
  version and both cost fidelity: `quality: low` strips exactly the details that
  make a car recognisable (wheels, grille, shoulder line), and opening the prompt
  with "Keep this exact car — Ferrari 488 GTB 2018 —" hands the model a label it
  will happily draw *its* idea of instead of copying the photograph. The pixels
  are the specification, and a redraw is precisely the moment a model would
  rather draw the car it already knows.
- **The sticker runs on OpenAI, which reverses the earlier decision because the
  job changed.** While the job was "keep this photograph, replace the scene",
  Gemini won and it was not close — `gpt-image-1` regenerates the whole frame on
  an edit, so nothing guaranteed the car survived, and the first build came back
  with cars that were no longer the player's. A sticker is an illustration, not a
  preserved photograph: regenerating the frame is the point, `input_fidelity:
  'high'` is what keeps the redraw anchored to the pixels, and only the GPT image
  models expose the alpha channel a die-cut needs (`background: 'transparent'`,
  which *requires* a png or webp `output_format` — asking for jpeg silently
  returns an opaque background). `IMAGE_MODEL` must stay on a model that supports
  `input_fidelity`: `gpt-image-1-mini` does not. Gemini stays reachable behind
  `IMAGE_PROVIDER` so the app still runs with only that key, but it cannot cut
  out — it is asked for a flat white background instead, which reads as die-cut
  on our white canvas and nowhere else.
- **What makes a grid of *redrawn* stickers read as a collection is in the
  prompt.** The lighting, the finish and the margin in the frame are pinned so
  every sticker matches every other one. The viewing angle deliberately is *not* —
  it stays whatever the player shot, because inventing a three-quarter view means
  inventing bodywork nobody photographed. A grid of **die-cuts** is held together
  by geometry alone — same canvas, same edge, same margin — and keeps the light of
  each photograph, which is exactly the uniformity the redraw is sold on. That is
  the honest limit of the free tier, and the argument « Embellir » makes.
- **RevenueCat's `CustomerInfo` is the only source of truth for Pro.** The
  `isPro` store flag is a cache so the UI does not flicker on cold start; it is
  written from a `CustomerInfo`, never from a completed transaction. A failed
  fetch returns null, which means *unknown* — never downgrade on it, or one
  flaky call locks a paying player out. `app/_layout.tsx` holds the listener.
- **Pro has to reach Postgres too.** `begin_scan()` reads `users.is_pro`, and
  the client is forbidden from writing that column, so a subscriber is refused
  at scan 11 unless the `revenuecat-webhook` edge function is deployed and
  wired up in the dashboard. The app calls `Purchases.logIn(<supabase user id>)`
  so the webhook knows which row to update.
- **The native purchase modules are loaded lazily**, through `require()` inside
  a try/catch. `react-native-purchases-ui` throws on import in Expo Go and on
  web, and the app must still run with an empty `.env`.
- **PostHog is one client, created at module load in `src/services/analytics.ts`
  and disabled rather than absent.** `disabled: !hasPostHog` is what keeps the
  empty-`.env` property: every method stays callable, so no call site needs a
  guard and `usePostHog()` works inside the provider. The previous shape — a
  `null` client behind `initAnalytics()` — silently swallowed events and made the
  provider impossible. Never add a `if (client)` branch back.
- **Event names live only in `events` in `analytics.ts`**, `snake_case` and past
  tense. A literal string passed to `track()` is a name that will drift and then
  quietly split one insight into two.
- **Player state is registered as super properties, never passed per call.**
  `syncPlayerContext()` in `<Telemetry>` (`app/_layout.tsx`) attaches `is_pro`,
  `level`, `cars_owned`, `scans_left` and the rest to *every* event, including
  autocaptured touches. That is what makes "do players who finished a collection
  convert better?" answerable from a scan event. A property that has to be
  remembered at forty call sites is a property that will be missing at one.
- **Screen views are captured from the pathname, with dynamic segments folded
  back into their template.** `captureScreens` is off in the provider because
  Expo Router exposes no `NavigationContainer` for the SDK to hook. `screen()`
  turns `/car/9f3a…` into `/car/[entryId]` and moves the id to a property —
  without that, one player with forty cars produces forty screen names and
  `$screen` is unusable. Add new dynamic routes to `DYNAMIC_ROUTES`.
- **A caught error still needs `captureError()`.** Almost every failure in this
  app is caught and turned into a message on screen, so it never reaches the
  uncaught handler and never appears in Error Tracking. The event says how often;
  the exception says why. `no_car` is the exception to the exception — that is
  the player framing badly, and filing it would bury the real ones.
- **`console` capture is off in `errorTracking.autocapture`, on purpose.**
  `PostHogErrorBoundary` reports render errors and React logs every one of them
  to `console.error`; enabling both files each crash twice under two
  fingerprints.
- **The e-mail address is never sent.** `identify()` sets `provider` and
  `has_email`, not the address. Nothing we measure needs it, and a key in `.env`
  is not consent — if that changes, the privacy policy changes first.
- **Server-side events use the Supabase user id as `distinctId`, always.** It is
  the same value the app passes to `identify()`, and the only thing stitching a
  server event onto the person who caused it. `supabase/functions/_shared/posthog.ts`
  is deliberately not `npm:posthog-node`: an edge function pays for every
  dependency on a cold start while already waiting on a model, and the SDK's
  background flush timer is the wrong shape for an isolate that gets frozen the
  moment it responds. Hence one queue per request and an **awaited** `flush()` at
  every exit — a queued batch in a frozen isolate is a batch nobody sees.
- **What the client cannot see is exactly what the server must report**: model
  latency and token counts, whether an image call was billed or refunded, and —
  in `revenuecat-webhook` — renewals, billing failures and expiries, which all
  happen while the app is closed. `purchase_completed` is the last thing the
  client ever says about a subscriber; everything about whether they *stayed* one
  is in the webhook. It also owns the `is_pro` person property, for the same
  reason it owns the column.
- **Online, the server's match wins.** `identify-car` returns `car_id`, and
  `resolveScan()` honours it whenever it is present. The client only matches
  locally in demo mode and the direct-OpenAI dev path, where no scan is charged,
  so a divergence can no longer mischarge anyone.
- **`match_car_id()` in Postgres still mirrors `src/lib/match.ts`**, because
  demo mode must behave like production. Its brand half lives in
  `match_collection_id()`, which `identify-car` also calls on its own to attach a
  brand to a discovered car without claiming a catalogue match.
  After touching either, run `npm run verify:matchers` — it stands up Postgres, applies schema + seed, and
  asserts both agree on every catalogue car, every alias, and every pair of
  brands whose aliases overlap. Exits non-zero on divergence, so it belongs in
  CI. Needs Docker.
- **Brand matching scores by longest matching alias, never array order.** Order
  dependence was a real bug: "lamborghini" contains "mb".
- After editing `src/data/`, run `node scripts/generate-seed.mjs`.
- **Brand logos come from Simple Icons**, inlined as single 24x24 SVG paths in
  `src/data/brandLogos.ts` — generated, never hand-edited. After adding a brand,
  run `node scripts/fetch-brand-logos.mjs`. Three brands have no upstream icon
  (Mercedes-Benz, Alfa Romeo, Land Rover); `<BrandLogo>` draws a monogram for
  those, so a missing entry is a supported state, not a bug. Render marks
  monochrome from `colors` — the brand hex would fight the black canvas.
- iOS native builds on this machine need a UTF-8 locale:
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios`.
- **Never run `eas build` without `--local`.** Cloud builds are billed and the
  account has no credits left. Store and TestFlight builds go through
  `./scripts/build-ios-production.sh`, which is local and free. Two things that
  follow from `--local`: the binary is never registered on EAS servers, so
  `eas submit --latest` finds nothing and needs `--path <archive>` instead; and the
  first build of a new distribution type must run **interactively**, because
  eas-cli's non-interactive `SetUpDistributionCertificate` is a stub that only
  throws. So never launch a first build in the background.
