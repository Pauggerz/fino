import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import fmtPeso from '@/utils/format';

export type SubscriptionRow = {
  id: string;
  title: string;
  amount: number;
  dueDate: string; // ISO
};

export function SubscriptionsList({
  subscriptions,
}: {
  subscriptions: SubscriptionRow[];
}) {
  const { colors } = useTheme();
  const total = subscriptions.reduce((s, x) => s + (x.amount || 0), 0);

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
          SUBSCRIPTIONS
        </Text>
        <View
          style={[styles.pill, { backgroundColor: colors.coralLight }]}
        >
          <Text style={[styles.pillText, { color: colors.expenseRed }]}>
            {subscriptions.length} active
          </Text>
        </View>
      </View>

      {subscriptions.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No recurring bills yet — add a bill reminder and toggle "recurring" to track here.
        </Text>
      ) : (
        <>
          <View style={styles.totalRow}>
            <Text
              style={[styles.totalAmount, { color: colors.textPrimary }]}
            >
              {fmtPeso(total)}{' '}
              <Text
                style={[
                  styles.totalSlash,
                  { color: colors.textSecondary },
                ]}
              >
                / month
              </Text>
            </Text>
            <Text
              style={[styles.totalSub, { color: colors.textSecondary }]}
            >
              ≈ {fmtPeso(total * 12)} / year locked in
            </Text>
          </View>

          {subscriptions.map((s, i) => (
            <View
              key={s.id}
              style={[
                styles.row,
                { borderTopColor: colors.border },
                i === 0 && { borderTopWidth: 0 },
              ]}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: colors.coralLight },
                ]}
              >
                <Ionicons
                  name="repeat-outline"
                  size={14}
                  color={colors.coralDark}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.name, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {s.title}
                </Text>
                <Text style={[styles.when, { color: colors.textSecondary }]}>
                  Monthly · next {formatDue(s.dueDate)}
                </Text>
              </View>
              <Text style={[styles.amount, { color: colors.textPrimary }]}>
                {fmtPeso(s.amount || 0)}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
    });
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
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  totalRow: {
    marginBottom: 8,
  },
  totalAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 22,
    letterSpacing: -0.4,
  },
  totalSlash: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  totalSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  when: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 1,
  },
  amount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
  },
  empty: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    paddingVertical: 12,
    lineHeight: 17,
  },
});
