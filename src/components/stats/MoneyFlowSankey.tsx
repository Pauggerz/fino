import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import fmtPeso from '@/utils/format';

export type SankeyNode = {
  key: string;
  label: string;
  amount: number;
  color: string;
};

const SCREEN_W = Dimensions.get('window').width;

export function MoneyFlowSankey({
  income,
  savings,
  expenseNodes,
}: {
  income: number;
  savings: number;
  expenseNodes: SankeyNode[];
}) {
  const { colors } = useTheme();

  // Right-side ordering: Savings first, then expenses sorted desc by amount.
  const rightNodes: SankeyNode[] = [
    {
      key: 'savings',
      label: 'Savings',
      amount: Math.max(0, savings),
      color: colors.incomeGreen,
    },
    ...expenseNodes,
  ].filter((n) => n.amount > 0);

  const totalRight = rightNodes.reduce((s, n) => s + n.amount, 0);
  const total = Math.max(income, totalRight, 1);

  const W = Math.max(280, SCREEN_W - 32 - 36);
  const H = 240;
  const PAD_TOP = 18;
  const PAD_BOTTOM = 22;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const incomeBlockX = 24;
  const incomeBlockW = 36;
  const rightBlockW = 26;
  const rightBlockX = W - 90;
  const labelX = rightBlockX + rightBlockW + 6;

  // Compute right-side y positions
  const rightYs: { y0: number; y1: number; node: SankeyNode }[] = [];
  let cum = 0;
  rightNodes.forEach((n) => {
    const h = (n.amount / total) * innerH;
    rightYs.push({
      y0: PAD_TOP + cum,
      y1: PAD_TOP + cum + h,
      node: n,
    });
    cum += h;
  });

  // Income spans the full innerH (or proportional if income < total)
  const incomeH = (Math.min(income, total) / total) * innerH;
  const incomeY0 = PAD_TOP;
  const incomeY1 = PAD_TOP + incomeH;

  // Carve income into segments matching right-side proportions
  const incomeSegments: { y0: number; y1: number; node: SankeyNode }[] = [];
  let icum = 0;
  rightNodes.forEach((n) => {
    const h = (n.amount / total) * innerH;
    incomeSegments.push({
      y0: incomeY0 + icum,
      y1: incomeY0 + icum + h,
      node: n,
    });
    icum += h;
  });

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.white, borderColor: colors.cardBorderTransparent },
      ]}
    >
      <View style={styles.headRow}>
        <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
          MONEY FLOW
        </Text>
        <View
          style={[styles.betaPill, { backgroundColor: colors.lavender }]}
        >
          <Text style={[styles.betaText, { color: colors.lavenderDark }]}>
            BETA
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View>
          <Text
            style={[
              styles.savingsRate,
              { color: colors.incomeGreen },
            ]}
          >
            {income > 0
              ? `${((Math.max(0, savings) / income) * 100).toFixed(1)}%`
              : '—'}
          </Text>
          <Text
            style={[styles.savingsLabel, { color: colors.textSecondary }]}
          >
            savings rate this month
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={[styles.incomeLabel, { color: colors.textSecondary }]}
          >
            Income
          </Text>
          <Text style={[styles.incomeAmount, { color: colors.textPrimary }]}>
            {fmtPeso(income)}
          </Text>
        </View>
      </View>

      {income <= 0 || rightNodes.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Need both income and expenses this month to render the flow.
        </Text>
      ) : (
        <Svg width={W} height={H}>
          {/* Income block */}
          <Rect
            x={incomeBlockX}
            y={incomeY0}
            width={incomeBlockW}
            height={Math.max(2, incomeY1 - incomeY0)}
            rx={6}
            fill={colors.incomeGreen}
          />
          <SvgText
            x={incomeBlockX + incomeBlockW / 2}
            y={incomeY0 - 6}
            fontFamily="Inter_700Bold"
            fontSize={9}
            fill={colors.incomeGreen}
            textAnchor="middle"
          >
            INCOME
          </SvgText>

          {/* Flow paths — one per right node */}
          {rightYs.map((r, i) => {
            const left = incomeSegments[i];
            const cx1 = incomeBlockX + incomeBlockW + (rightBlockX - (incomeBlockX + incomeBlockW)) * 0.45;
            const cx2 = incomeBlockX + incomeBlockW + (rightBlockX - (incomeBlockX + incomeBlockW)) * 0.55;
            const d =
              `M ${incomeBlockX + incomeBlockW} ${left.y0} ` +
              `C ${cx1} ${left.y0}, ${cx2} ${r.y0}, ${rightBlockX} ${r.y0} ` +
              `L ${rightBlockX} ${r.y1} ` +
              `C ${cx2} ${r.y1}, ${cx1} ${left.y1}, ${incomeBlockX + incomeBlockW} ${left.y1} Z`;
            return (
              <Path
                key={r.node.key}
                d={d}
                fill={r.node.color}
                fillOpacity={0.55}
              />
            );
          })}

          {/* Right blocks */}
          {rightYs.map((r) => {
            const h = Math.max(2, r.y1 - r.y0);
            return (
              <React.Fragment key={`block-${r.node.key}`}>
                <Rect
                  x={rightBlockX}
                  y={r.y0}
                  width={rightBlockW}
                  height={h}
                  rx={4}
                  fill={r.node.color}
                />
                <SvgText
                  x={labelX}
                  y={r.y0 + Math.min(h, 18) / 2 + 4}
                  fontFamily="Inter_600SemiBold"
                  fontSize={10}
                  fill={colors.textPrimary}
                >
                  {r.node.label}
                </SvgText>
                {h >= 18 ? (
                  <SvgText
                    x={labelX}
                    y={r.y0 + Math.min(h, 18) / 2 + 16}
                    fontFamily="DMMono_500Medium"
                    fontSize={9}
                    fill={colors.textSecondary}
                  >
                    {fmtPeso(r.node.amount)} ·{' '}
                    {((r.node.amount / total) * 100).toFixed(0)}%
                  </SvgText>
                ) : null}
              </React.Fragment>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  betaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  betaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  savingsRate: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 24,
    letterSpacing: -0.4,
  },
  savingsLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 2,
  },
  incomeLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  incomeAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 14,
  },
  empty: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    paddingVertical: 16,
  },
});
