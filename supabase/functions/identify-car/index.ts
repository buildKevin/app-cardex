/**
 * identify-car — the only server-side piece the MVP needs.
 *
 * 1. Authenticates the caller.
 * 2. Enforces the free-scan limit in the database, in two phases: it refuses
 *    before paying for a model call, and only charges the scan afterwards if
 *    the result actually matched the catalogue.
 * 3. Asks the vision model for make / model / generation / year / confidence.
 *
 * It deliberately does NOT ask the model for power, price, country or rarity:
 * those come from our own catalogue so the data stays consistent.
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

  if (carId) {
    await supabase.rpc('commit_scan', { p_user_id: userData.user.id });
  }

  return json({
    make,
    model,
    generation: parsed.generation ?? null,
    year: parsed.year ?? null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
    // Informational: the client re-matches locally for display.
    car_id: carId,
    charged: carId !== null,
  });
});
