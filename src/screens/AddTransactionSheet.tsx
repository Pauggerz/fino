import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

const { height } = Dimensions.get('window');

type TxType = 'exp' | 'inc';
type Account = 'gcash' | 'cash' | 'bdo';
type Category = 'food' | 'transport' | 'shopping' | 'bills' | 'health';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,30,46,0.4)',
  },
  sheetPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.9,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D8D6D0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  sheetTitle: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sheetSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  typeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(30,30,46,0.08)',
    alignItems: 'center',
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  typeBtnActiveExp: {
    borderColor: 'rgba(232,133,106,0.4)',
  },
  typeBtnActiveInc: {
    borderColor: 'rgba(63,107,82,0.3)',
  },
  typeBtnText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.textSecondary,
    zIndex: 1,
  },
  amountDisplay: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  amountVal: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 36,
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  amountSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  numKey: {
    width: '31%',
    height: 52,
    backgroundColor: 'white',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(30,30,46,0.08)',
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  numKeyDark: {
    backgroundColor: colors.textPrimary,
  },
  numKeyText: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 20,
    color: colors.textPrimary,
  },
  numKeyTextDark: {
    color: 'white',
  },
  section: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  acctOpts: {
    flexDirection: 'row',
    gap: 8,
  },
  acctOpt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(30,30,46,0.08)',
    overflow: 'hidden',
  },
  acctOptSel: {
    borderColor: 'rgba(91,140,110,0.35)',
  },
  acctOptIcon: { fontSize: 16, zIndex: 1 },
  acctOptName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: colors.textSecondary,
    zIndex: 1,
  },
  acctOptLast: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: colors.textSecondary,
    marginLeft: 'auto',
    zIndex: 1,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  catPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(30,30,46,0.08)',
    backgroundColor: colors.background,
  },
  catPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  aiFieldWrap: {
    marginBottom: 24,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(30,30,46,0.08)',
  },
  orText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  aiField: {
    backgroundColor: colors.lavenderLight,
    borderWidth: 1.5,
    borderColor: colors.lavender,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiFieldIcon: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#B8B4D8',
  },
  aiFieldIconMapped: {
    backgroundColor: colors.primary,
  },
  aiFieldText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  aiFieldTextHasText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
  },
  aiConfirm: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(91,140,110,0.3)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
    alignSelf: 'flex-start',
  },
  aiConfirmDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  aiConfirmText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.primaryDark,
  },
  saveBtnWrap: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: 12,
  },
  saveBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  saveBtnText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    color: 'white',
  },
  cancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});

export default function AddTransactionSheet() {
  const navigation = useNavigation();

  const [type, setType] = useState<TxType>('exp');
  const [amount, setAmount] = useState<string>('');
  const [account, setAccount] = useState<Account>('gcash');
  const [category, setCategory] = useState<Category>('food');
  const [aiText, setAiText] = useState<string>('');

  const handleNumTap = (key: string) => {
    if (key === 'back') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (key === '.' && !amount.includes('.')) {
      setAmount((prev) => prev + key);
    } else if (key !== '.' && amount.replace('.', '').length < 7) {
      setAmount((prev) => prev + key);
    }
  };

  const handleSimulateAI = () => {
    setAiText('lunch');
    setTimeout(() => {
      setCategory('food');
    }, 400);
  };

  const displayAmount = amount ? `₱ ${amount}` : '₱ 0';
  const isSaveDisabled = !amount || amount === '0';

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={() => navigation.goBack()}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={styles.sheetPanel}>
        <View style={styles.sheetHandle} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sheetTitle}>Add transaction</Text>
          <Text style={styles.sheetSub}>Log expense or income</Text>

          <View style={styles.typeToggle}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setType('exp')}
              style={[styles.typeBtn, type === 'exp' && styles.typeBtnActiveExp]}
            >
              {type === 'exp' && (
                <LinearGradient
                  colors={['#FBF0EC', '#ffe4d4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
                />
              )}
              <Text style={[styles.typeBtnText, type === 'exp' ? { color: colors.coralDark } : {}]}>Expense ↓</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setType('inc')}
              style={[styles.typeBtn, type === 'inc' && styles.typeBtnActiveInc]}
            >
              {type === 'inc' && (
                <LinearGradient
                  colors={['#EFF8F2', '#d4eddf']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
                />
              )}
              <Text style={[styles.typeBtnText, type === 'inc' ? { color: colors.incomeGreen } : {}]}>Income ↑</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.amountDisplay}>
            <Text style={styles.amountVal}>{displayAmount}</Text>
            <Text style={styles.amountSub}>Tap a number to enter amount</Text>
          </View>

          <View style={styles.numpad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((key) => (
              <TouchableOpacity
                key={key}
                activeOpacity={0.7}
                onPress={() => handleNumTap(key)}
                style={[styles.numKey, key === 'back' && styles.numKeyDark]}
              >
                <Text style={[styles.numKeyText, key === 'back' && styles.numKeyTextDark]}>
                  {key === 'back' ? '⌫' : key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>FROM ACCOUNT</Text>
            <View style={styles.acctOpts}>
              <TouchableOpacity onPress={() => setAccount('gcash')} style={[styles.acctOpt, account === 'gcash' && styles.acctOptSel]}>
                {account === 'gcash' && <LinearGradient colors={['#EFF8F2', '#d4eddf']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />}
                <Text style={styles.acctOptIcon}>📱</Text>
                <Text style={[styles.acctOptName, account === 'gcash' && { color: colors.primary }]}>GCash</Text>
                {account === 'gcash' && <Text style={styles.acctOptLast}>last used</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setAccount('cash')} style={[styles.acctOpt, account === 'cash' && styles.acctOptSel]}>
                {account === 'cash' && <LinearGradient colors={['#EFF8F2', '#d4eddf']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />}
                <Text style={styles.acctOptIcon}>💵</Text>
                <Text style={[styles.acctOptName, account === 'cash' && { color: colors.primary }]}>Cash</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setAccount('bdo')} style={[styles.acctOpt, account === 'bdo' && styles.acctOptSel]}>
                {account === 'bdo' && <LinearGradient colors={['#EFF8F2', '#d4eddf']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />}
                <Text style={styles.acctOptIcon}>🏦</Text>
                <Text style={[styles.acctOptName, account === 'bdo' && { color: colors.primary }]}>BDO</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>
              CATEGORY
              {' '}
              <Text style={{ color: '#4B2DA3', fontSize: 10, fontWeight: '700' }}>✦ AI suggested</Text>
            </Text>
            <View style={styles.pillsRow}>
              {[
                {
                  id: 'food', icon: '🍔', name: 'Food', color: '#9B6B1A',
                },
                {
                  id: 'transport', icon: '🚌', name: 'Transport', color: '#1A5C9B',
                },
                {
                  id: 'shopping', icon: '🛍', name: 'Shopping', color: '#9B1A5C',
                },
                {
                  id: 'bills', icon: '⚡', name: 'Bills', color: '#5C1A9B',
                },
                {
                  id: 'health', icon: '❤️', name: 'Health', color: '#C0503A',
                },
              ].map((c) => {
                const isSel = category === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCategory(c.id as Category)}
                    style={[styles.catPill, isSel ? { backgroundColor: c.color, borderColor: c.color } : {}]}
                  >
                    <Text style={[styles.catPillText, isSel && { color: 'white' }]}>
                      {c.icon}
                      {' '}
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.aiFieldWrap}>
            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR DESCRIBE</Text>
              <View style={styles.orLine} />
            </View>

            <TouchableOpacity activeOpacity={0.8} onPress={handleSimulateAI} style={styles.aiField}>
              <View style={[styles.aiFieldIcon, aiText ? styles.aiFieldIconMapped : {}]} />
              <Text style={[styles.aiFieldText, aiText ? styles.aiFieldTextHasText : {}]}>
                {aiText || 'e.g. "lunch", "grab ride", "gamot"'}
              </Text>
            </TouchableOpacity>

            {!!aiText && (
              <View style={styles.aiConfirm}>
                <View style={styles.aiConfirmDot} />
                <Text style={styles.aiConfirmText}>
                  &quot;
                  {aiText}
                  &quot; → Food ✓
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isSaveDisabled}
            onPress={() => navigation.goBack()}
            style={[styles.saveBtnWrap, isSaveDisabled && { opacity: 0.4 }]}
          >
            <LinearGradient colors={['#4a7a5e', '#5B8C6E', '#6a9e7f']} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save expense</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </View>
  );
}