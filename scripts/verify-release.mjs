/**
 * Pre-submission check. Run before building for the App Store:
 *
 *   npm run verify:release
 *
 * Every item here is something that either gets the build rejected or ships a
 * lie to users. Exits non-zero so it can gate a build pipeline.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

const blockers = [];
const warnings = [];

const app = json('app.json').expo;
let eas;
try {
  eas = json('eas.json');
} catch {
  blockers.push('eas.json is missing — there is no production build profile.');
}

const prod = eas?.build?.production?.env ?? {};

// ── Identification must be real ───────────────────────────────────────────────
if (!prod.EXPO_PUBLIC_SUPABASE_URL || !prod.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  blockers.push(
    'eas.json production is missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY. Without them\n' +
      '    the build falls back to simulated scans, which invent a car from the catalogue.',
  );
} else if (prod.EXPO_PUBLIC_SUPABASE_URL.includes('127.0.0.1') || prod.EXPO_PUBLIC_SUPABASE_URL.includes('localhost')) {
  blockers.push('eas.json production points at a local Supabase — unreachable from a device.');
}

if (prod.EXPO_PUBLIC_OPENAI_API_KEY) {
  blockers.push(
    'EXPO_PUBLIC_OPENAI_API_KEY is set for production. Anything EXPO_PUBLIC_ is readable\n' +
      '    by anyone who downloads the app. The key belongs in Supabase secrets.',
  );
}

// ── Legal pages ───────────────────────────────────────────────────────────────
if (!prod.EXPO_PUBLIC_TERMS_URL || !prod.EXPO_PUBLIC_PRIVACY_URL) {
  blockers.push(
    'EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_URL are not set. Apple requires both to be\n' +
      '    reachable and linked from the paywall; without them the links are hidden entirely.',
  );
}
if (!prod.EXPO_PUBLIC_SUPPORT_URL) {
  warnings.push('No EXPO_PUBLIC_SUPPORT_URL — App Store Connect asks for a support URL anyway.');
}

// ── Purchases ─────────────────────────────────────────────────────────────────
if (!prod.EXPO_PUBLIC_REVENUECAT_IOS_KEY) {
  blockers.push(
    'EXPO_PUBLIC_REVENUECAT_IOS_KEY is not set — the Founder purchase cannot complete,\n' +
      '    and a paywall whose button does nothing is a guaranteed rejection.',
  );
}

// ── Apple requirements in the native config ──────────────────────────────────
if (!app.ios?.usesAppleSignIn) {
  blockers.push('app.json is missing ios.usesAppleSignIn — the Apple entitlement will not be set.');
}
if (!app.ios?.bundleIdentifier) blockers.push('app.json is missing ios.bundleIdentifier.');
if (!app.ios?.infoPlist?.NSCameraUsageDescription) {
  blockers.push('app.json is missing NSCameraUsageDescription — the camera prompt would be rejected.');
}

// ── Assets still from the template ───────────────────────────────────────────
try {
  const icon = readFileSync(join(root, 'assets/icon.png'));
  const splash = readFileSync(join(root, 'assets/splash-icon.png'));
  if (icon.equals(splash)) {
    warnings.push('assets/icon.png and splash-icon.png are byte-identical — likely still the template.');
  }
} catch {
  blockers.push('assets/icon.png or assets/splash-icon.png is missing.');
}

// ── Trademarked brand marks ──────────────────────────────────────────────────
try {
  const logos = read('src/data/brandLogos.ts');
  const count = (logos.match(/^\s*'[a-z-]+':/gm) ?? []).length;
  if (count > 0) {
    warnings.push(
      `src/data/brandLogos.ts ships ${count} manufacturer marks. CC0 covers the drawing, not the\n` +
        '    trademark — Guideline 5.2.5. Confirm this is a decision, not an oversight.',
    );
  }
} catch {
  // No logo file: nothing to flag.
}

// ── Report ───────────────────────────────────────────────────────────────────
const line = '─'.repeat(72);
console.log(`\n${line}\nCarDex — pre-submission check\n${line}`);

if (blockers.length) {
  console.log(`\n✗ ${blockers.length} blocker(s):\n`);
  blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
}
if (warnings.length) {
  console.log(`\n! ${warnings.length} warning(s):\n`);
  warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
}
if (!blockers.length && !warnings.length) console.log('\n✓ Nothing to flag.');

console.log(`\n${line}\n`);
process.exitCode = blockers.length ? 1 : 0;
