/**
 * Proves that match_car_id() in Postgres reaches the same verdict as
 * src/lib/match.ts for every catalogue car and every alias.
 *
 *   node scripts/verify-matchers.mjs
 *
 * Why this exists: the server cannot trust the client's match, because the
 * client is what would be lying about having missed. So the rule is implemented
 * twice — once in TypeScript for the offline/demo path, once in SQL as the
 * authority for the scan counter. Online the client defers to the server's
 * verdict, so a divergence no longer mischarges anyone, but it would still make
 * demo mode disagree with production. This catches that mechanically.
 *
 * Requires Docker. Exits non-zero on any disagreement.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'cardex-matcher-check';
const IMAGE = 'postgres:16';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const psql = (args) => run('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', ...args]);
const quiet = (fn) => {
  try {
    return fn();
  } catch {
    return '';
  }
};

let work;
try {
  quiet(() => run('docker', ['info']));
} catch {
  console.error('Docker is required and does not appear to be running.');
  process.exit(2);
}

try {
  work = mkdtempSync(join(tmpdir(), 'cardex-matchers-'));

  // ── 1. Load the TypeScript matcher ─────────────────────────────────────────
  console.log('Compiling the TypeScript matcher…');
  run('npx', [
    'tsc', '--ignoreConfig',
    'src/lib/match.ts',
    '--module', 'commonjs', '--target', 'es2020',
    '--outDir', work, '--skipLibCheck',
  ], { cwd: root });

  // match.ts pulls in the theme, which imports react-native.
  const stub = join(work, 'node_modules', 'react-native');
  run('mkdir', ['-p', stub]);
  writeFileSync(join(stub, 'index.js'), 'module.exports={Dimensions:{get:()=>({width:402,height:874})}};');
  writeFileSync(join(stub, 'package.json'), '{"name":"react-native","version":"0.0.0","main":"index.js"}');

  const { resolveScan } = await import(`file://${join(work, 'lib', 'match.js')}`);
  const { CARS } = await import(`file://${join(work, 'data', 'cars.js')}`);
  const { BRANDS } = await import(`file://${join(work, 'data', 'brands.js')}`);

  // ── 2. Build the probe set ────────────────────────────────────────────────
  const probes = [];
  for (const car of CARS) {
    const brand = BRANDS.find((b) => b.id === car.brandId);
    probes.push([brand.name, car.model]);
    for (const alias of car.aliases) probes.push([brand.name, alias]);
  }
  // Every brand, by name and by alias, against a model that cannot exist:
  // pins down brand resolution independently of model resolution.
  for (const brand of BRANDS) {
    probes.push([brand.name, 'ModeleQuiNExistePas']);
    for (const alias of brand.aliases) probes.push([alias, 'ModeleQuiNExistePas']);
  }
  // Adversarial, derived from the data rather than hand-listed: wherever one
  // brand's alias is a substring of another brand's name or alias, both sides
  // must still resolve to themselves. This is the invariant that the old
  // array-order / name-length tie-breaks violated, and it keeps protecting us
  // if someone reintroduces a short alias like Mercedes' "mb".
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const a of BRANDS) {
    for (const b of BRANDS) {
      if (a.id === b.id) continue;
      for (const aTerm of [a.name, ...a.aliases].map(norm)) {
        for (const bTerm of [b.name, ...b.aliases].map(norm)) {
          if (aTerm && bTerm && aTerm !== bTerm && bTerm.includes(aTerm)) {
            probes.push([b.name, 'ModeleQuiNExistePas']);
            probes.push([a.name, 'ModeleQuiNExistePas']);
          }
        }
      }
    }
  }

  // Known traps and negatives.
  probes.push(
    ['Abarth', '595'], ['Range Rover', 'Sport'], ['Range Rover', 'Evoque'],
    ['VW', 'Golf GTI'], ['Mercedes-Benz', 'C200'], ['Fiat', '500e'],
    ['Kia', 'EV6 GT'], ['Alfa Romeo', 'Giulia Quadrifoglio'],
    ['LAMBORGHINI', 'HURACAN'], ['lamborghini', 'urus'],
    ['Ferrari', 'LaFerrari'], ['Lada', 'Niva'], ['McLaren', 'Senna'],
    ['', ''], ['Peugeot', ''], ['Toyota', 'Yaris'], ['Toyota', 'GR Yaris'],
  );

  const expected = probes.map(([make, model]) => ({
    make,
    model,
    // serverCarId intentionally absent: we want the LOCAL verdict here.
    ts: resolveScan({ make, model, generation: null, year: 2020, confidence: 0.9 }).car?.id ?? null,
  }));

  // ── 3. Stand up Postgres and apply schema + seed ──────────────────────────
  console.log('Starting Postgres…');
  quiet(() => run('docker', ['rm', '-f', CONTAINER]));
  run('docker', ['run', '--rm', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=pw', IMAGE]);

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (quiet(() => psql(['-c', 'select 1'])).includes('1')) break;
    if (Date.now() > deadline) throw new Error('Postgres did not become ready in 60s');
    run('sleep', ['1']);
  }

  for (const file of ['supabase/test/prelude.sql', 'supabase/schema.sql', 'supabase/seed.sql']) {
    run('docker', ['cp', join(root, file), `${CONTAINER}:/tmp/apply.sql`]);
    // Catalogue tables must exist before anon/authenticated can be granted on
    // them, so schema.sql is applied twice — it is idempotent by design.
    psql(['-q', '-f', '/tmp/apply.sql']);
    if (file.endsWith('schema.sql')) {
      quiet(() => psql(['-q', '-c',
        'grant select,insert,update,delete on all tables in schema public to anon, authenticated;']));
      psql(['-q', '-f', '/tmp/apply.sql']);
    }
  }

  const counts = psql(['-At', '-c',
    "select (select count(*) from collections) || '/' || (select count(*) from cars)"]).trim();
  console.log(`Seeded ${counts} (collections/cars).`);

  // ── 4. Ask SQL the same questions ─────────────────────────────────────────
  const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const sqlQuery = expected
    .map((p, i) => `select ${i} as i, coalesce(match_car_id(${lit(p.make)}, ${lit(p.model)}), '~null~') as id`)
    .join('\nunion all\n');
  writeFileSync(join(work, 'probe.sql'), `${sqlQuery};`);
  run('docker', ['cp', join(work, 'probe.sql'), `${CONTAINER}:/tmp/probe.sql`]);

  const actual = new Map();
  for (const line of psql(['-At', '-F', '|', '-f', '/tmp/probe.sql']).trim().split('\n')) {
    const [i, id] = line.split('|');
    actual.set(Number(i), id === '~null~' ? null : id);
  }

  // ── 5. Compare ────────────────────────────────────────────────────────────
  const disagreements = expected
    .map((p, i) => ({ ...p, sql: actual.get(i) }))
    .filter((p) => p.ts !== p.sql);

  const matched = expected.filter((p) => p.ts !== null).length;
  console.log(`\n${expected.length} probes — ${matched} expected to match, ${expected.length - matched} not.`);

  if (disagreements.length > 0) {
    console.error(`\n✗ ${disagreements.length} DISAGREEMENT(S) between TypeScript and SQL:\n`);
    for (const d of disagreements.slice(0, 30)) {
      console.error(`  ${JSON.stringify(d.make)} + ${JSON.stringify(d.model)}  ts=${d.ts}  sql=${d.sql}`);
    }
    if (disagreements.length > 30) console.error(`  … and ${disagreements.length - 30} more`);
    process.exitCode = 1;
  } else {
    console.log('✓ TypeScript and SQL agree on every probe.');
  }
} catch (error) {
  console.error(`\nVerification could not complete: ${error.message}`);
  process.exitCode = 2;
} finally {
  quiet(() => run('docker', ['rm', '-f', CONTAINER]));
  if (work) quiet(() => rmSync(work, { recursive: true, force: true }));
}
