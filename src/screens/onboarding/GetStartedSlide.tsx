import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  isActive: boolean;
  onCreateAccount: () => void;
  onLogin: () => void;
}

export default function GetStartedSlide({
  isActive,
  onCreateAccount,
  onLogin,
}: Props) {
  const [displayBalance, setDisplayBalance] = useState('₱0');

  const blob1Scale = useRef(new Animated.Value(1)).current;
  const blob2Scale = useRef(new Animated.Value(1)).current;
  const blob3Scale = useRef(new Animated.Value(1)).current;

  const logoOp = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const contentOp = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(20)).current;
  const ctaOp = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(20)).current;

  const blobLoops = useRef<Animated.CompositeAnimation[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Blob animations always running (ambient)
    const makeLoop = (
      anim: Animated.Value,
      dur: number,
      min: number,
      max: number
    ) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: max,
            duration: dur,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: min,
            duration: dur,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

    blobLoops.current = [
      makeLoop(blob1Scale, 7000, 0.9, 1.1),
      makeLoop(blob2Scale, 9000, 0.85, 1.15),
      makeLoop(blob3Scale, 6000, 0.95, 1.05),
    ];

    blobLoops.current.forEach((loop, i) => {
      Animated.sequence([Animated.delay(i * 1500), loop]).start();
    });

    return () => blobLoops.current.forEach((a) => a.stop());
  }, []);

  useEffect(() => {
    if (!isActive) {
      timers.current.forEach(clearTimeout);
      return () => {};
    }

    // Reset
    setDisplayBalance('₱0');
    logoOp.setValue(0);
    logoScale.setValue(0.7);
    contentOp.setValue(0);
    contentY.setValue(20);
    ctaOp.setValue(0);
    ctaY.setValue(20);
    timers.current = [];

    // Logo entrance 200ms
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(logoOp, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Content entrance 600ms
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(contentOp, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(contentY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Counter animation: ₱0 → ₱46,700 over 1800ms starting at 800ms
    const START = 800;
    const DURATION = 1800;
    const TARGET = 46700;
    const STEPS = 60;
    const STEP_INTERVAL = DURATION / STEPS;

    const t1 = setTimeout(() => {
      let step = 0;
      const tick = () => {
        step += 1;
        const progress = step / STEPS;
        // Ease-out cubic
        const eased = 1 - (1 - progress) ** 3;
        const val = Math.round(eased * TARGET);
        setDisplayBalance(`₱${val.toLocaleString()}`);
        if (step < STEPS) {
          timers.current.push(setTimeout(tick, STEP_INTERVAL));
        }
      };
      timers.current.push(setTimeout(tick, STEP_INTERVAL));
    }, START);
    timers.current.push(t1);

    // CTA buttons at 1800ms
    Animated.sequence([
      Animated.delay(1800),
      Animated.parallel([
        Animated.timing(ctaOp, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(ctaY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    return () => timers.current.forEach(clearTimeout);
  }, [isActive]);

  return (
    <View style={s.root}>
      {/* Background blobs */}
      <Animated.View style={[s.blob1, { transform: [{ scale: blob1Scale }] }]}>
        <LinearGradient
          colors={['rgba(91,140,110,0.4)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      <Animated.View style={[s.blob2, { transform: [{ scale: blob2Scale }] }]}>
        <LinearGradient
          colors={['rgba(30,80,55,0.6)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      <Animated.View style={[s.blob3, { transform: [{ scale: blob3Scale }] }]}>
        <LinearGradient
          colors={['rgba(168,213,181,0.15)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Logo */}
      <Animated.View
        style={[
          s.logoWrap,
          { opacity: logoOp, transform: [{ scale: logoScale }] },
        ]}
      >
        <LinearGradient
          colors={['#3a6b50', '#5B8C6E', '#7ab896']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.logoBox}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.2)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={s.logoF}>f</Text>
        </LinearGradient>
        <Text style={s.logoName}>fino</Text>
      </Animated.View>

      {/* Balance counter */}
      <Animated.View
        style={[
          s.counterWrap,
          { opacity: contentOp, transform: [{ translateY: contentY }] },
        ]}
      >
        <Text style={s.balanceLabel}>YOUR TOTAL BALANCE</Text>
        <Text style={s.balanceValue}>{displayBalance}</Text>
        <Text style={s.balanceSub}>across all your linked accounts</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View
        style={[
          s.taglineWrap,
          { opacity: contentOp, transform: [{ translateY: contentY }] },
        ]}
      >
        <Text style={s.tagline}>Track. Budget. Grow.</Text>
        <Text style={s.taglineSub}>
          {
            'Join thousands of Filipinos taking control\nof their finances with Fino.'
          }
        </Text>
      </Animated.View>

      {/* CTAs */}
      <Animated.View
        style={[
          s.ctaWrap,
          { opacity: ctaOp, transform: [{ translateY: ctaY }] },
        ]}
      >
        <TouchableOpacity onPress={onCreateAccount} activeOpacity={0.85}>
          <LinearGradient
            colors={['#5B8C6E', '#3a6b50']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>Create an Account</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLogin}
          activeOpacity={0.7}
          style={s.secondaryBtn}
        >
          <Text style={s.secondaryBtnText}>I already have an account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050d08',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  blob1: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -100,
    left: -80,
    overflow: 'hidden',
  },
  blob2: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: 60,
    right: -60,
    overflow: 'hidden',
  },
  blob3: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: '40%',
    left: '20%',
    overflow: 'hidden',
  },

  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B8C6E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
    marginBottom: 12,
  },
  logoF: {
    fontFamily: 'Nunito_900Black',
    fontSize: 50,
    color: 'white',
    lineHeight: 58,
  },
  logoName: {
    fontFamily: 'Nunito_900Black',
    fontSize: 32,
    color: 'white',
    letterSpacing: -1.5,
  },

  counterWrap: { alignItems: 'center', marginBottom: 24 },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(168,213,181,0.4)',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  balanceValue: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 44,
    color: 'white',
    letterSpacing: -1,
    lineHeight: 50,
  },
  balanceSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 6,
    textAlign: 'center',
  },

  taglineWrap: { alignItems: 'center', marginBottom: 36 },
  tagline: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 22,
    color: '#A8D5B5',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  taglineSub: {
    fontSize: 13,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },

  ctaWrap: { width: '100%', gap: 12 },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B8C6E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtnText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    color: 'white',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    color: 'rgba(168,213,181,0.6)',
    fontWeight: '500',
  },
});
