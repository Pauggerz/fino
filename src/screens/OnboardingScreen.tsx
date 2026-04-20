import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/RootNavigator';
import SplashSlide from './onboarding/SplashSlide';
import WelcomeSlide from './onboarding/WelcomeSlide';
import AccountsSlide from './onboarding/AccountsSlide';
import PaymentSlide from './onboarding/PaymentSlide';
import AskFinoSlide from './onboarding/AskFinoSlide';
import AuthSlide from './onboarding/AuthSlide';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'> & {
  onComplete: () => void;
};

const { width: W } = Dimensions.get('window');

// 0 Splash → 1 Welcome → 2 Accounts → 3 Payment → 4 AskFino → 5 Auth
const SLIDE_COUNT = 6;
const DOT_SLIDES = [0, 1, 2, 3, 4]; // nav dots shown on tour slides
const SKIP_SLIDES = [1, 2, 3, 4]; // skip + next shown on tour slides

export default function OnboardingScreen({ onComplete }: Props) {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const translations = useRef(
    Array.from({ length: SLIDE_COUNT }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    translations.forEach((t, i) => t.setValue(i === 0 ? 0 : W));
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (isTransitioning || next === current) return;
      setIsTransitioning(true);

      const direction = next > current ? 1 : -1;
      translations[next].setValue(direction * W);

      Animated.parallel([
        Animated.spring(translations[current], {
          toValue: direction * -W * 0.25,
          tension: 60,
          friction: 14,
          useNativeDriver: true,
        }),
        Animated.spring(translations[next], {
          toValue: 0,
          tension: 60,
          friction: 14,
          useNativeDriver: true,
        }),
      ]).start(() => {
        translations[current].setValue(direction * W);
        setCurrent(next);
        setIsTransitioning(false);
      });

      setCurrent(next);
    },
    [current, isTransitioning, translations]
  );

  // Auto-advance from splash
  useEffect(() => {
    if (current !== 0) return;
    const timer = setTimeout(() => goTo(1), 3200);
    return () => clearTimeout(timer);
  }, [current]);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem('hasOnboarded', 'true');
    onComplete();
  }, [onComplete]);

  const showDots = DOT_SLIDES.includes(current);
  const showSkip = SKIP_SLIDES.includes(current);
  const showNext = SKIP_SLIDES.includes(current);

  return (
    <View style={s.root}>
      {Array.from({ length: SLIDE_COUNT }, (_, i) => (
        <Animated.View
          key={i}
          style={[s.slide, { transform: [{ translateX: translations[i] }] }]}
          pointerEvents={current === i ? 'auto' : 'none'}
        >
          {i === 0 && <SplashSlide isActive={current === 0} />}
          {i === 1 && <WelcomeSlide isActive={current === 1} />}
          {i === 2 && <AccountsSlide isActive={current === 2} />}
          {i === 3 && <PaymentSlide isActive={current === 3} />}
          {i === 4 && <AskFinoSlide isActive={current === 4} />}
          {i === 5 && (
            <AuthSlide
              isActive={current === 5}
              onComplete={completeOnboarding}
            />
          )}
        </Animated.View>
      ))}

      {/* Nav overlay (dots / skip / next) */}
      {showDots && (
        <View style={s.navOverlay} pointerEvents="box-none">
          {showSkip && (
            <TouchableOpacity
              onPress={() => goTo(5)}
              style={s.skipBtn}
              activeOpacity={0.7}
            >
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
          )}

          <View style={s.dotsRow}>
            {DOT_SLIDES.map((i) => (
              <TouchableOpacity
                key={i}
                onPress={() => goTo(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <View style={[s.dot, current === i && s.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          {showNext && (
            <TouchableOpacity
              onPress={() => goTo(Math.min(current + 1, 5))}
              style={s.nextBtn}
              activeOpacity={0.8}
            >
              <Text style={s.nextText}>Next →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050d08' },
  slide: { ...StyleSheet.absoluteFillObject },
  navOverlay: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  skipBtn: { paddingVertical: 8 },
  skipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: { width: 18, backgroundColor: '#5B8C6E', borderRadius: 3 },
  nextBtn: { paddingVertical: 8 },
  nextText: { fontSize: 13, color: 'rgba(168,213,181,0.7)', fontWeight: '600' },
});
