import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import fmtPeso from '@/utils/format';

export type DonutSlice = {
  key: string;
  label: string;
  amount: number;
  color: string;
};

const RADIUS = 36;
const STROKE = 12;
const CIRC = 2 * Math.PI * RADIUS;
const CHART_SIZE = 110;

export function CategoryDonut({ slices }: { slices: DonutSlice[] }) {
  const { colors } = useTheme();

  // Drop non-positive amounts so SVG dasharray math never sees 0 / NaN / -.
  const safeSlices = slices.filter(
    (s) => Number.isFinite(s.amount) && s.amount > 0
  );
  const total = safeSlices.reduce((s, x) => s + x.amount, 0);
  const hasData = total > 0;
  const top = hasData ? safeSlices[0] : undefined;
  const topPct = top ? Math.round((top.amount / total) * 100) : 0;

  let cumulative = 0;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.white, borderColor: colors.cardBorderTransparent },
      ]}
    >
      <View style={styles.headRow}>
        <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
          BY CATEGORY
        </Text>
        <Text style={[styles.totalText, { color: colors.textSecondary }]}>
          {fmtPeso(total)} total
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.svgWrap}>
          <Svg width={CHART_SIZE} height={CHART_SIZE} viewBox="0 0 100 100">
            <G rotation={-90} originX={50} originY={50}>
              <Circle
                cx={50}
                cy={50}
                r={RADIUS}
                fill="none"
                stroke={colors.surfaceSubdued}
                strokeWidth={STROKE}
              />
              {hasData
                ? safeSlices.map((s) => {
                    const fraction = s.amount / total;
                    const dash = fraction * CIRC;
                    const offset = -cumulative * CIRC;
                    cumulative += fraction;
                    return (
                      <Circle
                        key={s.key}
                        cx={50}
                        cy={50}
                        r={RADIUS}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={STROKE}
                        strokeDasharray={`${dash} ${CIRC - dash}`}
                        strokeDashoffset={offset}
                        strokeLinecap="butt"
                      />
                    );
                  })
                : null}
            </G>
            {hasData && top ? (
              <>
                <SvgText
                  x={50}
                  y={48}
                  fontFamily="Inter_700Bold"
                  fontSize={12}
                  fill={colors.textPrimary}
                  textAnchor="middle"
                >
                  {topPct}%
                </SvgText>
                <SvgText
                  x={50}
                  y={60}
                  fontFamily="Inter_500Medium"
                  fontSize={7.5}
                  fill={colors.textSecondary}
                  textAnchor="middle"
                >
                  on {top.label}
                </SvgText>
              </>
            ) : null}
          </Svg>
        </View>

        <View style={styles.legend}>
          {!hasData ? (
            <Text
              style={[
                styles.emptyText,
                { color: colors.textSecondary },
              ]}
            >
              No expenses this month yet.
            </Text>
          ) : (
            safeSlices.map((s) => (
              <View key={s.key} style={styles.legendRow}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: s.color },
                  ]}
                />
                <Text
                  style={[
                    styles.legendName,
                    { color: colors.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
                <Text
                  style={[
                    styles.legendAmount,
                    { color: colors.textSecondary },
                  ]}
                >
                  {fmtPeso(s.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
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
  totalText: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 11,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  svgWrap: { width: CHART_SIZE, height: CHART_SIZE },
  legend: { flex: 1, gap: 6 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendName: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  legendAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 11,
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    paddingVertical: 16,
  },
});
