// deno-lint-ignore-file no-explicit-any
import {
  serviceClient,
  isAuthorisedInvocation,
  fetchReceipts,
  corsHeaders,
  json,
} from '../_shared/expoPush.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/**
 * expo-receipts — every 10 min. Polls Expo for delivery receipts of recently
 * sent pushes (Expo recommends polling ≥ 15 min after send; this window catches
 * them within ~25 min). Records receipt status; precise invalid-token reaping
 * happens at send time, this stage records terminal errors for observability.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('notification_deliveries')
    .select('id,expo_ticket_id')
    .eq('status', 'sent')
    .is('expo_receipt_id', null)
    .not('expo_ticket_id', 'is', null)
    .gte('sent_at', since)
    .limit(1000);
  if (error) return json({ error: error.message }, 500);

  const deliveries = (rows ?? []) as any[];
  if (deliveries.length === 0) return json({ polled: 0 });

  const ticketIds = deliveries.map((d) => d.expo_ticket_id as string);
  const receipts = await fetchReceipts(ticketIds);

  let ok = 0;
  let errors = 0;
  for (const d of deliveries) {
    const receipt = receipts[d.expo_ticket_id];
    if (!receipt) continue;
    if (receipt.status === 'ok') {
      ok += 1;
      await supabase
        .from('notification_deliveries')
        .update({ expo_receipt_id: d.expo_ticket_id })
        .eq('id', d.id);
    } else {
      errors += 1;
      await supabase
        .from('notification_deliveries')
        .update({
          expo_receipt_id: d.expo_ticket_id,
          status: 'failed',
          error_code: receipt.details?.error ?? receipt.message ?? 'receipt_error',
        })
        .eq('id', d.id);
    }
  }

  console.log('[expo-receipts]', { polled: deliveries.length, ok, errors });
  return json({ polled: deliveries.length, ok, errors });
});
