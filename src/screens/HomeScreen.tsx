import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/theme';
import {
  useTransactionStore,
  transactionStore,
  isNegativeBalance,
  BALANCE_ANIMATE_MS,
} from '../services/balanceCalc';
import type { Category } from '../services/aiCategoryMap';
import Toast from '../components/Toast';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_NAME = 'Christian';
const MONTHLY_BUDGET = 12_000;
const CATEGORY_BUDGETS: Partial<Record<Category, number>> = {
  food: 3000,
  transport: 1000,
  shopping: 2000,
  bills: 2000,
  health: 1500,
};
// 7 mock daily-spend percentages for the sparkline (last 7 days)
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

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Circular SVG progress ring — spec: strokeDasharray=94, strokeLinecap='round' */
function CircleRing({
  pct,
  label,
  value,
  color,
  warn,
}: {
  pct: number;
  label: string;
  value: string;
  color: string;
  warn?: boolean;
}) {
  const CIRC = 94; // 2π × 15 ≈ 94.2
  const offset = CIRC * (1 - Math.max(0, Math.min(1, pct)));

  return (
    <View style={ringStyles.wrap}>
      <View style={ringStyles.svgWrap}>
        <Svg width={42} height={42} viewBox="0 0 42 42">
          {/* Track */}
          <Circle
            cx="21"
            cy="21"
            r="15"
            stroke="#d4eddf"
            strokeWidth={4}
            fill="none"
          />
          {/* Fill */}
          <Circle
            cx="21"
            cy="21"
            r="15"
            stroke={color}
            strokeWidth={4}
            fill="none"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 21 21)"
          />
        </Svg>
        {warn && (
          <View style={ringStyles.warnBadge}>
            <Text style={ringStyles.warnText}>!</Text>
          </View>
        )}
      </View>
      <Text style={[ringStyles.val, { color }]}>{value}</Text>
      <Text style={ringStyles.label}>{label}</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3 },
  svgWrap: { position: 'relative', width: 42, height: 42 },
  warnBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(192,80,58,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: colors.expenseRed,
  },
  val: { fontFamily: 'DMMono_500Medium', fontSize: 11, lineHeight: 14 },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const store = useTransactionStore();

  const { totalBalance, totalIncome, totalExpense } = store.getBalanceSummary();
  const accountSummaries = store.getAccountSummaries();
  const categorySpend = store.getCategorySpend();

  // ── Balance animation — 400ms Animated.timing after each store change ──
  const animBalance = useRef(new Animated.Value(totalBalance)).current;
  useEffect(() => {
    Animated.timing(animBalance, {
      toValue: totalBalance,
      duration: BALANCE_ANIMATE_MS,
      useNativeDriver: false,
    }).start();
  }, [totalBalance, animBalance]);

  // ── Toast state ──
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTitle, setToastTitle] = useState('');
  const [toastSubtitle, setToastSubtitle] = useState('');
  const [toastIsUndo, setToastIsUndo] = useState(false);
  const [undoTxId, setUndoTxId] = useState<string | null>(null);

  // Show toast whenever screen regains focus after a save
  useFocusEffect(
    useCallback(() => {
      const last = transactionStore.getLastSaved();
      if (!last) return;
      transactionStore.clearLastSaved();
      const typeLabel = last.type === 'exp' ? 'Expense' : 'Income';
      const cat =
        last.category.charAt(0).toUpperCase() + last.category.slice(1);
      const acctLabel = ACCOUNT_CONFIG[last.account]?.label ?? last.account;
      setToastTitle(`${typeLabel} saved`);
      setToastSubtitle(`${fmtPeso(last.amount)} · ${cat} · ${acctLabel}`);
      setToastIsUndo(false);
      setUndoTxId(last.id);
      setToastVisible(true);
    }, [])
  );

  const handleUndo = useCallback(() => {
    if (!undoTxId) return;
    transactionStore.remove(undoTxId);
    setUndoTxId(null);
    setToastTitle('Removed');
    setToastSubtitle('Transaction undone');
    setToastIsUndo(true);
    setToastVisible(true);
  }, [undoTxId]);

  // ── Derived values ──
  const { text: greetText, emoji: greetEmoji } = getGreeting();
  const daysLeft = getDaysLeftInMonth();
  const pctSpent = MONTHLY_BUDGET > 0 ? totalExpense / MONTHLY_BUDGET : 0;
  const statusLabel = onTrackLabel(pctSpent);

  // Saved ring: budget remaining / budget
  const savedPct = Math.max(0, 1 - pctSpent);
  // Top over-budget category for ring 2
  const foodPct = CATEGORY_BUDGETS.food
    ? categorySpend.food / CATEGORY_BUDGETS.food
    : 0;
  const shoppingPct = CATEGORY_BUDGETS.shopping
    ? categorySpend.shopping / CATEGORY_BUDGETS.shopping
    : 0;
  const isShoppingOver = shoppingPct >= 1;

  // Mock last-month delta for trend badge
  const LAST_MONTH_TOTAL = totalBalance - 2450;
  const delta = totalBalance - LAST_MONTH_TOTAL;
  const deltaLabel = `${delta >= 0 ? '↑' : '↓'} ${delta >= 0 ? '+' : ''}${fmtPeso(delta)} vs last month`;

  // Mock insight (only render if present)
  const insight = {
    headline: 'You spend most on Tuesdays 🍜',
    body: 'Food is 42% of weekly spend. Want to set a lower limit?',
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ════════════════ GREETING ════════════════ */}
        <View style={styles.greeting}>
          <View style={styles.greetingTop}>
            <View style={styles.greetingLeft}>
              {/* Time-based pill: transparent bg, no border per spec */}
              <Text style={styles.greetingPill}>
                {greetText} {greetEmoji}
              </Text>
              {/* Two-tone name */}
              <Text style={styles.greetingName}>
                <Text style={{ color: colors.primary }}>Kamusta, </Text>
                <Text style={{ color: colors.greetingPurple }}>
                  {USER_NAME}!
                </Text>
              </Text>
            </View>
            {/* Avatar: 36px green gradient circle */}
            <LinearGradient
              colors={['#5B8C6E', '#3f6b52']}
              style={styles.avatar}
            >
              <Text style={styles.avatarLetter}>{USER_NAME[0]}</Text>
            </LinearGradient>
          </View>
        </View>

        {/* ════════════════ ON-TRACK STATUS PILL ════════════════ */}
        <View style={styles.onTrackWrap}>
          <LinearGradient
            colors={['#EFF8F2', '#d4eddf']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.onTrackPill}
          >
            {/* Sparkline */}
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
                {daysLeft} days left · {fmtPeso(totalExpense)} spent
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* ════════════════ MINI CIRCLE STATS ════════════════ */}
        <View style={styles.miniStats}>
          <CircleRing
            pct={savedPct}
            label="Saved"
            value={`${Math.round(savedPct * 100)}%`}
            color={colors.primary}
          />
          <CircleRing
            pct={foodPct}
            label="Food"
            value={`${Math.round(foodPct * 100)}%`}
            color={colors.coral}
          />
          <CircleRing
            pct={shoppingPct}
            label="Shopping"
            value={
              isShoppingOver ? 'Over!' : `${Math.round(shoppingPct * 100)}%`
            }
            color={isShoppingOver ? colors.expenseRed : colors.catShoppingText}
            warn={isShoppingOver}
          />
        </View>

        {/* ════════════════ HERO BALANCE CARD ════════════════ */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.heroWrap}
          onPress={() => navigation.navigate('stats')}
        >
          {/* Dark base */}
          <View style={styles.heroCard}>
            {/* Blob overlays */}
            <View
              style={[
                styles.blob,
                {
                  top: -40,
                  right: -30,
                  width: 140,
                  height: 140,
                  opacity: 0.18,
                },
              ]}
            />
            <View
              style={[
                styles.blob,
                {
                  bottom: -20,
                  left: -20,
                  width: 100,
                  height: 100,
                  opacity: 0.12,
                },
              ]}
            />
            <View
              style={[
                styles.blob,
                { top: 20, left: '45%', width: 80, height: 80, opacity: 0.09 },
              ]}
            />

            {/* Glass panel */}
            <View style={styles.glassPanel}>
              {/* Month chip */}
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>
                  {new Date().toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>

              <Text style={styles.heroLabel}>Total balance</Text>

              {/* Split peso + amount */}
              <View style={styles.heroAmountRow}>
                <Text style={styles.heroCurr}>₱</Text>
                <Text style={styles.heroAmount}>
                  {totalBalance.toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                  })}
                </Text>
              </View>

              {/* Trend badge */}
              <View style={styles.trendBadge}>
                <Text style={styles.trendText}>{deltaLabel}</Text>
              </View>

              {/* Income / Spent row */}
              <View style={styles.heroRow}>
                <View style={[styles.heroCol, styles.heroColBorder]}>
                  <Text style={styles.heroColLabel}>Income</Text>
                  <Text style={styles.heroColVal}>+{fmtPeso(totalIncome)}</Text>
                </View>
                <View style={styles.heroCol}>
                  <Text style={styles.heroColLabel}>Spent</Text>
                  <Text style={styles.heroColVal}>
                    −{fmtPeso(totalExpense)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* ════════════════ ACCOUNTS GRID ════════════════ */}
        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabel}>Accounts</Text>
        </View>

        <View style={styles.acctGrid}>
          {accountSummaries.map((acc) => {
            const cfg = ACCOUNT_CONFIG[acc.accountId];
            if (!cfg) return null;
            const neg = isNegativeBalance(acc.balance);
            return (
              <TouchableOpacity
                key={acc.accountId}
                activeOpacity={0.8}
                style={styles.acctCard}
                onPress={() => navigation.navigate('more')}
              >
                <View
                  style={[styles.acctAvatar, { backgroundColor: cfg.color }]}
                >
                  <Text style={styles.acctAvatarLetter}>{cfg.letter}</Text>
                </View>
                <Text style={styles.acctName}>{cfg.label}</Text>
                <Text
                  style={[
                    styles.acctBalance,
                    neg && { color: colors.expenseRed },
                  ]}
                >
                  {neg && <Text style={styles.negBang}>! </Text>}
                  {fmtPeso(acc.balance)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ════════════════ CATEGORY TILES ════════════════ */}
        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabel}>Monthly budgets</Text>
        </View>

        <View style={styles.catGrid}>
          {CATEGORY_TILES.map((tile) => {
            const spent = categorySpend[tile.id] ?? 0;
            const budget = CATEGORY_BUDGETS[tile.id] ?? 1;
            const pct = Math.min(1, spent / budget);
            const isOver = pct >= 1;
            return (
              <TouchableOpacity
                key={tile.id}
                activeOpacity={0.8}
                style={styles.catTileWrap}
                onPress={() => navigation.navigate('stats')}
              >
                <LinearGradient
                  colors={tile.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.catTile}
                >
                  {/* % badge — top right */}
                  <View style={styles.catBadgeWrap}>
                    {isOver ? (
                      <View style={styles.catOverBadge}>
                        <Text style={styles.catOverBadgeText}>Over!</Text>
                      </View>
                    ) : (
                      <Text
                        style={[styles.catPctBadge, { color: tile.textColor }]}
                      >
                        {Math.round(pct * 100)}%
                      </Text>
                    )}
                  </View>

                  {/* Icon in white circle */}
                  <View style={styles.catIconCircle}>
                    <Text style={styles.catIconEmoji}>{tile.icon}</Text>
                  </View>

                  <Text style={[styles.catName, { color: tile.textColor }]}>
                    {tile.label}
                  </Text>
                  <Text style={[styles.catAmt, { color: tile.textColor }]}>
                    {fmtPeso(spent)}
                  </Text>

                  {/* Progress bar: rgba(255,255,255,0.8) track */}
                  <View style={styles.catBarTrack}>
                    <View
                      style={[
                        styles.catBarFill,
                        {
                          width: `${pct * 100}%` as any,
                          backgroundColor: tile.barColor,
                        },
                      ]}
                    />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ════════════════ INSIGHT CARD (only if insight exists) ════════════════ */}
        {insight && (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.insightWrap}
            onPress={() => {
              /* navigate to AI screen in Phase 4 */
            }}
          >
            <LinearGradient
              colors={['#F0ECFD', '#EBF2EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.insightCard}
            >
              {/* ✦ avatar circle */}
              <View style={styles.insightAvatar}>
                <Text style={styles.insightAvatarIcon}>✦</Text>
              </View>

              <View style={styles.insightBody}>
                <Text style={styles.insightLabel}>Fino Intelligence</Text>
                <Text style={styles.insightHeadline}>{insight.headline}</Text>
                <Text style={styles.insightSub}>{insight.body}</Text>

                {/* "Ask Fino →" action chip */}
                <View style={styles.insightChip}>
                  <Text style={styles.insightChipText}>Ask Fino →</Text>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── Toast — absolute overlay, zIndex 300, auto-dismisses after 3500ms ── */}
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

// ─── Account display config (module-level so toast callback can reference it) ──

const ACCOUNT_CONFIG: Record<
  string,
  { letter: string; color: string; label: string }
> = {
  gcash: { letter: 'G', color: colors.accountGCash, label: 'GCash' },
  cash: { letter: '₱', color: colors.accountCash, label: 'Cash' },
  bdo: { letter: 'B', color: colors.accountBDO, label: 'BDO' },
  maya: { letter: 'M', color: colors.accountMaya, label: 'Maya' },
};

// ─── Category tile data ───────────────────────────────────────────────────────

const CATEGORY_TILES: {
  id: Category;
  label: string;
  icon: string;
  gradient: [string, string];
  textColor: string;
  barColor: string;
}[] = [
  {
    id: 'food',
    label: 'Food',
    icon: '🍔',
    gradient: [colors.catFoodBg, '#FFF3E0'],
    textColor: colors.catFoodText,
    barColor: colors.coral,
  },
  {
    id: 'transport',
    label: 'Transport',
    icon: '🚌',
    gradient: [colors.catTransportBg, '#E8F4FD'],
    textColor: colors.catTransportText,
    barColor: colors.primary,
  },
  {
    id: 'shopping',
    label: 'Shopping',
    icon: '🛍',
    gradient: [colors.catShoppingBg, '#FDE8F0'],
    textColor: colors.catShoppingText,
    barColor: colors.coral,
  },
  {
    id: 'bills',
    label: 'Bills',
    icon: '⚡',
    gradient: [colors.catBillsBg, colors.catBillsBg2],
    textColor: colors.catBillsText,
    barColor: colors.lavender,
  },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  // ── Greeting ──
  greeting: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  greetingTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  greetingLeft: { flex: 1 },
  // spec: background:transparent, border:none, Inter 500, textSecondary
  greetingPill: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  greetingName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 26,
    lineHeight: 32,
  },
  // Avatar: 36px circle, green gradient
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

  // ── On-track status pill ──
  onTrackWrap: { paddingHorizontal: 20, marginBottom: 14 },
  onTrackPill: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(45,106,79,0.15)',
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 20,
  },
  sparkBar: {
    width: 4,
    borderRadius: 2,
  },
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

  // ── Mini circle stats ──
  miniStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 8,
  },

  // ── Hero card ──
  heroWrap: { paddingHorizontal: 20, marginBottom: 20 },
  heroCard: {
    backgroundColor: '#2a4f3a',
    borderRadius: 28,
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#1a3028',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 10,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  // Glass panel wraps the actual content
  glassPanel: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 16,
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
  // Split peso sign + amount per spec
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
  // Trend badge
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

  // ── Section label row ──
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 10,
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

  // ── Accounts 2-column grid ──
  acctGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  acctCard: {
    width: '47.5%',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    gap: 4,
  },
  acctAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  acctAvatarLetter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: colors.white,
  },
  acctName: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  // spec: DM Mono, colors.textSecondary
  acctBalance: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  negBang: {
    color: colors.expenseRed,
    fontFamily: 'Inter_700Bold',
  },

  // ── Category tiles ──
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  catTileWrap: { width: '47.5%' },
  catTile: {
    // spec: borderRadius:28, height:120
    borderRadius: 28,
    height: 120,
    padding: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  catBadgeWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  catPctBadge: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  // Shopping "Over!" badge: rgba(192,80,58,0.12) bg per spec
  catOverBadge: {
    backgroundColor: 'rgba(192,80,58,0.12)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  catOverBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: colors.expenseRed,
  },
  // Icon in white circle
  catIconCircle: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconEmoji: { fontSize: 16 },
  catName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 12,
    marginBottom: 1,
  },
  catAmt: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 11,
    marginBottom: 6,
  },
  // spec: rgba(255,255,255,0.8) track
  catBarTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 4,
    opacity: 0.6,
  },

  // ── Insight card ──
  insightWrap: { paddingHorizontal: 20, marginBottom: 16 },
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
    backgroundColor: colors.lavenderLight,
    borderWidth: 1,
    borderColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightAvatarIcon: {
    fontSize: 15,
    color: colors.lavenderDark,
  },
  insightBody: { flex: 1 },
  // spec: "Fino Intelligence" label, #4B2DA3
  insightLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: colors.lavenderDark,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  // spec: Nunito 800 headline
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
  // "Ask Fino →" action chip
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
  },
});
