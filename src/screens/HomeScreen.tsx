import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useTransition,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  InteractionManager,
} from 'react-native';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSync } from '@/contexts/SyncContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Skeleton } from '@/components/Skeleton';
import Toast from '../components/Toast';
import { BudgetTile } from '@/components/home/BudgetTile';
import {
  ScaledWalletCard,
  SCALED_CARD_W,
  SCALED_CARD_H,
  CARD_SCALE,
} from '@/components/home/ScaledWalletCard';
import { BALANCE_ANIMATE_MS } from '../services/balanceCalc';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories, CategoryWithSpend } from '@/hooks/useCategories';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { getLastSaved, clearLastSaved } from '@/services/lastSavedStore';
import { supabase } from '@/services/supabase';
import { removeFromQueue } from '@/services/syncService';
import ProfileSidebar from '@/components/ProfileSidebar';
import { ErrorBanner } from '@/components/ErrorBanner';
import type { ThemeColors } from '@/constants/theme';

// ─── Animated primitives (module-level) ──────────────────────────────────────

const AnimatedTextInput = RAnim.createAnimatedComponent(TextInput);

/** Worklet-safe number formatter — mimics toLocaleString('en-PH', { minimumFractionDigits: 2 }) */
function formatBalanceWorklet(n: number): string {
  'worklet';

  const neg = n < 0;
  const abs = Math.abs(n);
  const rounded = Math.round(abs * 100) / 100;
  const int = Math.floor(rounded);
  const frac = Math.round((rounded - int) * 100).toString().padStart(2, '0');
  const s = int.toString();
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return `${neg ? '-' : ''}${out}.${frac}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 18) return { text: 'Good afternoon', emoji: '⛅' };
  return { text: 'Good evening', emoji: '🌙' };
}

function getDaysLeftInMonth(): number {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate();
}

function getMonthPace(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / daysInMonth;
}

function fmtPeso(n: number, isPrivacyMode: boolean = false): string {
  if (isPrivacyMode) return '₱***';
  return `₱${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function onTrackLabel(pct: number): string {
  if (pct < 0.7) return 'On track this month';
  if (pct < 0.9) return 'Watch spending';
  return 'Over budget';
}


// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { status: syncStatus, syncVersion } = useSync();
  const { profile } = useAuth();
  const userName = profile?.name || 'User';
  const [, startTransition] = useTransition();

  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets.top), [colors, isDark, insets.top]);

  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const { accounts, totalBalance, loading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useAccounts();
  const { categories, loading: categoriesLoading, error: categoriesError, refetch: refetchCategories } = useCategories();
  const {
    totalIncome,
    totalExpense: monthlyExpense,
    sparklineData,
    loading: totalsLoading,
    error: totalsError,
    refetch: refetchTotals,
  } = useMonthlyTotals();

  const fetchError = accountsError ?? categoriesError ?? totalsError;
  const retryAll = useCallback(() => {
    refetchAccounts();
    refetchCategories(true);
    refetchTotals();
  }, [refetchAccounts, refetchCategories, refetchTotals]);

  // True only on cold first load (no cached data yet) — avoids skeleton flash on background refetches
  const isFirstLoad = accountsLoading && accounts.length === 0;
  const isTotalsLoading = totalsLoading && totalIncome === 0 && monthlyExpense === 0;

  // ── Entrance animation shared values ────────────────────────────────────────
  const greetingOpacity = useSharedValue(0);
  const greetingTransY = useSharedValue(12);
  const cardOpacity = useSharedValue(0);
  const cardTransY = useSharedValue(16);
  const belowOpacity = useSharedValue(0);
  const belowTransY = useSharedValue(20);

  const greetingAnim = useAnimatedStyle(() => ({
    opacity: greetingOpacity.value,
    transform: [{ translateY: greetingTransY.value }],
  }));
  const cardAnim = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTransY.value }],
  }));
  const belowAnim = useAnimatedStyle(() => ({
    opacity: belowOpacity.value,
    transform: [{ translateY: belowTransY.value }],
  }));

  // ── Eye toggle animation ─────────────────────────────────────────────────────
  const eyeScale = useSharedValue(1);
  const eyeAnim = useAnimatedStyle(() => ({
    transform: [{ scale: eyeScale.value }],
  }));

  useEffect(() => {
    if (syncVersion > 0) {
      const task = InteractionManager.runAfterInteractions(() => {
        startTransition(() => {
          // syncVersion only increments after a successful queue flush,
          // so force past any freshness gates — data genuinely changed.
          refetchAccounts();
          refetchCategories(true);
          refetchTotals();
          lastFocusRefetchAt.current = Date.now();
        });
      });
      return () => task.cancel();
    }
    return undefined;
  }, [syncVersion, startTransition, refetchAccounts, refetchCategories, refetchTotals]);

  const getSyncColor = () => {
    switch (syncStatus) {
      case 'synced':
        return colors.syncSynced;
      case 'syncing':
        return colors.syncSyncing;
      case 'offline':
      case 'error':
        return colors.syncOffline;
      default:
        return colors.syncSynced;
    }
  };

  // ── Balance animation (off-JS-thread via reanimated shared value) ────────────
  const balanceSV = useSharedValue(totalBalance);
  const animatedBalanceProps = useAnimatedProps(() => ({
    text: formatBalanceWorklet(balanceSV.value),
    defaultValue: formatBalanceWorklet(balanceSV.value),
  }));

  useEffect(() => {
    balanceSV.value = withTiming(totalBalance, { duration: BALANCE_ANIMATE_MS });
  }, [totalBalance, balanceSV]);

  useEffect(() => {
    const getMyId = async () => {
      await supabase.auth.getUser();
    };
    getMyId();
  }, []);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastTitle, setToastTitle] = useState('');
  const [toastSubtitle, setToastSubtitle] = useState('');
  const [toastIsUndo, setToastIsUndo] = useState(false);
  const [undoTxId, setUndoTxId] = useState<string | null>(null);
  const [undoAccountId, setUndoAccountId] = useState<string | null>(null);
  const [undoPreviousBalance, setUndoPreviousBalance] = useState<number | null>(
    null
  );

  const hasAnimated = useRef(false);
  const hasFocusedOnce = useRef(false);
  const lastFocusRefetchAt = useRef(0);
  const FOCUS_REFETCH_STALE_MS = 30_000;

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        // Full entrance on first mount
        hasAnimated.current = true;
        greetingOpacity.value = 0; greetingTransY.value = 12;
        cardOpacity.value = 0;    cardTransY.value = 16;
        belowOpacity.value = 0;   belowTransY.value = 20;
        greetingOpacity.value = withTiming(1, { duration: 280 });
        greetingTransY.value  = withTiming(0, { duration: 280 });
        cardOpacity.value     = withDelay(80,  withTiming(1, { duration: 320 }));
        cardTransY.value      = withDelay(80,  withSpring(0, { damping: 18, stiffness: 180 }));
        belowOpacity.value    = withDelay(180, withTiming(1, { duration: 360 }));
        belowTransY.value     = withDelay(180, withSpring(0, { damping: 16, stiffness: 160 }));
      } else {
        // Lightweight re-entry on tab switches — keeps the screen feeling alive without a flash.
        cardOpacity.value = 0.6;   cardTransY.value = 8;
        belowOpacity.value = 0.55; belowTransY.value = 10;
        cardOpacity.value  = withTiming(1, { duration: 200 });
        cardTransY.value   = withSpring(0, { damping: 20, stiffness: 220 });
        belowOpacity.value = withDelay(40, withTiming(1, { duration: 220 }));
        belowTransY.value  = withDelay(40, withSpring(0, { damping: 20, stiffness: 200 }));
      }

      let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
      // Skip refetch on fast tab switches — syncVersion effect handles post-sync refresh separately.
      const now = Date.now();
      const isFresh = now - lastFocusRefetchAt.current < FOCUS_REFETCH_STALE_MS;
      if (hasFocusedOnce.current && !isFresh) {
        lastFocusRefetchAt.current = now;
        task = InteractionManager.runAfterInteractions(() => {
          startTransition(() => {
            refetchAccounts();
            refetchCategories();
            refetchTotals();
          });
        });
      }
      hasFocusedOnce.current = true;

      const last = getLastSaved();
      if (last) {
        clearLastSaved();
        const typeLabel = last.type === 'expense' ? 'Expense' : 'Income';
        setToastTitle(`${typeLabel} saved`);
        setToastSubtitle(
          `${fmtPeso(last.amount, isPrivacyMode)} · ${last.categoryName} · ${last.accountName}`
        );
        setToastIsUndo(false);
        setUndoTxId(last.id);
        setUndoAccountId(last.accountId);
        setUndoPreviousBalance(last.previousBalance);
        setToastVisible(true);
      }

      return () => {
        task?.cancel();
        // Sidebar uses a global Modal; always close it when Home loses focus
        // so it can never intercept touches on other screens.
        setSidebarVisible(false);
      };
    }, [startTransition, refetchAccounts, refetchCategories, refetchTotals, isPrivacyMode,
        greetingOpacity, greetingTransY, cardOpacity, cardTransY, belowOpacity, belowTransY])
  );

  const handleUndo = useCallback(async () => {
    if (!undoTxId) return;
    if (undoTxId.startsWith('temp_')) {
      // Offline transaction — remove from the local pending queue only
      await removeFromQueue(undoTxId);
    } else {
      await supabase.from('transactions').delete().eq('id', undoTxId);
    }
    if (undoAccountId !== null && undoPreviousBalance !== null) {
      await supabase
        .from('accounts')
        .update({ balance: undoPreviousBalance })
        .eq('id', undoAccountId);
    }
    refetchAccounts();
    refetchCategories();
    refetchTotals();
    setUndoTxId(null);
    setUndoAccountId(null);
    setUndoPreviousBalance(null);
    setToastTitle('Removed');
    setToastSubtitle('Transaction undone');
    setToastIsUndo(true);
    setToastVisible(true);
  }, [
    undoTxId,
    undoAccountId,
    undoPreviousBalance,
    refetchAccounts,
    refetchCategories,
    refetchTotals,
  ]);

  const { text: greetText, emoji: greetEmoji } = getGreeting();
  const daysLeft = getDaysLeftInMonth();
  const totalBudget = categories.reduce((s, c) => s + (c.budget_limit ?? 0), 0);
  const pctSpent = totalBudget > 0 ? monthlyExpense / totalBudget : 0;
  const statusLabel = onTrackLabel(pctSpent);

  // Use real 7-day daily-expense sparkline from useMonthlyTotals.
  // Override the last bar with today's actual pctSpent so it always reflects reality.
  const lastBarVal = Math.min(pctSpent > 0 ? pctSpent : getMonthPace(), 1);
  const SPARKLINE = sparklineData.map((bar, i) =>
    i === sparklineData.length - 1 ? { ...bar, val: lastBarVal } : bar
  );

  const delta = totalIncome - monthlyExpense;
  const deltaLabel = isPrivacyMode
    ? `₱*** net this month`
    : `${delta >= 0 ? '↑' : '↓'} ${delta >= 0 ? '+' : ''}${fmtPeso(delta)} net this month`;

  // Data-driven insight derived from the user's own category spend. Replaces
  // the previous hardcoded mock. A future PR can swap this for a Gemini call
  // via generateBulletInsights() — keeping this synchronous keeps Home snappy
  // and avoids burning API quota on every render.
  const insight = useMemo(() => {
    const spent = categories
      .map((c) => ({ name: c.name, emoji: c.emoji, spend: c.spent ?? 0, limit: c.budget_limit ?? 0 }))
      .filter((c) => c.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    if (spent.length === 0 || monthlyExpense <= 0) return null;

    const top = spent[0];
    const share = Math.round((top.spend / monthlyExpense) * 100);
    const over = top.limit > 0 && top.spend > top.limit;
    const emoji = top.emoji || '📊';

    if (over) {
      return {
        headline: `${top.name} is over budget ${emoji}`,
        body: `${share}% of your spend this month. Tap to review the limit.`,
      };
    }
    return {
      headline: `${top.name} leads your spend ${emoji}`,
      body: `${share}% of this month so far. Keep an eye on it over the next ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    };
  }, [categories, monthlyExpense, daysLeft]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        removeClippedSubviews
      >
        {fetchError ? (
          <ErrorBanner
            message="Can't reach server — showing cached data."
            onRetry={retryAll}
          />
        ) : null}
        <RAnim.View style={[styles.greeting, greetingAnim]}>
          <View style={styles.greetingTop}>
            <View style={styles.greetingLeft}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <Text style={[styles.greetingPill, { marginBottom: 0 }]}>
                  {greetText} {greetEmoji}
                </Text>
                {/* Sync Status Dot */}
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: getSyncColor(),
                    marginLeft: 8,
                    marginTop: 2,
                  }}
                />
              </View>
              <Text style={styles.greetingName}>
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: 'Nunito_700Bold',
                  }}
                >
                  Kamusta,{' '}
                </Text>
                <Text style={{ color: colors.greetingPurple }}>
                  {userName}!
                </Text>
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSidebarVisible(true)} activeOpacity={0.8}>
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.avatar}
              >
                <Text style={styles.avatarLetter}>
                  {userName.charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </RAnim.View>

        <RAnim.View style={[styles.onTrackWrap, greetingAnim]}>
          <View style={styles.onTrackPill}>
            <View style={styles.sparkline}>
              {SPARKLINE.map((bar, i) => (
                <View
                  key={bar.id}
                  style={[
                    styles.sparkBar,
                    {
                      height: Math.max(4, bar.val * 20),
                      backgroundColor:
                        i === SPARKLINE.length - 1
                          ? colors.primary
                          : colors.primaryTransparent30,
                    },
                  ]}
                />
              ))}
            </View>

            <View style={styles.onTrackText}>
              <Text style={styles.onTrackTitle}>{statusLabel}</Text>
              <Text style={styles.onTrackSub}>
                {daysLeft} days left · {fmtPeso(monthlyExpense, isPrivacyMode)}{' '}
                spent
              </Text>
            </View>
          </View>
        </RAnim.View>

        {/* ── Unified dark card: balance + accounts ── */}
        <RAnim.View style={[styles.unifiedCard, cardAnim]}>
          {/* Ambient blobs */}
          <LinearGradient
            colors={[colors.primaryLight60, 'transparent']}
            style={[
              styles.blob,
              { top: -30, right: -20, width: 160, height: 160 },
            ]}
          />
          <LinearGradient
            colors={[colors.primaryTransparent50, 'transparent']}
            style={[
              styles.blob,
              { bottom: 80, left: -20, width: 110, height: 110 },
            ]}
          />

          {/* ── Balance section ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('stats')}
            style={styles.balanceSection}
          >
            <View style={styles.heroHeaderRow}>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>
                  {new Date().toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>

              {/* EYE ICON TOGGLE */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  eyeScale.value = withSpring(0.82, { damping: 6, stiffness: 300 }, () => {
                    eyeScale.value = withSpring(1, { damping: 10, stiffness: 260 });
                  });
                  setIsPrivacyMode(!isPrivacyMode);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={isPrivacyMode ? 'Show balance' : 'Hide balance'}
                accessibilityRole="button"
              >
                <RAnim.View style={eyeAnim}>
                  <Ionicons
                    name={isPrivacyMode ? 'eye-off' : 'eye'}
                    size={22}
                    color={colors.whiteTransparent65}
                  />
                </RAnim.View>
              </TouchableOpacity>
            </View>

            <Text style={styles.heroLabel}>Total balance</Text>

            <View style={styles.heroAmountRow}>
              {isTotalsLoading && !isPrivacyMode ? (
                <Skeleton
                  width={180}
                  height={44}
                  borderRadius={8}
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 4 }}
                />
              ) : (
                <>
                  <Text style={styles.heroCurr}>₱</Text>
                  {isPrivacyMode ? (
                    <Text style={styles.heroAmount}>***</Text>
                  ) : (
                    <AnimatedTextInput
                      animatedProps={animatedBalanceProps}
                      editable={false}
                      style={styles.heroAmount}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.trendBadge}>
              <Text style={styles.trendText}>{deltaLabel}</Text>
            </View>

            <View style={styles.heroRow}>
              <View style={[styles.heroCol, styles.heroColBorder]}>
                <Text style={styles.heroColLabel}>Income</Text>
                <Text style={styles.heroColVal}>
                  {isPrivacyMode ? '₱***' : `+${fmtPeso(totalIncome)}`}
                </Text>
              </View>
              <View style={styles.heroCol}>
                <Text style={styles.heroColLabel}>Spent</Text>
                <Text style={styles.heroColVal}>
                  {isPrivacyMode ? '₱***' : `−${fmtPeso(monthlyExpense)}`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* ── Hairline divider + accounts label ── */}
          <View style={styles.unifiedDividerRow}>
            <View style={styles.unifiedHairline} />
            <Text style={styles.unifiedDividerLabel}>Accounts</Text>
            <View style={styles.unifiedHairline} />
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('more')}
              style={styles.unifiedSeeAll}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.seeAll}>See all →</Text>
            </TouchableOpacity>
          </View>

          {/* ── Scaled wallet cards ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.frostScroll}
            snapToInterval={SCALED_CARD_W + 14}
            decelerationRate="fast"
          >
            {isFirstLoad ? (
              <>
                <Skeleton
                  width={SCALED_CARD_W}
                  height={SCALED_CARD_H}
                  borderRadius={Math.round(22 * CARD_SCALE)}
                  style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
                />
                <Skeleton
                  width={SCALED_CARD_W}
                  height={SCALED_CARD_H}
                  borderRadius={Math.round(22 * CARD_SCALE)}
                  style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
                />
              </>
            ) : accounts.length === 0 ? (
              <View style={styles.emptyCarousel}>
                {/* Branded wallet illustration */}
                <Svg width={56} height={48} viewBox="0 0 56 48">
                  {/* Card body */}
                  <SvgPath d="M4 10 Q4 4 10 4 L46 4 Q52 4 52 10 L52 38 Q52 44 46 44 L10 44 Q4 44 4 38 Z" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
                  {/* Chip */}
                  <SvgPath d="M12 18 Q12 15 15 15 L22 15 Q25 15 25 18 L25 25 Q25 28 22 28 L15 28 Q12 28 12 25 Z" fill="rgba(255,255,255,0.18)" />
                  {/* Stripe */}
                  <SvgPath d="M4 31 L52 31 L52 36 L4 36 Z" fill="rgba(255,255,255,0.08)" />
                  {/* Plus badge */}
                  <SvgPath d="M42 30 m0-6 v12 M36 36 h12" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round" />
                </Svg>
                <Text style={styles.emptyCarouselText}>No accounts yet</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('more')}
                  style={styles.emptyCarouselCta}
                >
                  <Text style={styles.emptyCarouselCtaText}>Add account →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              accounts.map((acc) => (
                <ScaledWalletCard
                  key={acc.id}
                  account={acc}
                  isPrivacyMode={isPrivacyMode}
                  onPress={() =>
                    navigation.navigate('more', {
                      screen: 'AccountDetail',
                      params: { id: acc.id },
                    })
                  }
                />
              ))
            )}
          </ScrollView>
        </RAnim.View>

        {/* ── Budgets + insight, directly on background ── */}
        <RAnim.View style={[styles.belowCard, belowAnim]}>
          {/* Monthly budgets */}
          <View style={styles.acctHeader}>
            <View style={styles.acctHeaderLeft}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionLabel}>Monthly Budgets</Text>
            </View>
          </View>

          <View style={styles.catGrid}>
            {categoriesLoading && categories.length === 0 ? (
              <>
                <Skeleton width="47.5%" height={120} borderRadius={24} />
                <Skeleton width="47.5%" height={120} borderRadius={24} />
              </>
            ) : categories.length === 0 ? (
              <View style={styles.emptyBudget}>
                {/* Branded pie/budget illustration */}
                <Svg width={52} height={52} viewBox="0 0 52 52">
                  {/* Outer ring */}
                  <SvgPath d="M26 4 A22 22 0 0 1 48 26" stroke={colors.primary} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
                  <SvgPath d="M48 26 A22 22 0 0 1 26 48" stroke={colors.primary} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.45" />
                  <SvgPath d="M26 48 A22 22 0 0 1 4 26" stroke={colors.primary} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.22" />
                  <SvgPath d="M4 26 A22 22 0 0 1 26 4" stroke={colors.primary} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.12" />
                  {/* Center plus */}
                  <SvgPath d="M26 18 v16 M18 26 h16" stroke={colors.primary} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
                </Svg>
                <Text style={styles.emptyBudgetText}>No budgets set up yet</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('more')}
                  style={styles.emptyBudgetCta}
                >
                  <Text style={styles.emptyBudgetCtaText}>Set up budgets →</Text>
                </TouchableOpacity>
              </View>
            ) : categories.map((cat, index) => (
              <BudgetTile
                key={cat.id}
                cat={cat}
                index={index}
                isPrivacyMode={isPrivacyMode}
                isDark={isDark}
                colors={colors}
                styles={styles}
                onPress={() => navigation.navigate('stats')}
              />
            ))}
          </View>

          {insight && (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.insightWrap}
              onPress={() => navigation.navigate('ChatScreen')}
            >
              <LinearGradient
                colors={[colors.lavenderLight, colors.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.insightCard}
              >
                <View style={styles.insightAvatar}>
                  <Ionicons
                    name="sparkles"
                    size={16}
                    color={colors.lavenderDark}
                  />
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
        </RAnim.View>
      </ScrollView>

      <Toast
        visible={toastVisible}
        title={toastTitle}
        subtitle={toastSubtitle}
        type={toastIsUndo ? 'undo' : 'success'}
        onUndo={!toastIsUndo && undoTxId ? handleUndo : undefined}
        onDismiss={() => setToastVisible(false)}
      />
      <ProfileSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors, isDark: boolean, topInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: Math.max(topInset + 8, 20) },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120 }, // floating pill (64) + bottom inset (~34) + breathing room
    greeting: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
    greetingTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    greetingLeft: { flex: 1 },
    greetingPill: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    greetingName: {
      fontFamily: 'Nunito_400Regular',
      fontSize: 26,
      lineHeight: 32,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#FFFFFF',
    },
    onTrackWrap: { paddingHorizontal: 20, marginBottom: 14 },
    onTrackPill: {
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.onTrackBorder,
      backgroundColor: colors.onTrackBg1,
    },
    sparkline: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      height: 20,
    },
    sparkBar: { width: 4, borderRadius: 2 },
    onTrackText: { flex: 1 },
    onTrackTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 13,
      color: colors.onTrackTitle,
    },
    onTrackSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.onTrackSub,
      marginTop: 1,
    },
    // ── Unified dark card ──────────────────────────────────────────────────────
    unifiedCard: {
      marginHorizontal: 20,
      marginBottom: 0,
      backgroundColor: colors.heroCardBg,
      borderRadius: 28,
      overflow: 'hidden',
      paddingTop: 20,
      paddingBottom: 16,
      shadowColor: colors.heroCardShadow,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.45,
      shadowRadius: 32,
      elevation: 12,
    },
    blob: {
      position: 'absolute',
      borderRadius: 999,
    },
    balanceSection: {
      paddingHorizontal: 20,
      paddingBottom: 4,
    },
    heroHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    unifiedDividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 8,
    },
    unifiedHairline: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.whiteTransparent18,
    },
    unifiedDividerLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: colors.whiteTransparent55,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    unifiedSeeAll: {
      marginLeft: 4,
      backgroundColor: colors.whiteTransparent12,
      borderRadius: 20,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
    },
    frostScroll: {
      paddingHorizontal: 20,
      gap: 10,
      paddingBottom: 12,
    },
    heroChip: {
      alignSelf: 'flex-start',
      backgroundColor: colors.whiteTransparent15,
      borderRadius: 20,
      paddingVertical: 3,
      paddingHorizontal: 10,
    },
    heroChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.whiteTransparent80,
    },
    heroLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.whiteTransparent65,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    heroAmountRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    heroCurr: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 17,
      color: colors.whiteTransparent65,
      marginTop: 6,
      marginRight: 2,
    },
    heroAmount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 42,
      color: '#FFFFFF', // Ensures it stays bright white on the dark hero background
      letterSpacing: -2,
      lineHeight: 48,
    },
    trendBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primaryLight25,
      borderRadius: 8,
      paddingVertical: 3,
      paddingHorizontal: 8,
      marginBottom: 12,
    },
    trendText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.mint,
    },
    heroRow: {
      flexDirection: 'row',
      backgroundColor: colors.blackTransparent15,
      borderRadius: 12,
      overflow: 'hidden',
    },
    heroCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
    heroColBorder: {
      borderRightWidth: 1,
      borderRightColor: colors.whiteTransparent12,
    },
    heroColLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: colors.whiteTransparent55,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    heroColVal: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 17,
      color: '#FFFFFF',
    },
    // ── Accounts section ────────────────────────────────────────────────────────
    acctHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    acctHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sectionDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.primary,
    },
    sectionLabel: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 13,
      color: colors.textPrimary,
      letterSpacing: 0.3,
    },
    seeAll: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.primary,
    },
    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 20,
      gap: 10,
      marginBottom: 16,
    },
    catTileWrap: { width: '47.5%' },
    catTile: {
      borderRadius: 24,
      height: 120,
      padding: 14,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    catBadgeWrap: { position: 'absolute', top: 10, right: 10 },
    catPctPill: {
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 5,
    },
    catPctBadge: { fontFamily: 'Inter_700Bold', fontSize: 11 },
    catOverBadge: {
      backgroundColor: colors.coralLight,
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 5,
      borderWidth: 1,
      borderColor: colors.catOverBadgeBg,
    },
    catOverBadgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.coralDark,
    },
    catIconCircle: {
      position: 'absolute',
      top: 14,
      left: 14,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catName: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 12,
      marginBottom: 1,
    },
    catAmt: { fontFamily: 'DMMono_500Medium', fontSize: 11 },
    belowCard: {
      marginTop: 20,
    },
    insightWrap: { paddingHorizontal: 20, marginTop: 8, marginBottom: 16 },
    insightCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.insightCardBorder,
      padding: 16,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    insightAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.lavenderLight,
      borderWidth: 1,
      borderColor: colors.lavender,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    insightBody: { flex: 1 },
    insightLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.lavenderDark,
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
      backgroundColor: colors.lavenderLight,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.lavender,
      paddingVertical: 5,
      paddingHorizontal: 12,
    },
    insightChipText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: colors.lavenderDark,
      textTransform: 'uppercase',
    },
    // ── Empty states ─────────────────────────────────────────────────────────────
    emptyCarousel: {
      flex: 1,
      minHeight: SCALED_CARD_H,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      paddingHorizontal: 20,
    },
    emptyCarouselText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.whiteTransparent55,
    },
    emptyCarouselCta: {
      backgroundColor: colors.whiteTransparent12,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      marginTop: 4,
    },
    emptyCarouselCtaText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.whiteTransparent80,
    },
    emptyBudget: {
      width: '100%' as const,
      paddingVertical: 32,
      alignItems: 'center' as const,
      gap: 10,
    },
    emptyBudgetText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textSecondary,
    },
    emptyBudgetCta: {
      backgroundColor: colors.primaryLight,
      borderRadius: 20,
      paddingVertical: 7,
      paddingHorizontal: 16,
      marginTop: 2,
    },
    emptyBudgetCtaText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: colors.primary,
    },
  });
