/**
 * identify-car — the only server-side piece the MVP needs.
 *
 * 1. Authenticates the caller.
 * 2. Enforces the free-scan limit in the database, in two phases: it refuses
 *    before paying for a model call, and only charges the scan afterwards if
 *    the result actually matched the catalogue.
 * 3. Asks the vision model for make / model / generation / year / confidence.
 * 4. Only when the catalogue has no match: asks the model a SECOND time to rate
 *    the car, and stores that fiche in `discovered_cars` so every later sighting
 *    of the same car is served the same specs and the same XP.
 *
 * The identification prompt still asks for nothing but make / model /
 * generation / year / confidence — its answers feed match_car_id(), and a
 * prompt that also produced specs would be a prompt whose make and model drift.
 * The rating lives in its own call, on its own prompt, and never runs on the
 * ~95% of scans that hit the catalogue.
 *
 * Deploy: supabase functions deploy identify-car
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-...
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const MODEL = Deno.env.get('VISION_MODEL') ?? 'gpt-4o-mini';
const FREE_SCAN_LIMIT = Number(Deno.env.get('FREE_SCAN_LIMIT') ?? '10');
/** Hard ceiling on model calls per free account, matched or not. */
const VISION_CALL_CEILING = Number(Deno.env.get('VISION_CALL_CEILING') ?? '40');

const PROMPT = [
  'Tu es un expert en identification automobile.',
  'Identifie la voiture principale visible sur la photo.',
  'Réponds STRICTEMENT en JSON, sans texte autour, avec exactement ces clés :',
  '{"make": string|null, "model": string|null, "generation": string|null, "year": number|null, "confidence": number}',
  '- make : la marque (ex: "Ferrari", "Peugeot")',
  '- model : le modèle (ex: "488 GTB", "208")',
  '- generation : le code génération si tu en es sûr, sinon null',
  '- year : année approximative de production, sinon null',
  '- confidence : entre 0 et 1',
  "N'invente aucune autre caractéristique. Si aucune voiture n'est visible, mets make et model à null.",
].join('\n');

/**
 * Second call, only on a catalogue miss. No image on purpose: rarity has to be a
 * property of the model, not of the photograph, or the same car would be rated
 * differently depending on the light. Temperature 0 for the same reason.
 */
const RATING_PROMPT = [
  'Tu es un expert automobile. On te donne une marque et un modèle identifiés sur une photo.',
  "Cette voiture n'est pas dans notre catalogue : donne ses caractéristiques de référence.",
  'Réponds STRICTEMENT en JSON, sans texte autour, avec exactement ces clés :',
  '{"known": boolean, "generation": string|null, "year_from": number|null, "year_to": number|null,',
  ' "power": number|null, "country": string|null, "price_new": number|null,',
  ' "rarity": "common"|"rare"|"epic"|"legendary"}',
  '- known : false si ce modèle ne t’est pas familier. Dans ce cas, tout le reste à null.',
  '- power : puissance en ch de la version de référence',
  '- price_new : prix neuf approximatif en euros',
  '- year_to : null si le modèle est encore produit',
  '- country : pays du constructeur',
  '- rarity : rareté pour un jeu de collection, jugée sur la diffusion et le prix :',
  '  common = citadine ou familiale de grande diffusion',
  '  rare = version sportive ou finition haut de gamme d’un modèle courant',
  '  epic = sportive ou premium à faible diffusion',
  '  legendary = supercar, hypercar ou série très limitée',
  'Ne renvoie aucune autre clé. Dans le doute sur une caractéristique, mets null',
  "plutôt qu'une approximation inventée.",
].join('\n');

const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
type Rarity = (typeof RARITIES)[number];

interface Fiche {
  generation: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  power: number | null;
  country: string | null;
  priceNew: number | null;
  rarity: Rarity;
}

/** Bounded integer or null — a negative price or a 3000 hp Clio is not a spec. */
function int(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n);
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/** Asks the model to rate a car we do not list. Returns null if it cannot. */
async function rateCar(make: string, model: string): Promise<Fiche | null> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'user', content: `${RATING_PROMPT}\n\nMarque : ${make}\nModèle : ${model}` },
        ],
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let parsed: Record<string, unknown>;
  try {
    const text = (await response.json())?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') return null;
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  // An unrated car keeps today's behaviour: it lands in the garage on the
  // brand's baseline rarity, and costs the player nothing.
  if (parsed.known === false) return null;

  const rarity = RARITIES.includes(parsed.rarity as Rarity) ? (parsed.rarity as Rarity) : 'rare';

  return {
    generation: str(parsed.generation, 40),
    yearFrom: int(parsed.year_from, 1900, 2100),
    yearTo: int(parsed.year_to, 1900, 2100),
    power: int(parsed.power, 1, 2000),
    country: str(parsed.country, 40),
    priceNew: int(parsed.price_new, 100, 100_000_000),
    rarity,
  };
}

/** The `discovered_cars` row, in the shape the client stores. */
function ficheResponse(row: Record<string, unknown>) {
  return {
    id: row.id,
    brandId: row.collection_id ?? null,
    make: row.make,
    model: row.model,
    generation: row.generation ?? null,
    yearFrom: row.year_from ?? null,
    yearTo: row.year_to ?? null,
    power: row.power ?? null,
    country: row.country ?? null,
    priceNew: row.price_new ?? null,
    rarity: row.rarity,
    status: row.status,
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  let image: unknown;
  try {
    ({ image } = await req.json());
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof image !== 'string' || image.length < 100) {
    return json({ error: 'bad_request' }, 400);
  }

  // Phase 1 — decided by the database, before we spend anything on the model.
  const { data: allowed, error: beginError } = await supabase.rpc('begin_scan', {
    p_user_id: userData.user.id,
    p_free_limit: FREE_SCAN_LIMIT,
    p_call_ceiling: VISION_CALL_CEILING,
  });
  if (beginError) return json({ error: 'server_error' }, 500);
  if (!allowed) return json({ error: 'scan_limit_reached' }, 402);

  if (!OPENAI_KEY) return json({ error: 'vision_not_configured' }, 503);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return json({ error: 'vision_failed', status: response.status }, 502);
  }

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') return json({ error: 'vision_unreadable' }, 502);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: 'vision_unreadable' }, 502);
  }

  const make = typeof parsed.make === 'string' ? parsed.make : null;
  const model = typeof parsed.model === 'string' ? parsed.model : null;

  // Phase 2 — the database decides whether this counts. The client's own
  // verdict is never trusted for accounting.
  let carId: string | null = null;
  if (make && model) {
    const { data: matched } = await supabase.rpc('match_car_id', {
      p_make: make,
      p_model: model,
    });
    carId = (matched as string | null) ?? null;
  }

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.6;

  // Catalogue miss: serve the community fiche if we already hold one, otherwise
  // rate the car once and keep the answer for everyone who scans it next.
  let fiche: Record<string, unknown> | null = null;
  if (!carId && make && model) {
    const { data: existing } = await supabase.rpc('find_discovered_car', {
      p_make: make,
      p_model: model,
    });

    if (existing) {
      // The scanner's own identification agreeing with the stored keys IS the
      // second opinion, so this both serves the fiche and promotes it.
      const { data: touched } = await supabase.rpc('touch_discovered_car', {
        p_id: (existing as Record<string, unknown>).id,
        p_user_id: userData.user.id,
      });
      fiche = (touched as Record<string, unknown> | null) ?? (existing as Record<string, unknown>);
    } else {
      const rated = await rateCar(make, model);
      if (rated) {
        const { data: collectionId } = await supabase.rpc('match_collection_id', { p_make: make });
        const { data: created } = await supabase.rpc('record_discovered_car', {
          p_make: make,
          p_model: model,
          p_collection_id: (collectionId as string | null) ?? null,
          p_generation: rated.generation,
          p_year_from: rated.yearFrom,
          p_year_to: rated.yearTo,
          p_power: rated.power,
          p_country: rated.country,
          p_price_new: rated.priceNew,
          p_rarity: rated.rarity,
          p_user_id: userData.user.id,
          p_confidence: confidence,
        });
        fiche = (created as Record<string, unknown> | null) ?? null;
      }
    }
  }

  // A rated car is a real result, so it costs a scan like a catalogue hit. What
  // stays free is the case we cannot answer at all: no catalogue row and a model
  // that does not know the car either is our gap, not the player's.
  if (carId || fiche) {
    await supabase.rpc('commit_scan', { p_user_id: userData.user.id });
  }

  return json({
    make,
    model,
    generation: parsed.generation ?? null,
    year: parsed.year ?? null,
    confidence,
    // Informational: the client re-matches locally for display.
    car_id: carId,
    // Present (possibly null) whenever the catalogue missed, so the client can
    // tell "the server rated it" from "no server was involved".
    discovered: carId ? undefined : fiche ? ficheResponse(fiche) : null,
    charged: carId !== null || fiche !== null,
  });
});
