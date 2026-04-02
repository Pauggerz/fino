import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing } from '../constants/theme';
import { supabase } from '@/services/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';

type DbCategoryMeta = {
  label: string;
  emoji: string | null;
  textColor: string | null;
  tileBg: string | null;
};

// ─── THEME SYNC ─────────────────────────────────────────────────────────────
const CATEGORY_THEME: Record<
  string,
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

const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {
  food: 1500,
  transport: 1000,
  shopping: 2000,
  bills: 1500,
  health: 1000,
  default: 1000,
};

const normalizeCategoryKey = (value: string | null): string =>
  (value ?? '').trim().toLowerCase();

export default function StatsScreen() {
  const navigation = useNavigation<any>();
  const [currentDate, setCurrentDate] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [activeDonutIndex, setActiveDonutIndex] = useState<number>(-1);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [categoryMetaByKey, setCategoryMetaByKey] = useState<
    Record<string, DbCategoryMeta>
  >({});
  const [categoryTotals, setCategoryTotals] = useState<Record<string, number>>(
    {}
  );
  const [categoryBudgets, setCategoryBudgets] = useState<
    Record<string, number>
  >({});

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);

      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      ).toISOString();
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      ).toISOString();

      const { data: catData } = await supabase
        .from('categories')
        .select(
          'name, budget_limit, emoji, text_colour, tile_bg_colour, sort_order'
        )
        .eq('is_active', true);

      const { data: txData } = await supabase
        .from('transactions')
        .select('category, amount, type')
        .in('type', ['expense', 'exp'])
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

      const nextTotals: Record<string, number> = {};
      const nextBudgets: Record<string, number> = {};
      const nextKeys: string[] = [];
      const nextMetaByKey: Record<string, DbCategoryMeta> = {};

      (catData ?? []).forEach((cat) => {
        const key = normalizeCategoryKey(cat.name);
        if (!key) return;
        nextKeys.push(key);
        nextTotals[key] = 0;
        nextBudgets[key] =
          cat.budget_limit && cat.budget_limit > 0
            ? cat.budget_limit
            : (DEFAULT_CATEGORY_BUDGETS[key] ??
              DEFAULT_CATEGORY_BUDGETS.default);
        nextMetaByKey[key] = {
          label: cat.name,
          emoji: cat.emoji,
          textColor: cat.text_colour,
          tileBg: cat.tile_bg_colour,
        };
      });

      (txData ?? []).forEach((tx) => {
        const key = normalizeCategoryKey(tx.category);
        if (!key || !(key in nextTotals)) return;
        nextTotals[key] += Number(tx.amount) || 0;
      });

      setCategoryKeys(nextKeys);
      setCategoryMetaByKey(nextMetaByKey);
      setCategoryTotals(nextTotals);
      setCategoryBudgets(nextBudgets);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useFocusEffect(
    React.useCallback(() => {
      fetchStats();
    }, [fetchStats])
  );

  const spent = Object.values(categoryTotals).reduce(
    (sum, value) => sum + value,
    0
  );
  const totalBudget = Object.values(categoryBudgets).reduce(
    (sum, value) => sum + value,
    0
  );
  const budgetUsedPct =
    totalBudget > 0 ? Math.min((spent / totalBudget) * 100, 100) : 0;
  const remaining = Math.max(totalBudget - spent, 0);

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

  const insight = {
    headline: 'You spend most on Tuesdays 🍜',
    body: 'Food is 42% of weekly spend. Want to set a lower limit?',
  };

  // ─── SVG Donut Chart Math ───────────────────────────────────────────────────
  const donutRadius = 60;
  const donutStrokeWidth = 14;
  const donutCircumference = 2 * Math.PI * donutRadius;

  let cumulativeOffset = 0;
  const donutSegments = categoryKeys
    .filter((cat) => categoryTotals[cat] > 0)
    .map((cat, index) => {
      const maxBudget = totalBudget > 0 ? totalBudget : 1;
      const catSpent = Math.min(categoryTotals[cat], maxBudget);
      const strokeLength = (catSpent / maxBudget) * donutCircumference;
      const gapLength = donutCircumference - strokeLength;
      const meta = categoryMetaByKey[cat];
      const fallbackColor =
        Object.values(CATEGORY_THEME)[
          index % Object.values(CATEGORY_THEME).length
        ].barColor;
      const color = meta?.textColor ?? fallbackColor;

      const segment = {
        key: cat,
        color,
        strokeDasharray: `${strokeLength} ${gapLength}`,
        strokeDashoffset: -cumulativeOffset,
        catSpent,
      };

      cumulativeOffset += strokeLength;
      return segment;
    });

  const selectedDonut =
    activeDonutIndex >= 0 ? donutSegments[activeDonutIndex] : null;
  const selectedCategory = selectedDonut?.key;
  const selectedCategoryLabel = selectedCategory
    ? (categoryMetaByKey[selectedCategory]?.label ?? selectedCategory)
    : '';
  const selectedCategorySpent = selectedCategory
    ? categoryTotals[selectedCategory] || 0
    : 0;
  const selectedCategoryBudget = selectedCategory
    ? categoryBudgets[selectedCategory] || DEFAULT_CATEGORY_BUDGETS.default
    : 0;
  const selectedCategoryRemaining = Math.max(
    selectedCategoryBudget - selectedCategorySpent,
    0
  );
  const selectedThemeColor = selectedCategory
    ? (categoryMetaByKey[selectedCategory]?.textColor ?? selectedDonut?.color)
    : null;

  // ─── PAN RESPONDER (Drag & Scrub Menu) ──────────────────────────────────────
  const activeDonutIndexRef = useRef(activeDonutIndex);
  const startIndexRef = useRef(activeDonutIndex);
  const segmentsLengthRef = useRef(donutSegments.length);
  const isInteractingWithDonutRef = useRef(false);

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
        isInteractingWithDonutRef.current = true;
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
        setTimeout(() => {
          isInteractingWithDonutRef.current = false;
        }, 120);
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
        setTimeout(() => {
          isInteractingWithDonutRef.current = false;
        }, 120);
      },
    })
  ).current;

  // ─── DYNAMIC DONUT TEXT ─────────────────────────────────────────────────────
  let centerPctText = `${budgetUsedPct.toFixed(0)}%`;
  let centerSubText = 'used overall';
  let centerTextColor = colors.textPrimary;

  if (selectedDonut && selectedCategory) {
    const catBudget = selectedCategoryBudget || 1000;
    const catPct =
      catBudget > 0 ? (selectedCategorySpent / catBudget) * 100 : 0;

    centerPctText = `${catPct.toFixed(0)}%`;
    centerSubText = selectedCategoryLabel;
    centerTextColor = selectedDonut.color;
  }

  // ─── RENDERERS ──────────────────────────────────────────────────────────────
  const renderCategoryRow = (catKey: string, note?: string) => {
    const meta = categoryMetaByKey[catKey];
    const title = meta?.label ?? catKey;
    const theme = CATEGORY_THEME[catKey] ?? CATEGORY_THEME.other;
    const color = meta?.textColor ?? theme.nameColor;
    const bg = meta?.tileBg ?? theme.badgeBg;
    const iconKey = normalizeCategoryKey(meta?.emoji) || catKey;
    const catSpent = categoryTotals[catKey] || 0;
    const catBudget =
      categoryBudgets[catKey] || DEFAULT_CATEGORY_BUDGETS.default;
    const pct = catBudget > 0 ? (catSpent / catBudget) * 100 : 0;
    const isOver = pct >= 100;

    const displayPct = isOver ? 'Over!' : `${pct.toFixed(0)}%`;
    const activeTextColor = isOver ? colors.expenseRed : color;

    return (
      <TouchableOpacity
        key={catKey}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('feed', {
            screen: 'FeedMain',
            params: { filterCategory: title },
          })
        }
        style={styles.progRow}
      >
        <LinearGradient colors={[bg, bg]} style={styles.catIconWrap}>
          <CategoryIcon
            categoryKey={iconKey}
            color={activeTextColor}
            size={14}
            wrapperSize={24}
          />
        </LinearGradient>

        <View style={styles.progRowContent}>
          <View style={styles.progHd}>
            <Text style={[styles.progName, { color: activeTextColor }]}>
              {title}
            </Text>

            <View style={styles.progMetaWrap}>
              <View style={[styles.progBadge, { backgroundColor: bg }]}>
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
                  backgroundColor: color,
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
          <Text style={styles.headerSub}>
            ₱{totalBudget.toLocaleString()} monthly budget
          </Text>
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

      <Pressable
        style={[
          styles.overallCard,
          selectedThemeColor && { borderColor: selectedThemeColor },
        ]}
        onPress={() => {
          if (isInteractingWithDonutRef.current) return;
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
          <View style={styles.budgetMetricsRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>
                {selectedCategory
                  ? `Spent so far · ${selectedCategoryLabel}`
                  : 'Spent so far'}
              </Text>
              <Text
                style={[
                  styles.metricVal,
                  selectedThemeColor && { color: selectedThemeColor },
                ]}
              >
                ₱
                {(selectedCategory
                  ? selectedCategorySpent
                  : spent
                ).toLocaleString()}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>
                {selectedCategory
                  ? `Remaining budget · ${selectedCategoryLabel}`
                  : 'Remaining budget'}
              </Text>
              <Text
                style={[
                  styles.metricVal,
                  { color: selectedThemeColor ?? colors.primary },
                ]}
              >
                ₱
                {(selectedCategory
                  ? selectedCategoryRemaining
                  : remaining
                ).toLocaleString()}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.tapHint} pointerEvents="none">
          Tap or drag circle to explore
        </Text>
      </Pressable>

      <Text style={styles.sectionLabel}>By category</Text>
      <View style={{ marginBottom: 16 }}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>Loading category stats...</Text>
          </View>
        ) : (
          categoryKeys.map((catKey) => renderCategoryRow(catKey))
        )}
      </View>

      {insight && (
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.insightWrap}
          onPress={() => navigation.navigate('AIScreen')}
        >
          <LinearGradient
            colors={['#F0ECFD', '#EBF2EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.insightCard}
          >
            <View style={styles.insightAvatar}>
              <Text style={styles.insightAvatarIcon}>✦</Text>
            </View>

            <View style={styles.insightBody}>
              <Text style={styles.insightLabel}>Fino Intelligence</Text>
              <Text style={styles.insightHeadline}>{insight.headline}</Text>
              <Text style={styles.insightSub}>{insight.body}</Text>

              <View style={styles.insightChip}>
                <Text style={styles.insightChipText}>Ask Fino →</Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}
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
  donutCenterLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: '#6B6B7A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  donutCenterAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 2,
  },
  donutCenterRemaining: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 2,
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
    width: '100%',
    alignItems: 'center',
    marginBottom: 6,
  },
  budgetMetricsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
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
  loadingWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  insightWrap: { marginBottom: 16 },
  insightCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(201,184,245,0.35)',
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  insightAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0ECFD',
    borderWidth: 1,
    borderColor: '#C9B8F5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightAvatarIcon: {
    fontSize: 15,
    color: '#4B2DA3',
  },
  insightBody: { flex: 1 },
  insightLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#4B2DA3',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  insightHeadline: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  insightSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  insightChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0ECFD',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C9B8F5',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  insightChipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#4B2DA3',
    textTransform: 'uppercase',
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
