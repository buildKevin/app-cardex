/**
 * revenuecat-webhook — keeps `public.users.is_pro` in step with RevenueCat.
 *
 * The scan limit is enforced twice: in the client for UX, and in `begin_scan()`
 * so it cannot be bypassed. That second check reads `is_pro`, and the client is
 * deliberately forbidden from writing that column — otherwise anyone could flip
 * it and scan forever. So something server-side has to, and this is it.
 *
 * Without this function a paying subscriber is still refused at scan 11.
 *
 * The app calls `Purchases.logIn(<supabase user id>)`, so `app_user_id` is the
 * `public.users` primary key. Purchases made before sign-in arrive under a
 * RevenueCat anonymous id instead; those are ignored here and picked up by the
 * `logIn` alias, which makes RevenueCat resend under the real id.
 *
 * Auth: RevenueCat sends whatever Authorization header you configure on the
 * webhook. Compare it against REVENUECAT_WEBHOOK_SECRET — the endpoint is
 * public, and without this check anyone could grant themselves Pro.
 *
 * Deploy:
 *   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<a long random string>
 *   supabase functions deploy revenuecat-webhook --no-verify-jwt
 *
 * Then in RevenueCat → Integrations → Webhooks, point the URL at
 * https://<project>.supabase.co/functions/v1/revenuecat-webhook and set the
 * Authorization header to the same secret.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { Telemetry } from '../_shared/posthog.ts';

/**
 * Entitlement identifier, matching EXPO_PUBLIC_REVENUECAT_ENTITLEMENT.
 *
 * `CarDex Pro`, space and capitals included — see the note in
 * `src/services/env.ts`. RevenueCat sends this exact string in
 * `event.entitlement_ids`, and the check below drops any event that does not
 * name it. A slug here means every real purchase is filed as
 * `other_entitlement`, `is_pro` never flips, and the subscriber is refused at
 * scan 11 with nothing in the logs that looks like an error.
 */
const ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'CarDex Pro';

/**
 * Events that mean "Pro is on".
 *
 * CANCELLATION is deliberately absent: it only means auto-renew was turned off.
 * The customer keeps access until EXPIRATION, and revoking early would take
 * away time they already paid for.
 */
const GRANTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

/** Events that mean "Pro is off". */
const REVOKES = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED', 'BILLING_ISSUE_REVOKED']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 500);
  if (req.headers.get('Authorization') !== secret) return json({ error: 'unauthorized' }, 401);

  let event: Record<string, any>;
  try {
    event = (await req.json())?.event ?? {};
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const type = String(event.type ?? '');
  const entitlements: string[] = event.entitlement_ids ?? [];

  /**
   * The subscription lifecycle, which no app is running to see.
   *
   * A renewal, a billing failure and an expiry all happen while CarDex is closed,
   * so none of them exist in the client's data at all — `purchase_completed` is
   * the last thing it ever reports about a subscriber. Everything about whether
   * they *stayed* one is only here.
   *
   * `distinctId` is `app_user_id`, which the app sets to the Supabase user id via
   * `Purchases.logIn()`. Purchases made before sign-in arrive under a RevenueCat
   * anonymous id, and those genuinely belong to nobody we know yet.
   */
  const subscriber = typeof event.app_user_id === 'string' && UUID.test(event.app_user_id)
    ? event.app_user_id
    : null;
  const telemetry = new Telemetry(subscriber);
  /**
   * RevenueCat's own event id (a uuid), used as the PostHog dedupe key.
   *
   * `setPro` throws on a database error so RevenueCat retries — right for the
   * database, wrong for analytics, because the retry would count the same renewal
   * twice. Passing a stable uuid makes the second delivery a no-op on ingest.
   *
   * Only `subscription_event` carries it, because that is the one that gets summed.
   * A duplicated `$set` re-sets identical values, and a duplicated exception folds
   * into the same issue — neither distorts anything, and inventing derived uuids
   * for them would risk a malformed key dropping the event we actually need.
   */
  const deliveryId = typeof event.id === 'string' ? event.id : undefined;

  const revenue = {
    revenuecat_event: type,
    store: event.store ?? null,
    product_id: event.product_id ?? null,
    period_type: event.period_type ?? null,
    // In the currency the customer actually paid, plus RevenueCat's USD
    // normalisation — the second is the only one that can be summed across stores.
    price: event.price ?? null,
    currency: event.currency ?? null,
    price_in_usd: event.price_in_purchased_currency ?? null,
    revenue_usd: event.revenue ?? null,
    is_trial_conversion: event.is_trial_conversion ?? null,
    // Present on CANCELLATION and EXPIRATION: the difference between "they chose
    // to leave" and "their card failed" is the difference between a product
    // problem and a dunning problem.
    cancel_reason: event.cancel_reason ?? null,
    expiration_reason: event.expiration_reason ?? null,
    environment: event.environment ?? null,
  };

  const finish = async (body: unknown, status = 200) => {
    await telemetry.flush();
    return json(body, status);
  };

  // TRANSFER moves entitlements between accounts. Handled first and separately,
  // because leaving the old account Pro would hand out a second free ride.
  if (type === 'TRANSFER') {
    const admin = adminClient();
    await setPro(admin, event.transferred_from ?? [], false);
    await setPro(admin, event.transferred_to ?? [], true);
    telemetry.capture('subscription_transferred', revenue);
    return finish({ ok: true, type });
  }

  // Some event types (TEST, SUBSCRIBER_ALIAS, INVOICE_ISSUANCE…) carry no
  // entitlement change. Acknowledge them so RevenueCat stops retrying.
  const grants = GRANTS.has(type);
  const revokes = REVOKES.has(type);

  // Captured even when ignored for `is_pro` purposes: CANCELLATION changes
  // nothing here — access runs to the end of the paid period — but it is the
  // earliest possible warning that a subscriber has decided to leave, and
  // dropping it silently means only ever learning about churn a month late.
  telemetry.capture('subscription_event', {
    ...revenue,
    entitlements,
    grants_pro: grants,
    revokes_pro: revokes,
    // TEST events and other-entitlement events would otherwise pollute revenue
    // numbers that look real.
    affects_pro: (grants || revokes) && (entitlements.length === 0 || entitlements.includes(ENTITLEMENT)),
  }, deliveryId);

  if (!grants && !revokes) return finish({ ok: true, ignored: type });

  // An event about some other entitlement must not touch Pro.
  if (entitlements.length > 0 && !entitlements.includes(ENTITLEMENT)) {
    return finish({ ok: true, ignored: 'other_entitlement' });
  }

  // A grant whose expiry is already in the past is a replay of an old event.
  // `expiration_at_ms` is null for lifetime, which never expires.
  const expiresAt = event.expiration_at_ms ? Number(event.expiration_at_ms) : null;
  const isPro = grants && (expiresAt === null || expiresAt > Date.now());

  const updated = await setPro(adminClient(), [event.app_user_id, ...(event.aliases ?? [])], isPro);

  // The person property, from the only place that knows. `begin_scan()` reads
  // `users.is_pro` and the client is forbidden from writing it — the same reason
  // applies to the property a PostHog cohort is built on.
  telemetry.capture('$set', {
    $set: { is_pro: isPro, pro_product: event.product_id ?? null, pro_store: event.store ?? null },
  });

  // Grants only: a revoke that matched nothing is usually an expiry for an
  // anonymous id that never had a row, which is expected and not a problem.
  if (updated === 0 && isPro) {
    // A grant that matched no row is a paying customer whose Pro never reached
    // Postgres — they will be refused at scan 11 with a valid subscription.
    telemetry.captureError('SubscriberRowNotFound', `no users row for ${type}`, {
      ...revenue,
      is_pro: isPro,
    });
  }

  return finish({ ok: true, type, is_pro: isPro, updated });
});

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/**
 * Writes `is_pro` for every id that looks like a Supabase user.
 *
 * RevenueCat sends anonymous ids ($RCAnonymousID:…) for purchases made before
 * sign-in; filtering on the UUID shape drops those instead of failing the
 * whole request on a malformed uuid.
 */
async function setPro(
  admin: ReturnType<typeof adminClient>,
  ids: unknown[],
  value: boolean,
): Promise<number> {
  const userIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
  if (userIds.length === 0) return 0;

  const { data, error } = await admin
    .from('users')
    .update({ is_pro: value, updated_at: new Date().toISOString() })
    .in('id', userIds)
    .select('id');

  if (error) {
    console.error('[revenuecat-webhook] update failed', error.message);
    // Non-2xx makes RevenueCat retry, which is what we want for a transient
    // database error — the alternative is silently losing a subscription.
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}
