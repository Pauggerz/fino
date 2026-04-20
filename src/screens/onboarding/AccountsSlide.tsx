import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath } from 'react-native-svg';

interface Props {
  isActive: boolean;
}

const { width: W } = Dimensions.get('window');
const CARD_W = Math.min(268, W * 0.715);
const CARD_H = Math.round(CARD_W * 1.29);

const STACK = [
  { translateY: 0, scale: 1.0, opacity: 1.0, zIndex: 5 },
  { translateY: -20, scale: 0.94, opacity: 0.85, zIndex: 4 },
  { translateY: -38, scale: 0.88, opacity: 0.65, zIndex: 3 },
  { translateY: -54, scale: 0.82, opacity: 0.45, zIndex: 2 },
  { translateY: -68, scale: 0.76, opacity: 0.25, zIndex: 1 },
];

const CARDS = [
  {
    id: 'gcash',
    label: 'E-WALLET',
    logo: 'GCash',
    last4: '4291',
    balance: '₱8,000.00',
    gradColors: ['#0055c4', '#0041a0', '#002d7a'] as [string, string, string],
    watermark: 'G',
  },
  {
    id: 'maya',
    label: 'E-WALLET',
    logo: 'maya',
    last4: '8835',
    balance: '₱1,200.00',
    gradColors: ['#0c0c0c', '#0c0c0c', '#141414'] as [string, string, string],
    logoColor: '#3DD68C',
    silverChip: true,
    isMaya: true,
  },
  {
    id: 'bdo',
    label: 'BANK ACCOUNT',
    logo: 'BDO',
    last4: '1042',
    balance: '₱25,000.00',
    gradColors: ['#44aadf', '#1568c8', '#071e60'] as [string, string, string],
    isBDO: true,
  },
  {
    id: 'bpi',
    label: 'BANK ACCOUNT',
    logo: 'BPI',
    last4: '7761',
    balance: '₱12,500.00',
    gradColors: ['#cc2929', '#881010', '#6e0a0a'] as [string, string, string],
    isBPI: true,
  },
  {
    id: 'fino',
    label: 'YOUR FINO TOTAL',
    logo: 'fino',
    last4: '',
    balance: '₱46,700.00',
    gradColors: ['#1e3d2f', '#163224', '#0f2419'] as [string, string, string],
    isFino: true,
    logoColor: '#A8D5B5',
    watermark: 'f',
  },
];

const makeEntrance = () => ({
  y: new Animated.Value(40),
  op: new Animated.Value(0),
});

// Contactless NFC symbol — 3 concentric open arcs
function ContactlessIcon({ opacity = 0.5 }: { opacity?: number }) {
  const color = `rgba(255,255,255,${opacity})`;
  const W_ICON = 18;
  // Three arcs: d path draws a partial arc on the right side
  const arcs = [
    { r: 4, sw: 1.4 },
    { r: 7, sw: 1.3 },
    { r: 10, sw: 1.2 },
  ];
  const cx = W_ICON / 2;
  const cy = W_ICON / 2;
  return (
    <Svg width={W_ICON} height={W_ICON} viewBox={`0 0 ${W_ICON} ${W_ICON}`}>
      {arcs.map(({ r, sw }) => {
        // Arc from -50deg to +50deg (right-side opening)
        const startAngle = -55 * (Math.PI / 180);
        const endAngle = 55 * (Math.PI / 180);
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        return (
          <SvgPath
            key={`${r}-${sw}`}
            d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
            stroke={color}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

export default function AccountsSlide({ isActive }: Props) {
  const [cardTop, setCardTop] = useState(0);
  const cardTopRef = useRef(0);

  const entrance = useRef(CARDS.map(() => makeEntrance())).current;

  // Animated values for smooth stack transitions
  const stackTY = useRef(
    CARDS.map((_, i) => new Animated.Value(STACK[i].translateY))
  ).current;
  const stackSC = useRef(
    CARDS.map((_, i) => new Animated.Value(STACK[i].scale))
  ).current;
  const stackOP = useRef(
    CARDS.map((_, i) => new Animated.Value(STACK[i].opacity))
  ).current;

  const headerOp = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(14)).current;
  const hintOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) return;

    // Reset everything
    cardTopRef.current = 0;
    setCardTop(0);
    headerOp.setValue(0);
    headerY.setValue(14);
    hintOp.setValue(0);
    entrance.forEach((e) => {
      e.y.setValue(40);
      e.op.setValue(0);
    });
    CARDS.forEach((_, i) => {
      stackTY[i].setValue(STACK[i].translateY);
      stackSC[i].setValue(STACK[i].scale);
      stackOP[i].setValue(STACK[i].opacity);
    });

    // Header
    Animated.sequence([
      Animated.delay(100),
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

    // Hint
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(hintOp, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Card entrance stagger
    CARDS.forEach((_, i) => {
      Animated.sequence([
        Animated.delay(100 + i * 80 + 300),
        Animated.parallel([
          Animated.spring(entrance[i].y, {
            toValue: 0,
            tension: 34,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(entrance[i].op, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    });
  }, [isActive]);

  const handleCardPress = () => {
    const newTop = (cardTopRef.current + 1) % CARDS.length;
    cardTopRef.current = newTop;
    setCardTop(newTop);

    // Animate all cards to new stack positions with spring
    const anims = CARDS.map((_, i) => {
      const newPos = (i - newTop + CARDS.length) % CARDS.length;
      const target = STACK[newPos];
      return Animated.parallel([
        Animated.spring(stackTY[i], {
          toValue: target.translateY,
          tension: 60,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.spring(stackSC[i], {
          toValue: target.scale,
          tension: 60,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(stackOP[i], {
          toValue: target.opacity,
          duration: 250,
          useNativeDriver: true,
        }),
      ]);
    });
    Animated.parallel(anims).start();
  };

  return (
    <View style={s.root}>
      {/* Subtle bg glow */}
      <LinearGradient
        colors={['#0a1a10', '#111f15', '#0a1a10']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <Animated.View
        style={[
          s.header,
          { opacity: headerOp, transform: [{ translateY: headerY }] },
        ]}
      >
        <Text style={s.eyebrow}>All in one place</Text>
        <Text style={s.title}>
          Every wallet,{'\n'}
          <Text style={{ color: '#5B8C6E' }}>one view.</Text>
        </Text>
      </Animated.View>

      {/* Card stage */}
      <View style={s.stage}>
        <TouchableOpacity activeOpacity={1} onPress={handleCardPress}>
          <View style={{ width: CARD_W, height: CARD_H + 68 }}>
            {CARDS.map((card, i) => {
              const pos = (i - cardTop + CARDS.length) % CARDS.length;
              const cfg = STACK[pos];
              return (
                <Animated.View
                  key={card.id}
                  style={[
                    s.cardAbsolute,
                    {
                      zIndex: cfg.zIndex,
                      opacity: Animated.multiply(entrance[i].op, stackOP[i]),
                      transform: [
                        { translateY: stackTY[i] },
                        { translateY: entrance[i].y },
                        { scale: stackSC[i] },
                      ],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={card.gradColors}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.card}
                  >
                    {/* Base light sheen */}
                    <LinearGradient
                      colors={['rgba(255,255,255,0.13)', 'transparent']}
                      start={{ x: 0.1, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />

                    {/* ── Maya: neon green right-edge strip ── */}
                    {card.isMaya && (
                      <LinearGradient
                        colors={[
                          'transparent',
                          'rgba(61,214,140,0.95)',
                          'rgba(61,214,140,0.95)',
                          'transparent',
                        ]}
                        locations={[0, 0.35, 0.65, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={s.mayaNeon}
                      />
                    )}

                    {/* ── BDO: translucent geometric blocks ── */}
                    {card.isBDO && (
                      <>
                        <View
                          style={[
                            s.bdoBlock,
                            { width: 120, height: 120, top: 30, right: -25 },
                          ]}
                        />
                        <View
                          style={[
                            s.bdoBlock,
                            { width: 92, height: 92, top: 82, right: 18 },
                          ]}
                        />
                        <View
                          style={[
                            s.bdoBlock,
                            { width: 70, height: 70, top: 136, right: 6 },
                          ]}
                        />
                        <View
                          style={[
                            s.bdoBlock,
                            { width: 54, height: 54, top: 70, right: 88 },
                          ]}
                        />
                        {/* BDO text watermark */}
                        <Text style={s.bdoWatermark}>BDO</Text>
                      </>
                    )}

                    {/* ── BPI: radial glow + heraldic watermark ── */}
                    {card.isBPI && (
                      <>
                        <View style={s.bpiGlow} />
                        <View style={s.bpiGlow2} />
                        {/* BPI shield/crest watermark */}
                        <View style={s.bpiCrest}>
                          <Text style={s.bpiCrownText}>♛</Text>
                          <View style={s.bpiShieldRow}>
                            <Text style={s.bpiCastleText}>🏛</Text>
                            <Text style={s.bpiBearText}>🐻</Text>
                          </View>
                        </View>
                      </>
                    )}

                    {/* ── GCash / Fino: letter watermark ── */}
                    {card.watermark && (
                      <Text
                        style={[
                          s.watermark,
                          card.id === 'gcash' ? s.wmGcash : s.wmFino,
                        ]}
                      >
                        {card.watermark}
                      </Text>
                    )}

                    {/* ── Fino: total badge ── */}
                    {card.isFino && (
                      <View style={s.finoBadge}>
                        <Text style={s.finoBadgeText}>✦ Fino</Text>
                      </View>
                    )}

                    {/* ── Chip + contactless (top-right) ── */}
                    <View style={s.hardware}>
                      <LinearGradient
                        colors={
                          card.silverChip
                            ? ['#dce0e8', '#a8b0bc', '#cdd2da', '#8c96a2']
                            : ['#f0d060', '#c8961e', '#e8c040', '#b07818']
                        }
                        style={s.chip}
                      >
                        <View style={s.chipLine} />
                        <View style={[s.chipLine, { top: '50%' }]} />
                        <View style={s.chipLineV} />
                        <View style={[s.chipLineV, { left: '50%' }]} />
                      </LinearGradient>
                      <ContactlessIcon opacity={card.silverChip ? 0.55 : 0.5} />
                    </View>

                    {/* ── Card body ── */}
                    <View style={s.cardContent}>
                      <View>
                        <Text
                          style={[
                            s.cardLogo,
                            card.logoColor ? { color: card.logoColor } : {},
                          ]}
                        >
                          {card.logo}
                        </Text>
                        <Text style={s.cardLabel}>{card.label}</Text>
                      </View>

                      {/* Masked PAN */}
                      <View style={s.cardNumRow}>
                        {[0, 1, 2].map((g) => (
                          <View key={g} style={s.dotGroup}>
                            {[0, 1, 2, 3].map((d) => (
                              <View key={d} style={s.numDot} />
                            ))}
                          </View>
                        ))}
                        {card.last4 ? (
                          <Text style={s.last4}>{card.last4}</Text>
                        ) : (
                          <View style={{ flex: 1 }} />
                        )}
                      </View>

                      {/* Balance */}
                      <View style={s.cardBottom}>
                        <Text style={s.balLabel}>Total Balance</Text>
                        <Text
                          style={[
                            s.balance,
                            card.logoColor ? { color: card.logoColor } : {},
                          ]}
                        >
                          {card.balance}
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Animated.View>
              );
            })}
          </View>
        </TouchableOpacity>
      </View>

      {/* Hint */}
      <Animated.Text style={[s.hint, { opacity: hintOp }]}>
        Tap a card to cycle →
      </Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingTop: 70, paddingHorizontal: 28, paddingBottom: 20 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(168,213,181,0.4)',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Nunito_900Black',
    fontSize: 32,
    color: 'white',
    lineHeight: 35,
    letterSpacing: -1,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardAbsolute: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_H,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 32 },
    shadowOpacity: 0.75,
    shadowRadius: 40,
    elevation: 16,
  },
  card: { flex: 1, borderRadius: 28, padding: 28, overflow: 'hidden' },

  // Maya
  mayaNeon: {
    position: 'absolute',
    top: CARD_H * 0.08,
    right: 0,
    height: CARD_H * 0.84,
    width: 2,
    shadowColor: '#3DD68C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },

  // BDO
  bdoBlock: {
    position: 'absolute',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bdoWatermark: {
    position: 'absolute',
    bottom: 12,
    right: 18,
    fontFamily: 'Nunito_900Black',
    fontSize: 52,
    color: 'rgba(255,255,255,0.06)',
    letterSpacing: -2,
  },

  // BPI
  bpiGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -40,
    right: -40,
    backgroundColor: 'rgba(220,60,60,0.4)',
  },
  bpiGlow2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    bottom: 20,
    left: -20,
    backgroundColor: 'rgba(200,30,30,0.2)',
  },
  bpiCrest: {
    position: 'absolute',
    bottom: 48,
    right: 0,
    left: 0,
    alignItems: 'center',
    opacity: 0.12,
  },
  bpiCrownText: { fontSize: 36, color: 'white', lineHeight: 40 },
  bpiShieldRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  bpiCastleText: { fontSize: 22, color: 'white' },
  bpiBearText: { fontSize: 22, color: 'white' },

  // GCash / Fino watermark
  watermark: {
    position: 'absolute',
    fontFamily: 'Nunito_900Black',
    color: 'rgba(255,255,255,0.05)',
  },
  wmGcash: { fontSize: 200, bottom: -40, right: -10, lineHeight: 200 },
  wmFino: { fontSize: 200, bottom: -30, right: 5, lineHeight: 200 },

  // Fino badge
  finoBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'rgba(168,213,181,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(168,213,181,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  finoBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A8D5B5',
    letterSpacing: 0.8,
  },

  // Chip
  hardware: {
    position: 'absolute',
    top: 28,
    right: 26,
    alignItems: 'flex-end',
    gap: 8,
  },
  chip: {
    width: 40,
    height: 30,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  chipLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    top: '33%',
  },
  chipLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    left: '33%',
  },

  // Card body
  cardContent: { flex: 1, justifyContent: 'space-between' },
  cardLogo: {
    fontFamily: 'Nunito_900Black',
    fontSize: 24,
    color: 'white',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 5,
  },
  cardNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto' as any,
    paddingBottom: 16,
  },
  dotGroup: { flexDirection: 'row', gap: 3 },
  numDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  last4: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1,
  },
  cardBottom: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  balLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 6,
  },
  balance: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 26,
    color: 'white',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  hint: {
    textAlign: 'center',
    paddingBottom: 110,
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
  },
});
