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
 * recurring-income-dispatch — every 15 min. Payday nudge on the morning of an
 * active recurring income's next_due_at. kind = "recurring-income:<id>:<date>".
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  if (!(await tryAdvisoryLock(supabase, 'recurring-income-dispatch'))) {
    return json({ skipped: 'locked' });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { data: rows, error } = await supabase
    .from('recurring_incomes')
    .select('id,user_id,title,amount,next_due_at')
    .eq('is_active', true)
    .is('deleted_at', null)
    .gte('next_due_at', subtractDays(today, 1))
    .lte('next_due_at', subtractDays(today, -1));
  if (error) return json({ error: error.message }, 500);

  const incomes = (rows ?? []) as any[];
  if (incomes.length === 0) return json({ candidates: 0, sent: 0 });

  const userIds = [...new Set(incomes.map((i) => i.user_id))];
  const { data: prefRows } = await supabase
    .from('notification_prefs')
    .select('*')
    .in('user_id', userIds);
  const prefsByUser = new Map<string, NotificationPrefsRow>(
    (prefRows ?? []).map((p: any) => [p.user_id, p as NotificationPrefsRow])
  );

  let sent = 0;
  for (const inc of incomes) {
    const prefs = prefsByUser.get(inc.user_id);
    if (!prefs || !prefs.payday_reminders) continue;
    // Payday fires on the day itself, at the configured bill-reminder hour.
    if (inc.next_due_at !== dayInTimezone(now, prefs.timezone)) continue;
    if (hourInTimezone(now, prefs.timezone) < prefs.bill_reminder_hour) continue;

    const content = copy.payday(inc);
    const outcome = await dispatchPush({
      supabase,
      prefs,
      now,
      kind: `recurring-income:${inc.id}:${inc.next_due_at}`,
      content,
      redactedContent: copy.redacted(),
      channelId: 'general',
      route: 'RecurringIncome',
      notificationType: 'reminder',
      entityId: inc.id,
      interruptionLevel: 'active',
    });
    if (outcome === 'sent') sent += 1;
  }

  console.log('[recurring-income-dispatch]', { candidates: incomes.length, sent });
  return json({ candidates: incomes.length, sent });
});
