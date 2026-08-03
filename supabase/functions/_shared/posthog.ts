/**
 * PostHog, server side.
 *
 * The client cannot measure what matters most about these functions: how long a
 * model call actually took, what it cost, why it failed, and — for the webhook —
 * that a subscription renewed at all, which no app is running to see.
 *
 * Deliberately not `npm:posthog-node`. Two reasons, both about where this runs:
 * an edge function pays for every dependency on a cold start, and it is already
 * waiting on a vision model; and the SDK owns a background flush timer, which is
 * the wrong shape for an isolate that may be frozen the moment it responds. The
 * capture API is one documented POST, so this is that POST.
 *
 * `distinctId` must always be the Supabase user id — the same value the app
 * passes to `identify()`. That is the only thing stitching a server event onto
 * the person who caused it; get it wrong and you have two unrelated people.
 *
 * Secrets: supabase secrets set POSTHOG_KEY=phc_… POSTHOG_HOST=https://eu.i.posthog.com
 */

const KEY = Deno.env.get('POSTHOG_KEY') ?? '';
const HOST = (Deno.env.get('POSTHOG_HOST') ?? 'https://eu.i.posthog.com').replace(/\/$/, '');

/** Same property in every event from here, so `source = server` is filterable. */
const COMMON = { source: 'server', $lib: 'cardex-edge' } as const;

type Props = Record<string, unknown>;

interface QueuedEvent {
  event: string;
  properties: Props;
  timestamp: string;
  /** Deduplication key — see `dedupeKey` on `capture`. */
  uuid?: string;
}

/**
 * One collector per request.
 *
 * Events are held until `flush()` rather than sent as they happen: a function
 * reports three or four things about the same call, and one round trip at the end
 * costs the player nothing while four spread through the handler add latency to
 * the response they are describing.
 */
export class Telemetry {
  private queue: QueuedEvent[] = [];

  constructor(private distinctId: string | null) {}

  /**
   * @param dedupeKey Stable id for an event that may be delivered more than once.
   *   PostHog drops a repeated `uuid`, which is what makes a retried webhook safe:
   *   RevenueCat resends on any non-2xx, and without this a transient database
   *   error would count the same renewal twice in the revenue numbers.
   */
  capture(event: string, properties: Props = {}, dedupeKey?: string): void {
    if (!KEY || !this.distinctId) return;
    this.queue.push({
      event,
      properties: { ...COMMON, ...properties, distinct_id: this.distinctId },
      timestamp: new Date().toISOString(),
      uuid: dedupeKey,
    });
  }

  /**
   * An exception, in the shape Error Tracking groups on.
   *
   * `$exception_list` is the contract: a plain event named `$exception` with a
   * message property is ingested but never grouped, so it never appears as an
   * issue and nobody ever sees it.
   */
  captureError(name: string, message: string, properties: Props = {}): void {
    this.capture('$exception', {
      ...properties,
      $exception_list: [{ type: name, value: message, mechanism: { handled: true } }],
    });
  }

  /**
   * Ships whatever was queued. Never throws and never rejects: analytics that can
   * fail a scan is worse than no analytics. Awaited before the handler returns,
   * because the isolate may be frozen immediately afterwards.
   */
  async flush(): Promise<void> {
    if (!KEY || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];

    try {
      const response = await fetch(`${HOST}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: KEY, batch }),
        // A slow PostHog must not hold a worker that has already done its job.
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        console.error('[posthog] batch rejected', response.status, await response.text());
      }
    } catch (error) {
      console.error('[posthog] batch failed', error);
    }
  }
}

/**
 * Person properties are set by capturing a `$set` event with a `$set` property —
 * see the RevenueCat webhook, which owns `is_pro` because it is the only thing
 * that knows the truth about it.
 */
