import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props { isActive: boolean }

const RING_SIZES = [160, 260, 360, 480, 600];
const LOGO_SIZE  = 110;

// 8 particles that burst from the LOGO CENTER outward
const BURST = Array.from({ length: 8 }, (_, i) => {
  const angle  = (i / 8) * Math.PI * 2;
  const radius = 68 + (i % 3) * 20;
  return {
    tx:   Math.cos(angle) * radius,
    ty:   Math.sin(angle) * radius,
    size: i % 2 === 0 ? 5 : 3.5,
  };
});

export default function SplashSlide({ isActive }: Props) {
  const logoScale    = useRef(new Animated.Value(0.5)).current;
  const logoRot      = useRef(new Animated.Value(-12)).current;
  const nameOpacity  = useRef(new Animated.Value(0)).current;
  const nameY        = useRef(new Animated.Value(14)).current;
  const tagOpacity   = useRef(new Animated.Value(0)).current;
  const loaderOp     = useRef(new Animated.Value(0)).current;
  const loaderW      = useRef(new Animated.Value(0)).current;

  const rings    = useRef(RING_SIZES.map(() => new Animated.Value(0))).current;
  const loopRefs = useRef<Animated.CompositeAnimation[]>([]);

  // Per-particle burst values (start at 0, spring to tx/ty, then drift+fade out)
  const partX  = useRef(BURST.map(() => new Animated.Value(0))).current;
  const partY  = useRef(BURST.map(() => new Animated.Value(0))).current;
  const partOp = useRef(BURST.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!isActive) {
      loopRefs.current.forEach(a => a.stop());
      return;
    }

    // Reset
    logoScale.setValue(0.5); logoRot.setValue(-12);
    nameOpacity.setValue(0); nameY.setValue(14);
    tagOpacity.setValue(0);  loaderOp.setValue(0); loaderW.setValue(0);
    rings.forEach(r => r.setValue(0));
    partX.forEach(v => v.setValue(0));
    partY.forEach(v => v.setValue(0));
    partOp.forEach(v => v.setValue(0));

    // Ring pulse loops
    loopRefs.current = rings.map((ring, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(ring, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(ring, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      Animated.sequence([Animated.delay(i * 500), loop]).start();
      return loop;
    });

    // Logo spring
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
        Animated.timing(logoRot, { toValue: 0, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Particle BURST at 600ms
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel(
        BURST.map((cfg, i) =>
          Animated.parallel([
            Animated.spring(partX[i], { toValue: cfg.tx, tension: 42, friction: 6, useNativeDriver: true }),
            Animated.spring(partY[i], { toValue: cfg.ty, tension: 42, friction: 6, useNativeDriver: true }),
            Animated.timing(partOp[i], { toValue: 1, duration: 180, useNativeDriver: true }),
          ])
        )
      ),
    ]).start();

    // Particle DISINTEGRATE at 1400ms — drift further out + fade
    Animated.sequence([
      Animated.delay(1400),
      Animated.parallel(
        BURST.map((cfg, i) =>
          Animated.sequence([
            Animated.delay(i * 55),
            Animated.parallel([
              Animated.timing(partOp[i], { toValue: 0, duration: 550, useNativeDriver: true }),
              Animated.timing(partY[i], {
                toValue: cfg.ty - 18,
                duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true,
              }),
              Animated.timing(partX[i], {
                toValue: cfg.tx * 1.25,
                duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true,
              }),
            ]),
          ])
        )
      ),
    ]).start();

    // Name reveal at 900ms
    Animated.sequence([
      Animated.delay(900),
      Animated.parallel([
        Animated.timing(nameOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(nameY, { toValue: 0, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Tagline at 1200ms
    Animated.sequence([
      Animated.delay(1200),
      Animated.timing(tagOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    // Loader at 1500ms
    Animated.sequence([
      Animated.delay(1500),
      Animated.timing(loaderOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(1600),
      Animated.timing(loaderW, {
        toValue: 1, duration: 1800, useNativeDriver: false,
        easing: Easing.inOut(Easing.ease),
      }),
    ]).start();

    return () => loopRefs.current.forEach(a => a.stop());
  }, [isActive]);

  const logoRotDeg = logoRot.interpolate({ inputRange: [-12, 0], outputRange: ['-12deg', '0deg'] });

  return (
    <View style={s.root}>
      {/* Rings — screen-centered via absolute fill */}
      {RING_SIZES.map((size, i) => (
        <Animated.View
          key={i}
          style={[
            s.ring,
            { width: size, height: size, borderRadius: size / 2 },
            {
              opacity: rings[i].interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.0] }),
              transform: [{ scale: rings[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
            },
          ]}
        />
      ))}

      {/* ── Logo + particles — grouped so particles radiate from logo center ── */}
      <View style={s.logoGroup}>
        {/* Particles — positioned from the center of the LOGO_SIZE container */}
        {BURST.map((cfg, i) => (
          <Animated.View
            key={`p${i}`}
            style={{
              position: 'absolute',
              // Start at logo center: (LOGO_SIZE/2 - size/2)
              left: LOGO_SIZE / 2 - cfg.size / 2,
              top:  LOGO_SIZE / 2 - cfg.size / 2,
              width:  cfg.size,
              height: cfg.size,
              borderRadius: cfg.size / 2,
              backgroundColor: '#A8D5B5',
              opacity: partOp[i],
              transform: [{ translateX: partX[i] }, { translateY: partY[i] }],
            }}
          />
        ))}

        {/* Logo icon */}
        <Animated.View style={{ transform: [{ scale: logoScale }, { rotateZ: logoRotDeg }] }}>
          <LinearGradient
            colors={['#3a6b50', '#5B8C6E', '#7ab896']}
            start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.logoOuter}
          >
            <View style={s.logoInnerRing} />
            <Text style={s.logoF}>f</Text>
          </LinearGradient>
        </Animated.View>
      </View>

      {/* "fino" */}
      <Animated.Text style={[s.splashName, { opacity: nameOpacity, transform: [{ translateY: nameY }] }]}>
        fino
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[s.tagline, { opacity: tagOpacity }]}>
        Budget with ease
      </Animated.Text>

      {/* Loader bar */}
      <Animated.View style={[s.loaderWrap, { opacity: loaderOp }]}>
        <Animated.View style={[s.loaderFill, {
          width: loaderW.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#0a1510',
    alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(91,140,110,0.12)',
  },
  // Logo group: exact logo dimensions so absolute particles snap to center
  logoGroup: {
    width: LOGO_SIZE, height: LOGO_SIZE,
    alignItems: 'center', justifyContent: 'center',
  },
  logoOuter: {
    width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5B8C6E', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 30, elevation: 20,
  },
  logoInnerRing: {
    ...StyleSheet.absoluteFillObject, margin: 6,
    borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  logoF: {
    fontFamily: 'Nunito_900Black', fontSize: 60, color: 'white', lineHeight: 68,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 20,
  },
  splashName: {
    fontFamily: 'Nunito_900Black', fontSize: 48, color: 'white',
    letterSpacing: -2, marginTop: 20,
  },
  tagline: {
    fontSize: 13, fontWeight: '500', color: 'rgba(168,213,181,0.5)',
    letterSpacing: 3.2, textTransform: 'uppercase', marginTop: 8,
  },
  loaderWrap: {
    marginTop: 60, width: 40, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
  },
  loaderFill: {
    height: '100%', backgroundColor: '#5B8C6E', borderRadius: 2,
  },
});
