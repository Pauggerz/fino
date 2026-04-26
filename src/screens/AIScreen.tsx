import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FinoIntelIcon } from '../components/icons/FinoIntelIcon';

export default function AIScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <FinoIntelIcon size={36} color="#7A4AB8" filled />
      </View>
      <View style={styles.labelRow}>
        <Text style={styles.text}>Fino Intelligence</Text>
        <View style={styles.betaPill}>
          <Text style={styles.betaText}>BETA</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#EDE3F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 18,
    color: '#1E1E2E',
    letterSpacing: -0.4,
  },
  betaPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: '#D7C4F1',
  },
  betaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.6,
    color: '#5A2C9C',
  },
});
