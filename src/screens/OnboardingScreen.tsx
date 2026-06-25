import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../contexts/AuthContext';
import { seedOnboardingDefaults } from '../services/localMutations';
import { STARTER_EXPENSE_CATEGORIES } from '../constants/categoryMappings';

import SplashSlide from './onboarding/SplashSlide';
import WelcomeSlide from './onboarding/WelcomeSlide';
import AccountsSlide from './onboarding/AccountsSlide';
import PaymentSlide from './onboarding/PaymentSlide';
import AskFinoSlide from './onboarding/AskFinoSlide';
import NameSlide from './onboarding/NameSlide';
import CategoryQuizSlide from './onboarding/CategoryQuizSlide';
import CategoriesSlide from './onboarding/CategoriesSlide';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'> & {
  onComplete: () => void;
};

const { width: W } = Dimensions.get('window');

// 0 Splash → 1 Welcome → 2 Accounts → 3 Payment → 4 AskFino  (intro / tour)
// → 5 Name → 6 CategoryQuiz → 7 Categories                  (offline setup)
const SLIDE_COUNT = 8;
const TOUR_SLIDES = [0, 1, 2, 3, 4]; // dots + skip + next live here
const SETUP_START = 5; // first setup slide (Name)
const LAST_INDEX = 7; // Categories — carries the finish CTA

export default function OnboardingScreen({ onComplete }: Props) {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [completing, setCompleting] = useState(false);

  const { currentUserId, setLocalName } = useAuth();

  // ─── Setup state ───────────────────────────────────────────────────────
  const [name, setName] = useState('');
  // Default all 5 starters ON so skipping the quiz still yields a friendly
  // preset; the quiz narrows this via onRecommend.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(STARTER_EXPENSE_CATEGORIES.map((s) => s.key))
  );
  const [customs, setCustoms] = useState<string[]>([]);

  const toggleStarter = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const addCustom = useCallback((name: string) => {
    setCustoms((prev) => [...prev, name]);
  }, []);

  const removeCustom = useCallback((name: string) => {
    setCustoms((prev) => prev.filter((n) => n !== name));
  }, []);

  const applyRecommendation = useCallback((keys: string[]) => {
    setSelectedKeys(new Set(keys));
  }, []);

  // ─── Slide transitions ────────────────────────────────────────────────
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

  // ─── Completion ───────────────────────────────────────────────────────
  // Offline-first: no account is required. Persist the name locally and seed
  // the default Cash account + "Others" + chosen categories under the
  // device-local identity, then enter the app.
  const completeOnboarding = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      if (name.trim()) await setLocalName(name);
      await seedOnboardingDefaults({
        userId: currentUserId,
        selectedStarterKeys: [...selectedKeys],
        customCategoryNames: customs,
      });
    } catch (err) {
      // Soft-fail — proceed to the app anyway. "Others" can be re-created and
      // categories added manually in CategoryScreen.
      if (__DEV__)
        // eslint-disable-next-line no-console
        console.warn('[Onboarding] local seed failed:', err);
    } finally {
      await AsyncStorage.setItem('hasOnboarded', 'true');
      onComplete();
    }
  }, [
    completing,
    name,
    setLocalName,
    currentUserId,
    selectedKeys,
    customs,
    onComplete,
  ]);

  const isTour = TOUR_SLIDES.includes(current);
  const isLast = current === LAST_INDEX;

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
            <NameSlide
              isActive={current === 5}
              name={name}
              onChangeName={setName}
            />
          )}
          {i === 6 && (
            <CategoryQuizSlide
              isActive={current === 6}
              onRecommend={applyRecommendation}
            />
          )}
          {i === 7 && (
            <CategoriesSlide
              isActive={current === 7}
              selectedKeys={selectedKeys}
              customs={customs}
              onToggleStarter={toggleStarter}
              onAddCustom={addCustom}
              onRemoveCustom={removeCustom}
            />
          )}
        </Animated.View>
      ))}

      {/* ── Tour nav (dots / skip / next) ── */}
      {isTour && (
        <View style={s.navOverlay} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => goTo(SETUP_START)}
            style={s.skipBtn}
            activeOpacity={0.7}
          >
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>

          <View style={s.dotsRow}>
            {TOUR_SLIDES.map((i) => (
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

          <TouchableOpacity
            onPress={() => goTo(Math.min(current + 1, SETUP_START))}
            style={s.nextBtn}
            activeOpacity={0.8}
          >
            <Text style={s.nextText}>Next →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Setup nav (back / next / start) ── */}
      {!isTour && (
        <View style={s.setupNav} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => goTo(current - 1)}
            style={s.backBtn}
            activeOpacity={0.7}
            disabled={completing}
          >
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => (isLast ? completeOnboarding() : goTo(current + 1))}
            style={[s.primaryBtn, completing && { opacity: 0.7 }]}
            activeOpacity={0.85}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator color="#0e0b18" size="small" />
            ) : (
              <Text style={s.primaryBtnText}>
                {isLast ? 'Start using Fino' : 'Next →'}
              </Text>
            )}
          </TouchableOpacity>
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

  // ── Setup nav ──
  setupNav: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  backBtn: { paddingVertical: 12, paddingRight: 12 },
  backText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Inter_500Medium',
  },
  primaryBtn: {
    backgroundColor: '#A8D5B5',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 150,
  },
  primaryBtnText: {
    fontSize: 15,
    color: '#0e0b18',
    fontFamily: 'Nunito_800ExtraBold',
  },
});
