import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import fmtPeso from '@/utils/format';

export type MonthTrendPoint = {
  label: string;
  net: number;
  isCurrent?: boolean;
};

export function CashFlowCard({
  income,
  expenses,
  prevIncome,
  prevExpenses,
  prevNet,
  trend,
  largest,
  txCount,
  daysElapsed,
  interactive = true,
}: {
  income: number;
  expenses: number;
  prevIncome?: number | null;
  prevExpenses?: number | null;
  prevNet: number | null;
  trend: MonthTrendPoint[];
  largest: number;
  txCount: number;
  daysElapsed: number;
  // When false, the card-wide press-to-navigate-to-CashFlow is disabled and
  // the trailing chevron is hidden — used on CashFlowScreen itself, where
  // both would be no-ops.
  interactive?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const net = income - expenses;
  const positive = net >= 0;
  const savingsPct = income > 0 ? Math.round((net / income) * 100) : 0;
  const dailyAvg = daysElapsed > 0 ? expenses / daysElapsed : 0;

  const incomeDelta = computeDelta(income, prevIncome);
  const expenseDelta = computeDelta(expenses, prevExpenses);

  const trendMax = Math.max(1, ...trend.map((t) => Math.abs(t.net)));

  const deltaLabel =
    prevNet === null
      ? null
      : net >= prevNet
        ? `+${fmtPeso(net - prevNet)} vs prev`
        : `-${fmtPeso(prevNet - net)} vs prev`;
  const deltaUp = prevNet !== null && net >= prevNet;

  const Wrapper: React.ComponentType<any> = interactive ? Pressable : View;
  const wrapperProps = interactive
    ? {
        onPress: () => navigation.navigate('CashFlow'),
        android_ripple: { color: 'rgba(0,0,0,0.05)', borderless: false },
      }
    : {};

  return (
    <Wrapper {...wrapperProps}>
      <LinearGradient
        colors={isDark ? [colors.white, colors.white] : ['#FFFFFF', '#F4F0E9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: colors.cardBorderTransparent }]}
      >
        {/* Head */}
        <View style={styles.headRow}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
            CASH FLOW
          </Text>
          <View style={styles.headRight}>
            {deltaLabel ? (
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: deltaUp
                      ? colors.onTrackBg1
                      : colors.coralLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: deltaUp ? colors.incomeGreen : colors.expenseRed },
                  ]}
                >
                  {deltaUp ? '▲ ' : '▼ '}
                  {deltaLabel}
                </Text>
              </View>
            ) : null}
            {interactive ? (
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.textSecondary}
              />
            ) : null}
          </View>
        </View>

        {/* Hero net amount */}
        <Text
          style={[
            styles.netAmount,
            { color: positive ? colors.incomeGreen : colors.expenseRed },
          ]}
        >
          {positive ? '+' : '-'}
          {fmtPeso(net)}
        </Text>
        <Text style={[styles.netLabel, { color: colors.textSecondary }]}>
          Net this month — you kept {savingsPct}% of income
        </Text>

        {/* Dual columns. The previous green/red bar that lived under each value
          conveyed no useful information (income was always 100%, expense was
          income/expense ratio that already reads from the numbers above). It
          is replaced with a vs-prev-month delta — same vertical footprint,
          actually informative. */}
        <View style={styles.dualBars}>
          <View
            style={[styles.barCol, { backgroundColor: colors.surfaceSubdued }]}
          >
            <Text style={[styles.barLabel, { color: colors.textSecondary }]}>
              INCOME
            </Text>
            <Text style={[styles.barValue, { color: colors.incomeGreen }]}>
              {fmtPeso(income)}
            </Text>
            <DeltaPill
              delta={incomeDelta}
              // For income, going up is good; treated the same as expense going down.
              goodDirection="up"
              colors={colors}
            />
          </View>
          <View
            style={[styles.barCol, { backgroundColor: colors.surfaceSubdued }]}
          >
            <Text style={[styles.barLabel, { color: colors.textSecondary }]}>
              EXPENSES
            </Text>
            <Text style={[styles.barValue, { color: colors.expenseRed }]}>
              {fmtPeso(expenses)}
            </Text>
            <DeltaPill
              delta={expenseDelta}
              goodDirection="down"
              colors={colors}
            />
          </View>
        </View>

        {/* Mini stats */}
        <View style={styles.miniStats}>
          <MiniStat label="Largest" value={fmtPeso(largest)} colors={colors} />
          <MiniStat label="Txns" value={String(txCount)} colors={colors} />
          <MiniStat
            label="Daily avg"
            value={fmtPeso(dailyAvg)}
            colors={colors}
          />
        </View>

        {/* 6-month trend strip */}
        <View style={{ marginTop: 18 }}>
          <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>
            6-MONTH NET TREND
          </Text>
          <View style={styles.miniBars}>
            {trend.map((t) => {
              const height = `${Math.max(8, (Math.abs(t.net) / trendMax) * 100)}%`;
              const negative = t.net < 0;
              const fill = t.isCurrent
                ? colors.primary
                : negative
                  ? colors.expenseRed
                  : colors.incomeGreen;
              return (
                <View key={t.label} style={styles.miniBarCol}>
                  <View
                    style={[
                      styles.miniBar,
                      {
                        height: height as any,
                        backgroundColor: fill,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.miniBarLabel,
                      {
                        color: t.isCurrent
                          ? colors.primary
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    {t.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </LinearGradient>
    </Wrapper>
  );
}

type Delta =
  | { kind: 'pct'; up: boolean; pct: number }
  | { kind: 'new'; up: boolean }
  | null;

// Builds the vs-prev-month comparison. Returns null when there's no prior data
// or both sides are zero (nothing meaningful to compare). When prev is zero
// but current is positive, we mark it as "new" so the pill reads "New" rather
// than the misleading "+∞%".
function computeDelta(current: number, prev: number | null | undefined): Delta {
  if (prev == null) return null;
  if (prev === 0 && current === 0) return null;
  if (prev === 0) return { kind: 'new', up: current > 0 };
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return { kind: 'pct', up: true, pct: 0 };
  return { kind: 'pct', up: pct > 0, pct: Math.abs(pct) };
}

function DeltaPill({
  delta,
  goodDirection,
  colors,
}: {
  delta: Delta;
  goodDirection: 'up' | 'down';
  colors: any;
}) {
  if (!delta) {
    return (
      <View style={styles.deltaRow}>
        <Text
          style={[styles.deltaMuted, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          No prior month
        </Text>
      </View>
    );
  }

  const goingUp = delta.up;
  const isGood = goodDirection === 'up' ? goingUp : !goingUp;
  const tint = isGood ? colors.incomeGreen : colors.expenseRed;
  const bg = isGood ? colors.onTrackBg1 : colors.coralLight;

  const label =
    delta.kind === 'new'
      ? 'New'
      : delta.pct === 0
        ? 'Flat vs prev'
        : `${goingUp ? 'Up' : 'Down'} ${delta.pct}% vs prev`;

  return (
    <View style={styles.deltaRow}>
      <View style={[styles.deltaPill, { backgroundColor: bg }]}>
        <Text style={[styles.deltaPillText, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function MiniStat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={[styles.miniStat, { backgroundColor: colors.surfaceSubdued }]}>
      <Text style={[styles.miniStatKey, { color: colors.textSecondary }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.miniStatVal, { color: colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  netAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 36,
    letterSpacing: -1,
    lineHeight: 38,
  },
  netLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 14,
  },
  dualBars: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  barCol: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
  },
  barLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 6,
  },
  barValue: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  deltaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  deltaPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  deltaMuted: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 0.2,
  },
  miniStats: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
  },
  miniStat: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  miniStatKey: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  miniStatVal: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
    marginTop: 2,
  },
  miniLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 8,
  },
  miniBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 38,
    gap: 6,
  },
  miniBarCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  miniBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 3,
  },
  miniBarLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    marginTop: 4,
  },
});
