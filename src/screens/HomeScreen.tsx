import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useSync } from '@/contexts/SyncContext';
import { useAuth } from '@/contexts/AuthContext';

import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '../constants/accountLogos';
import { isNegativeBalance, BALANCE_ANIMATE_MS } from '../services/balanceCalc';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { useTransactions, FeedTransaction } from '@/hooks/useTransactions';
import { getLastSaved, clearLastSaved } from '@/services/lastSavedStore';
import { supabase } from '@/services/supabase';
import Toast from '../components/Toast';
import { Skeleton } from '@/components/Skeleton';

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

function calculateSparkline(
  transactions: FeedTransaction[]
): { id: string; val: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return {
      id: `day${i}`,
      timestamp: d.getTime(),
      total: 0,
    };
  });

  if (!transactions || transactions.length === 0) {
    return days.map((d) => ({ id: d.id, val: 0 }));
  }

  transactions.forEach((tx) => {
    if (tx.type === 'expense' && tx.date) {
      const txDate = new Date(tx.date);
      txDate.setHours(0, 0, 0, 0);
      const txTime = txDate.getTime();

      const dayMatch = days.find((d) => d.timestamp === txTime);
      if (dayMatch) {
        dayMatch.total += Number(tx.amount) || 0;
      }
    }
  });

  const maxSpend = Math.max(...days.map((d) => d.total));

  return days.map((d) => ({
    id: d.id,
    val: maxSpend > 0 ? d.total / maxSpend : 0,
  }));
}

function timeSince(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { status: syncStatus, syncVersion, lastSyncedAt } = useSync();
  const { profile } = useAuth();

  const userName = profile?.name || 'User';

  const {
    accounts,
    totalBalance,
    refetch: refetchAccounts,
    loading: isAccountsLoading = false,
  } = useAccounts();
  const {
    categories,
    refetch: refetchCategories,
    loading: isCategoriesLoading = false,
  } = useCategories();
  const {
    totalIncome,
    totalExpense: monthlyExpense,
    refetch: refetchTotals,
  } = useMonthlyTotals();
  const { items: transactions, refetch: refetchTransactions } =
    useTransactions();

  const sparklineData = useMemo(
    () => calculateSparkline(transactions),
    [transactions]
  );

  useEffect(() => {
    if (syncVersion > 0) {
      refetchAccounts();
      refetchCategories();
      refetchTotals();
      refetchTransactions();
    }
  }, [
    syncVersion,
    refetchAccounts,
    refetchCategories,
    refetchTotals,
    refetchTransactions,
  ]);

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

  const animBalance = useRef(new Animated.Value(totalBalance)).current;
  const [displayBalance, setDisplayBalance] = useState(totalBalance);

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
  const [undoPreviousBalance, setUndoPreviousBalance] = useState<number | null>(
    null
  );

  useFocusEffect(
    useCallback(() => {
      refetchAccounts();
      refetchCategories();
      refetchTotals();
      refetchTransactions();
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
    }, [refetchAccounts, refetchCategories, refetchTotals, refetchTransactions])
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
    refetchTransactions();
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
    refetchTransactions,
  ]);

  const [staleTimeText, setStaleTimeText] = useState('');
  useEffect(() => {
    if (syncStatus !== 'offline' || !lastSyncedAt) {
      setStaleTimeText('');
      return;
    }

    const updateTime = () =>
      setStaleTimeText(`Last synced ${timeSince(lastSyncedAt)}`);

    updateTime();
    const intervalId = setInterval(updateTime, 60000);

    return () => clearInterval(intervalId);
  }, [syncStatus, lastSyncedAt]);

  const { text: greetText, emoji: greetEmoji } = getGreeting();
  const daysLeft = getDaysLeftInMonth();
  const totalBudget = categories.reduce((s, c) => s + (c.budget_limit ?? 0), 0);
  const pctSpent = totalBudget > 0 ? monthlyExpense / totalBudget : 0;
  const statusLabel = onTrackLabel(pctSpent);

  const delta = totalIncome - monthlyExpense;
  const LAST_MONTH_TOTAL = totalBalance - delta;
  const deltaLabel = `${delta >= 0 ? '↑' : '↓'} ${delta >= 0 ? '+' : ''}${fmtPeso(delta)} vs last month`;

  const insight = useMemo(() => {
    if (isCategoriesLoading) return null;

    if (categories.length === 0 && monthlyExpense === 0) {
      return {
        headline: 'Welcome to Fino! 👋',
        body: 'Start adding transactions to get personalized insights on your spending.',
      };
    }

    const overBudget = categories.find((c) => c.state === 'over' || c.pct >= 1);
    if (overBudget) {
      const overAmt = overBudget.spent - (overBudget.budget_limit || 0);
      return {
        headline: `${overBudget.name} budget exceeded ⚠️`,
        body: `You are ${fmtPeso(overAmt)} over your limit for ${overBudget.name}. Try to hold off on purchases.`,
      };
    }

    const topSpend = [...categories].sort((a, b) => b.spent - a.spent)[0];
    if (topSpend && topSpend.spent > 0) {
      const pctOfTotal =
        monthlyExpense > 0
          ? Math.round((topSpend.spent / monthlyExpense) * 100)
          : 0;
      return {
        headline: `${topSpend.name} is your top spend 📊`,
        body: `It makes up ${pctOfTotal}% of your expenses. Want to adjust your budget?`,
      };
    }

    return {
      headline: 'On track this month 🌟',
      body: "You're keeping your expenses low. Keep up the good work!",
    };
  }, [categories, monthlyExpense, isCategoriesLoading]);

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
              colors={[colors.primary, colors.primaryDark]}
              style={styles.avatar}
            >
              <Text style={styles.avatarLetter}>
                {userName.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.onTrackWrap}>
          <LinearGradient
            colors={[colors.onTrackBg1, colors.onTrackBg2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.onTrackPill}
          >
            <View style={styles.sparkline}>
              {sparklineData.map((bar, i) => (
                <View
                  key={bar.id}
                  style={[
                    styles.sparkBar,
                    {
                      height: Math.max(4, bar.val * 20),
                      backgroundColor:
                        i === sparklineData.length - 1
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
                {daysLeft} days left · {fmtPeso(monthlyExpense)} spent
              </Text>
            </View>
          </LinearGradient>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.heroWrap}
          onPress={() => navigation.navigate('stats')}
        >
          <View style={styles.heroCard}>
            <View style={StyleSheet.absoluteFill}>
              <LinearGradient
                colors={[colors.primaryLight60, 'transparent']}
                style={[
                  styles.blob,
                  { top: -40, right: -30, width: 140, height: 140 },
                ]}
              />
              <LinearGradient
                colors={[colors.whiteTransparent30, 'transparent']}
                style={[
                  styles.blob,
                  { bottom: -20, left: -20, width: 100, height: 100 },
                ]}
              />
              <LinearGradient
                colors={[colors.primaryTransparent50, 'transparent']}
                style={[
                  styles.blob,
                  { top: 20, left: '45%', width: 80, height: 80 },
                ]}
              />
              <BlurView
                intensity={60}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
            </View>

            <View style={styles.glassPanel}>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>
                  {new Date().toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
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

              <View style={styles.badgeRow}>
                {syncStatus === 'offline' && (
                  <View style={styles.staleDataBadge}>
                    <Text style={styles.staleDataText}>
                      {staleTimeText || 'Offline - Stale data'}
                    </Text>
                  </View>
                )}

                <View style={styles.trendBadge}>
                  <Text style={styles.trendText}>{deltaLabel}</Text>
                </View>
              </View>

              <View style={styles.heroRow}>
                <View style={[styles.heroCol, styles.heroColBorder]}>
                  <Text style={styles.heroColLabel}>Income</Text>
                  <Text style={styles.heroColVal}>+{fmtPeso(totalIncome)}</Text>
                </View>
                <View style={styles.heroCol}>
                  <Text style={styles.heroColLabel}>Spent</Text>
                  <Text style={styles.heroColVal}>
                    −{fmtPeso(monthlyExpense)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabel}>Accounts</Text>
        </View>

        <View style={styles.acctGrid}>
          {isAccountsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <View key={`skel-acc-${i}`} style={styles.acctCard}>
                  <Skeleton
                    width={40}
                    height={40}
                    borderRadius={20}
                    style={{ marginBottom: 4 }}
                  />
                  <Skeleton
                    width={80}
                    height={14}
                    style={{ marginBottom: 4 }}
                  />
                  <Skeleton width={60} height={14} />
                </View>
              ))
            : accounts.map((acc) => {
                const neg = isNegativeBalance(acc.balance);
                return (
                  <TouchableOpacity
                    key={acc.id}
                    activeOpacity={0.8}
                    style={styles.acctCard}
                    onPress={() =>
                      navigation.navigate('more', {
                        screen: 'AccountDetail',
                        params: { id: acc.id },
                      })
                    }
                  >
                    {(() => {
                      const logo = ACCOUNT_LOGOS[acc.name];
                      const avatarLetter =
                        ACCOUNT_AVATAR_OVERRIDE[acc.name] ?? acc.letter_avatar;
                      return logo ? (
                        <View style={styles.acctIconWrap}>
                          <Image
                            source={logo}
                            style={styles.acctLogo}
                            resizeMode="contain"
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.acctIconWrap,
                            { backgroundColor: acc.brand_colour },
                          ]}
                        >
                          <Text style={styles.acctLetter}>{avatarLetter}</Text>
                        </View>
                      );
                    })()}
                    <Text style={styles.acctName}>{acc.name}</Text>
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

        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabel}>Monthly budgets</Text>
        </View>

        <View style={styles.catGrid}>
          {isCategoriesLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <View key={`skel-cat-${i}`} style={styles.catTileWrap}>
                  <View
                    style={[
                      styles.catTile,
                      { backgroundColor: colors.catTileEmptyBg },
                    ]}
                  >
                    <View style={styles.catBadgeWrap}>
                      <Skeleton width={32} height={14} borderRadius={4} />
                    </View>
                    <View
                      style={[
                        styles.catIconCircle,
                        { backgroundColor: 'transparent' },
                      ]}
                    >
                      <Skeleton width={32} height={32} borderRadius={16} />
                    </View>
                    <Skeleton
                      width={70}
                      height={14}
                      style={{ marginBottom: 4 }}
                    />
                    <Skeleton
                      width={50}
                      height={12}
                      style={{ marginBottom: 8 }}
                    />
                    <Skeleton width="100%" height={4} borderRadius={4} />
                  </View>
                </View>
              ))
            : categories.map((cat) => {
                const bgColor = cat.tile_bg_colour ?? colors.catTileEmptyBg;
                const textColor = cat.text_colour ?? colors.textPrimary;
                const isOver = cat.state === 'over';
                return (
                  <TouchableOpacity
                    key={cat.id}
                    activeOpacity={0.8}
                    style={styles.catTileWrap}
                    onPress={() => navigation.navigate('stats')}
                  >
                    <LinearGradient
                      colors={[bgColor, bgColor]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.catTile}
                    >
                      <View style={styles.catBadgeWrap}>
                        {isOver ? (
                          <View style={styles.catOverBadge}>
                            <Text style={styles.catOverBadgeText}>Over!</Text>
                          </View>
                        ) : (
                          <Text
                            style={[styles.catPctBadge, { color: textColor }]}
                          >
                            {Math.round(cat.pct * 100)}%
                          </Text>
                        )}
                      </View>

                      <View style={styles.catIconCircle}>
                        <CategoryIcon
                          categoryKey={cat.name.toLowerCase()}
                          color={cat.text_colour ?? colors.catIconEmpty}
                        />
                      </View>

                      <Text style={[styles.catName, { color: textColor }]}>
                        {cat.name}
                      </Text>
                      <Text style={[styles.catAmt, { color: textColor }]}>
                        {fmtPeso(cat.spent)}
                      </Text>

                      <View style={styles.catBarTrack}>
                        <View
                          style={[
                            styles.catBarFill,
                            {
                              width: `${cat.pct * 100}%` as any,
                              backgroundColor: textColor,
                            },
                          ]}
                        />
                      </View>
                    </LinearGradient>
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
            <LinearGradient
              colors={[colors.lavenderLight, colors.primaryLight]}
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
    borderColor: colors.onTrackBorder,
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
  heroWrap: { paddingHorizontal: 20, marginBottom: 20 },
  heroCard: {
    backgroundColor: colors.heroCardBg,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 20,
    shadowColor: colors.heroCardShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 10,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  glassPanel: {
    backgroundColor: colors.whiteTransparent07,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.whiteTransparent18,
    padding: 16,
  },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.whiteTransparent15,
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginBottom: 8,
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
    color: colors.white,
    letterSpacing: -2,
    lineHeight: 48,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  trendBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight25,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  trendText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.mint,
  },
  staleDataBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.staleDataBg,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  staleDataText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.staleDataText,
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
    fontFamily: 'DMMono_500Medium',
    fontSize: 15,
    color: colors.white,
  },
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
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    gap: 4,
  },
  acctIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorderTransparent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  acctLogo: { width: 28, height: 28 },
  acctLetter: { fontSize: 16, fontWeight: '700', color: colors.white },
  acctName: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  acctBalance: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  negBang: { color: colors.expenseRed, fontFamily: 'Inter_700Bold' },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  catTileWrap: { width: '47.5%' },
  catTile: {
    borderRadius: 28,
    height: 120,
    padding: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  catBadgeWrap: { position: 'absolute', top: 10, right: 10 },
  catPctBadge: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  catOverBadge: {
    backgroundColor: colors.catOverBadgeBg,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  catOverBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: colors.expenseRed,
  },
  catIconCircle: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.whiteTransparent80,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  catBarTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: colors.whiteTransparent80,
    overflow: 'hidden',
  },
  catBarFill: { height: '100%', borderRadius: 4, opacity: 0.6 },
  insightWrap: { paddingHorizontal: 20, marginBottom: 16 },
  insightCard: {
    borderRadius: 18,
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
  insightAvatarIcon: { fontSize: 15, color: colors.lavenderDark },
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
  },
});
