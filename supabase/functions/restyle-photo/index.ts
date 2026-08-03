/**
 * restyle-photo — turns a garage photo into a die-cut sticker.
 *
 * 1. Authenticates the caller.
 * 2. Resolves the garage row and its stored photo. The request carries an entry
 *    id, never an image: a function that rendered whatever bytes it was handed
 *    would let anyone spend our image budget on anything, and the ownership
 *    check is what bounds the feature to a player's own garage.
 * 3. Enforces the allowance in the database, two-phase — begin_restyle() before
 *    the model call so we never pay for a request we would refuse, then
 *    commit_restyle() only once an image actually came back.
 * 4. Writes the rendering next to the original in the `scans` bucket and
 *    returns a signed URL.
 *
 * The prompt is built here and never travels. Accepting prompt text from the
 * client would hand an arbitrary image generator to anyone with the app.
 *
 * It used to drop the car into a nicer scene, chosen from four backdrop keys.
 * There is no choice left to make: one sticker, one prompt. The scenes went
 * because the sticker is what the app collects — see the note on `buildPrompt`
 * for why a redraw beats a background swap here.
 *
 * Deploy: supabase functions deploy restyle-photo
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-... POSTHOG_KEY=phc_...
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { Telemetry } from '../_shared/posthog.ts';

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

/**
 * OpenAI first — the opposite of what this function used to do, because the job
 * changed.
 *
 * When the job was "keep this photograph, replace the scene", Gemini won and it
 * was not close: `gpt-image-1` regenerates the whole frame on an edit, so
 * nothing guaranteed the car survived, and the first build came back with cars
 * that were no longer the player's car.
 *
 * A sticker is not a preserved photograph, it is an illustration. Regenerating
 * the whole frame is now the point, `input_fidelity: 'high'` is the anchor that
 * keeps the redraw on the car in front of it, and — decisively — a sticker needs
 * a real alpha channel, which only the GPT image models expose here
 * (`background: 'transparent'`). It costs several times what Gemini does per
 * image; the allowance is what bounds that.
 *
 * Gemini stays reachable so the app still works with only that key set, but it
 * cannot cut out: it gets asked for a flat white background instead. On our
 * white canvas that reads as die-cut, but there is no alpha to shadow or to
 * composite on anything else.
 */
type Provider = 'gemini' | 'openai';
const PROVIDER: Provider =
  (Deno.env.get('IMAGE_PROVIDER') as Provider | undefined) ??
  (OPENAI_KEY ? 'openai' : 'gemini');

const GEMINI_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3.1-flash-image';

/**
 * Must be a model that supports `input_fidelity` — `gpt-image-1`, `gpt-image-1.5`
 * and later. `gpt-image-1-mini` does not, and without that anchor the redraw
 * stops being the player's car.
 */
const OPENAI_MODEL = Deno.env.get('IMAGE_MODEL') ?? 'gpt-image-1.5';
/**
 * 'low' was a mistake worth recording: the details that make a car
 * recognisable — wheels, grille, shoulder line — are the first thing a
 * low-quality render loses, so saving on the unit cost was paid for in the one
 * property the feature exists to have. A sticker raises the stakes again: its
 * edge *is* the object, and a soft edge reads as a bad cutout.
 */
const OPENAI_QUALITY = Deno.env.get('IMAGE_QUALITY') ?? 'high';
/**
 * Square, unlike the landscape the scenes wanted. A sticker is displayed in a
 * square grid cell at `contentFit: 'contain'`, and a landscape sticker is a
 * sticker with air above and below it in every cell.
 */
const OPENAI_SIZE = Deno.env.get('IMAGE_SIZE') ?? '1024x1024';

function providerKey(): string {
  return PROVIDER === 'gemini' ? GEMINI_KEY : OPENAI_KEY;
}

const FREE_RESTYLE_LIMIT = Number(Deno.env.get('FREE_RESTYLE_LIMIT') ?? '1');
const PRO_RESTYLE_LIMIT = Number(Deno.env.get('PRO_RESTYLE_LIMIT') ?? '30');

/** Wall-clock guard: an image call that hangs must fail, not hold the worker. */
const MODEL_TIMEOUT_MS = 110_000;

const BUCKET = 'scans';
const SIGNED_URL_TTL = 60 * 60 * 24;

/**
 * Deliberately does NOT name the car.
 *
 * The first version opened with "Keep this exact car — Ferrari 488 GTB 2018 —",
 * which is an invitation: handed a label, a generative model draws its own idea
 * of a 488 instead of copying the photograph in front of it. The pixels are the
 * specification here, so the prompt points at them and nothing else. That rule
 * matters more for a sticker, not less: a redraw is exactly the moment a model
 * would rather draw the car it knows.
 *
 * Two things are pinned on purpose, and they are what makes a grid of these
 * read as a collection rather than as a pile of exports: the lighting and finish
 * are always the same, and the car always sits at the same margin in the frame.
 * The viewing angle is *not* pinned — it stays whatever the player shot, because
 * inventing a three-quarter view means inventing bodywork nobody photographed.
 */
function buildPrompt(background: 'transparent' | 'white'): string {
  return [
    'Redraw the car in this photograph as a single die-cut collectible sticker.',
    '',
    'Absolute rule: it must stay the same car. Same body shape and proportions,',
    'same paint colour, same wheels, same badges and trim, same viewing angle as',
    'the photograph. Do not modernise it, do not idealise the shape, do not',
    'substitute a similar model. Read the car off the pixels.',
    '',
    'Style: clean glossy product illustration, smooth even studio lighting from',
    'the front and above, crisp specular highlights on the paint, dark glass,',
    'legible wheels. Remove every trace of the original surroundings — no road,',
    'no sky, no buildings, no reflections of the street in the paintwork, no',
    'ground shadow.',
    '',
    background === 'transparent'
      ? 'Output the car alone on a fully transparent background, with a smooth even white die-cut border about 3% of the image width following its silhouette.'
      : 'Output the car alone on a plain pure white background (#FFFFFF), flat and uniform, with a smooth even white die-cut border following its silhouette. No gradient, no vignette, no grey halo at the edges.',
    '',
    'The whole car is visible and centred, filling most of the frame with a small',
    'even margin on every side. Leave any licence plate blank. No text, no',
    'watermark, no people, no other vehicles, no props.',
  ].join('\n');
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

/** base64 → bytes, without pulling in a dependency for it. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * bytes → base64. Chunked because `String.fromCharCode(...bytes)` spreads every
 * byte as an argument and blows the call stack somewhere around 100 kB — which
 * every photo here exceeds.
 */
function encodeBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Outcome of one image call.
 *
 * `billed` is what decides whether the attempt counts against the player's
 * ceiling: an HTTP error means OpenAI generated nothing and charged us nothing,
 * so an outage on our side must not cost a free player their only try. A
 * timeout is reported as billed — the request may well have completed.
 */
type RenderOutcome =
  | { bytes: Uint8Array; mime: string }
  | { bytes: null; billed: boolean };

/** base64 → bytes, plus the mime the provider actually returned. */
interface RawImage {
  b64: string;
  mime: string;
}

/** Gemini: image and prompt as two parts of one multimodal request. */
async function renderViaGemini(
  original: Uint8Array,
  prompt: string,
  signal: AbortSignal,
): Promise<RawImage | { failed: true; billed: boolean }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: encodeBase64(original) } },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    console.error('[restyle] gemini returned', response.status, await response.text());
    return { failed: true, billed: false };
  }

  const payload = await response.json();
  // Responses come back camelCased even though requests accept snake_case, and
  // the image is one part among possibly several (the model likes to narrate).
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data;
    const data = inline?.data;
    if (typeof data === 'string') {
      return { b64: data, mime: inline?.mimeType ?? inline?.mime_type ?? 'image/png' };
    }
  }

  console.error('[restyle] gemini returned no image', JSON.stringify(payload).slice(0, 500));
  return { failed: true, billed: true };
}

/** OpenAI: multipart edit. Kept for a side-by-side, not the default. */
async function renderViaOpenAI(
  original: Uint8Array,
  prompt: string,
  signal: AbortSignal,
): Promise<RawImage | { failed: true; billed: boolean }> {
  const form = new FormData();
  form.append('model', OPENAI_MODEL);
  form.append('image', new Blob([original], { type: 'image/jpeg' }), 'car.jpg');
  form.append('prompt', prompt);
  form.append('size', OPENAI_SIZE);
  form.append('quality', OPENAI_QUALITY);
  // The parameter that exists for exactly this problem: preserve the details of
  // the input rather than reinterpret them.
  form.append('input_fidelity', 'high');
  // The cutout, and the reason this path is the default. `transparent` requires
  // a format that carries alpha, so png and jpeg are not interchangeable here —
  // asking for jpeg silently gets an opaque background back.
  form.append('background', 'transparent');
  form.append('output_format', 'png');
  form.append('n', '1');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: form,
    signal,
  });

  if (!response.ok) {
    console.error('[restyle] openai returned', response.status, await response.text());
    return { failed: true, billed: false };
  }

  const payload = await response.json();
  const b64 = payload?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string') {
    console.error('[restyle] openai returned no image');
    return { failed: true, billed: true };
  }
  return { b64, mime: 'image/png' };
}

/** Calls whichever image model is configured. */
async function renderImage(original: Uint8Array, prompt: string): Promise<RenderOutcome> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), MODEL_TIMEOUT_MS);

  try {
    const raw =
      PROVIDER === 'gemini'
        ? await renderViaGemini(original, prompt, abort.signal)
        : await renderViaOpenAI(original, prompt, abort.signal);

    if ('failed' in raw) return { bytes: null, billed: raw.billed };
    return { bytes: decodeBase64(raw.b64), mime: raw.mime };
  } catch (error) {
    // Aborts and network faults land here. We cannot tell whether the request
    // reached the provider, so we assume it did.
    console.error('[restyle] model call failed', error);
    return { bytes: null, billed: true };
  } finally {
    clearTimeout(timer);
  }
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
  const userId = userData.user.id;

  const telemetry = new Telemetry(userId);
  /** Single exit, awaited: see the same note in `identify-car`. */
  const finish = async (body: unknown, status = 200) => {
    await telemetry.flush();
    return json(body, status);
  };

  let entryId: unknown;
  try {
    // A `backdrop` in the body is ignored rather than rejected: builds already on
    // TestFlight still send one, and answering them with a sticker is better than
    // answering them with a 400.
    ({ entry_id: entryId } = await req.json());
  } catch {
    return finish({ error: 'bad_request' }, 400);
  }

  if (typeof entryId !== 'string' || !entryId) return finish({ error: 'bad_request' }, 400);

  // Ownership and source photo in one read. Scoping by user_id is what stops
  // one player from spending their allowance on another player's car.
  const { data: entry, error: entryError } = await supabase
    .from('garage')
    // The prompt deliberately does not name the car, so nothing but the id and
    // the source photo is needed here.
    .select('id, photo_path')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle();

  if (entryError) {
    telemetry.captureError('GarageReadFailed', entryError.message, { stage: 'read_entry' });
    return finish({ error: 'server_error' }, 500);
  }
  // Either the entry is gone or it belongs to somebody else. The query cannot
  // tell them apart, and the second one is an attempt to spend our image budget
  // on another player's car — worth knowing if it ever starts happening.
  if (!entry) {
    telemetry.capture('restyle_rejected', { reason: 'not_found_or_not_owned' });
    return finish({ error: 'not_found' }, 404);
  }

  // The photo lives on the device until the entry syncs. Nothing is broken —
  // the client just has to push it first, and it knows how.
  if (!entry.photo_path) {
    // The client pushes the entry before calling, so reaching this means the push
    // failed silently. It is a sync bug surfacing as a restyle failure.
    telemetry.capture('restyle_rejected', { reason: 'photo_not_synced' });
    return finish({ error: 'photo_not_synced' }, 409);
  }

  // Phase 1 — decided by the database, before we spend anything.
  const { data: allowed, error: beginError } = await supabase.rpc('begin_restyle', {
    p_user_id: userId,
    p_free_limit: FREE_RESTYLE_LIMIT,
    p_pro_limit: PRO_RESTYLE_LIMIT,
  });
  if (beginError) {
    telemetry.captureError('BeginRestyleFailed', beginError.message, { stage: 'begin_restyle' });
    return finish({ error: 'server_error' }, 500);
  }
  if (!allowed) {
    // The refusal that holds — and the one the paywall depends on. A free player
    // hits it on their second click, which is the whole conversion mechanism.
    telemetry.capture('restyle_refused_server', {
      free_limit: FREE_RESTYLE_LIMIT,
      pro_limit: PRO_RESTYLE_LIMIT,
    });
    return finish({ error: 'restyle_limit_reached' }, 402);
  }

  if (!providerKey()) {
    telemetry.captureError('RestyleNotConfigured', `no key for provider ${PROVIDER}`, {
      provider: PROVIDER,
    });
    return finish({ error: 'restyle_not_configured' }, 503);
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(entry.photo_path);
  if (downloadError || !blob) {
    // The row says there is a photo and the bucket disagrees. The allowance was
    // already claimed by `begin_restyle`, so this costs the player an attempt for
    // nothing — one to fix rather than watch.
    telemetry.captureError('PhotoUnavailable', downloadError?.message ?? 'no blob', {
      stage: 'download_photo',
    });
    return finish({ error: 'photo_unavailable' }, 409);
  }

  const original = new Uint8Array(await blob.arrayBuffer());
  const renderStartedAt = Date.now();
  const outcome = await renderImage(
    original,
    buildPrompt(PROVIDER === 'openai' ? 'transparent' : 'white'),
  );
  const renderMs = Date.now() - renderStartedAt;

  if (!outcome.bytes) {
    // Nothing was generated and nothing was billed: give the attempt back,
    // otherwise a misconfigured key spends a free player's whole ceiling.
    if (!outcome.billed) {
      await supabase.rpc('refund_restyle_call', { p_user_id: userId });
    }
    // `billed` is the expensive distinction: a refunded failure costs us an API
    // error, an un-refunded one costs a generation we never delivered. A rising
    // rate of the second is money leaving with nothing to show for it.
    telemetry.captureError('RestyleFailed', `${PROVIDER} produced no image`, {
      stage: 'render',
      provider: PROVIDER,
      model: PROVIDER === 'gemini' ? GEMINI_MODEL : OPENAI_MODEL,
      billed: outcome.billed,
      refunded: !outcome.billed,
      duration_ms: renderMs,
      // A timeout and a refusal look identical to the client; this separates them.
      timed_out: renderMs >= MODEL_TIMEOUT_MS - 1000,
    });
    return finish({ error: 'restyle_failed' }, 502);
  }

  // Store what we were actually given rather than mislabel a PNG as .jpg —
  // expo-image sniffs content, but the signed URL's content-type is what a
  // browser and a CDN go on, and an alpha channel announced as JPEG is an alpha
  // channel a CDN may flatten.
  const extension = outcome.mime === 'image/png' ? 'png' : 'jpg';
  // Distinct from the original, and stable per entry: a re-render replaces the
  // sticker rather than accumulating one file per attempt.
  const path = `${userId}/${entry.id}-sticker.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, outcome.bytes, { contentType: outcome.mime, upsert: true });
  if (uploadError) {
    // The worst failure in the function: we paid for the image and then lost it.
    telemetry.captureError('StorageFailed', uploadError.message, {
      stage: 'upload_rendering',
      bytes: outcome.bytes.length,
    });
    return finish({ error: 'storage_failed' }, 500);
  }

  const { error: updateError } = await supabase
    .from('garage')
    .update({ styled_photo_path: path })
    .eq('id', entry.id)
    .eq('user_id', userId);
  if (updateError) {
    telemetry.captureError('GarageUpdateFailed', updateError.message, {
      stage: 'attach_rendering',
    });
    return finish({ error: 'server_error' }, 500);
  }

  // Only now: an image exists and is stored. A failure anywhere above left the
  // allowance untouched.
  await supabase.rpc('commit_restyle', { p_user_id: userId });

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  /**
   * The only place the real cost of the feature is visible.
   *
   * `provider` and `model` are here rather than assumed because `IMAGE_PROVIDER`
   * exists precisely so the two can be compared — and a side-by-side is not a
   * side-by-side unless the latency and the failure rate are attributed.
   */
  telemetry.capture('restyle_delivered', {
    provider: PROVIDER,
    model: PROVIDER === 'gemini' ? GEMINI_MODEL : OPENAI_MODEL,
    duration_ms: renderMs,
    source_bytes: original.length,
    output_bytes: outcome.bytes.length,
    mime: outcome.mime,
  });

  return finish({
    styled_photo_path: path,
    styled_photo_url: signed?.signedUrl ?? null,
  });
});
