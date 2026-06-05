/**
 * Theme mapping + formatting for chat cards (FINO_CHATBOT_CARDS.md §3.1, §4).
 *
 * The brain emits semantic ROLES, never colors — these helpers (used only by
 * the renderer, which has `useTheme()`) turn a role/status into a concrete
 * theme token so cards stay correct across all seven accents + light/dark.
 */

import type { ThemeColors } from '@/constants/theme';
import type { CardStatus } from '@/intelligence';

/**
 * Stable category palette for breakdown segments, mirroring the Stats merchant
 * palette so chat cards feel of-a-piece with the Insights screen. Indexed by a
 * `cat-N` role; wraps if N exceeds the palette length.
 */
const CAT_PALETTE = [
  '#1B7A4B',
  '#1F4FB6',
  '#C97A20',
  '#7A4AB8',
  '#E8856A',
  '#0F5B3F',
  '#0072FF',
  '#A0153E',
  '#5B8C6E',
  '#D31921',
];

/** Resolve a `cat-N` segment role to a palette color. */
export function roleColor(role: string): string {
  const m = /^cat-(\d+)$/.exec(role);
  const idx = m ? Number.parseInt(m[1], 10) : 0;
  return CAT_PALETTE[
    ((idx % CAT_PALETTE.length) + CAT_PALETTE.length) % CAT_PALETTE.length
  ];
}

/** Foreground/line color for a status: good → positive, watch → amber, over → negative. */
export function statusColor(status: CardStatus, colors: ThemeColors): string {
  if (status === 'good') return colors.incomeGreen;
  if (status === 'watch') return colors.statWarnBar;
  return colors.expenseRed;
}

/** Subtle tinted surface for a status, for coach/forecast card backgrounds. */
export function statusSurface(status: CardStatus, colors: ThemeColors): string {
  if (status === 'good') return colors.onTrackBg1;
  if (status === 'watch') return colors.billCardBg;
  return colors.coralLight;
}

/** ₱ formatter — whole pesos, PH grouping. Matches the brain's `nlg.peso`. */
export function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString('en-PH')}`;
}

/** Compact ₱ for tight bar/axis labels: ₱1.2k, ₱34k, ₱1.1M. */
export function shortPeso(v: number): string {
  if (v <= 0) return '₱0';
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `₱${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return `₱${Math.round(v)}`;
}
