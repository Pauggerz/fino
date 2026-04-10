import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSync } from '@/contexts/SyncContext';
import { useAuth } from '@/contexts/AuthContext';
import { CategoryIcon } from '@/components/CategoryIcon';
import Toast from '../components/Toast';
import WalletCard, { CARD_WIDTH, CARD_HEIGHT } from '../components/WalletCard';
import { colors } from '../constants/theme';
import { BALANCE_ANIMATE_MS } from '../services/balanceCalc';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { getLastSaved, clearLastSaved } from '@/services/lastSavedStore';
import { supabase } from '@/services/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_SCALE = 0.78;
const SCALED_CARD_W = Math.round(CARD_WIDTH * CARD_SCALE);
const SCALED_CARD_H = Math.round(CARD_HEIGHT * CARD_SCALE);

const SPARKLINE = [
  { id: 'day0', val: 0.38 },
  { id: 'day1', val: 0.6 },
  { id: 'day2', val: 0.27 },
  { id: 'day3', val: 0.74 },
  { id: 'day4', val: 0.45 },
  { id: 'day5', val: 0.88 },
  { id: 'day6', val: 0.52 },
];

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

function fmtPeso(n: number): string {
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
  const numArcs = (WAVE_SVG_W / halfWl) + 2;
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
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim1, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(anim2, { toValue: 1, duration: 4600, useNativeDriver: true })
    ).start();
  }, [anim1, anim2]);

  const clampedPct = Math.min(Math.max(pct, 0), 1);
  const yBase = TILE_H - TILE_H * clampedPct;

  // Translate exactly one wavelength → start and end frames are identical → no snap
  const tx1 = anim1.interpolate({ inputRange: [0, 1], outputRange: [0, -TILE_W] });
  const tx2 = anim2.interpolate({ inputRange: [0, 1], outputRange: [0, -TILE_W] });

  const waveStyle = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: WAVE_SVG_W,
  };

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {/* Back wave — slower, subtler */}
      <Animated.View style={[waveStyle, { transform: [{ translateX: tx2 }] }]}>
        <Svg width={WAVE_SVG_W} height={TILE_H}>
          <SvgPath d={makeWavePath(yBase + 6, 8)} fill={color} opacity={0.18} />
        </Svg>
      </Animated.View>
      {/* Front wave — faster, more opaque */}
      <Animated.View style={[waveStyle, { transform: [{ translateX: tx1 }] }]}>
        <Svg width={WAVE_SVG_W} height={TILE_H}>
          <SvgPath d={makeWavePath(yBase, 10)} fill={color} opacity={0.42} />
        </Svg>
      </Animated.View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { status: syncStatus, syncVersion } = useSync();
  const { profile } = useAuth();
  const userName = profile?.name || 'User';

  const { accounts, totalBalance, refetch: refetchAccounts } = useAccounts();
  const { categories, refetch: refetchCategories } = useCategories();
  const {
    totalIncome,
    totalExpense: monthlyExpense,
    refetch: refetchTotals,
  } = useMonthlyTotals();

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
        return '#10B981';
      case 'syncing':
        return '#F59E0B';
      case 'offline':
        return '#EF4444';
      default:
        return '#10B981';
    }
  };

  const animBalance = useRef(new Animated.Value(totalBalance)).current;
  const [displayBalance, setDisplayBalance] = useState(totalBalance);

  useEffect(() => {
    const getMyId = async () => {
      await supabase.auth.getUser();
    };
    getMyId();
  }, []);

  useEffect(() => {
    const listenerId = animBalance.addListener(({ value }) => {
      setDisplayBalance(value);
    });

    Animated.timing(animBalance, {
      toValue: totalBalance,
      duration: BALANCE_ANIMATE_MS,
      useNativeDriver: false,
    }).start();

    return () => animBalance.removeListener(listenerId);
  }, [totalBalance, animBalance]);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastTitle, setToastTitle] = useState('');
  const [toastSubtitle, setToastSubtitle] = useState('');
  const [toastIsUndo, setToastIsUndo] = useState(false);
  const [undoTxId, setUndoTxId] = useState<string | null>(null);
  const [undoAccountId, setUndoAccountId] = useState<string | null>(null);
  const [undoPreviousBalance, setUndoPreviousBalance] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetchAccounts();
      refetchCategories();
      refetchTotals();
      const last = getLastSaved();
      if (!last) return;
      clearLastSaved();
      const typeLabel = last.type === 'expense' ? 'Expense' : 'Income';
      setToastTitle(`${typeLabel} saved`);
      setToastSubtitle(
        `${fmtPeso(last.amount)} · ${last.categoryName} · ${last.accountName}`
      );
      setToastIsUndo(false);
      setUndoTxId(last.id);
      setUndoAccountId(last.accountId);
      setUndoPreviousBalance(last.previousBalance);
      setToastVisible(true);
    }, [refetchAccounts, refetchCategories, refetchTotals])
  );

  const handleUndo = useCallback(async () => {
    if (!undoTxId) return;
    await supabase.from('transactions').delete().eq('id', undoTxId);
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

  const delta = totalIncome - monthlyExpense;
  const deltaLabel = `${delta >= 0 ? '↑' : '↓'} ${delta >= 0 ? '+' : ''}${fmtPeso(delta)} vs last month`;

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
        <View style={styles.greeting}>
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
            <LinearGradient
              colors={['#5B8C6E', '#3f6b52']}
              style={styles.avatar}
            >
              <Text style={styles.avatarLetter}>
                {userName.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.onTrackWrap}>
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
                          : 'rgba(91,140,110,0.3)',
                    },
                  ]}
                />
              ))}
            </View>

            <View style={styles.onTrackText}>
              <Text style={styles.onTrackTitle}>{statusLabel}</Text>
              <Text style={styles.onTrackSub}>
                {daysLeft} days left · {fmtPeso(monthlyExpense)} spent
              </Text>
            </View>
          </View>
        </View>

        {/* ── Unified dark card: balance + accounts ── */}
        <View style={styles.unifiedCard}>
          {/* Ambient blobs */}
          <LinearGradient
            colors={['rgba(168,213,181,0.45)', 'transparent']}
            style={[styles.blob, { top: -30, right: -20, width: 160, height: 160 }]}
          />
          <LinearGradient
            colors={['rgba(91,140,110,0.4)', 'transparent']}
            style={[styles.blob, { bottom: 80, left: -20, width: 110, height: 110 }]}
          />

          {/* ── Balance section ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('stats')}
            style={styles.balanceSection}
          >
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>
                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
            </View>

            <Text style={styles.heroLabel}>Total balance</Text>

            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurr}>₱</Text>
              <Text style={styles.heroAmount}>
                {displayBalance.toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            <View style={styles.trendBadge}>
              <Text style={styles.trendText}>{deltaLabel}</Text>
            </View>

            <View style={styles.heroRow}>
              <View style={[styles.heroCol, styles.heroColBorder]}>
                <Text style={styles.heroColLabel}>Income</Text>
                <Text style={styles.heroColVal}>+{fmtPeso(totalIncome)}</Text>
              </View>
              <View style={styles.heroCol}>
                <Text style={styles.heroColLabel}>Spent</Text>
                <Text style={styles.heroColVal}>−{fmtPeso(monthlyExpense)}</Text>
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
            {accounts.map((acc) => (
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
                <View style={{
                  width: SCALED_CARD_W,
                  height: SCALED_CARD_H,
                  overflow: 'hidden',
                  borderRadius: Math.round(22 * CARD_SCALE),
                }}>
                  <View style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    transform: [{ scale: CARD_SCALE }],
                    left: -Math.round(CARD_WIDTH * (1 - CARD_SCALE) / 2),
                    top: -Math.round(CARD_HEIGHT * (1 - CARD_SCALE) / 2),
                  }}>
                    <WalletCard account={acc} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Budgets + insight, directly on background ── */}
        <View style={styles.belowCard}>
          {/* Monthly budgets */}
          <View style={styles.acctHeader}>
            <View style={styles.acctHeaderLeft}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionLabel}>Monthly budgets</Text>
            </View>
          </View>

          <View style={styles.catGrid}>
            {categories.map((cat) => {
              const bgColor = cat.tile_bg_colour ?? '#F5F5F5';
              const solidColor = cat.text_colour ?? colors.primary;
              const isOver = cat.state === 'over';
              return (
                <TouchableOpacity
                  key={cat.id}
                  activeOpacity={0.8}
                  style={styles.catTileWrap}
                  onPress={() => navigation.navigate('stats')}
                >
                  <View style={[styles.catTile, { backgroundColor: bgColor }]}>
                    {/* Animated wave liquid fill in solid brand color */}
                    <WaveFill pct={cat.pct} color={solidColor} />

                    <View style={styles.catBadgeWrap}>
                      {isOver ? (
                        <View style={styles.catOverBadge}>
                          <Text style={[styles.catOverBadgeText, { color: solidColor }]}>Over!</Text>
                        </View>
                      ) : (
                        <Text style={[styles.catPctBadge, { color: solidColor }]}>
                          {Math.round(cat.pct * 100)}%
                        </Text>
                      )}
                    </View>

                    <View style={[styles.catIconCircle, { backgroundColor: `${solidColor}22` }]}>
                      <CategoryIcon
                        categoryKey={cat.name.toLowerCase()}
                        color={solidColor}
                      />
                    </View>

                    <Text style={[styles.catName, { color: solidColor }]}>{cat.name}</Text>
                    <Text style={[styles.catAmt, { color: solidColor }]}>{fmtPeso(cat.spent)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {insight && (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.insightWrap}
              onPress={() => navigation.navigate('ChatScreen')}
            >
              <View style={styles.insightCard}>
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
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Toast
        visible={toastVisible}
        title={toastTitle}
        subtitle={toastSubtitle}
        type={toastIsUndo ? 'undo' : 'success'}
        onUndo={!toastIsUndo && undoTxId ? handleUndo : undefined}
        onDismiss={() => setToastVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  greeting: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
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
    marginTop: 4,
  },
  avatarLetter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: colors.white,
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
    borderColor: 'rgba(91,140,110,0.2)',
    backgroundColor: 'rgba(235,242,238,0.7)',
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
    backgroundColor: '#1e3d2f',
    borderRadius: 28,
    overflow: 'hidden',
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: '#0f2419',
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
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  unifiedDividerLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  unifiedSeeAll: { marginLeft: 4 },
  frostScroll: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 4,
  },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  heroChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  heroLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
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
    color: 'rgba(255,255,255,0.65)',
    marginTop: 6,
    marginRight: 2,
  },
  heroAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 42,
    color: colors.white,
    letterSpacing: -2,
    lineHeight: 48,
  },
  trendBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(168,213,181,0.25)',
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
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  heroCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  heroColBorder: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.12)',
  },
  heroColLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  heroColVal: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 15,
    color: colors.white,
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
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
  catPctBadge: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  catOverBadge: {
    backgroundColor: 'rgba(192,80,58,0.12)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  catOverBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
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
  catName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 12, marginBottom: 1 },
  catAmt: { fontFamily: 'DMMono_500Medium', fontSize: 11 },
  belowCard: {
    marginTop: 24,
  },
  insightWrap: { paddingHorizontal: 20, marginTop: 8, marginBottom: 16 },
  insightCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(91,140,110,0.15)',
    backgroundColor: 'rgba(235,242,238,0.6)',
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  insightAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(91,140,110,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(91,140,110,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightAvatarIcon: { fontSize: 15, color: colors.primary },
  insightBody: { flex: 1 },
  insightLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: colors.primaryDark,
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
    backgroundColor: 'rgba(91,140,110,0.12)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(91,140,110,0.25)',
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  insightChipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.primaryDark,
  },
});
