import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

interface Props { isActive: boolean }

const { width: W, height: H } = Dimensions.get('window');

// Floating micro-specs
const SPECS = Array.from({ length: 16 }, (_, i) => ({
  x:     (i * 83 + 45) % (W - 24),
  y:     (i * 131 + 55) % (H * 0.82),
  size:  1.5 + (i % 3) * 0.7,
  dur:   3500 + (i % 5) * 1100,
  delay: i * 380,
  op:    0.18 + (i % 4) * 0.10,
}));

// ✦ sparkles at screen edges
const SPARKLES = [
  { x: W * 0.10, y: H * 0.07,  size: 11, delay: 600,  dur: 3200 },
  { x: W * 0.87, y: H * 0.12,  size: 8,  delay: 1200, dur: 2800 },
  { x: W * 0.04, y: H * 0.60,  size: 7,  delay: 900,  dur: 3600 },
  { x: W * 0.93, y: H * 0.52,  size: 9,  delay: 400,  dur: 3000 },
  { x: W * 0.72, y: H * 0.84,  size: 6,  delay: 1600, dur: 2600 },
];

export default function WelcomeSlide({ isActive }: Props) {
  const glowPulse   = useRef(new Animated.Value(0)).current;
  const specAnims   = useRef(SPECS.map(() => new Animated.Value(0))).current;
  const sparkleAnims = useRef(SPARKLES.map(() => new Animated.Value(0))).current;

  const eyebrowA = useRef(new Animated.Value(0)).current;
  const eyebrowY = useRef(new Animated.Value(14)).current;
  const titleA   = useRef(new Animated.Value(0)).current;
  const titleY   = useRef(new Animated.Value(14)).current;
  const statA    = useRef(new Animated.Value(0)).current;
  const statY    = useRef(new Animated.Value(14)).current;
  const divA     = useRef(new Animated.Value(0)).current;
  const divW     = useRef(new Animated.Value(0)).current;
  const solveA   = useRef(new Animated.Value(0)).current;
  const solveY   = useRef(new Animated.Value(14)).current;
  const descA    = useRef(new Animated.Value(0)).current;
  const descY    = useRef(new Animated.Value(14)).current;

  const bgLoops = useRef<Animated.CompositeAnimation[]>([]);

  // Always-on ambient animations
  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    glowLoop.start();

    const specLoops = specAnims.map((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: SPECS[i].dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: SPECS[i].dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      Animated.sequence([Animated.delay(SPECS[i].delay), loop]).start();
      return loop;
    });

    const sparkLoops = sparkleAnims.map((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: SPARKLES[i].dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.1, duration: SPARKLES[i].dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      Animated.sequence([Animated.delay(SPARKLES[i].delay), loop]).start();
      return loop;
    });

    bgLoops.current = [glowLoop, ...specLoops, ...sparkLoops];
    return () => bgLoops.current.forEach(a => a.stop());
  }, []);

  // Content entrance
  useEffect(() => {
    if (!isActive) return;

    [eyebrowA, titleA, statA, divA, divW, solveA, descA].forEach(v => v.setValue(0));
    [eyebrowY, titleY, statY, solveY, descY].forEach(v => v.setValue(14));

    const fade = (op: Animated.Value, y: Animated.Value | null, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(op, { toValue: 1, duration: 500, useNativeDriver: true }),
          ...(y ? [Animated.timing(y, { toValue: 0, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true })] : []),
        ]),
      ]);

    fade(eyebrowA, eyebrowY, 100).start();
    fade(titleA,   titleY,   280).start();
    fade(statA,    statY,    820).start();

    Animated.sequence([
      Animated.delay(1180),
      Animated.parallel([
        Animated.timing(divA, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(divW, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]),
    ]).start();

    fade(solveA, solveY, 1420).start();
    fade(descA,  descY,  1700).start();
  }, [isActive]);

  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const glowOp    = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.75] });

  return (
    <View style={s.root}>

      {/* ── Background ── */}
      <LinearGradient
        colors={['#030b06', '#091c0e', '#1a5c35', '#0a1f10', '#2d8a50', '#0a1a0d', '#030b06']}
        start={{ x: 0.25, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Radial glow approximations */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={[s.radial, {
          width: W * 1.16, height: W * 1.16, borderRadius: W * 0.58,
          left: W * 0.22 - W * 0.58, top: H * 0.20 - W * 0.58,
          backgroundColor: 'rgba(25,100,52,0.40)',
        }]} />
        <View style={[s.radial, {
          width: W * 1.04, height: W * 1.04, borderRadius: W * 0.52,
          left: W * 0.82 - W * 0.52, top: H * 0.76 - W * 0.52,
          backgroundColor: 'rgba(55,145,85,0.30)',
        }]} />
        <View style={[s.radial, {
          width: W * 0.70, height: W * 0.70, borderRadius: W * 0.35,
          left: W * 0.52 - W * 0.35, top: H * 0.46 - W * 0.35,
          backgroundColor: 'rgba(168,213,181,0.08)',
        }]} />
        <View style={[s.radial, {
          width: W * 0.84, height: W * 0.84, borderRadius: W * 0.42,
          left: W * 0.10 - W * 0.42, top: H * 0.80 - W * 0.42,
          backgroundColor: 'rgba(30,90,50,0.22)',
        }]} />
        <View style={[s.radial, {
          width: W * 0.64, height: W * 0.64, borderRadius: W * 0.32,
          left: W * 0.90 - W * 0.32, top: H * 0.12 - W * 0.32,
          backgroundColor: 'rgba(232,133,106,0.05)',
        }]} />
      </View>

      {/* Animated center glow */}
      <Animated.View
        style={[s.centerGlow, { opacity: glowOp, transform: [{ scale: glowScale }] }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgba(50,150,85,0.16)', 'rgba(25,80,45,0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Floating micro-specs */}
      {SPECS.map((sp, i) => (
        <Animated.View
          key={`s${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: sp.x, top: sp.y,
            width: sp.size, height: sp.size, borderRadius: sp.size / 2,
            backgroundColor: '#A8D5B5',
            opacity: specAnims[i].interpolate({ inputRange: [0,1], outputRange: [sp.op * 0.4, sp.op] }),
            transform: [{ translateY: specAnims[i].interpolate({ inputRange:[0,1], outputRange:[0,-10] }) }],
          }}
        />
      ))}

      {/* Sparkle ✦ */}
      {SPARKLES.map((sp, i) => (
        <Animated.Text
          key={`star${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute', left: sp.x, top: sp.y,
            fontSize: sp.size, color: '#A8D5B5',
            opacity: sparkleAnims[i],
            transform: [{ scale: sparkleAnims[i].interpolate({ inputRange:[0,1], outputRange:[0.7,1.3] }) }],
          }}
        >✦</Animated.Text>
      ))}

      {/* Content */}
      <View style={s.content}>
        <Animated.View style={{ opacity: eyebrowA, transform: [{ translateY: eyebrowY }] }}>
          <Text style={s.eyebrow}>
            Introducing <Text style={{ color: '#A8D5B5', fontFamily: 'Nunito_900Black' }}>Fino.</Text>
          </Text>
        </Animated.View>

        <Animated.Text style={[s.title, { opacity: titleA, transform: [{ translateY: titleY }] }]}>
          {"You don't know\nwhere your\n"}
          <Text style={s.titleAccent}>money went.</Text>
        </Animated.Text>

        {/* Glassmorphism stat box */}
        <Animated.View style={[s.statOuter, { opacity: statA, transform: [{ translateY: statY }] }]}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={['rgba(35,85,52,0.40)', 'rgba(12,32,18,0.22)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={s.statInner}>
            <Text style={s.statStrong}>1 in 3 pesos</Text>
            <Text style={s.statDesc}>goes untracked every month by Filipinos.</Text>
          </View>
        </Animated.View>

        {/* Divider */}
        <Animated.View style={[s.dividerWrap, { opacity: divA }]}>
          <Animated.View style={[s.divider, {
            width: divW.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }),
          }]} />
        </Animated.View>

        <Animated.Text style={[s.solution, { opacity: solveA, transform: [{ translateY: solveY }] }]}>
          Fino changes that.
        </Animated.Text>

        <Animated.Text style={[s.desc, { opacity: descA, transform: [{ translateY: descY }] }]}>
          {'AI-powered budget tracking built for how '}
          <Text style={s.em}>Filipinos</Text>
          {' actually spend — in Filipino, English, or '}
          <Text style={s.em}>Taglish.</Text>
        </Animated.Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#030b06' },
  radial: { position: 'absolute' },
  centerGlow: {
    position: 'absolute',
    width: W * 1.2, height: W * 1.2, borderRadius: W * 0.6,
    alignSelf: 'center', top: H * 0.12,
  },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, zIndex: 1,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '700', color: 'rgba(168,213,181,0.5)',
    letterSpacing: 3.2, textTransform: 'uppercase', marginBottom: 24, textAlign: 'center',
  },
  title: {
    fontFamily: 'Nunito_900Black', fontSize: 44, color: 'white',
    textAlign: 'center', lineHeight: 44, letterSpacing: -2.5, marginBottom: 20,
  },
  titleAccent: { color: '#A8D5B5' },
  statOuter: {
    marginBottom: 20, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(168,213,181,0.20)',
    width: '100%',
  },
  statInner: { paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
  statStrong: {
    fontFamily: 'Nunito_900Black', fontSize: 18, color: '#E8856A',
    marginBottom: 4, textAlign: 'center',
  },
  statDesc: {
    fontSize: 13, lineHeight: 22, color: 'rgba(255,255,255,0.65)', textAlign: 'center',
  },
  dividerWrap: { alignSelf: 'center', marginVertical: 8, marginBottom: 16, overflow: 'hidden' },
  divider: { height: 2, borderRadius: 1, backgroundColor: '#5B8C6E', alignSelf: 'center' },
  solution: {
    fontSize: 20, fontFamily: 'Nunito_800ExtraBold', color: '#A8D5B5',
    letterSpacing: -0.4, marginBottom: 14, lineHeight: 24,
  },
  desc: {
    fontSize: 14, lineHeight: 25.2, color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.14, textAlign: 'center',
  },
  em: { color: 'rgba(168,213,181,0.85)' },
});
