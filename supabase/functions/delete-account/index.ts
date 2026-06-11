// deno-lint-ignore-file no-explicit-any
import {
  serviceClient,
  corsHeaders,
  json,
} from '../_shared/expoPush.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/**
 * delete-account — permanently erase the calling user.
 *
 * Called by the app (not pg_cron) with the user's own bearer token. We validate
 * the JWT with the service-role client, then delete the auth user. Every app
 * table FKs `auth.users(id) ON DELETE CASCADE`, so removing the auth user
 * cascades all of their rows. The public.users profile is removed first as a
 * defensive measure in case that one row doesn't cascade on this project.
 *
 * Deploy: `supabase functions deploy delete-account`. No EDGE_INVOKE_JWT gate —
 * authorisation is the caller's own validated session token.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = serviceClient();

  // Validate the caller's JWT and resolve their uid (signature-checked).
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
  const uid = userData.user.id;

  // Defensive profile cleanup, then delete the auth user (cascades app data).
  await admin.from('users').delete().eq('id', uid);
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return json({ error: delErr.message }, 500);

  return json({ ok: true });
});
