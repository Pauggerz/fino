import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Easing, StyleSheet, Text, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';

interface Props { isActive: boolean }

const { width: W } = Dimensions.get('window');
const PH_W   = Math.round(W * 0.395);     // ~148px on 375px screen (exact HTML ratio)
const PH_H   = Math.round(PH_W * 1.797);  // 266/148
const SC_W   = PH_W - 14;                  // screen inset 7px each side
const SC_H   = PH_H - 14;

export default function PaymentSlide({ isActive }: Props) {
  const headerOp  = useRef(new Animated.Value(0)).current;
  const headerY   = useRef(new Animated.Value(12)).current;
  const phoneOp   = useRef(new Animated.Value(0)).current;
  const phoneY    = useRef(new Animated.Value(20)).current;
  // 3D tilt angles
  const rotY  = useRef(new Animated.Value(-22)).current;
  const rotX  = useRef(new Animated.Value(7)).current;
  const rotZ  = useRef(new Animated.Value(-1)).current;
  // Phone glow overlay colour (0=none, 1=blue, 2=green)
  const glowBlue  = useRef(new Animated.Value(0)).current;
  const glowGreen = useRef(new Animated.Value(0)).current;
  // Sliding panel track
  const trackX = useRef(new Animated.Value(0)).current;
  // Scan beam
  const beamY  = useRef(new Animated.Value(0)).current;
  const beamOp = useRef(new Animated.Value(1)).current;
  const beamLoop = useRef<Animated.CompositeAnimation | null>(null);
  // Spinner -> tick state
  const [spinnerDone, setSpinnerDone] = useState(false);
  const [payLabel, setPayLabel] = useState('Processing...');
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  // Arrow divider + parsed box
  const arrowOp  = useRef(new Animated.Value(0)).current;
  const arrowY   = useRef(new Animated.Value(6)).current;
  const parsedOp = useRef(new Animated.Value(0)).current;
  const parsedY  = useRef(new Animated.Value(8)).current;
  const fieldAnims = useRef([0,1,2,3].map(() => ({
    op: new Animated.Value(0), x: new Animated.Value(8),
  }))).current;
  // Transaction logged
  const logOp = useRef(new Animated.Value(0)).current;
  const logY  = useRef(new Animated.Value(14)).current;
  const logScale = useRef(new Animated.Value(0.98)).current;

  const reset = () => {
    setSpinnerDone(false);
    setPayLabel('Processing...');
    [headerOp, phoneOp, arrowOp, parsedOp, logOp, glowBlue, glowGreen, beamOp].forEach(v => v.setValue(0));
    [headerY, phoneY, arrowY, parsedY, logY].forEach(v => v.setValue(v === headerY ? 12 : v === phoneY ? 20 : v === arrowY ? 6 : v === parsedY ? 8 : 14));
    [logScale].forEach(v => v.setValue(0.98));
    rotY.setValue(-22); rotX.setValue(7); rotZ.setValue(-1);
    trackX.setValue(0); beamY.setValue(0); spinAnim.setValue(0);
    fieldAnims.forEach(f => { f.op.setValue(0); f.x.setValue(8); });
    beamLoop.current?.stop();
    spinLoop.current?.stop();
  };

  useEffect(() => {
    if (!isActive) { beamLoop.current?.stop(); spinLoop.current?.stop(); return; }
    reset();

    // Header
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(headerOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(headerY, { toValue: 0, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Phone appear at 520ms
    Animated.sequence([
      Animated.delay(520),
      Animated.parallel([
        Animated.timing(phoneOp, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(phoneY, { toValue: 0, tension: 34, friction: 7, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Beam scan loop
      beamOp.setValue(1);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(beamY, { toValue: 1, duration: 1400, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(beamY, { toValue: 0, duration: 0, useNativeDriver: false }),
        ])
      );
      beamLoop.current = loop;
      loop.start();

      // Spinner
      const spin = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.linear })
      );
      spinLoop.current = spin;
      spin.start();
    });

    // 2100ms: slide to GCash panel, tilt-less, blue glow
    setTimeout(() => {
      beamLoop.current?.stop();
      beamOp.setValue(0);
      Animated.parallel([
        Animated.timing(trackX, { toValue: -SC_W, duration: 550, easing: Easing.bezier(0.4,0,0.2,1), useNativeDriver: true }),
        Animated.timing(rotY, { toValue: -10, duration: 900, useNativeDriver: true }),
        Animated.timing(rotX, { toValue: 4,   duration: 900, useNativeDriver: true }),
        Animated.timing(rotZ, { toValue: 0,   duration: 900, useNativeDriver: true }),
        Animated.timing(glowBlue, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]).start();
    }, 2100);

    // 3200ms: payment done
    setTimeout(() => {
      spinLoop.current?.stop();
      setSpinnerDone(true);
      setPayLabel('Payment sent!');
      Animated.parallel([
        Animated.timing(glowBlue,  { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(glowGreen, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]).start();
    }, 3200);

    // 3900ms: slide to Receipt
    setTimeout(() => {
      Animated.timing(trackX, {
        toValue: -SC_W * 2, duration: 550, easing: Easing.bezier(0.4,0,0.2,1), useNativeDriver: true,
      }).start();
    }, 3900);

    // 4600ms: arrow
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(arrowOp, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(arrowY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 4600);

    // 4900ms: parsed box + staggered fields
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(parsedOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(parsedY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
      fieldAnims.forEach((f, i) => {
        Animated.sequence([
          Animated.delay(i * 130),
          Animated.parallel([
            Animated.timing(f.op, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(f.x,  { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        ]).start();
      });
    }, 4900);

    // 5800ms: transaction logged
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(logOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logY, { toValue: 0, tension: 34, friction: 7, useNativeDriver: true }),
        Animated.spring(logScale, { toValue: 1, tension: 34, friction: 7, useNativeDriver: true }),
      ]).start();
    }, 5800);

    return () => { beamLoop.current?.stop(); spinLoop.current?.stop(); };
  }, [isActive]);

  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const beamTop = beamY.interpolate({ inputRange: [0, 1], outputRange: [4, SC_H * 0.6] });
  const rotYDeg = rotY.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const rotXDeg = rotX.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const rotZDeg = rotZ.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const blueGlow  = glowBlue.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,85,196,0)',  'rgba(0,85,196,0.35)'] });
  const greenGlow = glowGreen.interpolate({ inputRange: [0, 1], outputRange: ['rgba(45,106,79,0)', 'rgba(45,106,79,0.40)'] });
  // Ambient halo behind the phone — subtle glow
  const haloBlue  = glowBlue.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,85,196,0)',   'rgba(0,85,196,0.28)'] });
  const haloGreen = glowGreen.interpolate({ inputRange: [0, 1], outputRange: ['rgba(45,158,95,0)', 'rgba(45,158,95,0.28)'] });
  const haloDef   = phoneOp.interpolate({ inputRange: [0, 1],   outputRange: ['rgba(91,80,60,0)',   'rgba(91,80,60,0.10)'] });

  // QR frame size (scaled to screen)
  const QR = Math.round(SC_W * 0.60);

  const FIELDS = [
    { label: 'Merchant', val: 'Jollibee' },
    { label: 'Amount',   val: '₱185.00' },
    { label: 'Date',     val: 'Apr 3, 2026' },
    { label: 'Wallet',   val: 'GCash' },
  ];

  return (
    <View style={s.root}>
      {/* Header */}
      <Animated.View style={[s.header, { opacity: headerOp, transform: [{ translateY: headerY }] }]}>
        <Text style={s.eyebrow}>OCR magic</Text>
        <Text style={s.title}>Snap. Scan.{'\n'}<Text style={{ color: '#E8856A' }}>Done.</Text></Text>
      </Animated.View>

      <View style={s.stage}>
        {/* ── 3D Phone ── */}
        <Animated.View style={[s.phoneWrap, { opacity: phoneOp, transform: [{ translateY: phoneY }] }]}>
          {/* Ambient halo glow behind phone */}
          <Animated.View style={[s.halo, { backgroundColor: haloDef as any }]} />
          <Animated.View style={[s.halo, { backgroundColor: haloBlue as any }]} />
          <Animated.View style={[s.halo, { backgroundColor: haloGreen as any }]} />
          <Animated.View style={[
            s.phone,
            { width: PH_W, height: PH_H },
            {
              transform: [
                { perspective: 720 },
                { rotateY: rotYDeg },
                { rotateX: rotXDeg },
                { rotateZ: rotZDeg },
              ],
            },
          ]}>
            {/* Blue glow overlay */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: blueGlow as any, borderRadius: 28 }]} />
            {/* Green glow overlay */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: greenGlow as any, borderRadius: 28 }]} />

            {/* Notch */}
            <View style={[s.notch, { width: PH_W * 0.31, height: 9 }]} />
            {/* Left buttons */}
            <View style={s.btnL} />
            <View style={[s.btnL, { top: 68 + 16 }]} />
            <View style={[s.btnL, { top: 68 + 30 }]} />
            {/* Right button */}
            <View style={s.btnR} />

            {/* Screen */}
            <View style={[s.screen, { width: SC_W, height: SC_H }]}>
              <Animated.View style={[s.track, { width: SC_W * 3, transform: [{ translateX: trackX }] }]}>

                {/* Panel 1: QR Scanner */}
                <View style={[s.panel, { width: SC_W, backgroundColor: '#090d0a', alignItems: 'center', justifyContent: 'center' }]}>
                  <View style={s.camBar}>
                    <Text style={s.camTitle}>GCash QR</Text>
                    <View style={s.flash} />
                  </View>
                  {/* QR frame */}
                  <View style={{ width: QR, height: QR, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Corner brackets */}
                    {(['tl','tr','bl','br'] as const).map(pos => (
                      <View key={pos} style={[s.corner, {
                        top: pos[0] === 't' ? 0 : undefined,
                        bottom: pos[0] === 'b' ? 0 : undefined,
                        left: pos[1] === 'l' ? 0 : undefined,
                        right: pos[1] === 'r' ? 0 : undefined,
                        borderTopWidth: pos[0] === 't' ? 2 : 0,
                        borderBottomWidth: pos[0] === 'b' ? 2 : 0,
                        borderLeftWidth: pos[1] === 'l' ? 2 : 0,
                        borderRightWidth: pos[1] === 'r' ? 2 : 0,
                        borderTopLeftRadius: pos === 'tl' ? 2 : 0,
                        borderTopRightRadius: pos === 'tr' ? 2 : 0,
                        borderBottomLeftRadius: pos === 'bl' ? 2 : 0,
                        borderBottomRightRadius: pos === 'br' ? 2 : 0,
                      }]} />
                    ))}
                    {/* QR SVG */}
                    <Svg width={QR * 0.74} height={QR * 0.74} viewBox="0 0 64 64">
                      <Rect x="3"    y="3"    width="20" height="20" rx="2.5" stroke="white" strokeWidth="1.8" fill="none"/>
                      <Rect x="7.5"  y="7.5"  width="11" height="11" fill="white"/>
                      <Rect x="41"   y="3"    width="20" height="20" rx="2.5" stroke="white" strokeWidth="1.8" fill="none"/>
                      <Rect x="45.5" y="7.5"  width="11" height="11" fill="white"/>
                      <Rect x="3"    y="41"   width="20" height="20" rx="2.5" stroke="white" strokeWidth="1.8" fill="none"/>
                      <Rect x="7.5"  y="45.5" width="11" height="11" fill="white"/>
                      <Rect x="27"   y="3"    width="5" height="5"   fill="white"/>
                      <Rect x="27"   y="11"   width="5" height="5"   fill="white"/>
                      <Rect x="3"    y="27"   width="5" height="5"   fill="white"/>
                      <Rect x="11"   y="27"   width="5" height="5"   fill="white"/>
                      <Rect x="27"   y="27"   width="5" height="5"   fill="white"/>
                      <Rect x="35"   y="27"   width="5" height="5"   fill="white"/>
                      <Rect x="27"   y="35"   width="5" height="5"   fill="white"/>
                      <Rect x="41"   y="41"   width="5" height="5"   fill="white"/>
                      <Rect x="49"   y="49"   width="5" height="5"   fill="white"/>
                      <Rect x="57"   y="41"   width="5" height="5"   fill="white"/>
                      <Rect x="41"   y="57"   width="5" height="5"   fill="white"/>
                      <Rect x="57"   y="57"   width="5" height="5"   fill="white"/>
                    </Svg>
                    {/* Scan beam */}
                    <Animated.View style={[s.beam, {
                      opacity: beamOp,
                      top: beamTop,
                      left: 2, right: 2,
                    }]} />
                  </View>
                  <Text style={s.qrHint}>Jollibee · Ayala</Text>
                </View>

                {/* Panel 2: GCash Payment */}
                <View style={[s.panel, { width: SC_W }]}>
                  <LinearGradient colors={['#0060d0', '#0042a8', '#002878']} style={[StyleSheet.absoluteFillObject, { borderRadius: 0 }]} />
                  <LinearGradient colors={['rgba(255,255,255,0.1)', 'transparent']} style={StyleSheet.absoluteFillObject} />
                  <View style={s.gcashContent}>
                    <Text style={s.gcashBrand}>GCash</Text>
                    <Text style={s.gcashTo}>Paying to</Text>
                    <Text style={s.gcashMerchant}>Jollibee</Text>
                    <Text style={s.gcashAmt}>₱185.00</Text>
                    <View style={s.gcashRule} />
                    <View style={s.gcashStatus}>
                      {spinnerDone ? (
                        <View style={s.spinnerDone}><Text style={{ color: 'white', fontSize: 7, fontWeight: '700' }}>✓</Text></View>
                      ) : (
                        <Animated.View style={[s.spinner, { transform: [{ rotate: spinDeg }] }]} />
                      )}
                      <Text style={[s.gcashLbl, spinnerDone && { color: 'rgba(255,255,255,0.95)' }]}>
                        {payLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Panel 3: Receipt */}
                <View style={[s.panel, { width: SC_W, backgroundColor: 'white' }]}>
                  <LinearGradient colors={['#0052be', '#007DFF']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={s.rcptHead}>
                    <View style={s.rcptCheck}><Text style={{ color: '#007DFF', fontSize: 8, fontWeight: '700' }}>✓</Text></View>
                    <Text style={s.rcptBrand}>GCash</Text>
                  </LinearGradient>
                  <View style={s.rcptBody}>
                    <Text style={s.rcptMerchant}>Jollibee · Ayala Center Cebu</Text>
                    {[
                      { l: 'Amount',   v: '185.00',     bold: false },
                      { l: 'Total',    v: '₱185.00',    bold: true  },
                      { l: 'Date',     v: 'Apr 3, 2026',bold: false },
                      { l: 'Ref No.',  v: '60392874651',bold: false },
                    ].map(r => (
                      <View key={r.l} style={s.rcptRow}>
                        <Text style={s.rcptL}>{r.l}</Text>
                        <Text style={[s.rcptV, r.bold && { color: '#007DFF', fontWeight: '700' }]}>{r.v}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </Animated.View>

        {/* ── Fino Intelligence arrow ── */}
        <Animated.View style={[s.arrowRow, { opacity: arrowOp, transform: [{ translateY: arrowY }] }]}>
          <View style={s.divLine} />
          <Text style={s.arrowIcon}>↓</Text>
          <View style={s.divLine} />
        </Animated.View>

        {/* ── Parsed box ── */}
        <Animated.View style={[s.parsedBox, { opacity: parsedOp, transform: [{ translateY: parsedY }] }]}>
          <Text style={s.parsedHeader}>Parsed by Fino Intelligence</Text>
          {FIELDS.map((f, i) => (
            <Animated.View
              key={f.label}
              style={[s.pfield, { opacity: fieldAnims[i].op, transform: [{ translateX: fieldAnims[i].x }] }]}
            >
              <Text style={s.pfLabel}>{f.label}</Text>
              <View style={s.pfVal}>
                <View style={s.pfDot} />
                <Text style={s.pfValText}>{f.val}</Text>
              </View>
            </Animated.View>
          ))}
        </Animated.View>

        {/* ── Transaction logged ── */}
        <Animated.View style={[s.logWrap, {
          opacity: logOp,
          transform: [{ translateY: logY }, { scale: logScale }],
        }]}>
          <View style={s.logBadge}>
            <View style={s.logCheck}><Text style={{ color: 'white', fontSize: 8, fontWeight: '700' }}>✓</Text></View>
            <Text style={s.logBadgeLabel}>Added to Transactions</Text>
          </View>
          <View style={s.logRow}>
            <View style={s.logIcon}><Text style={{ fontSize: 15 }}>🍔</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.logName} numberOfLines={1}>Jollibee · Ayala Center Cebu</Text>
              <Text style={s.logMeta}>Apr 3, 2026 · 1:42 PM · GCash</Text>
            </View>
            <Text style={s.logAmt}>-₱185.00</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070d09' },
  header: { paddingTop: 56, paddingHorizontal: 28 },
  eyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2.4,
    color: 'rgba(232,133,106,0.5)', textTransform: 'uppercase', marginBottom: 10,
  },
  title: {
    fontFamily: 'Nunito_900Black', fontSize: 30, color: 'white',
    lineHeight: 33, letterSpacing: -1,
  },
  stage: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, paddingBottom: 12, gap: 14,
  },
  // Phone
  phoneWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: PH_W * 1.6, height: PH_H * 0.9,
    borderRadius: PH_W * 0.8,
    alignSelf: 'center',
  },
  phone: {
    borderRadius: 28, position: 'relative',
    backgroundColor: '#161819',
    shadowColor: '#000', shadowOffset: { width: 26, height: 30 },
    shadowOpacity: 0.9, shadowRadius: 65, elevation: 30,
  },
  notch: {
    position: 'absolute', top: 0, alignSelf: 'center',
    backgroundColor: '#0a0c0b', borderBottomLeftRadius: 9, borderBottomRightRadius: 9, zIndex: 20,
  },
  btnL: {
    position: 'absolute', left: -3, top: 52, width: 3, height: 18,
    backgroundColor: '#2a2c2c', borderTopLeftRadius: 2, borderBottomLeftRadius: 2,
  },
  btnR: {
    position: 'absolute', right: -3, top: 68, width: 3, height: 28,
    backgroundColor: '#2a2c2c', borderTopRightRadius: 2, borderBottomRightRadius: 2,
  },
  screen: {
    position: 'absolute', top: 7, left: 7,
    borderRadius: 22, overflow: 'hidden',
    backgroundColor: '#0a0e0b',
  },
  track: { height: '100%', flexDirection: 'row' },
  panel: { height: '100%', overflow: 'hidden' },
  // QR panel
  camBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  camTitle: { fontSize: 7, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' },
  flash: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  corner: {
    position: 'absolute', width: 14, height: 14,
    borderColor: 'rgba(232,133,106,0.88)',
  },
  beam: {
    position: 'absolute', height: 1,
    backgroundColor: 'rgba(232,133,106,0.95)',
    shadowColor: '#E8856A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5,
  },
  qrHint: { fontSize: 7, color: 'rgba(255,255,255,0.25)', marginTop: 6 },
  // GCash panel
  gcashContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
  gcashBrand: { fontFamily: 'Nunito_900Black', fontSize: 20, color: 'white', letterSpacing: -0.5 },
  gcashTo: { fontSize: 7, fontWeight: '600', letterSpacing: 1.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' },
  gcashMerchant: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: -2 },
  gcashAmt: { fontFamily: 'DMMono_400Regular', fontSize: 26, color: 'white', letterSpacing: -1, marginVertical: 4 },
  gcashRule: { width: '80%', height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  gcashStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spinner: {
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    borderTopColor: 'white',
  },
  spinnerDone: {
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  gcashLbl: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  // Receipt panel
  rcptHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 9, flexShrink: 0,
  },
  rcptCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'white', alignItems: 'center', justifyContent: 'center',
  },
  rcptBrand: { fontFamily: 'Nunito_900Black', fontSize: 12, color: 'white' },
  rcptBody: { padding: 8, flex: 1 },
  rcptMerchant: { fontFamily: 'Nunito_800ExtraBold', fontSize: 8, color: '#1a1a2e', marginBottom: 5 },
  rcptRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f3f0ea',
  },
  rcptL: { fontSize: 6.5, color: '#9A9AAA' },
  rcptV: { fontFamily: 'DMMono_400Regular', fontSize: 6.5, color: '#1E1E2E' },
  // Arrow divider
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  divLine: { flex: 1, height: 1, backgroundColor: 'rgba(168,213,181,0.22)' },
  arrowIcon: { fontSize: 12, color: 'rgba(168,213,181,0.45)' },
  // Parsed box
  parsedBox: {
    width: '100%',
    backgroundColor: 'rgba(91,140,110,0.06)',
    borderWidth: 1, borderColor: 'rgba(91,140,110,0.16)',
    borderRadius: 14, padding: 11,
  },
  parsedHeader: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1.6,
    color: 'rgba(168,213,181,0.35)', textTransform: 'uppercase', marginBottom: 7,
  },
  pfield: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3.5 },
  pfLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  pfVal: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(91,140,110,0.1)',
    borderWidth: 1, borderColor: 'rgba(160,188,160,0.2)',
    borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3,
  },
  pfDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#5B8C6E' },
  pfValText: { fontFamily: 'DMMono_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  // Transaction logged
  logWrap: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  logBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: 'rgba(91,140,110,0.18)',
    borderWidth: 1, borderColor: 'rgba(91,140,110,0.3)',
    borderBottomWidth: 0,
    borderTopLeftRadius: 10, borderTopRightRadius: 10,
  },
  logCheck: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#5B8C6E', alignItems: 'center', justifyContent: 'center',
  },
  logBadgeLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1.6,
    textTransform: 'uppercase', color: 'rgba(168,213,181,0.6)',
  },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(91,140,110,0.18)',
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },
  logIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(254,243,226,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  logName: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  logMeta: { fontSize: 10, color: 'rgba(255,255,255,0.32)', marginTop: 2 },
  logAmt: { fontFamily: 'DMMono_500Medium', fontSize: 13, color: '#E8856A' },
});
