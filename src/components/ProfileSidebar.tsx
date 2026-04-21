/**
 * ProfileSidebar — Facebook-style right drawer.
 * Partial screen width (peek of content on left).
 * Layout: profile row → shortcut grid → list rows → sign out.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import { supabase } from '../services/supabase';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import type CategoryModel from '../db/models/Category';
import type BillReminderModel from '../db/models/BillReminder';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '../constants/accountLogos';
import { Skeleton } from './Skeleton';
import { spacing, ACCENT_THEMES, ThemeColors } from '../constants/theme';
import { AddAccountModal } from '../screens/MoreScreen';
import { CategoryIcon } from './CategoryIcon';

const { width: W, height: H } = Dimensions.get('window');
const PANEL_W = Math.round(W * 0.88); // ~88% — leaves a peek on the left

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ── Shortcut grid item ────────────────────────────────────────────────────────
function GridItem({
  icon,
  label,
  color,
  bg,
  onPress,
  colors,
  isDark,
  styles,
}: {
  icon: string;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
  colors: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.gridItem,
        { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8' },
      ]}
    >
      <View style={[styles.gridIconBox, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text
        style={[styles.gridLabel, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────
function ListRow({
  icon,
  label,
  onPress,
  colors,
  isDark,
  chevron = true,
  styles,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  isDark: boolean;
  chevron?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      style={styles.listRow}
    >
      <View
        style={[
          styles.listIconBox,
          { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8' },
        ]}
      >
        <Ionicons name={icon as any} size={18} color={colors.textSecondary} />
      </View>
      <Text style={[styles.listLabel, { color: colors.textPrimary }]}>
        {label}
      </Text>
      {chevron && (
        <Ionicons
          name="chevron-forward"
          size={15}
          color={colors.textSecondary}
          style={{ opacity: 0.5 }}
        />
      )}
    </TouchableOpacity>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProfileSidebar({ visible, onClose }: Props) {
  const { colors, isDark, mode, setMode, accent, setAccent } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const { accounts, loading, refetch: refetchAccounts } = useAccounts();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const slideAnim = useRef(new Animated.Value(PANEL_W)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [modalMounted, setModalMounted] = useState(false);

  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState('Guest');
  const [userInitial, setUserInitial] = useState('G');

  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const [billsExpanded, setBillsExpanded] = useState(false);

  const [budgetCategories, setBudgetCategories] = useState<
    {
      id: string;
      name: string;
      emoji: string | null;
      budget_limit: number | null;
      text_colour: string | null;
      tile_bg_colour: string | null;
    }[]
  >([]);
  const [bills, setBills] = useState<
    {
      id: string;
      title: string;
      amount: number | null;
      due_date: string;
      is_paid: boolean;
      is_recurring: boolean;
    }[]
  >([]);
  const [loadingBudget, setLoadingBudget] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      setAuthEmail(email);
      if (email) {
        const raw = email.split('@')[0].replace(/[._]/g, ' ');
        setUserName(raw.charAt(0).toUpperCase() + raw.slice(1));
        setUserInitial(email.charAt(0).toUpperCase());
      } else {
        setUserName('Guest');
        setUserInitial('G');
      }
    });
  }, [visible]);

  // ── Fetch budget categories ──────────────────────────────────────────────
  useEffect(() => {
    if (!budgetExpanded || !userId) return;
    setLoadingBudget(true);
    database
      .get<CategoryModel>('categories')
      .query(Q.where('user_id', userId), Q.sortBy('name', Q.asc))
      .fetch()
      .then((records) => {
        setBudgetCategories(
          records.map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji ?? null,
            budget_limit: c.budgetLimit ?? null,
            text_colour: c.textColour ?? null,
            tile_bg_colour: c.tileBgColour ?? null,
          })),
        );
        setLoadingBudget(false);
      });
  }, [budgetExpanded, userId]);

  // ── Fetch bills ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!billsExpanded || !userId) return;
    setLoadingBills(true);
    database
      .get<BillReminderModel>('bill_reminders')
      .query(Q.where('user_id', userId), Q.sortBy('due_date', Q.asc))
      .fetch()
      .then((records) => {
        setBills(
          records.map((b) => ({
            id: b.id,
            title: b.title,
            amount: b.amount ?? null,
            due_date: b.dueDate,
            is_paid: b.isPaid,
            is_recurring: b.isRecurring,
          })),
        );
        setLoadingBills(false);
      });
  }, [billsExpanded, userId]);

  // ── Animation lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    let closeFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    if (visible) {
      slideAnim.setValue(PANEL_W);
      backdropAnim.setValue(0);
      setModalMounted(true);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            friction: 18,
            tension: 200,
            useNativeDriver: true,
          }),
          Animated.timing(backdropAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: PANEL_W,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setModalMounted(false));

      // Fallback in case animation callback does not fire (interrupted animation,
      // fast navigation). Prevents an invisible global Modal from blocking taps.
      closeFallbackTimer = setTimeout(() => setModalMounted(false), 320);
    }

    return () => {
      if (closeFallbackTimer) clearTimeout(closeFallbackTimer);
    };
  }, [visible]);

  const handleAccountPress = useCallback(
    (id: string) => {
      onClose();
      setTimeout(
        () =>
          navigation.navigate('more', {
            screen: 'AccountDetail',
            params: { id },
          }),
        260
      );
    },
    [navigation, onClose]
  );

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setAuthEmail(null);
          setUserName('Guest');
          setUserInitial('G');
          onClose();
        },
      },
    ]);
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      Alert.alert('Required', 'Enter your email and password.');
      return;
    }
    setIsLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setIsLoggingIn(false);
    if (error) {
      Alert.alert('Login failed', error.message);
      return;
    }
    setShowLogin(false);
    setLoginPassword('');
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      setAuthEmail(email);
      if (email) {
        const raw = email.split('@')[0].replace(/[._]/g, ' ');
        setUserName(raw.charAt(0).toUpperCase() + raw.slice(1));
        setUserInitial(email.charAt(0).toUpperCase());
      }
    });
  };

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <Modal
      visible={modalMounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Dimmed peek area on the left */}
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[styles.backdrop, { opacity: backdropAnim }]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>

        {/* Sliding panel */}
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[
            styles.panel,
            { paddingTop: insets.top, transform: [{ translateX: slideAnim }] },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            bounces={false}
          >
            {/* ── Profile row ── */}
            <View style={styles.profileRow}>
              <TouchableOpacity
                style={styles.avatarWrap}
                onPress={() => !authEmail && setShowLogin(true)}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={styles.avatarCircle}
                >
                  <Text style={styles.avatarLetter}>{userInitial}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <View style={styles.profileMeta}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {userName}
                </Text>
                {authEmail ? (
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {authEmail}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={() => setShowLogin(true)}>
                    <Text
                      style={[styles.profileEmail, { color: colors.primary }]}
                    >
                      Log in →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[
                  styles.headerIconBtn,
                  {
                    backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                  },
                ]}
                onPress={onClose}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Balance chip */}
            <View
              style={[
                styles.balanceChip,
                { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8' },
              ]}
            >
              <Ionicons
                name="wallet-outline"
                size={14}
                color={colors.primary}
              />
              <Text
                style={[styles.balanceLabel, { color: colors.textSecondary }]}
              >
                Total balance
              </Text>
              <Text
                style={[styles.balanceAmount, { color: colors.textPrimary }]}
              >
                ₱
                {Math.abs(totalBalance).toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            {/* ── Shortcut grid ── */}
            <View style={styles.grid}>
              <GridItem
                icon="wallet-outline"
                label="My Accounts"
                color={colors.primary}
                bg={isDark ? colors.primaryLight : '#E8F4EC'}
                onPress={() => {
                  setBudgetExpanded(false);
                  setBillsExpanded(false);
                  setAccountsExpanded((v) => !v);
                }}
                colors={colors}
                isDark={isDark}
                styles={styles}
              />
              <GridItem
                icon="pie-chart-outline"
                label="Budget"
                color={colors.statWarnBar}
                bg={isDark ? '#3A2E1D' : '#FFF4E5'}
                onPress={() => {
                  setAccountsExpanded(false);
                  setBillsExpanded(false);
                  setBudgetExpanded((v) => !v);
                }}
                colors={colors}
                isDark={isDark}
                styles={styles}
              />
              <GridItem
                icon="receipt-outline"
                label="Bills"
                color={colors.insightPurple}
                bg={isDark ? colors.lavenderLight : '#F0ECFD'}
                onPress={() => {
                  setAccountsExpanded(false);
                  setBudgetExpanded(false);
                  setBillsExpanded((v) => !v);
                }}
                colors={colors}
                isDark={isDark}
                styles={styles}
              />
              <GridItem
                icon="sparkles-outline"
                label="Ask Fino"
                color={colors.lavenderDark}
                bg={isDark ? colors.lavenderLight : '#EDE8FC'}
                onPress={() => {
                  onClose();
                  setTimeout(
                    () => (navigation as any).navigate('ChatScreen'),
                    260
                  );
                }}
                colors={colors}
                isDark={isDark}
                styles={styles}
              />
            </View>

            {/* Accounts expandable under grid */}
            {accountsExpanded && (
              <View
                style={[
                  styles.accountsBlock,
                  {
                    backgroundColor: isDark ? colors.background : '#F8F8FA',
                    borderColor: colors.border,
                  },
                ]}
              >
                {loading
                  ? [0, 1, 2].map((i) => (
                      <View key={i} style={styles.acctRow}>
                        <Skeleton width={32} height={32} borderRadius={16} />
                        <Skeleton
                          width={100}
                          height={12}
                          style={{ marginLeft: 10, flex: 1 }}
                        />
                        <Skeleton width={60} height={12} />
                      </View>
                    ))
                  : accounts.map((acct, i) => {
                      const logo = ACCOUNT_LOGOS[acct.name];
                      const letter =
                        ACCOUNT_AVATAR_OVERRIDE[acct.name] ??
                        acct.letter_avatar;
                      const neg = acct.balance < 0;
                      return (
                        <TouchableOpacity
                          key={acct.id}
                          style={[
                            styles.acctRow,
                            i === accounts.length - 1 && {
                              borderBottomWidth: 0,
                            },
                          ]}
                          onPress={() => handleAccountPress(acct.id)}
                          activeOpacity={0.65}
                        >
                          <View style={styles.acctLeft}>
                            {logo ? (
                              <View
                                style={[
                                  styles.acctAvatar,
                                  { backgroundColor: colors.white },
                                ]}
                              >
                                <Image
                                  source={logo}
                                  style={{ width: 16, height: 16 }}
                                  contentFit="contain"
                                  transition={150}
                                />
                              </View>
                            ) : (
                              <View
                                style={[
                                  styles.acctAvatar,
                                  {
                                    backgroundColor:
                                      acct.brand_colour ??
                                      colors.catTileEmptyBg,
                                  },
                                ]}
                              >
                                <Text style={styles.acctAvatarText}>
                                  {letter}
                                </Text>
                              </View>
                            )}
                            <Text
                              style={[
                                styles.acctName,
                                { color: colors.textPrimary },
                              ]}
                              numberOfLines={1}
                            >
                              {acct.name}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.acctBalance,
                              neg && { color: colors.expenseRed },
                            ]}
                          >
                            {neg ? '−' : '+'}₱
                            {Math.abs(acct.balance).toLocaleString('en-PH', {
                              minimumFractionDigits: 0,
                            })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                <TouchableOpacity
                  style={styles.addAcctRow}
                  onPress={() => setShowAddAccount(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={[styles.addAcctText, { color: colors.primary }]}>
                    Add new account
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Budget expandable ── */}
            {budgetExpanded && (
              <View
                style={[
                  styles.accountsBlock,
                  {
                    backgroundColor: isDark ? colors.background : '#F8F8FA',
                    borderColor: colors.border,
                  },
                ]}
              >
                {loadingBudget ? (
                  [0, 1, 2].map((i) => (
                    <View key={i} style={styles.acctRow}>
                      <Skeleton width={32} height={32} borderRadius={16} />
                      <Skeleton
                        width={100}
                        height={12}
                        style={{ marginLeft: 10, flex: 1 }}
                      />
                      <Skeleton width={60} height={12} />
                    </View>
                  ))
                ) : budgetCategories.filter((c) => c.budget_limit != null)
                    .length === 0 ? (
                  <View style={[styles.acctRow, { borderBottomWidth: 0 }]}>
                    <Text
                      style={[
                        styles.acctName,
                        { color: colors.textSecondary, marginLeft: 0 },
                      ]}
                    >
                      No budgets set yet
                    </Text>
                  </View>
                ) : (
                  budgetCategories
                    .filter((c) => c.budget_limit != null)
                    .map((cat, i, arr) => {
                      const color = cat.text_colour ?? colors.primary;
                      return (
                        <View
                          key={cat.id}
                          style={[
                            styles.acctRow,
                            i === arr.length - 1 && { borderBottomWidth: 0 },
                          ]}
                        >
                          <View style={styles.acctLeft}>
                            <CategoryIcon
                              categoryKey={cat.name.toLowerCase()}
                              color={color}
                              size={15}
                              wrapperSize={32}
                            />
                            <Text
                              style={[
                                styles.acctName,
                                { color: colors.textPrimary },
                              ]}
                              numberOfLines={1}
                            >
                              {cat.name}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.acctBalance,
                              { color: colors.textPrimary },
                            ]}
                          >
                            ₱
                            {cat.budget_limit!.toLocaleString('en-PH', {
                              minimumFractionDigits: 0,
                            })}
                          </Text>
                        </View>
                      );
                    })
                )}
              </View>
            )}

            {/* ── Bills expandable ── */}
            {billsExpanded && (
              <View
                style={[
                  styles.accountsBlock,
                  {
                    backgroundColor: isDark ? colors.background : '#F8F8FA',
                    borderColor: colors.border,
                  },
                ]}
              >
                {loadingBills ? (
                  [0, 1, 2].map((i) => (
                    <View key={i} style={styles.billRow}>
                      <Skeleton width={36} height={36} borderRadius={10} />
                      <View style={{ flex: 1, gap: 5, marginLeft: 10 }}>
                        <Skeleton width={110} height={11} />
                        <Skeleton width={70} height={10} />
                      </View>
                      <Skeleton width={54} height={22} borderRadius={8} />
                    </View>
                  ))
                ) : bills.length === 0 ? (
                  <View style={[styles.billRow, { borderBottomWidth: 0 }]}>
                    <Text
                      style={[
                        styles.acctName,
                        { color: colors.textSecondary, marginLeft: 0 },
                      ]}
                    >
                      No bills yet
                    </Text>
                  </View>
                ) : (
                  bills.map((bill, i) => {
                    const due = new Date(bill.due_date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const daysLeft = Math.ceil(
                      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    const isOverdue = !bill.is_paid && daysLeft < 0;
                    const dueSoon =
                      !bill.is_paid && daysLeft >= 0 && daysLeft <= 3;

                    const badgeColor = bill.is_paid
                      ? colors.primary
                      : isOverdue
                        ? colors.expenseRed
                        : dueSoon
                          ? colors.statWarnBar
                          : colors.textSecondary;

                    const badgeBg = bill.is_paid
                      ? isDark
                        ? 'rgba(52,199,89,0.15)'
                        : '#E8F4EC'
                      : isOverdue
                        ? isDark
                          ? 'rgba(224,92,92,0.15)'
                          : '#FEF0F0'
                        : dueSoon
                          ? isDark
                            ? 'rgba(255,171,0,0.15)'
                            : '#FFF8E7'
                          : isDark
                            ? colors.surfaceSubdued
                            : '#EBEBEF';

                    const iconBg = bill.is_paid
                      ? isDark
                        ? 'rgba(52,199,89,0.12)'
                        : '#E8F4EC'
                      : isOverdue
                        ? isDark
                          ? 'rgba(224,92,92,0.12)'
                          : '#FEF0F0'
                        : isDark
                          ? colors.surfaceSubdued
                          : '#EBEBEF';

                    const dueLabel = bill.is_paid
                      ? 'Paid'
                      : daysLeft === 0
                        ? 'Today'
                        : daysLeft === 1
                          ? 'Tomorrow'
                          : isOverdue
                            ? `${Math.abs(daysLeft)}d ago`
                            : `in ${daysLeft}d`;

                    const monthStr = due.toLocaleString('en-PH', {
                      month: 'short',
                    });
                    const dayStr = due.getDate();

                    return (
                      <View
                        key={bill.id}
                        style={[
                          styles.billRow,
                          i === bills.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        {/* Calendar icon box */}
                        <View
                          style={[
                            styles.billIconBox,
                            { backgroundColor: iconBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.billIconMonth,
                              { color: badgeColor },
                            ]}
                          >
                            {monthStr.toUpperCase()}
                          </Text>
                          <Text
                            style={[styles.billIconDay, { color: badgeColor }]}
                          >
                            {dayStr}
                          </Text>
                        </View>

                        {/* Title + recurring */}
                        <View style={styles.billMeta}>
                          <Text
                            style={[
                              styles.billTitle,
                              {
                                color: bill.is_paid
                                  ? colors.textSecondary
                                  : colors.textPrimary,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {bill.title}
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {bill.is_recurring && (
                              <Ionicons
                                name="repeat"
                                size={10}
                                color={colors.textSecondary}
                              />
                            )}
                            <Text
                              style={[
                                styles.billSubLabel,
                                { color: colors.textSecondary },
                              ]}
                            >
                              {bill.is_recurring ? 'Recurring' : 'One-time'}
                            </Text>
                          </View>
                        </View>

                        {/* Right: amount + badge */}
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          {bill.amount != null && (
                            <Text
                              style={[
                                styles.billAmount,
                                {
                                  color: bill.is_paid
                                    ? colors.textSecondary
                                    : colors.textPrimary,
                                },
                              ]}
                            >
                              ₱
                              {bill.amount.toLocaleString('en-PH', {
                                minimumFractionDigits: 0,
                              })}
                            </Text>
                          )}
                          <View
                            style={[
                              styles.billBadge,
                              { backgroundColor: badgeBg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.billBadgeText,
                                { color: badgeColor },
                              ]}
                            >
                              {dueLabel}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            {/* ── List rows ── */}
            <ListRow
              icon="settings-outline"
              label="Settings & Preferences"
              onPress={() => setShowSettings(true)}
              colors={colors}
              isDark={isDark}
              styles={styles}
            />
            <ListRow
              icon="help-circle-outline"
              label="Help & Support"
              onPress={() => {}}
              colors={colors}
              isDark={isDark}
              styles={styles}
            />

            <View
              style={[
                styles.divider,
                { backgroundColor: colors.border, marginTop: 8 },
              ]}
            />

            {/* ── Sign out ── */}
            {authEmail ? (
              <TouchableOpacity
                style={styles.signOutRow}
                onPress={handleSignOut}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.listIconBox,
                    {
                      backgroundColor: isDark
                        ? 'rgba(224,92,92,0.1)'
                        : '#FEF0F0',
                    },
                  ]}
                >
                  <Ionicons
                    name="log-out-outline"
                    size={18}
                    color={colors.expenseRed}
                  />
                </View>
                <Text style={[styles.listLabel, { color: colors.expenseRed }]}>
                  Sign out
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.signOutRow}
                onPress={() => setShowLogin(true)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.listIconBox,
                    {
                      backgroundColor: isDark ? colors.primaryLight : '#E8F4EC',
                    },
                  ]}
                >
                  <Ionicons
                    name="log-in-outline"
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <Text style={[styles.listLabel, { color: colors.primary }]}>
                  Log in
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      <AddAccountModal
        visible={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onSaved={refetchAccounts}
      />

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettings(false)}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.white }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{ paddingTop: 12, paddingHorizontal: spacing.screenPadding }}
          >
            {/* Handle */}
            <View
              style={{
                width: 36,
                height: 4,
                backgroundColor: colors.border,
                borderRadius: 2,
                alignSelf: 'center',
                marginBottom: 16,
              }}
            />

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 28,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Nunito_800ExtraBold',
                  fontSize: 22,
                  color: colors.textPrimary,
                }}
              >
                Settings
              </Text>
              <TouchableOpacity
                onPress={() => setShowSettings(false)}
                style={{ padding: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Appearance ── */}
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 11,
                color: colors.textSecondary,
                letterSpacing: 0.8,
                marginBottom: 12,
              }}
            >
              APPEARANCE
            </Text>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.catTileEmptyBg,
                borderRadius: 12,
                padding: 4,
                marginBottom: 28,
              }}
            >
              {(['system', 'light', 'dark'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setMode(t)}
                  style={[
                    {
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: 'center',
                      gap: 4,
                    },
                    mode === t && {
                      backgroundColor: colors.white,
                      shadowColor: '#000',
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 2,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      t === 'system'
                        ? 'phone-portrait-outline'
                        : t === 'light'
                          ? 'sunny-outline'
                          : 'moon-outline'
                    }
                    size={16}
                    color={
                      mode === t ? colors.textPrimary : colors.textSecondary
                    }
                  />
                  <Text
                    style={{
                      fontFamily:
                        mode === t ? 'Inter_600SemiBold' : 'Inter_400Regular',
                      fontSize: 12,
                      color:
                        mode === t ? colors.textPrimary : colors.textSecondary,
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Color theme ── */}
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 11,
                color: colors.textSecondary,
                letterSpacing: 0.8,
                marginBottom: 14,
              }}
            >
              COLOR THEME
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 32,
              }}
            >
              {ACCENT_THEMES.map((theme) => {
                const isActive = accent === theme.key;
                return (
                  <TouchableOpacity
                    key={theme.key}
                    onPress={() => setAccent(theme.key)}
                    activeOpacity={0.75}
                    style={{ alignItems: 'center', gap: 6, width: 64 }}
                  >
                    {/* Swatch circle */}
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: theme.swatch,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: isActive ? 3 : 2,
                        borderColor: isActive
                          ? theme.swatch
                          : isDark
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(0,0,0,0.08)',
                        shadowColor: theme.swatch,
                        shadowOpacity: isActive ? 0.45 : 0,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 3 },
                        elevation: isActive ? 6 : 0,
                      }}
                    >
                      {isActive && (
                        <Ionicons name="checkmark" size={22} color="#fff" />
                      )}
                    </View>
                    <Text
                      style={{
                        fontFamily: isActive
                          ? 'Inter_600SemiBold'
                          : 'Inter_400Regular',
                        fontSize: 11,
                        color: isActive
                          ? colors.textPrimary
                          : colors.textSecondary,
                        textAlign: 'center',
                      }}
                    >
                      {theme.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Preview strip ── */}
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 11,
                color: colors.textSecondary,
                letterSpacing: 0.8,
                marginBottom: 12,
              }}
            >
              PREVIEW
            </Text>
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                marginBottom: 8,
              }}
            >
              {/* Hero mini */}
              <View
                style={{
                  backgroundColor: colors.heroCardBg,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.6)',
                      marginBottom: 2,
                    }}
                  >
                    Total Balance
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Nunito_800ExtraBold',
                      fontSize: 22,
                      color: '#fff',
                    }}
                  >
                    ₱12,500
                  </Text>
                </View>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="wallet" size={18} color="#fff" />
                </View>
              </View>
              {/* Row mini */}
              <View
                style={{
                  backgroundColor: colors.white,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.primaryLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name="trending-down"
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: 'Inter_500Medium',
                      fontSize: 13,
                      color: colors.textPrimary,
                    }}
                  >
                    Groceries
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular',
                      fontSize: 11,
                      color: colors.textSecondary,
                    }}
                  >
                    Today
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: 'DMMono_400Regular',
                    fontSize: 13,
                    color: colors.expenseRed,
                  }}
                >
                  −₱450
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </Modal>

      {/* Login Modal */}
      <Modal
        visible={showLogin}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLogin(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: colors.white }}
        >
          <View
            style={{ paddingTop: 12, paddingHorizontal: spacing.screenPadding }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                backgroundColor: colors.border,
                borderRadius: 2,
                alignSelf: 'center',
                marginBottom: 16,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 28,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Nunito_800ExtraBold',
                  fontSize: 22,
                  color: colors.textPrimary,
                }}
              >
                Log in
              </Text>
              <TouchableOpacity
                onPress={() => setShowLogin(false)}
                style={{ padding: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 14,
                fontFamily: 'Inter_400Regular',
                fontSize: 15,
                color: colors.textPrimary,
                marginBottom: 12,
                backgroundColor: colors.white,
              }}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={loginEmail}
              onChangeText={setLoginEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 14,
                fontFamily: 'Inter_400Regular',
                fontSize: 15,
                color: colors.textPrimary,
                marginBottom: 24,
                backgroundColor: colors.white,
              }}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
            />
            <TouchableOpacity
              onPress={handleLogin}
              disabled={isLoggingIn}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 14,
                padding: 16,
                alignItems: 'center',
                opacity: isLoggingIn ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 15,
                  color: '#fff',
                }}
              >
                {isLoggingIn ? 'Logging in…' : 'Log in'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    panel: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: PANEL_W,
      backgroundColor: colors.white,
      shadowColor: '#000',
      shadowOffset: { width: -8, height: 0 },
      shadowOpacity: isDark ? 0.5 : 0.15,
      shadowRadius: 24,
      elevation: 20,
    },

    // ── Profile row ──
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
      gap: 10,
    },
    avatarWrap: {},
    avatarCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: '#fff',
    },
    profileMeta: { flex: 1, minWidth: 0 },
    profileName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: colors.textPrimary,
    },
    profileEmail: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    headerIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Balance chip
    balanceChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginHorizontal: 16,
      marginBottom: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    balanceLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1 },
    balanceAmount: { fontFamily: 'DMMono_400Regular', fontSize: 13 },

    divider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: 16,
      marginVertical: 8,
    },

    // ── Grid ──
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      gap: 8,
      marginVertical: 8,
    },
    gridItem: {
      width: '47%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    gridIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    gridLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      flex: 1,
    },

    // ── Accounts block ──
    accountsBlock: {
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    acctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
    },
    acctLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    acctAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    acctAvatarText: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 11,
      color: '#fff',
    },
    acctName: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      marginLeft: 9,
      flex: 1,
    },
    acctBalance: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 11.5,
      color: colors.textPrimary,
    },
    addAcctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    addAcctText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },

    // ── Bill rows ──
    billRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
    },
    billIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    billIconMonth: {
      fontFamily: 'Inter_700Bold',
      fontSize: 7,
      letterSpacing: 0.5,
    },
    billIconDay: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 14,
      lineHeight: 16,
    },
    billMeta: { flex: 1, minWidth: 0, gap: 2 },
    billTitle: { fontFamily: 'Inter_500Medium', fontSize: 13 },
    billSubLabel: { fontFamily: 'Inter_400Regular', fontSize: 10 },
    billAmount: { fontFamily: 'DMMono_400Regular', fontSize: 12 },
    billBadge: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    billBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },

    // ── List rows ──
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    signOutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    listIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    listLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14.5,
      flex: 1,
    },
  });
