import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

interface Props {
  isActive: boolean;
  name: string;
  onChangeName: (value: string) => void;
}

const MAX_NAME_LEN = 30;

export default function NameSlide({ isActive, name, onChangeName }: Props) {
  const inputRef = useRef<TextInput>(null);

  const headerOp = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(16)).current;
  const fieldOp = useRef(new Animated.Value(0)).current;
  const fieldY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!isActive) return;
    [headerOp, fieldOp].forEach((v) => v.setValue(0));
    [headerY, fieldY].forEach((v) => v.setValue(16));

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

    Animated.sequence([
      Animated.delay(320),
      Animated.parallel([
        Animated.timing(fieldOp, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(fieldY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isActive]);

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Animated.View
        style={[
          s.header,
          { opacity: headerOp, transform: [{ translateY: headerY }] },
        ]}
      >
        <Text style={s.eyebrow}>Let’s set up Fino</Text>
        <Text style={s.title}>
          First, what should{'\n'}
          <Text style={{ color: '#A8D5B5' }}>we call you?</Text>
        </Text>
        <Text style={s.subtitle}>
          Just your name — it stays on this device. No account needed.
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          s.fieldWrap,
          { opacity: fieldOp, transform: [{ translateY: fieldY }] },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={name}
          onChangeText={onChangeName}
          maxLength={MAX_NAME_LEN}
          placeholder="Your name"
          placeholderTextColor="rgba(255,255,255,0.3)"
          style={s.input}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="givenName"
          returnKeyType="done"
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e0b18', paddingHorizontal: 28 },
  header: { paddingTop: 96 },
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
  fieldWrap: { marginTop: 36 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(168,213,181,0.28)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 18,
    color: 'white',
    fontFamily: 'Inter_600SemiBold',
  },
});
