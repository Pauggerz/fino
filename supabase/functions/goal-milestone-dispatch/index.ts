// deno-lint-ignore-file no-explicit-any
import {
  serviceClient,
  isAuthorisedInvocation,
  tryAdvisoryLock,
  dispatchPush,
  corsHeaders,
  json,
  type NotificationPrefsRow,
} from '../_shared/expoPush.ts';
import { copy } from '../_shared/copy.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const BUCKETS = [100, 75, 50, 25];

/**
 * goal-milestone-dispatch — every 15 min. When a savings goal crosses a 25 / 50
 * / 75 / 100% bucket (after a synced contribution), congratulate once per
 * bucket. kind = "goal:<goal_id>:<bucket>".
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isAuthorisedInvocation(req)) return json({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();
  if (!(await tryAdvisoryLock(supabase, 'goal-milestone-dispatch'))) {
    return json({ skipped: 'locked' });
  }

  const now = new Date();
  // Look at goals touched in the last ~30 min so we react to fresh contributions
  // without rescanning the whole table every tick.
  const since = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('savings_goals')
    .select('id,user_id,name,current_amount,target_amount,updated_at')
    .is('deleted_at', null)
    .gte('updated_at', since)
    .gt('target_amount', 0);
  if (error) return json({ error: error.message }, 500);

  const goals = (rows ?? []) as any[];
  if (goals.length === 0) return json({ candidates: 0, sent: 0 });

  const userIds = [...new Set(goals.map((g) => g.user_id))];
  const { data: prefRows } = await supabase
    .from('notification_prefs')
    .select('*')
    .in('user_id', userIds);
  const prefsByUser = new Map<string, NotificationPrefsRow>(
    (prefRows ?? []).map((p: any) => [p.user_id, p as NotificationPrefsRow])
  );

  let sent = 0;
  for (const g of goals) {
    const prefs = prefsByUser.get(g.user_id);
    if (!prefs || !prefs.goal_milestones) continue;

    const pct = Math.floor((Number(g.current_amount) / Number(g.target_amount)) * 100);
    const bucket = BUCKETS.find((b) => pct >= b);
    if (!bucket) continue;

    const content = copy.goalMilestone(
      { name: g.name, currentAmount: g.current_amount, targetAmount: g.target_amount },
      bucket
    );
    const outcome = await dispatchPush({
      supabase,
      prefs,
      now,
      kind: `goal:${g.id}:${bucket}`,
      content,
      redactedContent: copy.redacted(),
      channelId: 'general',
      route: 'SavingsGoal',
      params: { id: g.id },
      notificationType: 'achievement',
      entityId: g.id,
      interruptionLevel: 'passive',
    });
    if (outcome === 'sent') sent += 1;
  }

  console.log('[goal-milestone-dispatch]', { candidates: goals.length, sent });
  return json({ candidates: goals.length, sent });
});
