import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/contexts/ThemeContext';
import { ACCOUNT_LOGOS } from '@/constants/accountLogos';
import fmtPeso from '@/utils/format';

export type AccountSpend = {
  id: string;
  name: string;
  brandColour: string | null;
  letterAvatar: string | null;
  expense: number;
  txCount: number;
};

export function ByAccountStrip({
  accounts,
  totalExpense,
}: {
  accounts: AccountSpend[];
  totalExpense: number;
}) {
  const { colors } = useTheme();
  const denom = totalExpense > 0 ? totalExpense : 1;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.white,
          borderColor: colors.cardBorderTransparent,
        },
      ]}
    >
      <View style={styles.headRow}>
        <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
          BY ACCOUNT
        </Text>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
        </Text>
      </View>

      {accounts.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No spending across accounts this month.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        >
          {accounts.map((a) => {
            const pct = (a.expense / denom) * 100;
            const accentColor = a.brandColour ?? colors.primary;
            const logo = ACCOUNT_LOGOS[a.name];
            return (
              <View
                key={a.id}
                style={[
                  styles.acct,
                  { backgroundColor: colors.surfaceSubdued },
                ]}
              >
                <View style={styles.acctHead}>
                  {logo ? (
                    <Image
                      source={logo}
                      style={styles.acctLogo}
                      contentFit="contain"
                      transition={150}
                    />
                  ) : (
                    <View
                      style={[
                        styles.acctDot,
                        { backgroundColor: accentColor },
                      ]}
                    >
                      <Text style={styles.acctDotText}>
                        {a.letterAvatar ?? a.name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[styles.acctName, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {a.name}
                  </Text>
                </View>
                <Text
                  style={[styles.acctAmount, { color: colors.textPrimary }]}
                >
                  {fmtPeso(a.expense)}
                </Text>
                <View
                  style={[
                    styles.acctBar,
                    { backgroundColor: 'rgba(0,0,0,0.05)' },
                  ]}
                >
                  <View
                    style={{
                      width: `${Math.max(4, Math.min(100, pct))}%`,
                      height: '100%',
                      backgroundColor: accentColor,
                      borderRadius: 999,
                    }}
                  />
                </View>
                <Text
                  style={[styles.acctMeta, { color: colors.textSecondary }]}
                >
                  {pct.toFixed(0)}% · {a.txCount} txns
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  metaText: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 11,
  },
  acct: {
    width: 130,
    borderRadius: 14,
    padding: 12,
  },
  acctHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  acctLogo: {
    width: 22,
    height: 22,
    borderRadius: 7,
  },
  acctDot: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctDotText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  acctName: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  acctAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 16,
    marginBottom: 4,
  },
  acctBar: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  acctMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 6,
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    paddingVertical: 12,
  },
});
