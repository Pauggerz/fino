import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  isActive: boolean;
  onDone: () => void;
}

const { width: W, height: H } = Dimensions.get('window');

// 42 confetti particles
const CONFETTI_COUNT = 42;
const CONFETTI_COLORS = ['#A8D5B5', '#5B8C6E', '#7ab896', '#E8856A', '#f5d78e', '#b084f5', '#5dc9f5', '#f56a8c'];

const CONFETTI = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  id: i,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  angle: (i / CONFETTI_COUNT) * Math.PI * 2,
  radius: 80 + Math.random() * 120,
  size: 5 + Math.random() * 6,
  isRect: i % 3 !== 0,
  delay: Math.floor(i / 6) * 80,
}));

export default function WelcomeAboardSlide({ isActive, onDone }: Props) {
  const blob1Scale = useRef(new Animated.Value(1)).current;
  const blob2Scale = useRef(new Animated.Value(1)).current;

  const logoOp     = useRef(new Animated.Value(0)).current;
  const logoScale  = useRef(new Animated.Value(0.5)).current;
  const glowOp     = useRef(new Animated.Value(0)).current;
  const glowScale  = useRef(new Animated.Value(0.5)).current;

  const confettiAnims = useRef(
    CONFETTI.map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      op: new Animated.Value(0),
      rot: new Animated.Value(0),
    }))
  ).current;

  const headlineOp  = useRef(new Animated.Value(0)).current;
  const headlineY   = useRef(new Animated.Value(20)).current;
  const subtitleOp  = useRef(new Animated.Value(0)).current;
  const subtitleY   = useRef(new Animated.Value(14)).current;

  const pill1Op     = useRef(new Animated.Value(0)).current;
  const pill1Y      = useRef(new Animated.Value(10)).current;
  const pill2Op     = useRef(new Animated.Value(0)).current;
  const pill2Y      = useRef(new Animated.Value(10)).current;
  const pill3Op     = useRef(new Animated.Value(0)).current;
  const pill3Y      = useRef(new Animated.Value(10)).current;

  const ctaOp       = useRef(new Animated.Value(0)).current;
  const ctaY        = useRef(new Animated.Value(14)).current;

  const blobLoops = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    const makeLoop = (anim: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1.12, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.9,  duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
    blobLoops.current = [makeLoop(blob1Scale, 7000), makeLoop(blob2Scale, 9000)];
    blobLoops.current.forEach((l, i) => Animated.sequence([Animated.delay(i * 2000), l]).start());
    return () => blobLoops.current.forEach(a => a.stop());
  }, []);

  useEffect(() => {
    if (!isActive) return;

    // Reset
    [logoOp, logoScale, glowOp, glowScale, headlineOp, headlineY, subtitleOp, subtitleY,
     pill1Op, pill1Y, pill2Op, pill2Y, pill3Op, pill3Y, ctaOp, ctaY].forEach(v => {
      if (v === logoScale) v.setValue(0.5);
      else if (v === glowScale) v.setValue(0.5);
      else if ([headlineY, subtitleY, pill1Y, pill2Y, pill3Y, ctaY].includes(v)) v.setValue(v === headlineY ? 20 : 14);
      else v.setValue(0);
    });
    confettiAnims.forEach(c => {
      c.x.setValue(0); c.y.setValue(0); c.op.setValue(0); c.rot.setValue(0);
    });

    // Glow burst + logo at 100ms
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(glowOp,    { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(glowScale, { toValue: 1, tension: 30, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOp,    { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
      ]),
    ]).start();

    // Confetti burst at 300ms
    CONFETTI.forEach((conf, i) => {
      const { x, y, op, rot } = confettiAnims[i];
      const targetX = Math.cos(conf.angle) * conf.radius;
      const targetY = Math.sin(conf.angle) * conf.radius - 40;

      Animated.sequence([
        Animated.delay(300 + conf.delay),
        Animated.parallel([
          Animated.spring(x, { toValue: targetX, tension: 50, friction: 6, useNativeDriver: true }),
          Animated.spring(y, { toValue: targetY, tension: 50, friction: 6, useNativeDriver: true }),
          Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(rot, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]).start(() => {
        // Fade out after burst
        Animated.sequence([
          Animated.delay(600),
          Animated.timing(op, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]).start();
      });
    });

    // Headline 800ms
    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(headlineOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(headlineY,  { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Subtitle 1100ms
    Animated.sequence([
      Animated.delay(1100),
      Animated.parallel([
        Animated.timing(subtitleOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(subtitleY,  { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Pills staggered: 1500, 1700, 1900ms
    [[pill1Op, pill1Y], [pill2Op, pill2Y], [pill3Op, pill3Y]].forEach(([op, yV], i) => {
      Animated.sequence([
        Animated.delay(1500 + i * 200),
        Animated.parallel([
          Animated.timing(op as Animated.Value, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(yV as Animated.Value, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]).start();
    });

    // CTA at 2200ms
    Animated.sequence([
      Animated.delay(2200),
      Animated.parallel([
        Animated.timing(ctaOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(ctaY,  { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, [isActive]);

  return (
    <View style={s.root}>
      {/* Blobs */}
      <Animated.View style={[s.blob1, { transform: [{ scale: blob1Scale }] }]}>
        <LinearGradient colors={['rgba(91,140,110,0.5)', 'transparent']} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <Animated.View style={[s.blob2, { transform: [{ scale: blob2Scale }] }]}>
        <LinearGradient colors={['rgba(30,80,55,0.7)', 'transparent']} style={StyleSheet.absoluteFillObject} />
      </Animated.View>

      {/* Logo + confetti area */}
      <View style={s.heroArea}>
        {/* Glow burst */}
        <Animated.View style={[s.glow, { opacity: glowOp, transform: [{ scale: glowScale }] }]} />

        {/* Confetti */}
        {CONFETTI.map((conf, i) => {
          const rotDeg = confettiAnims[i].rot.interpolate({
            inputRange: [0, 1], outputRange: ['0deg', `${conf.isRect ? 360 : 180}deg`],
          });
          return (
            <Animated.View
              key={conf.id}
              style={[
                conf.isRect ? s.confettiRect : s.confettiDot,
                {
                  width: conf.size,
                  height: conf.isRect ? conf.size * 0.5 : conf.size,
                  borderRadius: conf.isRect ? 1 : conf.size / 2,
                  backgroundColor: conf.color,
                  opacity: confettiAnims[i].op,
                  transform: [
                    { translateX: confettiAnims[i].x },
                    { translateY: confettiAnims[i].y },
                    { rotateZ: rotDeg },
                  ],
                },
              ]}
            />
          );
        })}

        {/* Logo */}
        <Animated.View style={{ opacity: logoOp, transform: [{ scale: logoScale }], alignItems: 'center' }}>
          <LinearGradient
            colors={['#3a6b50', '#5B8C6E', '#7ab896']}
            start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.logoBox}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.2)', 'transparent']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={s.logoRing} />
            <Text style={s.logoF}>f</Text>
          </LinearGradient>
        </Animated.View>
      </View>

      {/* Text content */}
      <View style={s.textArea}>
        <Animated.Text style={[s.headline, { opacity: headlineOp, transform: [{ translateY: headlineY }] }]}>
          {"You're all set. ✦"}
        </Animated.Text>
        <Animated.Text style={[s.subtitle, { opacity: subtitleOp, transform: [{ translateY: subtitleY }] }]}>
          Welcome to Fino.
        </Animated.Text>

        {/* Feature pills */}
        <View style={s.pillsGrid}>
          {[
            { icon: '📊', text: 'Smart Budgets' },
            { icon: '🔔', text: 'Spend Alerts' },
            { icon: '🤖', text: 'AI Insights' },
          ].map((pill, i) => {
            const ops = [pill1Op, pill2Op, pill3Op];
            const ys  = [pill1Y,  pill2Y,  pill3Y];
            return (
              <Animated.View
                key={i}
                style={[s.pill, { opacity: ops[i], transform: [{ translateY: ys[i] }] }]}
              >
                <Text style={s.pillIcon}>{pill.icon}</Text>
                <Text style={s.pillText}>{pill.text}</Text>
              </Animated.View>
            );
          })}
        </View>

        {/* CTA */}
        <Animated.View style={{ opacity: ctaOp, transform: [{ translateY: ctaY }], width: '100%' }}>
          <TouchableOpacity onPress={onDone} activeOpacity={0.85}>
            <LinearGradient
              colors={['#5B8C6E', '#3a6b50']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.ctaBtn}
            >
              <Text style={s.ctaBtnText}>View my Dashboard →</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#050d08',
    alignItems: 'center', overflow: 'hidden',
  },
  blob1: {
    position: 'absolute', width: 380, height: 380, borderRadius: 190,
    top: -100, left: -80, overflow: 'hidden',
  },
  blob2: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    bottom: -60, right: -60, overflow: 'hidden',
  },

  heroArea: {
    height: H * 0.38, alignItems: 'center', justifyContent: 'center', width: '100%',
  },
  glow: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(91,140,110,0.3)',
  },
  confettiRect: { position: 'absolute' },
  confettiDot:  { position: 'absolute' },
  logoBox: {
    width: 100, height: 100, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5B8C6E', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 36, elevation: 24,
  },
  logoRing: {
    ...StyleSheet.absoluteFillObject, margin: 6,
    borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  logoF: {
    fontFamily: 'Nunito_900Black', fontSize: 56, color: 'white', lineHeight: 66,
  },

  textArea: {
    flex: 1, paddingHorizontal: 28, alignItems: 'center', gap: 8, width: '100%',
  },
  headline: {
    fontFamily: 'Nunito_900Black', fontSize: 28, color: 'white',
    letterSpacing: -0.8, textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: '#A8D5B5',
    letterSpacing: -0.4, textAlign: 'center', marginBottom: 8,
  },
  pillsGrid: {
    flexDirection: 'row', gap: 10, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(168,213,181,0.1)',
    borderWidth: 1, borderColor: 'rgba(168,213,181,0.2)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  pillIcon: { fontSize: 14 },
  pillText: { fontSize: 12, fontWeight: '600', color: 'rgba(168,213,181,0.8)' },
  ctaBtn: {
    borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5B8C6E', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  ctaBtnText: {
    fontFamily: 'Nunito_700Bold', fontSize: 16, color: 'white', letterSpacing: 0.2,
  },
});
