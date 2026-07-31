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
- **The vision model returns only** `make`, `model`, `generation`, `year`,
  `confidence`. Every other characteristic is enriched from `src/data/cars.ts`.
  Do not extend the prompt to ask for specs.
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
  demo mode must behave like production. After touching either, run
  `npm run verify:matchers` — it stands up Postgres, applies schema + seed, and
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
