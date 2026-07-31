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
  via `consume_scan()` so it cannot be bypassed.
- After editing `src/data/`, run `node scripts/generate-seed.mjs`.
- iOS native builds on this machine need a UTF-8 locale:
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios`.
