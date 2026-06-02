// deno-lint-ignore-file no-explicit-any
import {
  serviceClient,
  isAuthorisedInvocation,
  tryAdvisoryLock,
  dispatchPush,
  dayInTimezone,
  subtractDays,
  hourInTimezone,
  corsHeaders,
  json,
  type NotificationPrefsRow,
} from '../_shared/expoPush.ts';
import { copy } from '../_shared/copy.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/**
 * recurring-bill-dispatch — every 15 min. Reminds for the next occurrence of an
 * active recurring bill. kind = "recurring-bill:<id>:<next_due_at>".
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  if (!(await tryAdvisoryLock(supabase, 'recurring-bill-dispatch'))) {
    return json({ skipped: 'locked' });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { data: rows, error } = await supabase
    .from('recurring_bills')
    .select('id,user_id,title,amount,next_due_at')
    .eq('is_active', true)
    .is('deleted_at', null)
    .gte('next_due_at', subtractDays(today, 1))
    .lte('next_due_at', subtractDays(today, -4));
  if (error) return json({ error: error.message }, 500);

  const bills = (rows ?? []) as any[];
  if (bills.length === 0) return json({ candidates: 0, sent: 0 });

  const userIds = [...new Set(bills.map((b) => b.user_id))];
  const { data: prefRows } = await supabase
    .from('notification_prefs')
    .select('*')
    .in('user_id', userIds);
  const prefsByUser = new Map<string, NotificationPrefsRow>(
    (prefRows ?? []).map((p: any) => [p.user_id, p as NotificationPrefsRow])
  );

  let sent = 0;
  for (const bill of bills) {
    const prefs = prefsByUser.get(bill.user_id);
    if (!prefs || !prefs.bill_reminders) continue;
    const fireDay = subtractDays(bill.next_due_at, prefs.bill_reminder_days_before);
    if (fireDay !== dayInTimezone(now, prefs.timezone)) continue;
    if (hourInTimezone(now, prefs.timezone) < prefs.bill_reminder_hour) continue;

    const days = prefs.bill_reminder_days_before;
    const content =
      days === 0
        ? copy.billDue.today(bill)
        : days === 1
          ? copy.billDue.tomorrow(bill)
          : copy.billDue.inNDays(bill, days);

    const outcome = await dispatchPush({
      supabase,
      prefs,
      now,
      kind: `recurring-bill:${bill.id}:${bill.next_due_at}`,
      content,
      redactedContent: copy.redacted(),
      channelId: 'bill-reminders',
      route: 'RecurringBills',
      notificationType: 'reminder',
      entityId: bill.id,
      interruptionLevel: days <= 1 ? 'timeSensitive' : 'active',
      categoryId: 'BILL_DUE',
    });
    if (outcome === 'sent') sent += 1;
  }

  console.log('[recurring-bill-dispatch]', { candidates: bills.length, sent });
  return json({ candidates: bills.length, sent });
});
