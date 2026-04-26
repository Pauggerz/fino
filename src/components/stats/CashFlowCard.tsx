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
  prevNet,
  trend,
  largest,
  txCount,
  daysElapsed,
}: {
  income: number;
  expenses: number;
  prevNet: number | null;
  trend: MonthTrendPoint[];
  largest: number;
  txCount: number;
  daysElapsed: number;
}) {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const net = income - expenses;
  const positive = net >= 0;
  const savingsPct = income > 0 ? Math.round((net / income) * 100) : 0;
  const dailyAvg = daysElapsed > 0 ? expenses / daysElapsed : 0;

  // Cap bar widths so income (always 100%) and expense (relative) read at a glance.
  const expenseRatio =
    income > 0 ? Math.min(1, expenses / income) : expenses > 0 ? 1 : 0;

  const trendMax = Math.max(
    1,
    ...trend.map((t) => Math.abs(t.net))
  );

  const deltaLabel =
    prevNet === null
      ? null
      : net >= prevNet
        ? `+${fmtPeso(net - prevNet)} vs prev`
        : `-${fmtPeso(prevNet - net)} vs prev`;
  const deltaUp = prevNet !== null && net >= prevNet;

  return (
    <Pressable
      onPress={() => navigation.navigate('CashFlow')}
      android_ripple={{ color: 'rgba(0,0,0,0.05)', borderless: false }}
    >
    <LinearGradient
      colors={
        isDark
          ? [colors.white, colors.white]
          : ['#FFFFFF', '#F4F0E9']
      }
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
          <Ionicons
            name="chevron-forward"
            size={14}
            color={colors.textSecondary}
          />
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

      {/* Dual bars */}
      <View style={styles.dualBars}>
        <View style={[styles.barCol, { backgroundColor: colors.surfaceSubdued }]}>
          <Text style={[styles.barLabel, { color: colors.textSecondary }]}>
            INCOME
          </Text>
          <Text style={[styles.barValue, { color: colors.incomeGreen }]}>
            {fmtPeso(income)}
          </Text>
          <View
            style={[
              styles.barFill,
              { backgroundColor: 'rgba(0,0,0,0.05)' },
            ]}
          >
            <View
              style={[
                styles.barFillInner,
                {
                  width: '100%',
                  backgroundColor: colors.incomeGreen,
                },
              ]}
            />
          </View>
        </View>
        <View style={[styles.barCol, { backgroundColor: colors.surfaceSubdued }]}>
          <Text style={[styles.barLabel, { color: colors.textSecondary }]}>
            EXPENSES
          </Text>
          <Text style={[styles.barValue, { color: colors.expenseRed }]}>
            {fmtPeso(expenses)}
          </Text>
          <View
            style={[
              styles.barFill,
              { backgroundColor: 'rgba(0,0,0,0.05)' },
            ]}
          >
            <View
              style={[
                styles.barFillInner,
                {
                  width: `${expenseRatio * 100}%`,
                  backgroundColor: colors.expenseRed,
                },
              ]}
            />
          </View>
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
    </Pressable>
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
    <View
      style={[styles.miniStat, { backgroundColor: colors.surfaceSubdued }]}
    >
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
  barFill: {
    height: 8,
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  barFillInner: {
    height: '100%',
    borderRadius: 999,
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
