import { hasSupabase } from './env';
import { supabase } from './supabase';

/**
 * Sticker generation — the garage photo redrawn by an image model as a die-cut
 * collectible, for the garage grid and the showcase.
 *
 * Everything happens server-side in the `restyle-photo` edge function: it holds
 * the model key, owns the allowance, and builds the prompt. The client never
 * sends prompt text and never sends an image — only the id of a row it owns.
 *
 * There is nothing to choose any more. The four backdrops that used to live here
 * are gone, and with them the mirrored key list that could drift from the
 * server's.
 */

export type RestyleErrorCode =
  | 'limit'
  | 'not_synced'
  | 'network'
  | 'failed'
  | 'unconfigured';

export class RestyleError extends Error {
  constructor(
    public code: RestyleErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RestyleError';
  }
}

export interface RestyleResult {
  /** Signed URL, valid long enough to display and cache. */
  uri: string;
  /** Path inside the `scans` bucket, so a later sync can re-sign it. */
  path: string;
}

/** False when no Supabase is configured — the whole feature hides rather than fails. */
export const restyleAvailable = hasSupabase;

/** Maps the edge function's error bodies onto something the UI can act on. */
function codeFor(status: number | undefined, body: unknown): RestyleErrorCode {
  const error = (body as { error?: string } | null)?.error;

  if (status === 402 || error === 'restyle_limit_reached') return 'limit';
  if (status === 409 || error === 'photo_not_synced' || error === 'photo_unavailable') {
    return 'not_synced';
  }
  if (status === 503 || error === 'restyle_not_configured') return 'unconfigured';
  if (status === 502 || error === 'restyle_failed') return 'failed';
  return 'network';
}

/**
 * Asks the server for `remoteId`'s sticker.
 *
 * Takes the *remote* id: the row has to exist server-side, because the function
 * reads the stored photo rather than accepting one. Callers push the entry
 * first when it has not synced yet.
 */
export async function restylePhoto(remoteId: string): Promise<RestyleResult> {
  if (!supabase) throw new RestyleError('unconfigured');

  const { data, error } = await supabase.functions.invoke('restyle-photo', {
    body: { entry_id: remoteId },
  });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new RestyleError(codeFor(status, data), error.message);
  }

  const result = data as { styled_photo_path?: string; styled_photo_url?: string } | null;
  if (!result?.styled_photo_path || !result.styled_photo_url) {
    throw new RestyleError('failed');
  }

  return { uri: result.styled_photo_url, path: result.styled_photo_path };
}
