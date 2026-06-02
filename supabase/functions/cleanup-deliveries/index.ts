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
 * cleanup-deliveries — daily 04:00 UTC. Enforces the 90-day retention on the
 * delivery audit log cited in the privacy policy (§6.27).
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();

  const { data, error } = await supabase
    .from('notification_deliveries')
    .delete()
    .lt('sent_at', cutoff)
    .select('id');
  if (error) return json({ error: error.message }, 500);

  const deleted = (data ?? []).length;
  console.log('[cleanup-deliveries]', { deleted });
  return json({ deleted });
});
