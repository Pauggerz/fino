import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  PanResponder,
  Vibration,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors, spacing } from '../constants/theme';
import { Category } from '../services/aiCategoryMap';

// ─── SVG ICONS FROM HOME SCREEN ───────────────────────────────────────────────
function getCategoryIcon(id: string, color: string) {
  switch (id.toLowerCase()) {
    case 'food':
      return (
        <Path
          d="M11 2V9C11 10.1 10.1 11 9 11V20H7V11C5.9 11 5 10.1 5 9V2H6V7H7V2H8V7H9V2H11ZM15 2C16.1 2 17 2.9 17 4V10H14V20H12V2H15Z"
          fill={color}
        />
      );
    case 'transport':
      return (
        <Path
          d="M4 16C4 17.1 4.9 18 6 18H6.5L6 20H8L8.5 18H15.5L16 20H18L17.5 18H18C19.1 18 20 17.1 20 16V6C20 3.8 18.2 2 16 2H8C5.8 2 4 3.8 4 6V16ZM7.5 14C6.7 14 6 13.3 6 12.5C6 11.7 6.7 11 7.5 11C8.3 11 9 11.7 9 12.5C9 13.3 8.3 14 7.5 14ZM16.5 14C15.7 14 15 13.3 15 12.5C15 11.7 15.7 11 16.5 11C17.3 11 18 11.7 18 12.5C18 13.3 17.3 14 16.5 14ZM6 9V6H18V9H6Z"
          fill={color}
        />
      );
    case 'shopping':
      return (
        <Path
          d="M16 6V4C16 1.8 14.2 0 12 0C9.8 0 8 1.8 8 4V6H2V22C2 23.1 2.9 24 4 24H20C21.1 24 22 23.1 22 22V6H16ZM10 4C10 2.9 10.9 2 12 2C13.1 2 14 2.9 14 4V6H10V4ZM20 22H4V8H8V10C8 10.6 8.4 11 9 11C9.6 11 10 10.6 10 10V8H14V10C14 10.6 14.4 11 15 11C15.6 11 16 10.6 16 10V8H20V22Z"
          fill={color}
        />
      );
    case 'bills':
      return (
        <Path
          d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM13 9V3.5L18.5 9H13Z"
          fill={color}
        />
      );
    default:
      return (
        <Path
          d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z"
          fill={color}
        />
      );
  }
}

// ─── THEME SYNC ─────────────────────────────────────────────────────────────
const CATEGORY_THEME: Record<
  Category,
  {
    nameColor: string;
    barColor: string;
    iconGrad: readonly [string, string];
    badgeBg: string;
  }
> = {
  food: {
    nameColor: '#B27B16',
    barColor: '#F2A649',
    iconGrad: ['#FFF3E0', '#ffe4b5'] as const,
    badgeBg: '#FFF3E0',
  },
  transport: {
    nameColor: '#1A5C9B',
    barColor: '#4CA1EF',
    iconGrad: ['#E8F4FD', '#c8e4f8'] as const,
    badgeBg: '#EEF6FF',
  },
  shopping: {
    nameColor: '#9B1A5C',
    barColor: '#F27A9B',
    iconGrad: ['#FDE8F0', '#fbc8dc'] as const,
    badgeBg: '#FFF0F3',
  },
  bills: {
    nameColor: '#5C1A9B',
    barColor: '#9B61E8',
    iconGrad: ['#EDE8FD', '#d8d0fa'] as const,
    badgeBg: '#F3EFFF',
  },
  health: {
    nameColor: '#2d6a4f',
    barColor: '#5B8C6E',
    iconGrad: ['#EFF8F2', '#d4eddf'] as const,
    badgeBg: '#EFF8F2',
  },
  other: {
    nameColor: colors.textSecondary,
    barColor: '#B4B2A9',
    iconGrad: ['#F7F5F2', '#efece8'] as const,
    badgeBg: '#F7F5F2',
  },
};

const CATEGORY_BUDGETS: Record<Category, number> = {
  food: 1500,
  transport: 1000,
  shopping: 2000,
  bills: 1500,
  health: 1000,
  other: 1000,
};

const TOTAL_BUDGET = 8000;

export default function StatsScreen() {
  const navigation = useNavigation<any>();
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1));
  const [activeDonutIndex, setActiveDonutIndex] = useState<number>(-1);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // ─── SAMPLE DATA ────────────────────────────────────────────────────────────
  const spent = 5550;
  const categoryTotals: Record<Category, number> = {
    transport: 350,
    food: 1200,
    shopping: 2200,
    bills: 800,
    health: 0,
    other: 1000,
  };

  const budgetUsedPct = Math.min((spent / TOTAL_BUDGET) * 100, 100);
  const remaining = Math.max(TOTAL_BUDGET - spent, 0);

  const prevMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
  const nextMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );
  const monthLabel = currentDate.toLocaleString('default', {
    month: 'short',
    year: 'numeric',
  });

  // ─── SVG Donut Chart Math ───────────────────────────────────────────────────
  const donutRadius = 60;
  const donutStrokeWidth = 14;
  const donutCircumference = 2 * Math.PI * donutRadius;

  let cumulativeOffset = 0;
  const donutSegments = (Object.keys(categoryTotals) as Category[])
    .filter((cat) => categoryTotals[cat] > 0)
    .map((cat) => {
      const catSpent = Math.min(categoryTotals[cat], TOTAL_BUDGET);
      const strokeLength = (catSpent / TOTAL_BUDGET) * donutCircumference;
      const gapLength = donutCircumference - strokeLength;

      const segment = {
        key: cat,
        color: CATEGORY_THEME[cat].barColor,
        strokeDasharray: `${strokeLength} ${gapLength}`,
        strokeDashoffset: -cumulativeOffset,
        catSpent,
      };

      cumulativeOffset += strokeLength;
      return segment;
    });

  // ─── PAN RESPONDER (Drag & Scrub Menu) ──────────────────────────────────────
  const activeDonutIndexRef = useRef(activeDonutIndex);
  const startIndexRef = useRef(activeDonutIndex);
  const segmentsLengthRef = useRef(donutSegments.length);

  useEffect(() => {
    activeDonutIndexRef.current = activeDonutIndex;
  }, [activeDonutIndex]);
  useEffect(() => {
    segmentsLengthRef.current = donutSegments.length;
  }, [donutSegments.length]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setScrollEnabled(false);
        startIndexRef.current = activeDonutIndexRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (Math.abs(gestureState.dy) > 5) {
          const sensitivity = 25;
          const delta = Math.floor(
            (gestureState.dy - (gestureState.dy > 0 ? 5 : -5)) / sensitivity
          );

          const totalOptions = segmentsLengthRef.current + 1;

          const raw = startIndexRef.current + 1 + delta;
          const wrapped = ((raw % totalOptions) + totalOptions) % totalOptions;
          const nextIndex = wrapped - 1;

          if (activeDonutIndexRef.current !== nextIndex) {
            activeDonutIndexRef.current = nextIndex;
            setActiveDonutIndex(nextIndex);
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut
            );

            // 👇 Increased vibration duration for better support across devices
            Vibration.vibrate(40);
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        setScrollEnabled(true);
        // If it was a tap instead of a drag
        if (Math.abs(gestureState.dy) <= 5 && Math.abs(gestureState.dx) <= 5) {
          const totalOptions = segmentsLengthRef.current + 1;
          const nextIndex =
            ((activeDonutIndexRef.current + 2) % totalOptions) - 1;
          setActiveDonutIndex(nextIndex);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

          // 👇 Light tap vibration
          Vibration.vibrate(20);
        }
      },
      onPanResponderTerminate: () => {
        setScrollEnabled(true);
      },
    })
  ).current;

  // ─── DYNAMIC DONUT TEXT ─────────────────────────────────────────────────────
  let centerPctText = `${budgetUsedPct.toFixed(0)}%`;
  let centerSubText = 'used overall';
  let centerTextColor = colors.textPrimary;

  if (activeDonutIndex >= 0 && donutSegments[activeDonutIndex]) {
    const activeData = donutSegments[activeDonutIndex];
    const catBudget = CATEGORY_BUDGETS[activeData.key as Category] || 1000;

    centerPctText = `${((activeData.catSpent / catBudget) * 100).toFixed(0)}%`;
    centerSubText = activeData.key;
    centerTextColor = activeData.color;
  }

  // ─── RENDERERS ──────────────────────────────────────────────────────────────
  const renderCategoryRow = (catId: Category, title: string, note?: string) => {
    const theme = CATEGORY_THEME[catId];
    const catSpent = categoryTotals[catId] || 0;
    const catBudget = CATEGORY_BUDGETS[catId];
    const pct = (catSpent / catBudget) * 100;
    const isOver = pct >= 100;

    const displayPct = isOver ? 'Over!' : `${pct.toFixed(0)}%`;
    const activeTextColor = isOver ? colors.expenseRed : theme.nameColor;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('feed', {
            screen: 'FeedMain',
            params: { filterCategory: title },
          })
        }
        style={styles.progRow}
      >
        <LinearGradient colors={theme.iconGrad} style={styles.catIconWrap}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            {getCategoryIcon(catId, theme.nameColor)}
          </Svg>
        </LinearGradient>

        <View style={styles.progRowContent}>
          <View style={styles.progHd}>
            <Text style={[styles.progName, { color: activeTextColor }]}>
              {title}
            </Text>

            <View style={styles.progMetaWrap}>
              <View
                style={[styles.progBadge, { backgroundColor: theme.badgeBg }]}
              >
                <Text
                  style={[styles.progBadgeText, { color: activeTextColor }]}
                >
                  {displayPct}
                </Text>
              </View>
              <Text
                style={[styles.progMeta, isOver && { color: activeTextColor }]}
              >
                ₱{catSpent.toLocaleString()} / ₱{catBudget.toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={styles.progTrack}>
            <View
              style={[
                styles.progFillBar,
                {
                  width: `${Math.min(pct, 100)}%`,
                  backgroundColor: theme.barColor,
                },
              ]}
            />
          </View>
          {note ? (
            <Text style={[styles.progNote, { color: activeTextColor }]}>
              {note}
            </Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      scrollEnabled={scrollEnabled}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Stats</Text>
          <Text style={styles.headerSub}>₱8,000 monthly budget</Text>
        </View>
        <View style={styles.monthSelector}>
          <TouchableOpacity style={styles.monthBtn} onPress={prevMonth}>
            <Text style={styles.monthBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity style={styles.monthBtn} onPress={nextMonth}>
            <Text style={styles.monthBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 👇 Wrapped the overall card in a Pressable to capture white space clicks */}
      <Pressable
        style={styles.overallCard}
        onPress={() => {
          // Reset to Overall View when white space is clicked
          if (activeDonutIndex !== -1) {
            setActiveDonutIndex(-1);
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut
            );
          }
        }}
      >
        {/* eslint-disable-next-line react/jsx-props-no-spreading */}
        <View {...panResponder.panHandlers} style={styles.donutContainer}>
          <Svg width={160} height={160} viewBox="0 0 160 160">
            <G rotation="-90" origin="80, 80">
              <Circle
                cx="80"
                cy="80"
                r={donutRadius}
                stroke="rgba(30,30,46,0.06)"
                strokeWidth={donutStrokeWidth}
                fill="transparent"
              />
              {donutSegments.map((segment, index) => {
                const isFocused = activeDonutIndex === index;
                const isDimmed = activeDonutIndex >= 0 && !isFocused;

                return (
                  <Circle
                    key={segment.key}
                    cx="80"
                    cy="80"
                    r={donutRadius}
                    stroke={segment.color}
                    strokeWidth={
                      isFocused ? donutStrokeWidth + 6 : donutStrokeWidth
                    }
                    opacity={isDimmed ? 0.2 : 1}
                    fill="transparent"
                    strokeDasharray={segment.strokeDasharray}
                    strokeDashoffset={segment.strokeDashoffset}
                    strokeLinecap="butt"
                  />
                );
              })}
            </G>
          </Svg>

          <View style={styles.donutCenterText} pointerEvents="none">
            <Text style={[styles.donutCenterPct, { color: centerTextColor }]}>
              {centerPctText}
            </Text>
            <Text
              style={[
                styles.donutCenterSub,
                { color: activeDonutIndex >= 0 ? centerTextColor : '#6B6B7A' },
              ]}
            >
              {centerSubText.charAt(0).toUpperCase() + centerSubText.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.budgetMetrics} pointerEvents="none">
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Spent so far</Text>
            <Text style={styles.metricVal}>₱{spent.toLocaleString()}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Remaining</Text>
            <Text style={[styles.metricVal, { color: colors.primary }]}>
              ₱{remaining.toLocaleString()}
            </Text>
          </View>
        </View>
        <Text style={styles.tapHint} pointerEvents="none">
          Tap or drag circle to explore
        </Text>
      </Pressable>

      <Text style={styles.sectionLabel}>By category</Text>
      <View style={{ marginBottom: 16 }}>
        {renderCategoryRow('transport', 'Transport')}
        {renderCategoryRow('food', 'Food', 'Nearing limit — ₱300 left')}
        {renderCategoryRow('shopping', 'Shopping', 'Over by ₱200 😬')}
        {renderCategoryRow('bills', 'Bills')}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: 100 },
  header: {
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  headerSub: { fontSize: 13, color: '#6B6B7A' },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(30,30,46,0.08)',
  },
  monthBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnText: { fontSize: 16, color: colors.textPrimary, lineHeight: 18 },
  monthLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 10,
  },
  overallCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(30,30,46,0.08)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  donutContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  donutCenterText: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterPct: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 28,
    fontWeight: '800',
  },
  donutCenterSub: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  budgetMetrics: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  metricCol: { alignItems: 'center' },
  metricLabel: {
    fontSize: 11,
    color: '#6B6B7A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricVal: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metricDivider: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(30,30,46,0.08)',
  },
  tapHint: {
    marginTop: 12,
    fontSize: 11,
    color: '#A0A0AA',
    fontFamily: 'Inter_500Medium',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B6B7A',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingVertical: 12,
  },
  progRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  catIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  progRowContent: { flex: 1 },
  chevron: {
    fontSize: 20,
    color: 'rgba(30,30,46,0.2)',
    paddingLeft: 12,
    marginBottom: 8,
  },
  progHd: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progName: { fontFamily: 'Nunito_700Bold', fontSize: 15, fontWeight: '700' },
  progMetaWrap: { flexDirection: 'row', alignItems: 'center' },
  progBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    marginRight: 6,
  },
  progBadgeText: { fontSize: 10, fontWeight: '700' },
  progMeta: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 11,
    color: '#6B6B7A',
  },
  progTrack: {
    height: 6,
    backgroundColor: 'rgba(30,30,46,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progFillBar: { height: '100%', borderRadius: 4 },
  progNote: { fontSize: 11, fontWeight: '700', marginTop: 6 },
});
