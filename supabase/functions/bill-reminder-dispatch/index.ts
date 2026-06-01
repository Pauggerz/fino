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
 * bill-reminder-dispatch — runs every 15 min (pg_cron).
 *
 * Sends a push for each unpaid one-off bill whose (due_date − daysBefore) is
 * today in the user's timezone, once the configured hour has arrived. Idempotent
 * via kind = "bill-reminder:<bill_id>:<due_date>".
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  if (!(await tryAdvisoryLock(supabase, 'bill-reminder-dispatch'))) {
    return json({ skipped: 'locked' });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const lower = subtractDays(today, 1);
  const upper = subtractDays(today, -4); // today + 4 (wide TZ-safe window)

  const { data: bills, error } = await supabase
    .from('bill_reminders')
    .select('id,user_id,title,amount,due_date')
    .eq('is_paid', false)
    .is('deleted_at', null)
    .gte('due_date', lower)
    .lte('due_date', upper);
  if (error) return json({ error: error.message }, 500);

  const rows = (bills ?? []) as any[];
  if (rows.length === 0) return json({ candidates: 0, sent: 0 });

  const userIds = [...new Set(rows.map((b) => b.user_id))];
  const { data: prefRows } = await supabase
    .from('notification_prefs')
    .select('*')
    .in('user_id', userIds);
  const prefsByUser = new Map<string, NotificationPrefsRow>(
    (prefRows ?? []).map((p: any) => [p.user_id, p as NotificationPrefsRow])
  );

  let sent = 0;
  const outcomes: Record<string, number> = {};
  for (const bill of rows) {
    const prefs = prefsByUser.get(bill.user_id);
    if (!prefs || !prefs.bill_reminders) continue;

    const fireDay = subtractDays(bill.due_date, prefs.bill_reminder_days_before);
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
      kind: `bill-reminder:${bill.id}:${bill.due_date}`,
      content,
      redactedContent: copy.redacted(),
      channelId: 'bill-reminders',
      route: 'more',
      notificationType: 'reminder',
      entityId: bill.id,
      interruptionLevel: days <= 1 ? 'timeSensitive' : 'active',
      categoryId: 'BILL_DUE',
    });
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    if (outcome === 'sent') sent += 1;
  }

  console.log('[bill-reminder-dispatch]', { candidates: rows.length, sent, outcomes });
  return json({ candidates: rows.length, sent, outcomes });
});
