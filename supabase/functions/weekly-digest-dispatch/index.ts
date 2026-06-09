// deno-lint-ignore-file no-explicit-any
import {
  serviceClient,
  isAuthorisedInvocation,
  tryAdvisoryLock,
  dispatchPush,
  hourInTimezone,
  weekdayInTimezone,
  corsHeaders,
  json,
  type NotificationPrefsRow,
} from '../_shared/expoPush.ts';
import { copy } from '../_shared/copy.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/** ISO week key (YYYY-Www) for idempotency across the whole week. */
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * weekly-digest-dispatch — hourly. For each user whose digest day+hour matches
 * the current hour in their timezone, summarises the last 7 days' spend/save.
 * kind = "weekly-digest:<user_id>:<ISO week>".
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  if (!(await tryAdvisoryLock(supabase, 'weekly-digest-dispatch'))) {
    return json({ skipped: 'locked' });
  }

  const now = new Date();
  const { data: prefRows, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('push_enabled', true)
    .eq('weekly_digest', true);
  if (error) return json({ error: error.message }, 500);

  const prefs = (prefRows ?? []) as NotificationPrefsRow[];
  const weekKey = isoWeek(now);
  const sinceIso = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  let sent = 0;
  for (const p of prefs) {
    if (weekdayInTimezone(now, p.timezone) !== p.weekly_digest_day) continue;
    // >= (not ==) so a skipped/delayed hourly tick still catches up later the
    // same day. The per-week idempotency kind below guarantees at-most-once.
    if (hourInTimezone(now, p.timezone) < p.weekly_digest_hour) continue;

    const { data: txs } = await supabase
      .from('transactions')
      .select('amount,type,is_transfer')
      .eq('user_id', p.user_id)
      .is('deleted_at', null)
      .gte('date', sinceIso);

    let spent = 0;
    let income = 0;
    for (const t of (txs ?? []) as any[]) {
      if (t.is_transfer) continue;
      if (t.type === 'expense') spent += Number(t.amount) || 0;
      else if (t.type === 'income') income += Number(t.amount) || 0;
    }
    const saved = Math.max(0, income - spent);
    const content = copy.weeklyDigest({ spent, saved });

    const outcome = await dispatchPush({
      supabase,
      prefs: p,
      now,
      kind: `weekly-digest:${p.user_id}:${weekKey}`,
      content,
      // The digest carries no per-transaction detail — safe to show on lockscreen.
      redactedContent: content,
      channelId: 'weekly-digest',
      route: 'stats',
      notificationType: 'insight',
      interruptionLevel: 'active',
    });
    if (outcome === 'sent') sent += 1;
  }

  console.log('[weekly-digest-dispatch]', { candidates: prefs.length, sent });
  return json({ candidates: prefs.length, sent });
});
