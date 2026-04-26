import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import fmtPeso from '@/utils/format';
import type { SankeyNode } from '@/components/stats/MoneyFlowSankey';
import type { RootStackParamList } from '../navigation/RootNavigator';

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');

export default function SankeyFullscreenScreen() {
  const navigation = useNavigation<any>();
  const route =
    useRoute<RouteProp<RootStackParamList, 'SankeyFullscreen'>>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { income, savings, expenseNodes } = route.params ?? {
    income: 0,
    savings: 0,
    expenseNodes: [],
  };

  // Stage size — measured at runtime so the chart fills exactly the
  // available content area (between header and bottom safe area).
  const [stage, setStage] = useState({
    w: WIN_W - 24,
    h: WIN_H - insets.top - insets.bottom - 120,
  });
  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setStage({ w: width, h: height });
  };

  const styles = useMemo(
    () => createStyles(colors, insets.top),
    [colors, insets.top]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.iconBtn, { backgroundColor: colors.white }]}
          activeOpacity={0.75}
        >
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Money Flow
        </Text>
        <View style={styles.iconBtnSpacer} />
      </View>

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Tap × to close. Each band's height = its share of income.
      </Text>

      <View
        style={[styles.stage, { paddingBottom: insets.bottom + 12 }]}
        onLayout={onStageLayout}
      >
        <SankeyChart
          income={income}
          savings={savings}
          expenseNodes={expenseNodes}
          W={stage.w}
          H={stage.h}
          colors={colors}
        />
      </View>
    </View>
  );
}

function SankeyChart({
  income,
  savings,
  expenseNodes,
  W,
  H,
  colors,
}: {
  income: number;
  savings: number;
  expenseNodes: SankeyNode[];
  W: number;
  H: number;
  colors: any;
}) {
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
  const total = Math.max(income, totalRight, 1);

  // Layout — designed for portrait fullscreen. Right-side label column is wide
  // so labels never get truncated.
  const PAD_TOP = 40;
  const PAD_BOTTOM = 40;
  const innerH = Math.max(120, H - PAD_TOP - PAD_BOTTOM);
  const MIN_BAND = 10;

  const incomeBlockX = 24;
  const incomeBlockW = 44;
  const rightBlockW = 32;
  // Reserve roughly half the width for label column so amounts/labels fit.
  const labelColW = Math.max(160, W * 0.45);
  const rightBlockX = W - labelColW - rightBlockW;
  const labelX = rightBlockX + rightBlockW + 10;

  const rawHeights = rightNodes.map((n) => (n.amount / total) * innerH);
  const flooredHeights = rawHeights.map((h) => Math.max(h, MIN_BAND));
  const sumFloored = flooredHeights.reduce((s, h) => s + h, 0) || 1;
  const heights = flooredHeights.map((h) => (h / sumFloored) * innerH);

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

  const incomeH =
    income >= totalRight ? innerH : (income / total) * innerH;
  const incomeY0 = PAD_TOP;

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

  if (income <= 0 || rightNodes.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'Inter_500Medium',
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: 'center',
            paddingHorizontal: 32,
          }}
        >
          Need both income and expenses this month to render the flow.
        </Text>
      </View>
    );
  }

  return (
    <Svg width={W} height={H}>
      <Rect
        x={incomeBlockX}
        y={incomeY0}
        width={incomeBlockW}
        height={Math.max(2, incomeH)}
        rx={8}
        fill={colors.incomeGreen}
      />
      <SvgText
        x={incomeBlockX + incomeBlockW / 2}
        y={incomeY0 - 12}
        fontFamily="Inter_700Bold"
        fontSize={11}
        fill={colors.incomeGreen}
        textAnchor="middle"
      >
        INCOME
      </SvgText>
      <SvgText
        x={incomeBlockX + incomeBlockW / 2}
        y={incomeY0 + incomeH + 18}
        fontFamily="DMMono_500Medium"
        fontSize={11}
        fill={colors.textPrimary}
        textAnchor="middle"
      >
        {fmtPeso(income)}
      </SvgText>

      {rightYs.map((r, i) => {
        const left = incomeSegments[i];
        const cx1 =
          incomeBlockX +
          incomeBlockW +
          (rightBlockX - (incomeBlockX + incomeBlockW)) * 0.45;
        const cx2 =
          incomeBlockX +
          incomeBlockW +
          (rightBlockX - (incomeBlockX + incomeBlockW)) * 0.55;
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
            fillOpacity={0.6}
          />
        );
      })}

      {rightYs.map((r) => {
        const h = Math.max(2, r.y1 - r.y0);
        const labelY = r.y0 + h / 2;
        return (
          <React.Fragment key={`block-${r.node.key}`}>
            <Rect
              x={rightBlockX}
              y={r.y0}
              width={rightBlockW}
              height={h}
              rx={6}
              fill={r.node.color}
            />
            <SvgText
              x={labelX}
              y={labelY - 2}
              fontFamily="Inter_700Bold"
              fontSize={13}
              fill={colors.textPrimary}
            >
              {r.node.label}
            </SvgText>
            <SvgText
              x={labelX}
              y={labelY + 14}
              fontFamily="DMMono_500Medium"
              fontSize={11}
              fill={colors.textSecondary}
            >
              {fmtPeso(r.node.amount)} ·{' '}
              {((r.node.amount / total) * 100).toFixed(0)}%
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function createStyles(colors: any, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topInset,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 8,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 18,
      letterSpacing: -0.4,
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnSpacer: { width: 38, height: 38 },
    hint: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      textAlign: 'center',
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 4,
    },
    stage: {
      flex: 1,
      paddingHorizontal: 12,
      paddingTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
