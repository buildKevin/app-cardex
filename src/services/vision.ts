import { CARS } from '../data/cars';
import { BRANDS_BY_ID } from '../data/brands';
import type { DiscoveredCar, Rarity, VisionResult } from '../data/types';
import { RARITY_ORDER } from '../lib/rarity';
import { isReleaseMisconfigured } from '../config/release';
import { ENV, hasOpenAI, hasSupabase } from './env';
import { supabase } from './supabase';

export type VisionErrorCode = 'no_car' | 'network' | 'unreadable' | 'limit' | 'unconfigured';

export class VisionError extends Error {
  constructor(
    public code: VisionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'VisionError';
  }
}

const PROMPT = [
  'Tu es un expert en identification automobile.',
  "Identifie la voiture principale visible sur la photo.",
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
 * The community fiche, when the edge function had to rate the car itself.
 *
 * It comes from our own server, so this only guards against a shape mismatch
 * between an older app build and a newer function — never against hostile data.
 */
function parseDiscovered(raw: unknown): DiscoveredCar | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string' || typeof data.make !== 'string' || typeof data.model !== 'string') {
    return null;
  }

  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

  return {
    id: data.id,
    brandId: text(data.brandId),
    make: data.make,
    model: data.model,
    generation: text(data.generation),
    yearFrom: num(data.yearFrom),
    yearTo: num(data.yearTo),
    power: num(data.power),
    country: text(data.country),
    priceNew: num(data.priceNew),
    rarity: RARITY_ORDER.includes(data.rarity as Rarity) ? (data.rarity as Rarity) : 'rare',
    status: data.status === 'confirmed' ? 'confirmed' : 'pending',
  };
}

/** Which of the four fields we accept, and nothing else. */
function parseResult(raw: unknown): VisionResult {
  if (!raw || typeof raw !== 'object') throw new VisionError('unreadable');
  const data = raw as Record<string, unknown>;

  const make = typeof data.make === 'string' ? data.make.trim() : '';
  const model = typeof data.model === 'string' ? data.model.trim() : '';
  if (!make || !model) throw new VisionError('no_car');

  const year = Number(data.year);
  const confidence = Number(data.confidence);

  return {
    make,
    model,
    generation: typeof data.generation === 'string' && data.generation.trim() ? data.generation.trim() : null,
    year: Number.isFinite(year) && year > 1900 && year < 2100 ? Math.round(year) : null,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.6,
    // Present only when the edge function ruled on it.
    serverCarId: 'car_id' in data ? ((data.car_id as string | null) ?? null) : undefined,
    serverDiscovered: 'discovered' in data ? parseDiscovered(data.discovered) : undefined,
  };
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new VisionError('unreadable');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new VisionError('unreadable');
  }
}

/** Preferred path: the key stays on the server. */
async function identifyViaSupabase(base64: string): Promise<VisionResult> {
  const { data, error } = await supabase!.functions.invoke('identify-car', {
    body: { image: base64 },
  });

  if (error) {
    // The edge function owns the free-tier gate, so 402 means "show the paywall".
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 402) throw new VisionError('limit', error.message);

    // A local stack usually has no OPENAI_API_KEY. Rather than make the whole
    // loop untestable against local Supabase, fall back to the mock — but only
    // in development, so a misconfigured production build fails loudly instead
    // of quietly inventing cars.
    if (status === 503 && __DEV__) {
      console.warn('[vision] edge function has no model configured — using the mock (dev only)');
      return identifyMocked();
    }

    throw new VisionError('network', error.message);
  }

  return parseResult(data);
}

/** Local dev only — a key in the bundle is readable by anyone who downloads the app. */
async function identifyViaOpenAI(base64: string): Promise<VisionResult> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ENV.openaiKey}`,
      },
      body: JSON.stringify({
        model: ENV.visionModel,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          },
        ],
      }),
    });
  } catch (error: any) {
    throw new VisionError('network', error?.message);
  }

  if (!response.ok) throw new VisionError('network', `HTTP ${response.status}`);

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new VisionError('unreadable');
  return parseResult(extractJson(text));
}

/** Demo mode: no key configured, so we invent a plausible sighting. */
const MOCK_WEIGHT: Record<Rarity, number> = { common: 60, rare: 25, epic: 10, legendary: 5 };

async function identifyMocked(): Promise<VisionResult> {
  await new Promise((resolve) => setTimeout(resolve, 1400));

  const total = CARS.reduce((sum, car) => sum + MOCK_WEIGHT[car.rarity], 0);
  let roll = Math.random() * total;
  const picked = CARS.find((car) => (roll -= MOCK_WEIGHT[car.rarity]) <= 0) ?? CARS[0];

  const now = new Date().getFullYear();
  const latest = picked.yearTo ?? now;
  const year = picked.yearFrom + Math.floor(Math.random() * Math.max(1, latest - picked.yearFrom + 1));

  return {
    make: BRANDS_BY_ID[picked.brandId].name,
    model: picked.model,
    generation: picked.generation,
    year,
    confidence: 0.72 + Math.random() * 0.23,
  };
}

export const visionMode: 'supabase' | 'openai' | 'mock' = hasSupabase
  ? 'supabase'
  : hasOpenAI
    ? 'openai'
    : 'mock';

/**
 * The model returns make / model / generation / year / confidence — nothing else.
 * Every other characteristic is enriched from our own catalogue, or, when the
 * catalogue has no such car, from the community fiche the edge function stores
 * on the first sighting (`serverDiscovered`). Neither of the two local paths
 * below can produce one: there is no server to write it to.
 */
export async function identifyCar(base64: string): Promise<VisionResult> {
  if (visionMode === 'supabase') return identifyViaSupabase(base64);
  if (visionMode === 'openai') return identifyViaOpenAI(base64);

  // Demo mode must never reach a real user: inventing a car from the catalogue
  // and presenting it as an identification is a lie, and one nobody would spot
  // until review. Fail loudly instead.
  if (isReleaseMisconfigured(visionMode)) throw new VisionError('unconfigured');

  return identifyMocked();
}
