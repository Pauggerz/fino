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
import type {
  ChatCard,
  CardStatus,
  CardAction,
  TxListRow,
} from '@/intelligence';
import { MiniBars } from './MiniBars';
import { MiniSparkline } from './MiniSparkline';
import { ProgressBar } from './ProgressBar';
import { DeltaChip } from './DeltaChip';
import { Reveal, REVEAL_STAGGER_MS } from './Reveal';
import {
  roleColor,
  statusColor,
  statusSurface,
  peso,
  shortPeso,
} from './palette';

/** The card body starts revealing just after the bubble text settles, so the
 *  reply reads "text first, then the card assembles" (chat-timing-mockup). */
const CARD_BASE_MS = 140;

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

const TX_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${TX_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** One transaction row inside a `txList` / `status` card. Tappable when
 *  `onPress` is provided (deep-links to TransactionDetail via `onAction`). */
function TxRowView({
  row,
  colors,
  onPress,
}: {
  row: TxListRow;
  colors: ThemeColors;
  onPress?: () => void;
}) {
  const isIncome = row.type === 'income';
  return (
    <TouchableOpacity
      style={styles.txRow}
      activeOpacity={onPress ? 0.6 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.txRowLeft}>
        <Text
          style={[styles.txName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {row.name}
        </Text>
        <Text
          style={[styles.txMeta, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {`${row.category ?? 'Uncategorized'} · ${fmtShortDate(row.date)}`}
        </Text>
      </View>
      <Text
        style={[
          styles.txAmount,
          {
            color: isIncome ? statusColor('good', colors) : colors.textPrimary,
          },
        ]}
      >
        {(isIncome ? '+' : '') + peso(row.amount)}
      </Text>
    </TouchableOpacity>
  );
}

function ChatCardViewBase({
  card,
  colors,
  onAction,
  animateIn = false,
}: {
  card: ChatCard;
  colors: ThemeColors;
  /** Handler for a card action chip / tappable row (V3). ChatScreen dispatches
   *  the navigate/prompt action. */
  onAction?: (action: CardAction) => void;
  /** Stagger the card in on mount (set only for a freshly-sent reply). */
  animateIn?: boolean;
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
        <MiniBars
          segments={data.segments}
          colors={colors}
          animate={animateIn}
          baseDelay={REVEAL_STAGGER_MS}
        />
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
  } else if (card.kind === 'coach') {
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
  } else if (card.kind === 'txList') {
    const { data } = card;
    inner = (
      <>
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
            <Text
              style={[styles.eyebrow, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {data.title.toUpperCase()}
            </Text>
            {data.total != null ? (
              <Text style={[styles.bigValue, { color: colors.textPrimary }]}>
                {peso(data.total)}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.txList}>
          {data.rows.map((r) => (
            <TxRowView
              key={r.id}
              row={r}
              colors={colors}
              onPress={
                onAction
                  ? () =>
                      onAction({
                        kind: 'navigate',
                        label: r.name,
                        target: 'transactionDetail',
                        params: { id: r.id },
                      })
                  : undefined
              }
            />
          ))}
        </View>
        {data.matchCount && data.matchCount > data.rows.length ? (
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            +{data.matchCount - data.rows.length} more
          </Text>
        ) : null}
      </>
    );
  } else if (card.kind === 'status') {
    const { data } = card;
    const sc = statusColor(data.status, colors);
    inner = (
      <>
        <View style={styles.coachHead}>
          <Ionicons
            name={data.yes ? 'checkmark-circle' : COACH_ICON[data.status]}
            size={18}
            color={sc}
          />
          <Text style={[styles.coachTitle, { color: colors.textPrimary }]}>
            {data.title}
          </Text>
        </View>
        <Text style={[styles.coachMsg, { color: colors.textPrimary }]}>
          {data.message}
        </Text>
        {data.tx ? (
          <TxRowView
            row={data.tx}
            colors={colors}
            onPress={
              onAction
                ? () =>
                    onAction({
                      kind: 'navigate',
                      label: data.tx!.name,
                      target: 'transactionDetail',
                      params: { id: data.tx!.id },
                    })
                : undefined
            }
          />
        ) : null}
      </>
    );
  } else if (card.kind === 'summary') {
    const { data } = card;
    const netColor =
      data.net >= 0 ? statusColor('good', colors) : statusColor('over', colors);
    inner = (
      <>
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
            <Text
              style={[styles.eyebrow, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {data.label.toUpperCase()}
            </Text>
            <Text style={[styles.bigValue, { color: netColor }]}>
              {(data.net < 0 ? '−' : '') + peso(Math.abs(data.net))} net
            </Text>
          </View>
          {data.savingsRate != null ? (
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: statusSurface(
                    data.savingsRate >= 0 ? 'good' : 'over',
                    colors
                  ),
                },
              ]}
            >
              <Text style={[styles.pillText, { color: netColor }]}>
                {Math.round(data.savingsRate * 100)}% saved
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text
              style={[styles.summaryLabel, { color: colors.textSecondary }]}
            >
              IN
            </Text>
            <Text
              style={[
                styles.summaryValue,
                { color: statusColor('good', colors) },
              ]}
            >
              {peso(data.income)}
            </Text>
          </View>
          <View style={styles.summaryStat}>
            <Text
              style={[styles.summaryLabel, { color: colors.textSecondary }]}
            >
              OUT
            </Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {peso(data.expense)}
            </Text>
          </View>
        </View>
        {data.segments.length ? (
          <MiniBars
            segments={data.segments}
            colors={colors}
            animate={animateIn}
            baseDelay={REVEAL_STAGGER_MS}
          />
        ) : null}
      </>
    );
  } else if (card.kind === 'budget') {
    const { data } = card;
    inner = (
      <>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          BUDGETS THIS MONTH
        </Text>
        <View style={styles.budgetList}>
          {data.rows.map((r) => (
            <View key={r.label} style={styles.budgetRow}>
              <View style={styles.budgetHead}>
                <Text
                  style={[styles.budgetLabel, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {r.label}
                </Text>
                <Text
                  style={[
                    styles.budgetAmount,
                    { color: statusColor(r.status, colors) },
                  ]}
                >
                  {peso(r.spent)} / {peso(r.limit)}
                </Text>
              </View>
              <ProgressBar
                value={r.spent}
                limit={r.limit}
                status={r.status}
                colors={colors}
              />
            </View>
          ))}
        </View>
      </>
    );
  } else if (card.kind === 'needsWants') {
    const { data } = card;
    const needColor = roleColor('cat-0');
    const wantColor = roleColor('cat-3');
    const needPctW = Math.round(data.needPct * 100);
    inner = (
      <>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          NEEDS VS WANTS
        </Text>
        <View
          style={[styles.nwTrack, { backgroundColor: colors.surfaceSubdued }]}
        >
          {data.need > 0 ? (
            <View style={{ flex: data.need, backgroundColor: needColor }} />
          ) : null}
          {data.want > 0 ? (
            <View style={{ flex: data.want, backgroundColor: wantColor }} />
          ) : null}
        </View>
        <View style={styles.nwLegend}>
          <View style={styles.nwLegendItem}>
            <View style={[styles.nwDot, { backgroundColor: needColor }]} />
            <Text style={[styles.nwLegendText, { color: colors.textPrimary }]}>
              Needs {needPctW}% · {peso(data.need)}
            </Text>
          </View>
          <View style={styles.nwLegendItem}>
            <View style={[styles.nwDot, { backgroundColor: wantColor }]} />
            <Text style={[styles.nwLegendText, { color: colors.textPrimary }]}>
              Wants {100 - needPctW}% · {peso(data.want)}
            </Text>
          </View>
        </View>
        {data.unknown ? (
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            {peso(data.unknown)} uncategorized (left out)
          </Text>
        ) : null}
      </>
    );
  } else {
    // pattern (day-of-week bars / short trend series)
    const { data } = card;
    const accent = data.direction
      ? statusColor(
          data.direction === 'up'
            ? 'over'
            : data.direction === 'down'
              ? 'good'
              : 'watch',
          colors
        )
      : colors.primary;
    const max = data.bars.reduce((m, b) => Math.max(m, b.amount), 0) || 1;
    inner = (
      <>
        <View style={styles.headRow}>
          <Text
            style={[styles.eyebrow, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {data.title}
          </Text>
          {data.direction ? (
            <Ionicons
              name={
                data.direction === 'up'
                  ? 'trending-up'
                  : data.direction === 'down'
                    ? 'trending-down'
                    : 'remove'
              }
              size={16}
              color={accent}
            />
          ) : null}
        </View>
        <Text style={[styles.coachMsg, { color: colors.textPrimary }]}>
          {data.caption}
        </Text>
        <View style={styles.patternWrap}>
          {data.bars.map((b, i) => (
            <View key={`${b.label}-${i}`} style={styles.patternRow}>
              <Text
                style={[styles.patternLabel, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {b.label}
              </Text>
              <View style={styles.patternBarCol}>
                <View
                  style={[
                    styles.patternTrack,
                    { backgroundColor: colors.surfaceSubdued },
                  ]}
                >
                  <View
                    style={[
                      styles.patternFill,
                      {
                        backgroundColor: b.highlight
                          ? accent
                          : colors.textSecondary,
                        opacity: b.highlight ? 1 : 0.4,
                        width: `${Math.max(0.04, b.amount / max) * 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text
                style={[styles.patternAmount, { color: colors.textPrimary }]}
              >
                {shortPeso(b.amount)}
              </Text>
            </View>
          ))}
        </View>
      </>
    );
  }

  return (
    <View style={baseStyle}>
      <Reveal animate={animateIn} delay={CARD_BASE_MS} style={styles.inner}>
        {inner}
      </Reveal>
      {card.action || card.actions?.length ? (
        <Reveal animate={animateIn} delay={CARD_BASE_MS + 120}>
          <View style={styles.actionRow}>
            {[
              ...(card.action ? [card.action] : []),
              ...(card.actions ?? []),
            ].map((a) => (
              <TouchableOpacity
                key={a.label}
                style={[styles.actionChip, { borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => onAction?.(a)}
              >
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  {a.label}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={13}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ))}
          </View>
        </Reveal>
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
  // The reveal wrapper holds the card's sections; it owns their spacing so the
  // header → visual gap survives the extra Animated.View.
  inner: { gap: 12 },
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
  // txList / status rows
  txList: { gap: 2 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 7,
  },
  txRowLeft: { flex: 1, gap: 1 },
  txName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  txMeta: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  txAmount: { fontFamily: 'DMMono_500Medium', fontSize: 13 },
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
  // summary
  summaryRow: { flexDirection: 'row', gap: 20 },
  summaryStat: { gap: 1 },
  summaryLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  summaryValue: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
  // budget
  budgetList: { gap: 10 },
  budgetRow: { gap: 5 },
  budgetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  budgetLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flexShrink: 1 },
  budgetAmount: { fontFamily: 'DMMono_500Medium', fontSize: 11 },
  // needsWants
  nwTrack: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 999,
    overflow: 'hidden',
  },
  nwLegend: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  nwLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nwDot: { width: 8, height: 8, borderRadius: 4 },
  nwLegendText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  // pattern
  patternWrap: { gap: 6 },
  patternRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  patternLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, width: 56 },
  patternBarCol: { flex: 1 },
  patternTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  patternFill: { height: 8, borderRadius: 999 },
  patternAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 11,
    minWidth: 48,
    textAlign: 'right',
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
