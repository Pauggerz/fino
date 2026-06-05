/**
 * ChatCardView — the render seam (FINO_CHATBOT_CARDS.md §3/§4). Takes a typed,
 * fully-populated `ChatCard` from the brain and renders the matching mini
 * visual inside the chat bubble. This is the ONLY place a card touches the
 * theme: it maps the brain's semantic roles/status to tokens via `palette.ts`
 * (§3.1), so the brain stays theme-free and testable.
 *
 * Dumb by design: it computes nothing about the numbers — the brain froze them
 * (reply cards are snapshots, §6). It only draws.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '@/constants/theme';
import type { ChatCard, CardStatus, CardAction } from '@/intelligence';
import { MiniBars } from './MiniBars';
import { MiniSparkline } from './MiniSparkline';
import { ProgressBar } from './ProgressBar';
import { DeltaChip } from './DeltaChip';
import { statusColor, statusSurface, peso, shortPeso } from './palette';

const STATUS_PILL: Record<CardStatus, string> = {
  good: 'on track',
  watch: 'watch',
  over: 'over pace',
};

const COACH_ICON: Record<
  CardStatus,
  'checkmark-circle' | 'alert-circle' | 'warning'
> = {
  good: 'checkmark-circle',
  watch: 'alert-circle',
  over: 'warning',
};

function ChatCardViewBase({
  card,
  colors,
  onAction,
}: {
  card: ChatCard;
  colors: ThemeColors;
  /** Deep-link handler for an optional card action chip (§10 Q4). */
  onAction?: (target: CardAction['target']) => void;
}) {
  const baseStyle = [
    styles.card,
    {
      backgroundColor: colors.white,
      borderColor: colors.cardBorderTransparent,
    },
  ];

  let inner: React.ReactNode = null;

  if (card.kind === 'breakdown') {
    const { data } = card;
    inner = (
      <>
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
              THIS MONTH
            </Text>
            <Text style={[styles.bigValue, { color: colors.textPrimary }]}>
              {peso(data.total)}
            </Text>
          </View>
          {data.delta ? (
            <View style={styles.headRight}>
              <DeltaChip
                pct={data.delta.pct}
                direction={data.delta.direction}
                colors={colors}
              />
              <Text style={[styles.miniNote, { color: colors.textSecondary }]}>
                vs last month
              </Text>
            </View>
          ) : null}
        </View>
        <MiniBars segments={data.segments} colors={colors} />
      </>
    );
  } else if (card.kind === 'compare') {
    const { data } = card;
    const max = Math.max(data.current, data.previous, 1);
    const rows = [
      { label: data.currentLabel, value: data.current, color: colors.primary },
      {
        label: data.previousLabel,
        value: data.previous,
        color: colors.textSecondary,
      },
    ];
    inner = (
      <>
        <View style={styles.headRow}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
            SPENDING VS LAST MONTH
          </Text>
          <DeltaChip
            pct={data.pct}
            direction={data.direction}
            colors={colors}
          />
        </View>
        <View style={styles.cmpWrap}>
          {rows.map((r) => (
            <View key={r.label} style={styles.cmpRow}>
              <Text style={[styles.cmpLabel, { color: colors.textSecondary }]}>
                {r.label}
              </Text>
              <View style={styles.cmpBarCol}>
                <View
                  style={[
                    styles.cmpTrack,
                    { backgroundColor: colors.surfaceSubdued },
                  ]}
                >
                  <View
                    style={[
                      styles.cmpFill,
                      {
                        backgroundColor: r.color,
                        width: `${(r.value / max) * 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text style={[styles.cmpValue, { color: colors.textPrimary }]}>
                {peso(r.value)}
              </Text>
            </View>
          ))}
        </View>
      </>
    );
  } else if (card.kind === 'forecast') {
    const { data } = card;
    const sc = statusColor(data.status, colors);
    inner = (
      <>
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
              PROJECTED MONTH-END
            </Text>
            <Text style={[styles.bigValue, { color: colors.textPrimary }]}>
              {peso(data.projected)}
            </Text>
          </View>
          <View
            style={[
              styles.pill,
              { backgroundColor: statusSurface(data.status, colors) },
            ]}
          >
            <Text style={[styles.pillText, { color: sc }]}>
              {STATUS_PILL[data.status]}
            </Text>
          </View>
        </View>
        <MiniSparkline
          spent={data.spent}
          projected={data.projected}
          ciLow={data.ciLow}
          ciHigh={data.ciHigh}
          income={data.income}
          daysElapsed={data.daysElapsed}
          daysInMonth={data.daysInMonth}
          status={data.status}
          colors={colors}
        />
        <Text style={[styles.caption, { color: colors.textSecondary }]}>
          {peso(data.spent)} spent · range {shortPeso(data.ciLow)}–
          {shortPeso(data.ciHigh)}
        </Text>
      </>
    );
  } else {
    // coach
    const { data } = card;
    const sc = statusColor(data.status, colors);
    inner = (
      <>
        <View style={styles.coachHead}>
          <Ionicons name={COACH_ICON[data.status]} size={18} color={sc} />
          <Text style={[styles.coachTitle, { color: colors.textPrimary }]}>
            {data.title}
          </Text>
        </View>
        <Text style={[styles.coachMsg, { color: colors.textPrimary }]}>
          {data.message}
        </Text>
        {data.reasons && data.reasons.length > 0 ? (
          <View style={styles.reasons}>
            {data.reasons.map((r) => (
              <View key={r.label} style={styles.reasonRow}>
                <View style={styles.reasonHead}>
                  <Text
                    style={[styles.reasonLabel, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {r.label}
                  </Text>
                  {r.detail ? (
                    <Text
                      style={[
                        styles.reasonDetail,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {r.detail}
                    </Text>
                  ) : null}
                </View>
                {r.bar ? (
                  <ProgressBar
                    value={r.bar.value}
                    limit={r.bar.limit}
                    status={r.bar.status}
                    colors={colors}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View style={baseStyle}>
      {inner}
      {card.action ? (
        <TouchableOpacity
          style={[styles.actionChip, { borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => onAction?.(card.action!.target)}
        >
          <Text style={[styles.actionText, { color: colors.primary }]}>
            {card.action.label}
          </Text>
          <Ionicons name="arrow-forward" size={13} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Memoized: the chat list re-renders on every typewriter tick, but a card's
 * `card`/`colors` props are stable references, so historical cards (and the
 * live proactive card) skip re-rendering during streaming — keeping the SVG
 * sparkline off the per-tick render path. `onAction` identity is intentionally
 * ignored (it only fires on tap and always routes the same way).
 */
export const ChatCardView = React.memo(
  ChatCardViewBase,
  (prev, next) => prev.card === next.card && prev.colors === next.colors
);

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headLeft: { gap: 2 },
  headRight: { alignItems: 'flex-end', gap: 2 },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  bigValue: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 18,
  },
  miniNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  caption: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  // compare
  cmpWrap: { gap: 8 },
  cmpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cmpLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, width: 84 },
  cmpBarCol: { flex: 1 },
  cmpTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  cmpFill: { height: 8, borderRadius: 999 },
  cmpValue: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 12,
    minWidth: 64,
    textAlign: 'right',
  },
  // coach
  coachHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coachTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  coachMsg: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    marginTop: -4,
  },
  reasons: { gap: 10 },
  reasonRow: { gap: 6 },
  reasonHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  reasonLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flexShrink: 1 },
  reasonDetail: { fontFamily: 'DMMono_400Regular', fontSize: 11 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
