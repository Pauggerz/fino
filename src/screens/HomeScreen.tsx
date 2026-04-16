import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import RAnim, {
  Easing,
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSpring,
  withRepeat,
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
import WalletCard, { CARD_WIDTH, CARD_HEIGHT } from '../components/WalletCard';
import { BALANCE_ANIMATE_MS } from '../services/balanceCalc';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories, CategoryWithSpend } from '@/hooks/useCategories';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { getLastSaved, clearLastSaved } from '@/services/lastSavedStore';
import { supabase } from '@/services/supabase';
import { removeFromQueue } from '@/services/syncService';
import ProfileSidebar from '@/components/ProfileSidebar';

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
  let s = int.toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return `${neg ? '-' : ''}${out}.${frac}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_SCALE = 0.78;
const SCALED_CARD_W = Math.round(CARD_WIDTH * CARD_SCALE);
const SCALED_CARD_H = Math.round(CARD_HEIGHT * CARD_SCALE);

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

// ─── WaveFill ─────────────────────────────────────────────────────────────────

const TILE_W = 160;
const TILE_H = 120;
// SVG must be wide enough that translating by -TILE_W never exposes a gap.
const WAVE_SVG_W = TILE_W * 4;

/**
 * Builds a filled wave path using quadratic beziers.
 * Wavelength = TILE_W, so translating by -TILE_W is a seamless loop.
 */
function makeWavePath(yBase: number, amp: number): string {
  const halfWl = TILE_W / 2;
  const numArcs = WAVE_SVG_W / halfWl + 2;
  let d = `M 0 ${yBase}`;
  for (let i = 0; i < numArcs; i++) {
    const x0 = i * halfWl;
    const xMid = x0 + halfWl / 2;
    const x1 = x0 + halfWl;
    const yPeak = i % 2 === 0 ? yBase - amp : yBase + amp;
    d += ` Q ${xMid} ${yPeak} ${x1} ${yBase}`;
  }
  d += ` L ${WAVE_SVG_W + halfWl} ${TILE_H} L 0 ${TILE_H} Z`;
  return d;
}

function WaveFill({ pct, color }: { pct: number; color: string }) {
  const wave1X = useSharedValue(0);
  const wave2X = useSharedValue(0);

  const wave1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave1X.value }],
  }));
  const wave2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave2X.value }],
  }));

  useEffect(() => {
    wave1X.value = withRepeat(
      withTiming(-TILE_W, {
        duration: 3000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    wave2X.value = withRepeat(
      withTiming(-TILE_W, {
        duration: 4600,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    return () => {
      cancelAnimation(wave1X);
      cancelAnimation(wave2X);
      wave1X.value = 0;
      wave2X.value = 0;
    };
  }, [wave1X, wave2X]);

  const clampedPct = Math.min(Math.max(pct, 0), 1);
  const yBase = TILE_H - TILE_H * clampedPct;

  const waveStyle = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: WAVE_SVG_W,
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
    >
      {/* Back wave — slower, subtler */}
      <RAnim.View style={[waveStyle, wave2Style]}>
        <Svg width={WAVE_SVG_W} height={TILE_H}>
          <SvgPath d={makeWavePath(yBase + 6, 8)} fill={color} opacity={0.18} />
        </Svg>
      </RAnim.View>
      {/* Front wave — faster, more opaque */}
      <RAnim.View style={[waveStyle, wave1Style]}>
        <Svg width={WAVE_SVG_W} height={TILE_H}>
          <SvgPath d={makeWavePath(yBase, 10)} fill={color} opacity={0.42} />
        </Svg>
      </RAnim.View>
    </View>
  );
}

// ─── BudgetTile ───────────────────────────────────────────────────────────────

type BudgetTileProps = {
  cat: CategoryWithSpend;
  index: number;
  isPrivacyMode: boolean;
  isDark: boolean;
  colors: any;
  styles: any;
  onPress: () => void;
};

const BudgetTile = React.memo(function BudgetTile({ cat, index, isPrivacyMode, isDark, colors, styles, onPress }: BudgetTileProps) {
  const opacity = useSharedValue(0);
  const transY = useSharedValue(16);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: transY.value }],
  }));

  useEffect(() => {
    opacity.value = withDelay(index * 60, withTiming(1, { duration: 280 }));
    transY.value  = withDelay(index * 60, withSpring(0, { damping: 18, stiffness: 200 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgColor = cat.tile_bg_colour ?? colors.catTileEmptyBg;
  const solidColor = cat.text_colour ?? colors.primary;
  const isOver = cat.state === 'over';

  return (
    <RAnim.View style={[styles.catTileWrap, animStyle]}>
      <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
        <View
          style={[
            styles.catTile,
            { backgroundColor: isDark ? colors.surfaceSubdued : bgColor },
          ]}
        >
          <WaveFill pct={cat.pct} color={solidColor} />

          <View style={styles.catBadgeWrap}>
            {isOver ? (
              <View style={styles.catOverBadge}>
                <Text style={styles.catOverBadgeText}>Over!</Text>
              </View>
            ) : (
              <View style={[styles.catPctPill, { backgroundColor: `${solidColor}18` }]}>
                <Text style={[styles.catPctBadge, { color: solidColor }]}>
                  {Math.round(cat.pct * 100)}%
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.catIconCircle, { backgroundColor: `${solidColor}22` }]}>
            <CategoryIcon categoryKey={cat.name.toLowerCase()} color={solidColor} />
          </View>

          <Text style={[styles.catName, { color: solidColor }]}>{cat.name}</Text>
          <Text style={[styles.catAmt, { color: solidColor }]}>
            {fmtPeso(cat.spent, isPrivacyMode)}
          </Text>
        </View>
      </TouchableOpacity>
    </RAnim.View>
  );
}, (prev, next) =>
  prev.cat.id === next.cat.id &&
  prev.cat.pct === next.cat.pct &&
  prev.cat.state === next.cat.state &&
  prev.cat.spent === next.cat.spent &&
  prev.isPrivacyMode === next.isPrivacyMode &&
  prev.isDark === next.isDark &&
  prev.colors === next.colors &&
  prev.styles === next.styles
);

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { status: syncStatus, syncVersion } = useSync();
  const { profile } = useAuth();
  const userName = profile?.name || 'User';

  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets.top), [colors, isDark, insets.top]);

  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const { accounts, totalBalance, loading: accountsLoading, refetch: refetchAccounts } = useAccounts();
  const { categories, loading: categoriesLoading, refetch: refetchCategories } = useCategories();
  const {
    totalIncome,
    totalExpense: monthlyExpense,
    sparklineData,
    loading: totalsLoading,
    refetch: refetchTotals,
  } = useMonthlyTotals();

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
      refetchAccounts();
      refetchCategories();
      refetchTotals();
    }
  }, [syncVersion, refetchAccounts, refetchCategories, refetchTotals]);

  const getSyncColor = () => {
    switch (syncStatus) {
      case 'synced':
        return colors.syncSynced;
      case 'syncing':
        return colors.syncSyncing;
      case 'offline':
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

  useFocusEffect(
    useCallback(() => {
      // Only play entrance animation on first mount, not on every back-navigation
      if (!hasAnimated.current) {
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
      }

      refetchAccounts();
      refetchCategories();
      refetchTotals();
      const last = getLastSaved();
      if (!last) return;
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
    }, [refetchAccounts, refetchCategories, refetchTotals, isPrivacyMode,
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

  // TODO: Replace with real AI-generated insight from backend once Fino Intelligence API is ready.
  const insight = {
    headline: 'You spend most on Tuesdays 📊',
    body: 'Food is 42% of weekly spend. Want to set a lower limit?',
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
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
                <Ionicons name="wallet-outline" size={28} color={colors.whiteTransparent55} />
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
                <TouchableOpacity
                  key={acc.id}
                  activeOpacity={0.88}
                  onPress={() =>
                    navigation.navigate('more', {
                      screen: 'AccountDetail',
                      params: { id: acc.id },
                    })
                  }
                >
                  <View
                    style={{
                      width: SCALED_CARD_W,
                      height: SCALED_CARD_H,
                      overflow: 'hidden',
                      borderRadius: Math.round(22 * CARD_SCALE),
                    }}
                  >
                    <View
                      style={{
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        transform: [{ scale: CARD_SCALE }],
                        left: -Math.round((CARD_WIDTH * (1 - CARD_SCALE)) / 2),
                        top: -Math.round((CARD_HEIGHT * (1 - CARD_SCALE)) / 2),
                      }}
                    >
                      <WalletCard account={acc} isPrivacyMode={isPrivacyMode} />
                    </View>
                  </View>
                </TouchableOpacity>
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
                <Ionicons name="pie-chart-outline" size={28} color={colors.textSecondary} />
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

const createStyles = (colors: any, isDark: boolean, topInset: number) =>
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
