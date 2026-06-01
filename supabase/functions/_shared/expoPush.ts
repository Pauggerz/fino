// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Shared Expo Push helpers for the notification dispatchers.
 *
 * Payload schema version (data.v). Bump on any breaking change to the `data`
 * field and document it here:
 *   v1 — { v, kind, route, params, notification_type, inboxInsert, title,
 *          body, actionLabel, entityId, interruptionLevel?, imageUrl? }
 */
export const PAYLOAD_VERSION = 1;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
  interruptionLevel?: 'active' | 'timeSensitive' | 'passive' | 'critical';
  mutableContent?: boolean;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string; expoPushToken?: string };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

// ── Environment ────────────────────────────────────────────────────────────

export function env(key: string): string | undefined {
  return (globalThis as any).Deno?.env?.get(key);
}

export function requireEnv(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

/** Is this a staging deploy that must not message real users? (§6.35) */
export function isStagingSink(): boolean {
  return env('APP_ENV') === 'staging' && env('STAGING_REAL_SENDS') !== 'true';
}

/** Service-role Supabase client (bypasses RLS — server-internal only). */
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  );
}

/**
 * Validate the shared-secret used by pg_cron to invoke a dispatcher. Returns
 * true when authorised. Compares the Bearer token to EDGE_INVOKE_JWT.
 */
export function isAuthorisedInvocation(req: Request): boolean {
  const expected = env('EDGE_INVOKE_JWT');
  if (!expected) return true; // not configured (dev) → allow
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  return token === expected;
}

// ── Sending ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send messages to Expo in batches of 100. Returns tickets in the same order as
 * the input messages. On a staging sink, logs and returns synthetic ok tickets.
 */
export async function sendPushBatch(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];
  if (isStagingSink()) {
    console.log(`[expoPush] staging sink — not sending ${messages.length} msgs`);
    return messages.map(() => ({ status: 'ok' as const, id: 'staging-sink' }));
  }

  const accessToken = env('EXPO_ACCESS_TOKEN');
  const tickets: ExpoPushTicket[] = [];

  for (const batch of chunk(messages, 100)) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[expoPush] send failed', res.status, text);
      // Mark the whole batch as errored so callers record failures + retry.
      for (let i = 0; i < batch.length; i += 1) {
        tickets.push({ status: 'error', message: `HTTP ${res.status}` });
      }
      continue;
    }
    const json = await res.json();
    const data = (json.data ?? []) as ExpoPushTicket[];
    for (const t of data) tickets.push(t);
  }
  return tickets;
}

/** Poll Expo for delivery receipts by ticket id (§4.1). */
export async function fetchReceipts(
  ticketIds: string[]
): Promise<Record<string, ExpoPushReceipt>> {
  if (ticketIds.length === 0) return {};
  const accessToken = env('EXPO_ACCESS_TOKEN');
  const out: Record<string, ExpoPushReceipt> = {};

  for (const batch of chunk(ticketIds, 1000)) {
    const res = await fetch(EXPO_RECEIPT_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ ids: batch }),
    });
    if (!res.ok) {
      console.error('[expoPush] receipts failed', res.status, await res.text());
      continue;
    }
    const json = await res.json();
    Object.assign(out, (json.data ?? {}) as Record<string, ExpoPushReceipt>);
  }
  return out;
}

const INVALID_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MismatchSenderId',
]);

/**
 * Deactivate push tokens that Expo reported as invalid (DeviceNotRegistered et
 * al). Accepts the tokens to deactivate. Re-registration reactivates the row.
 */
export async function markInvalidTokens(
  supabase: SupabaseClient,
  tokens: string[]
): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await supabase
    .from('push_tokens')
    .update({ is_active: false })
    .in('token', tokens);
  if (error) console.error('[expoPush] markInvalidTokens failed', error.message);
}

export function isInvalidTokenError(code?: string): boolean {
  return !!code && INVALID_TOKEN_ERRORS.has(code);
}

// ── Prefs / quiet hours / rate limiting ───────────────────────────────────────

export interface NotificationPrefsRow {
  user_id: string;
  push_enabled: boolean;
  bill_reminders: boolean;
  bill_reminder_days_before: number;
  bill_reminder_hour: number;
  budget_alerts: boolean;
  budget_threshold: number;
  weekly_digest: boolean;
  weekly_digest_day: number;
  weekly_digest_hour: number;
  inactivity_reminder: boolean;
  goal_milestones: boolean;
  payday_reminders: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
  hide_amounts_on_lockscreen: boolean;
  rate_limit_per_day: number;
  timezone: string;
}

/** The hour (0–23) in the user's timezone for a given instant. */
export function hourInTimezone(now: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    return parseInt(fmt.format(now), 10) % 24;
  } catch {
    return now.getUTCHours();
  }
}

/** The calendar day ('YYYY-MM-DD') in the user's timezone for an instant. */
export function dayInTimezone(now: Date, timezone: string): string {
  try {
    // en-CA renders ISO-ish YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Subtract `n` days from a 'YYYY-MM-DD' string, returning 'YYYY-MM-DD'. */
export function subtractDays(dayStr: string, n: number): string {
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The weekday (Sun=0) in the user's timezone for a given instant. */
export function weekdayInTimezone(now: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: timezone,
    });
    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return map[fmt.format(now)] ?? now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

/** Timezone-aware quiet-hours check (§6.3). Handles wrap-around windows. */
export function quietHoursActive(
  prefs: NotificationPrefsRow,
  now: Date
): boolean {
  if (!prefs.quiet_hours_enabled) return false;
  const start = prefs.quiet_hours_start;
  const end = prefs.quiet_hours_end;
  if (start === end) return false;
  const hour = hourInTimezone(now, prefs.timezone);
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Per-user, per-day cap (§6.6). Returns true when the user has already received
 * their configured number of *sent* pushes in the last 24h.
 */
export async function rateLimitReached(
  supabase: SupabaseClient,
  userId: string,
  cap: number
): Promise<boolean> {
  if (cap <= 0) return false;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('notification_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('channel', 'push')
    .eq('status', 'sent')
    .gte('sent_at', since);
  if (error) {
    console.error('[expoPush] rateLimit query failed', error.message);
    return false;
  }
  return (count ?? 0) >= cap;
}

// ── Delivery audit / idempotency ───────────────────────────────────────────────

export type DeliveryStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'dead'
  | 'skipped_prefs'
  | 'skipped_quiet_hours'
  | 'rate_limited';

/**
 * Claim the right to send by inserting a `queued` delivery row. The unique
 * (user_id, kind) index means a duplicate insert is ignored — returns false
 * when the row already exists (already handled this kind), true when claimed.
 */
export async function claimDelivery(
  supabase: SupabaseClient,
  row: { user_id: string; kind: string; channel?: 'push' | 'local'; payload?: unknown }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_deliveries')
    .upsert(
      {
        user_id: row.user_id,
        kind: row.kind,
        channel: row.channel ?? 'push',
        status: 'queued',
        payload: row.payload ?? null,
      },
      { onConflict: 'user_id,kind', ignoreDuplicates: true }
    )
    .select('id');
  if (error) {
    console.error('[expoPush] claimDelivery failed', error.message);
    return false;
  }
  // ignoreDuplicates → empty array means the row already existed.
  return Array.isArray(data) && data.length > 0;
}

/** Record a terminal status for a previously-claimed delivery. */
export async function finalizeDelivery(
  supabase: SupabaseClient,
  args: {
    user_id: string;
    kind: string;
    status: DeliveryStatus;
    expo_ticket_id?: string | null;
    error_code?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('notification_deliveries')
    .update({
      status: args.status,
      expo_ticket_id: args.expo_ticket_id ?? null,
      error_code: args.error_code ?? null,
    })
    .eq('user_id', args.user_id)
    .eq('kind', args.kind);
  if (error) console.error('[expoPush] finalizeDelivery failed', error.message);
}

/** Record a skip (prefs off / quiet hours / rate limited) idempotently. */
export async function recordSkip(
  supabase: SupabaseClient,
  row: { user_id: string; kind: string; status: DeliveryStatus; payload?: unknown }
): Promise<void> {
  await supabase.from('notification_deliveries').upsert(
    {
      user_id: row.user_id,
      kind: row.kind,
      channel: 'push',
      status: row.status,
      payload: row.payload ?? null,
    },
    { onConflict: 'user_id,kind', ignoreDuplicates: true }
  );
}

/** Active push tokens for a user. */
export async function activeTokensFor(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) {
    console.error('[expoPush] activeTokensFor failed', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => r.token as string);
}

// ── Advisory lock (§6.11) ──────────────────────────────────────────────────────

/** Try to acquire a session advisory lock named after the dispatcher. */
export async function tryAdvisoryLock(
  supabase: SupabaseClient,
  name: string
): Promise<boolean> {
  // hashtext(name) → bigint key; pg_try_advisory_lock returns bool.
  const { data, error } = await supabase.rpc('try_dispatch_lock', { lock_name: name });
  if (error) {
    // RPC not present (optional) — fall back to "no lock", relying on the
    // (user_id, kind) unique index as the hard idempotency guard.
    return true;
  }
  return data === true;
}

// ── High-level per-user dispatch ───────────────────────────────────────────────

export type DispatchOutcome =
  | 'sent'
  | 'duplicate'
  | 'no_tokens'
  | 'skipped_prefs'
  | 'skipped_quiet_hours'
  | 'rate_limited'
  | 'failed';

export interface DispatchArgs {
  supabase: SupabaseClient;
  prefs: NotificationPrefsRow;
  now: Date;
  kind: string;
  /** Full, unredacted content (also used for the in-app inbox row). */
  content: { title: string; body: string };
  /** Redacted content shown on a locked screen when the user opted in. */
  redactedContent: { title: string; body: string };
  channelId: string;
  route?: string;
  params?: Record<string, unknown>;
  notificationType?: string;
  entityId?: string;
  interruptionLevel?: 'active' | 'timeSensitive' | 'passive';
  categoryId?: string;
  imageUrl?: string;
}

/**
 * The full guard → claim → send → finalize pipeline for one user + one `kind`.
 * Idempotent via the (user_id, kind) unique index. Honours push_enabled, quiet
 * hours, per-day rate limit, and lockscreen-redaction prefs.
 */
export async function dispatchPush(args: DispatchArgs): Promise<DispatchOutcome> {
  const { supabase, prefs, kind } = args;
  const userId = prefs.user_id;

  if (!prefs.push_enabled) {
    await recordSkip(supabase, { user_id: userId, kind, status: 'skipped_prefs' });
    return 'skipped_prefs';
  }

  const tokens = await activeTokensFor(supabase, userId);
  if (tokens.length === 0) return 'no_tokens'; // no record — can fire once a device registers

  if (quietHoursActive(prefs, args.now)) {
    await recordSkip(supabase, {
      user_id: userId,
      kind,
      status: 'skipped_quiet_hours',
    });
    return 'skipped_quiet_hours';
  }

  if (await rateLimitReached(supabase, userId, prefs.rate_limit_per_day)) {
    await recordSkip(supabase, { user_id: userId, kind, status: 'rate_limited' });
    return 'rate_limited';
  }

  // Full payload carried in data — the in-app inbox always materialises the
  // unredacted copy regardless of lockscreen redaction.
  const data = {
    v: PAYLOAD_VERSION,
    kind,
    route: args.route,
    params: args.params,
    notification_type: args.notificationType,
    inboxInsert: true,
    title: args.content.title,
    body: args.content.body,
    entityId: args.entityId,
    interruptionLevel: args.interruptionLevel,
    imageUrl: args.imageUrl,
  };

  const shown = prefs.hide_amounts_on_lockscreen ? args.redactedContent : args.content;

  if (!(await claimDelivery(supabase, { user_id: userId, kind, payload: data }))) {
    return 'duplicate';
  }

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: shown.title,
    body: shown.body,
    data,
    sound: 'default',
    channelId: args.channelId,
    priority: 'high',
    categoryId: args.categoryId,
    interruptionLevel: args.interruptionLevel ?? 'active',
  }));

  const tickets = await sendPushBatch(messages);
  const okTicket = tickets.find((t) => t.status === 'ok' && t.id);
  const errorTicket = tickets.find((t) => t.status === 'error');

  // Reap tokens Expo rejected outright at send time.
  const invalid = tickets
    .filter((t) => t.status === 'error' && isInvalidTokenError(t.details?.error))
    .map((t) => t.details?.expoPushToken)
    .filter((x): x is string => !!x);
  if (invalid.length) await markInvalidTokens(supabase, invalid);

  if (okTicket) {
    await finalizeDelivery(supabase, {
      user_id: userId,
      kind,
      status: 'sent',
      expo_ticket_id: okTicket.id,
    });
    return 'sent';
  }

  await finalizeDelivery(supabase, {
    user_id: userId,
    kind,
    status: 'failed',
    error_code: errorTicket?.details?.error ?? errorTicket?.message ?? 'unknown',
  });
  return 'failed';
}

// ── CORS / responses ───────────────────────────────────────────────────────────

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
