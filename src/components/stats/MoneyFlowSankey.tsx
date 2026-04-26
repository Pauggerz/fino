import React from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  onExpand,
}: {
  income: number;
  savings: number;
  expenseNodes: SankeyNode[];
  onExpand?: () => void;
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
  ].filter((n) => Number.isFinite(n.amount) && n.amount > 0);

  const totalRight = rightNodes.reduce((s, n) => s + n.amount, 0);
  // Scale against the larger side so paths fit when income > expenses (savings
  // visible as gap), and when expenses > income (overspend) we still see flow.
  // Fallback to 1 keeps SVG math safe; the early-return below catches no-data.
  const total = Math.max(income, totalRight, 1);

  const W = Math.max(280, SCREEN_W - 32 - 36);
  const H = 240;
  const PAD_TOP = 18;
  const PAD_BOTTOM = 22;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  // Floor for any node so a tiny category isn't an invisible 1-pixel sliver.
  const MIN_BAND = 4;

  const incomeBlockX = 24;
  const incomeBlockW = 36;
  const rightBlockW = 26;
  const rightBlockX = W - 90;
  const labelX = rightBlockX + rightBlockW + 6;

  // Compute proportional band heights, then enforce a min height per band and
  // re-normalise so the stack still totals innerH (avoid overflow off-card).
  const rawHeights = rightNodes.map(
    (n) => (n.amount / total) * innerH
  );
  const flooredHeights = rawHeights.map((h) => Math.max(h, MIN_BAND));
  const sumFloored = flooredHeights.reduce((s, h) => s + h, 0) || 1;
  const heights = flooredHeights.map((h) => (h / sumFloored) * innerH);

  // Right-side y positions
  const rightYs: { y0: number; y1: number; node: SankeyNode }[] = [];
  let cum = 0;
  rightNodes.forEach((n, i) => {
    const h = heights[i];
    rightYs.push({
      y0: PAD_TOP + cum,
      y1: PAD_TOP + cum + h,
      node: n,
    });
    cum += h;
  });

  // Income spans full innerH when income >= totalRight; otherwise shrinks
  // proportionally so flow paths visually convey the deficit.
  const incomeH = income >= totalRight
    ? innerH
    : (income / total) * innerH;
  const incomeY0 = PAD_TOP;
  const incomeY1 = PAD_TOP + incomeH;

  // Income segments: proportional to right-side bands within the income block.
  const incomeSegments: { y0: number; y1: number; node: SankeyNode }[] = [];
  const sumHeights = heights.reduce((s, h) => s + h, 0) || 1;
  let icum = 0;
  rightNodes.forEach((n, i) => {
    const h = (heights[i] / sumHeights) * incomeH;
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
        <View style={styles.headRight}>
          <View
            style={[styles.betaPill, { backgroundColor: colors.lavender }]}
          >
            <Text style={[styles.betaText, { color: colors.lavenderDark }]}>
              BETA
            </Text>
          </View>
          {onExpand ? (
            <Pressable
              onPress={onExpand}
              hitSlop={8}
              style={[
                styles.expandBtn,
                { backgroundColor: colors.surfaceSubdued },
              ]}
            >
              <Ionicons
                name="expand-outline"
                size={14}
                color={colors.textSecondary}
              />
            </Pressable>
          ) : null}
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
  headRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  betaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  expandBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
