import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.screenContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
      >
        {/* ── GREETING ── */}
        <View style={styles.greeting}>
          <View style={styles.greetingPillContainer}>
            <LinearGradient
              colors={['#FBF0EC', '#FFF3E0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.greetingPill}
            >
              <Text style={styles.greetingPillText}>Good morning ☀️</Text>
            </LinearGradient>
          </View>
          <Text style={styles.greetingName}>Hey, Christian! 👋</Text>
          <Text style={styles.greetingDate}>
            Sunday, March 22 · Here&apos;s your picture
          </Text>

          <View style={styles.statChips}>
            <View style={styles.statChipWrapper}>
              <LinearGradient
                colors={['#EFF8F2', '#d4eddf']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statChip}
              >
                <Text style={[styles.statChipLabel, { color: '#3f6b52' }]}>
                  Saved
                </Text>
                <Text style={[styles.statChipVal, { color: '#3f6b52' }]}>
                  ₱450
                </Text>
                <Text style={[styles.statChipSub, { color: '#3f6b52' }]}>
                  vs last week
                </Text>
              </LinearGradient>
            </View>
            <View style={styles.statChipWrapper}>
              <LinearGradient
                colors={['#FBF0EC', '#ffe4d4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statChip}
              >
                <Text style={[styles.statChipLabel, { color: '#A83A1A' }]}>
                  Food
                </Text>
                <Text style={[styles.statChipVal, { color: '#A83A1A' }]}>
                  80%
                </Text>
                <Text style={[styles.statChipSub, { color: '#A83A1A' }]}>
                  of budget
                </Text>
              </LinearGradient>
            </View>
          </View>
        </View>

        {/* ── HERO CARD ── */}
        <TouchableOpacity activeOpacity={0.9}>
          <LinearGradient
            colors={['#4a7a5e', '#5B8C6E', '#6a9e7f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Note: React Native doesn't support radial gradients natively without SVG, so we use a subtle overlay for the 'hero-light' effect */}
            <View style={styles.heroLight} />

            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>March 2026</Text>
            </View>
            <Text style={styles.heroLabel}>Total balance</Text>
            <Text style={styles.heroAmount}>₱12,450.00</Text>

            <View style={styles.heroRow}>
              <View style={[styles.heroCol, styles.heroColBorder]}>
                <Text style={styles.heroColLabel}>Income</Text>
                <Text style={styles.heroColVal}>+₱18,000</Text>
              </View>
              <View style={styles.heroCol}>
                <Text style={styles.heroColLabel}>Spent</Text>
                <Text style={styles.heroColVal}>−₱5,550</Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── ACCOUNTS ── */}
        <Text style={styles.sectionLabel}>ACCOUNTS</Text>
        <TouchableOpacity activeOpacity={0.8}>
          <View style={styles.acctChip}>
            <LinearGradient
              colors={['#EFF8F2', '#d4eddf']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.acctIcon}
            >
              <Text style={styles.acctIconEmoji}>💵</Text>
            </LinearGradient>
            <View style={styles.acctInfo}>
              <Text style={styles.acctName}>Cash</Text>
              <Text style={styles.acctSub}>Updated now</Text>
            </View>
            <Text style={styles.acctVal}>₱2,450</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8}>
          <View style={styles.acctChip}>
            <LinearGradient
              colors={['#E8F4FD', '#c8e4f8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.acctIcon}
            >
              <Text style={styles.acctIconEmoji}>📱</Text>
            </LinearGradient>
            <View style={styles.acctInfo}>
              <Text style={styles.acctName}>GCash</Text>
              <Text style={styles.acctSub}>Updated 3m ago</Text>
            </View>
            <Text style={styles.acctVal}>₱8,000</Text>
          </View>
        </TouchableOpacity>

        {/* ── SPENDING THIS MONTH ── */}
        <Text style={styles.sectionLabel}>SPENDING THIS MONTH</Text>
        <View style={styles.catGrid}>
          {/* Food */}
          <TouchableOpacity activeOpacity={0.8} style={styles.catTileWrapper}>
            <LinearGradient
              colors={['#FFF8EE', '#FFF3E0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.catTile}
            >
              <Text style={styles.catEmoji}>🍔</Text>
              <Text style={[styles.catName, { color: '#9B6B1A' }]}>Food</Text>
              <Text style={[styles.catAmt, { color: '#9B6B1A' }]}>₱1,200</Text>
              <View style={styles.catBar}>
                <View
                  style={[
                    styles.catFill,
                    { width: '80%', backgroundColor: '#E8856A' },
                  ]}
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
          {/* Transport */}
          <TouchableOpacity activeOpacity={0.8} style={styles.catTileWrapper}>
            <LinearGradient
              colors={['#EEF6FF', '#E8F4FD']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.catTile}
            >
              <Text style={styles.catEmoji}>🚌</Text>
              <Text style={[styles.catName, { color: '#1A5C9B' }]}>
                Transport
              </Text>
              <Text style={[styles.catAmt, { color: '#1A5C9B' }]}>₱350</Text>
              <View style={styles.catBar}>
                <View
                  style={[
                    styles.catFill,
                    { width: '35%', backgroundColor: '#5B8C6E' },
                  ]}
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
          {/* Shopping */}
          <TouchableOpacity activeOpacity={0.8} style={styles.catTileWrapper}>
            <LinearGradient
              colors={['#FFF0F8', '#FDE8F0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.catTile}
            >
              <Text style={styles.catEmoji}>🛍</Text>
              <Text style={[styles.catName, { color: '#9B1A5C' }]}>
                Shopping
              </Text>
              <Text
                style={[
                  styles.catAmt,
                  { color: '#C0503A', fontFamily: 'DMMono_500Medium' },
                ]}
              >
                Over!
              </Text>
              <View style={styles.catBar}>
                <View
                  style={[
                    styles.catFill,
                    { width: '100%', backgroundColor: '#E8856A' },
                  ]}
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
          {/* Bills */}
          <TouchableOpacity activeOpacity={0.8} style={styles.catTileWrapper}>
            <LinearGradient
              colors={['#F4F0FF', '#EDE8FD']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.catTile}
            >
              <Text style={styles.catEmoji}>⚡</Text>
              <Text style={[styles.catName, { color: '#5C1A9B' }]}>Bills</Text>
              <Text style={[styles.catAmt, { color: '#5C1A9B' }]}>₱800</Text>
              <View style={styles.catBar}>
                <View
                  style={[
                    styles.catFill,
                    { width: '55%', backgroundColor: '#C9B8F5' },
                  ]}
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── INSIGHT CARD ── */}
        <LinearGradient
          colors={['#F0ECFD', '#EBF2EE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.insightCard}
        >
          <Text style={styles.insightHd}>✦ SPENDING INSIGHT</Text>
          <Text style={styles.insightBody}>You spend most on Tuesdays 🍜</Text>
          <Text style={styles.insightSub}>
            Food is 42% of weekly spend. Want to set a lower limit?
          </Text>
        </LinearGradient>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // #F7F5F2
  },
  screenContent: {
    flex: 1,
  },
  // ── GREETING ──
  greeting: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greetingPillContainer: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(232,133,106,0.25)',
    overflow: 'hidden',
  },
  greetingPill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  greetingPillText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#A83A1A',
  },
  greetingName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 24,
    color: colors.textPrimary, // #1E1E2E
    lineHeight: 28,
    marginBottom: 4,
  },
  greetingDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary, // #8A8A9A
    marginBottom: 14,
  },
  statChips: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  statChipWrapper: {
    flex: 1,
    borderRadius: 18,
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  statChip: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  statChipLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  statChipVal: {
    fontFamily: 'DMMono_500Medium', // Emulating DM Mono 700 with available 500
    fontSize: 22,
    lineHeight: 22,
  },
  statChipSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    opacity: 0.7,
    marginTop: 3,
  },

  // ── HERO CARD ──
  heroCard: {
    borderRadius: 26,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#4a7a5e',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 8,
    overflow: 'hidden',
  },
  heroLight: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  heroChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  heroLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  heroCol: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  heroColBorder: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.15)',
  },
  heroColLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  heroColVal: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // ── COMMON & TYPOGRAPHY ──
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },

  // ── ACCOUNTS ──
  acctChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  acctIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  acctIconEmoji: {
    fontSize: 20,
  },
  acctInfo: {
    flex: 1,
  },
  acctName: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  acctSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  acctVal: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 16,
    color: colors.primary, // #5B8C6E
  },

  // ── CATEGORIES (SPENDING THIS MONTH) ──
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  catTileWrapper: {
    width: '48%', // Approx 2 columns accounting for gap
  },
  catTile: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(30,30,46,0.08)',
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
  },
  catEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  catName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 13,
  },
  catAmt: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 12,
    opacity: 0.85,
    marginTop: 2,
  },
  catBar: {
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(30,30,46,0.1)',
    marginTop: 8,
    overflow: 'hidden',
  },
  catFill: {
    height: '100%',
    borderRadius: 4,
  },

  // ── INSIGHT CARD ──
  insightCard: {
    borderWidth: 1,
    borderColor: 'rgba(201,184,245,0.35)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  insightHd: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#4B2DA3',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  insightBody: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  insightSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
