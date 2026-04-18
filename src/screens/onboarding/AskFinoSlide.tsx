import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props { isActive: boolean }

const { width: W, height: H } = Dimensions.get('window');

// Nodes placed at fixed angles and radii
const NODES = [
  { emoji: '🍔', label: 'Jollibee',  amount: '₱185',    angle: -70, r: 100 },
  { emoji: '🚌', label: 'Transport', amount: '₱3,191',  angle:  25, r: 105 },
  { emoji: '🍖', label: 'Samgyup',   amount: '₱2,000',  angle: 160, r: 98  },
];

const ORB_R  = 50;
const RING1_R = 95;
const RING2_R = 128;

export default function AskFinoSlide({ isActive }: Props) {
  const [showTyping, setShowTyping] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const headerOp   = useRef(new Animated.Value(0)).current;
  const headerY    = useRef(new Animated.Value(14)).current;
  const orbScale   = useRef(new Animated.Value(0.3)).current;
  const orbOp      = useRef(new Animated.Value(0)).current;
  const orbPulse   = useRef(new Animated.Value(1)).current;
  const ring1Op    = useRef(new Animated.Value(0)).current;
  const ring2Op    = useRef(new Animated.Value(0)).current;
  const ring1Rot   = useRef(new Animated.Value(0)).current;
  const ring2Rot   = useRef(new Animated.Value(0)).current;
  const nodeOps    = useRef(NODES.map(() => new Animated.Value(0))).current;
  const nodeScales = useRef(NODES.map(() => new Animated.Value(0.5))).current;
  const questionX  = useRef(new Animated.Value(60)).current;
  const questionOp = useRef(new Animated.Value(0)).current;
  const answerOp   = useRef(new Animated.Value(0)).current;
  const answerY    = useRef(new Animated.Value(10)).current;
  const pill1X     = useRef(new Animated.Value(-40)).current;
  const pill1Op    = useRef(new Animated.Value(0)).current;
  const pill2X     = useRef(new Animated.Value(-40)).current;
  const pill2Op    = useRef(new Animated.Value(0)).current;
  const hintOp     = useRef(new Animated.Value(0)).current;

  const ringLoops  = useRef<Animated.CompositeAnimation[]>([]);
  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);
  const timers     = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!isActive) {
      ringLoops.current.forEach(a => a.stop());
      pulseLoop.current?.stop();
      timers.current.forEach(clearTimeout);
      return;
    }

    // Reset
    setShowTyping(false); setShowAnswer(false);
    headerOp.setValue(0); headerY.setValue(14);
    orbScale.setValue(0.3); orbOp.setValue(0); orbPulse.setValue(1);
    ring1Op.setValue(0); ring2Op.setValue(0);
    ring1Rot.setValue(0); ring2Rot.setValue(0);
    nodeOps.forEach(v => v.setValue(0));
    nodeScales.forEach(v => v.setValue(0.5));
    questionX.setValue(60); questionOp.setValue(0);
    answerOp.setValue(0); answerY.setValue(10);
    pill1X.setValue(-40); pill1Op.setValue(0);
    pill2X.setValue(-40); pill2Op.setValue(0);
    hintOp.setValue(0);
    timers.current = [];

    // Header 100ms
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(headerOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(headerY,  { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Orb 520ms
    Animated.sequence([
      Animated.delay(520),
      Animated.parallel([
        Animated.spring(orbScale, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
        Animated.timing(orbOp,    { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    // Ring 1 at 820ms → start spinning
    Animated.sequence([
      Animated.delay(820),
      Animated.timing(ring1Op, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      const loop = Animated.loop(
        Animated.timing(ring1Rot, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })
      );
      loop.start();
      ringLoops.current[0] = loop;
    });

    // Ring 2 at 1020ms → counter-rotate
    Animated.sequence([
      Animated.delay(1020),
      Animated.timing(ring2Op, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      const loop = Animated.loop(
        Animated.timing(ring2Rot, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true })
      );
      loop.start();
      ringLoops.current[1] = loop;
    });

    // Nodes: 1250, 1450, 1650ms
    [1250, 1450, 1650].forEach((delay, i) => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.spring(nodeScales[i], { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
          Animated.timing(nodeOps[i],    { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    });

    // Orb pulse at 1900ms
    const t1 = setTimeout(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(orbPulse, { toValue: 1.08, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orbPulse, { toValue: 1,    duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      pulseLoop.current = loop;
    }, 1900);
    timers.current.push(t1);

    // Question 2500ms
    Animated.sequence([
      Animated.delay(2500),
      Animated.parallel([
        Animated.spring(questionX,  { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(questionOp, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();

    // Typing dots 3100ms
    const t2 = setTimeout(() => setShowTyping(true), 3100);
    timers.current.push(t2);

    // Answer replaces typing 4300ms
    const t3 = setTimeout(() => {
      setShowTyping(false); setShowAnswer(true);
      Animated.parallel([
        Animated.timing(answerOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(answerY,  { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 4300);
    timers.current.push(t3);

    // Pills 5100, 5300ms
    Animated.sequence([
      Animated.delay(5100),
      Animated.parallel([
        Animated.spring(pill1X,  { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(pill1Op, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
    Animated.sequence([
      Animated.delay(5300),
      Animated.parallel([
        Animated.spring(pill2X,  { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(pill2Op, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();

    // Input hint 5700ms
    Animated.sequence([
      Animated.delay(5700),
      Animated.timing(hintOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    return () => {
      ringLoops.current.forEach(a => a.stop());
      pulseLoop.current?.stop();
      timers.current.forEach(clearTimeout);
    };
  }, [isActive]);

  const ring1Deg = ring1Rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ring2Deg = ring2Rot.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  // Arena height: roughly 42% of screen
  const ARENA_H = Math.min(H * 0.40, 300);

  return (
    <View style={s.root}>
      {/* Header */}
      <Animated.View style={[s.header, { opacity: headerOp, transform: [{ translateY: headerY }] }]}>
        <Text style={s.eyebrow}>Fino Intelligence</Text>
        <Text style={s.title}>Ask anything{'\n'}<Text style={{ color: '#b084f5' }}>about your money.</Text></Text>
      </Animated.View>

      {/* Orb arena — fixed height */}
      <View style={[s.arenaWrap, { height: ARENA_H }]}>
        {/* Outer ring (counter-rotate) */}
        <Animated.View style={[
          s.ring,
          { width: RING2_R * 2, height: RING2_R * 2, borderRadius: RING2_R },
          { opacity: ring2Op, transform: [{ rotateZ: ring2Deg }] },
        ]}>
          <View style={s.ringDot} />
        </Animated.View>

        {/* Inner ring (clockwise) */}
        <Animated.View style={[
          s.ring,
          { width: RING1_R * 2, height: RING1_R * 2, borderRadius: RING1_R },
          { opacity: ring1Op, transform: [{ rotateZ: ring1Deg }] },
        ]}>
          <View style={[s.ringDot, { backgroundColor: 'rgba(176,132,245,0.7)' }]} />
        </Animated.View>

        {/* Data nodes */}
        {NODES.map((node, i) => {
          const rad = (node.angle * Math.PI) / 180;
          return (
            <Animated.View
              key={i}
              style={[
                s.dataNode,
                {
                  transform: [
                    { translateX: Math.cos(rad) * node.r },
                    { translateY: Math.sin(rad) * node.r },
                    { scale: nodeScales[i] },
                  ],
                  opacity: nodeOps[i],
                },
              ]}
            >
              <Text style={s.nodeEmoji}>{node.emoji}</Text>
              <Text style={s.nodeLabel}>{node.label}</Text>
              <Text style={s.nodeAmount}>{node.amount}</Text>
            </Animated.View>
          );
        })}

        {/* Central orb */}
        <Animated.View style={{ transform: [{ scale: orbScale }, { scale: orbPulse }], opacity: orbOp }}>
          <LinearGradient
            colors={['#9b59f5', '#7c3aed', '#6d28d9']}
            style={[s.orb, { width: ORB_R * 2, height: ORB_R * 2, borderRadius: ORB_R }]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.25)', 'transparent']}
              start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={s.orbText}>AI</Text>
          </LinearGradient>
        </Animated.View>
      </View>

      {/* Chat section */}
      <View style={s.chatSection}>
        {/* User question */}
        <Animated.View style={[s.questionBubble, { opacity: questionOp, transform: [{ translateX: questionX }] }]}>
          <Text style={s.questionText}>How much did I spend on food this month?</Text>
        </Animated.View>

        {/* Typing / answer */}
        {showTyping && (
          <View style={s.answerBubble}>
            <TypingDots />
          </View>
        )}
        {showAnswer && (
          <Animated.View style={[s.answerBubble, { opacity: answerOp, transform: [{ translateY: answerY }] }]}>
            <Text style={s.answerText}>Here's your food breakdown for April:</Text>
            <View style={s.statsTable}>
              {[
                ['Jollibee',  '₱185'],
                ['Samgyup',   '₱2,000'],
                ['Grab Food', '₱640'],
                ['Total',     '₱2,825'],
              ].map(([label, val], i) => (
                <View key={i} style={[s.statsRow, i === 3 && s.statsRowTotal]}>
                  <Text style={[s.statsLabel, i === 3 && s.statsTotalLabel]}>{label}</Text>
                  <Text style={[s.statsVal,   i === 3 && s.statsTotalVal]}>{val}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Pills */}
        <View style={s.pillsRow}>
          <Animated.View style={[s.pill, { opacity: pill1Op, transform: [{ translateX: pill1X }] }]}>
            <Text style={s.pillText}>✦ Budget Alerts</Text>
          </Animated.View>
          <Animated.View style={[s.pill, { opacity: pill2Op, transform: [{ translateX: pill2X }] }]}>
            <Text style={s.pillText}>✦ Spend Insights</Text>
          </Animated.View>
        </View>

        {/* Input hint */}
        <Animated.View style={[s.inputHint, { opacity: hintOp }]}>
          <Text style={s.inputPlaceholder}>Ask Fino anything…</Text>
          <Text style={s.inputArrow}>↑</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1,   duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 4 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[s.typingDot, { opacity: d }]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e0b18' },

  header: { paddingTop: 60, paddingHorizontal: 28, paddingBottom: 8 },
  eyebrow: {
    fontSize: 11, fontWeight: '700', color: 'rgba(176,132,245,0.5)',
    letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 10,
  },
  title: {
    fontFamily: 'Nunito_900Black', fontSize: 28, color: 'white',
    lineHeight: 32, letterSpacing: -0.8,
  },

  arenaWrap: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  ring: {
    position: 'absolute',
    borderWidth: 1, borderColor: 'rgba(176,132,245,0.2)',
    borderStyle: 'dashed',
  },
  ringDot: {
    position: 'absolute', top: -3,
    alignSelf: 'center',
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dataNode: {
    position: 'absolute', alignItems: 'center',
    backgroundColor: 'rgba(176,132,245,0.12)',
    borderWidth: 1, borderColor: 'rgba(176,132,245,0.25)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, minWidth: 72,
  },
  nodeEmoji:  { fontSize: 16 },
  nodeLabel:  { fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  nodeAmount: { fontSize: 10, fontFamily: 'DMMono_400Regular', color: '#b084f5', marginTop: 1 },
  orb: {
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#9b59f5', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 30, elevation: 20,
  },
  orbText: {
    fontFamily: 'Nunito_900Black', fontSize: 18, color: 'white', letterSpacing: -0.5,
  },

  chatSection: { flex: 1, paddingHorizontal: 18, paddingBottom: 100, gap: 8, justifyContent: 'flex-end' },
  questionBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(176,132,245,0.2)',
    borderWidth: 1, borderColor: 'rgba(176,132,245,0.35)',
    borderRadius: 16, borderBottomRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: W * 0.75,
  },
  questionText: { fontSize: 13, color: 'white', lineHeight: 19 },
  answerBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: W * 0.85,
  },
  answerText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 18, marginBottom: 7 },
  statsTable: { gap: 3 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 20 },
  statsRowTotal: {
    borderTopWidth: 1, borderTopColor: 'rgba(176,132,245,0.2)',
    marginTop: 2, paddingTop: 3,
  },
  statsLabel:     { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  statsVal:       { fontSize: 11, fontFamily: 'DMMono_400Regular', color: 'rgba(255,255,255,0.7)' },
  statsTotalLabel:{ fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  statsTotalVal:  { fontFamily: 'DMMono_400Regular', color: '#b084f5', fontWeight: '700' },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },

  pillsRow: { flexDirection: 'row', gap: 8 },
  pill: {
    backgroundColor: 'rgba(176,132,245,0.15)',
    borderWidth: 1, borderColor: 'rgba(176,132,245,0.3)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: '#b084f5', letterSpacing: 0.4 },

  inputHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(176,132,245,0.2)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  inputPlaceholder: { fontSize: 13, color: 'rgba(255,255,255,0.25)' },
  inputArrow: { fontSize: 16, color: 'rgba(176,132,245,0.5)' },
});
