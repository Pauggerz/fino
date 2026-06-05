/**
 * Proactive coach selection (FINO_CHATBOT_CARDS.md §5 surface 2).
 *
 * On chat open, the ChatScreen resolves the current `Insights` and calls
 * `selectProactiveCoach` to pick the SINGLE most important nudge, rendered as a
 * live, dismissible card near the top — recomputed each open, never persisted
 * (§6). Pure & synchronous; no theme, no DB.
 *
 * Gate (so the chat never opens with "everything's fine" noise):
 *   - sentiment must be NON-NEUTRAL (skip the bland baseline), and
 *   - there must be something concrete to say — a hot category, an imminent
 *     bill, or a genuine positive milestone (a coach message + reason/positive
 *     sentiment). Otherwise return null and show nothing.
 *
 * Priority is inherited from the engine's own `coach.sentiment` +
 * anomaly ranking (over-budget/negative → anomaly → upcoming bill → positive),
 * which `buildCoachCard` already encodes; here we just decide *whether* to show.
 */

import type { Insights } from '../../services/IntelligenceEngine';
import type { ChatCard, CardAction } from './types';
import { buildCoachCard, sentimentToStatus } from './cards';

const OPEN_INSIGHTS: CardAction = {
  kind: 'navigate',
  label: 'Open Insights',
  target: 'insights',
};

export function selectProactiveCoach(insights: Insights): ChatCard | null {
  // No "everything's fine" noise — only surface a non-neutral verdict.
  if (insights.coach.sentiment === 'neutral') return null;

  const status = sentimentToStatus(insights.coach.sentiment);
  const data = buildCoachCard(insights, { maxReasons: 1 });

  // A cautious/negative verdict is always worth surfacing. A positive one only
  // earns the slot when it's a real milestone (a concrete reason to celebrate
  // or an explicit coach message), not just an empty "good" baseline.
  const isConcern = status === 'over' || status === 'watch';
  const isMilestone =
    status === 'good' &&
    (Boolean(data.reasons?.length) || data.message.trim().length > 0);
  if (!isConcern && !isMilestone) return null;

  return { kind: 'coach', data, action: OPEN_INSIGHTS };
}
