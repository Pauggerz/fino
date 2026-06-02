// deno-lint-ignore-file no-explicit-any
import {
  serviceClient,
  isAuthorisedInvocation,
  corsHeaders,
  json,
} from '../_shared/expoPush.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/**
 * invalid-token-reaper — daily 03:00 UTC. Housekeeping: deactivate push tokens
 * not seen in 60 days. Precise DeviceNotRegistered reaping happens at send time
 * (dispatchPush) and via expo-receipts; this catches devices that have simply
 * gone dark so dispatch never wastes cycles on them.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();

  const { data, error } = await supabase
    .from('push_tokens')
    .update({ is_active: false })
    .eq('is_active', true)
    .lt('last_seen_at', cutoff)
    .select('id');
  if (error) return json({ error: error.message }, 500);

  const reaped = (data ?? []).length;
  console.log('[invalid-token-reaper]', { reaped });
  return json({ reaped });
});
