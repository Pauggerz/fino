import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import fmtPeso from '@/utils/format';

export type MerchantRow = {
  key: string;
  name: string;
  count: number;
  category: string | null;
  amount: number;
  color: string;
};

export type TopTxRow = {
  key: string;
  name: string;
  category: string | null;
  amount: number;
  date: string;
  color: string;
};

type Mode = 'merchants' | 'transactions';

export function TopSpendingCard({
  merchants,
  topTransactions,
  totalExpense,
}: {
  merchants: MerchantRow[];
  topTransactions: TopTxRow[];
  totalExpense: number;
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('merchants');

  const rows = useMemo(() => {
    if (mode === 'merchants') return merchants.slice(0, 5);
    return topTransactions.slice(0, 5);
  }, [mode, merchants, topTransactions]);

  const denom = totalExpense > 0 ? totalExpense : 1;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.white, borderColor: colors.cardBorderTransparent },
      ]}
    >
      <View style={styles.headRow}>
        <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
          TOP SPENDING
        </Text>
        <View
          style={[styles.toggle, { backgroundColor: colors.surfaceSubdued }]}
        >
          {(['merchants', 'transactions'] as const).map((opt) => {
            const active = mode === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setMode(opt)}
                style={[
                  styles.toggleOpt,
                  active && {
                    backgroundColor: colors.white,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.toggleOptText,
                    {
                      color: active
                        ? colors.textPrimary
                        : colors.textSecondary,
                    },
                  ]}
                >
                  {opt === 'merchants' ? 'Merchants' : 'Txns'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {rows.length === 0 ? (
        <Text
          style={[styles.emptyText, { color: colors.textSecondary }]}
        >
          {mode === 'merchants'
            ? 'No merchant data yet — add some transactions to see your top merchants.'
            : 'No transactions this month.'}
        </Text>
      ) : (
        rows.map((row, i) => {
          const sharePct = (row.amount / denom) * 100;
          const subline =
            mode === 'merchants'
              ? `${(row as MerchantRow).count} txns${row.category ? ` · ${cap(row.category)}` : ''}`
              : `${formatShortDate((row as TopTxRow).date)}${row.category ? ` · ${cap(row.category)}` : ''}`;
          return (
            <View
              key={row.key}
              style={[
                styles.row,
                i < rows.length - 1 && { borderBottomColor: colors.border },
                i < rows.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={[styles.rank, { color: colors.textSecondary }]}>
                {i + 1}
              </Text>
              <View
                style={[styles.avatar, { backgroundColor: row.color }]}
              >
                <Text style={styles.avatarText}>
                  {avatarLetters(row.name)}
                </Text>
              </View>
              <View style={styles.meta}>
                <Text
                  style={[styles.name, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {row.name || 'Unknown'}
                </Text>
                <Text
                  style={[styles.subline, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {subline}
                </Text>
                <View
                  style={[
                    styles.shareBar,
                    { backgroundColor: colors.surfaceSubdued },
                  ]}
                >
                  <View
                    style={{
                      width: `${Math.max(4, Math.min(100, sharePct))}%`,
                      height: '100%',
                      backgroundColor: row.color,
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>
              <Text style={[styles.amount, { color: colors.textPrimary }]}>
                {fmtPeso(row.amount)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

function avatarLetters(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
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
  toggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
  },
  toggleOpt: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  toggleOptText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
  },
  rank: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 12,
    width: 16,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  meta: { flex: 1, gap: 2 },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  subline: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  shareBar: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 4,
  },
  amount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
    textAlign: 'right',
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    paddingVertical: 12,
  },
});
