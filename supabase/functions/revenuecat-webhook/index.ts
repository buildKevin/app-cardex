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

/** Entitlement identifier, matching EXPO_PUBLIC_REVENUECAT_ENTITLEMENT. */
const ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'cardex_pro';

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

  // TRANSFER moves entitlements between accounts. Handled first and separately,
  // because leaving the old account Pro would hand out a second free ride.
  if (type === 'TRANSFER') {
    const admin = adminClient();
    await setPro(admin, event.transferred_from ?? [], false);
    await setPro(admin, event.transferred_to ?? [], true);
    return json({ ok: true, type });
  }

  // Some event types (TEST, SUBSCRIBER_ALIAS, INVOICE_ISSUANCE…) carry no
  // entitlement change. Acknowledge them so RevenueCat stops retrying.
  const grants = GRANTS.has(type);
  const revokes = REVOKES.has(type);
  if (!grants && !revokes) return json({ ok: true, ignored: type });

  // An event about some other entitlement must not touch Pro.
  if (entitlements.length > 0 && !entitlements.includes(ENTITLEMENT)) {
    return json({ ok: true, ignored: 'other_entitlement' });
  }

  // A grant whose expiry is already in the past is a replay of an old event.
  // `expiration_at_ms` is null for lifetime, which never expires.
  const expiresAt = event.expiration_at_ms ? Number(event.expiration_at_ms) : null;
  const isPro = grants && (expiresAt === null || expiresAt > Date.now());

  const updated = await setPro(adminClient(), [event.app_user_id, ...(event.aliases ?? [])], isPro);
  return json({ ok: true, type, is_pro: isPro, updated });
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
