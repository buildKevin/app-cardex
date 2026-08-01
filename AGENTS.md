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
