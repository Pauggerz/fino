import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface QuizOption {
  label: string;
  /** Starter category keys this answer recommends. */
  keys: string[];
}

interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

// 'food' is recommended for everyone; the quiz only decides the rest. Keys map
// to STARTER_EXPENSE_CATEGORIES (food/transport/shopping/bills/health).
const ALWAYS_KEYS = ['food'];

const QUESTIONS: QuizQuestion[] = [
  {
    id: 'transport',
    prompt: 'How do you usually get around?',
    options: [
      { label: 'I commute or drive', keys: ['transport'] },
      { label: 'Mostly stay close to home', keys: [] },
    ],
  },
  {
    id: 'bills',
    prompt: 'Do you handle your own bills?',
    options: [
      { label: 'Yes — rent, utilities, subscriptions', keys: ['bills'] },
      { label: 'Not really', keys: [] },
    ],
  },
  {
    id: 'lifestyle',
    prompt: 'Where does your extra money usually go?',
    options: [
      { label: 'Shopping & treats', keys: ['shopping'] },
      { label: 'Health & fitness', keys: ['health'] },
      { label: 'A bit of both', keys: ['shopping', 'health'] },
    ],
  },
];

interface Props {
  isActive: boolean;
  /** Fired as answers change with the recommended starter keys (incl. 'food'). */
  onRecommend: (keys: string[]) => void;
}

export default function CategoryQuizSlide({ isActive, onRecommend }: Props) {
  // questionId → selected option index.
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const headerOp = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!isActive) return;
    headerOp.setValue(0);
    headerY.setValue(16);
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(headerOp, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(headerY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isActive]);

  const select = (questionId: string, optionIdx: number) => {
    Haptics.selectionAsync();
    const next = { ...answers, [questionId]: optionIdx };
    setAnswers(next);

    // Recommend the union of every answered option's keys, plus the universal set.
    const keys = new Set<string>(ALWAYS_KEYS);
    for (const q of QUESTIONS) {
      const idx = next[q.id];
      if (idx != null) {
        q.options[idx].keys.forEach((k) => keys.add(k));
      }
    }
    onRecommend([...keys]);
  };

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={[
            s.header,
            { opacity: headerOp, transform: [{ translateY: headerY }] },
          ]}
        >
          <Text style={s.eyebrow}>A few quick questions</Text>
          <Text style={s.title}>
            Let’s tailor your{'\n'}
            <Text style={{ color: '#A8D5B5' }}>spending categories.</Text>
          </Text>
          <Text style={s.subtitle}>
            Answer a few and we’ll suggest a starter set — you can tweak it
            next.
          </Text>
        </Animated.View>

        {QUESTIONS.map((q) => (
          <View key={q.id} style={s.question}>
            <Text style={s.prompt}>{q.prompt}</Text>
            <View style={s.options}>
              {q.options.map((opt, idx) => {
                const selected = answers[q.id] === idx;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    activeOpacity={0.85}
                    onPress={() => select(q.id, idx)}
                    style={[s.option, selected && s.optionSelected]}
                  >
                    <Text
                      style={[s.optionText, selected && s.optionTextSelected]}
                    >
                      {opt.label}
                    </Text>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#A8D5B5"
                      />
                    ) : (
                      <View style={s.radioEmpty} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e0b18' },
  scroll: { paddingHorizontal: 28, paddingTop: 80, paddingBottom: 130 },
  header: { paddingBottom: 8 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(168,213,181,0.55)',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Nunito_900Black',
    fontSize: 28,
    color: 'white',
    lineHeight: 32,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 19,
  },
  question: { marginTop: 28 },
  prompt: {
    fontSize: 16,
    color: 'white',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 12,
  },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  optionSelected: {
    backgroundColor: 'rgba(168,213,181,0.12)',
    borderColor: 'rgba(168,213,181,0.45)',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Inter_500Medium',
  },
  optionTextSelected: { color: 'white' },
  radioEmpty: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
