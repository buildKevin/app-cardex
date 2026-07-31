/**
 * delete-account — erases the caller's account and everything attached to it.
 *
 * Apple requires an in-app path to account deletion for any app that lets you
 * create an account (App Store Review Guideline 5.1.1(v)), and deleting an auth
 * user needs the service_role key, which must never reach the client. Hence an
 * edge function.
 *
 * It deletes only the caller's own account: the id comes from the verified JWT,
 * never from the request body, so there is no way to aim it at someone else.
 *
 * public.users cascades to garage, so rows go with it. Storage objects are not
 * covered by the cascade and are removed explicitly.
 *
 * Deploy: supabase functions deploy delete-account
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userError } = await admin.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  const userId = userData.user.id;

  // Scan photos live at scans/<user-id>/… and are outside the FK cascade.
  try {
    const { data: files } = await admin.storage.from('scans').list(userId);
    if (files?.length) {
      await admin.storage.from('scans').remove(files.map((file) => `${userId}/${file.name}`));
    }
  } catch {
    // A leftover object must not block the deletion the user asked for.
  }

  // Cascades to public.garage via the foreign key.
  const { error: profileError } = await admin.from('users').delete().eq('id', userId);
  if (profileError) return json({ error: 'profile_delete_failed' }, 500);

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) return json({ error: 'auth_delete_failed' }, 500);

  return json({ deleted: true });
});
