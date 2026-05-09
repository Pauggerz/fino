import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/contexts/ThemeContext';
import { FinoIntelIcon } from '@/components/icons/FinoIntelIcon';

const AUTO_ADVANCE_MS = 2500;
const HORIZONTAL_MARGIN = 20;

type ToolCardProps = {
  width: number;
  badge: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaIcon?: keyof typeof Ionicons.glyphMap;
  iconNode: React.ReactNode;
  bgLight: string;
  accentLight: string;
  textLight: string;
  bgDark: string;
  accentDark: string;
  textDark: string;
  blobLight: { primary: string; secondary: string };
  blobDark: { primary: string; secondary: string };
  layerLight: string;
  layerDark: string;
  borderLight: string;
  borderDark: string;
  shadowColor: string;
  onPress: () => void;
};

function ToolCard({
  width,
  badge,
  title,
  subtitle,
  ctaText,
  ctaIcon = 'arrow-forward',
  iconNode,
  bgLight,
  accentLight,
  textLight,
  bgDark,
  accentDark,
  textDark,
  blobLight,
  blobDark,
  layerLight,
  layerDark,
  borderLight,
  borderDark,
  shadowColor,
  onPress,
}: ToolCardProps) {
  const { isDark } = useTheme();

  const bg = isDark ? bgDark : bgLight;
  const accent = isDark ? accentDark : accentLight;
  const text = isDark ? textDark : textLight;
  const blobs = isDark ? blobDark : blobLight;
  const layer = isDark ? layerDark : layerLight;
  const border = isDark ? borderDark : borderLight;

  return (
    <View style={{ width, paddingHorizontal: 0 }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={[
          styles.card,
          {
            borderColor: border,
            shadowColor,
            shadowOpacity: isDark ? 0.3 : 0.12,
          },
        ]}
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg }]} />
        <View style={[styles.blob1, { backgroundColor: blobs.primary }]} />
        <View style={[styles.blob2, { backgroundColor: blobs.secondary }]} />

        <View style={styles.cardLeft}>
          <View style={[styles.badge, { backgroundColor: layer }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{badge}</Text>
          </View>
          <Text style={[styles.title, { color: text }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.sub, { color: accent }]} numberOfLines={2}>
            {subtitle}
          </Text>
          <View style={[styles.cta, { backgroundColor: layer }]}>
            <Text style={[styles.ctaText, { color: text }]}>{ctaText}</Text>
            <Ionicons name={ctaIcon} size={13} color={text} />
          </View>
        </View>

        <View style={[styles.iconWrap, { backgroundColor: layer }]}>
          {iconNode}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function ToolsCarousel({
  insight,
  title,
}: {
  insight?: { headline: string; body: string } | null;
  title?: string;
}) {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();

  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const userInteractingRef = useRef(false);

  const slides = [
    {
      key: 'fino',
      badge: 'POWERED BY FINO INTELLIGENCE',
      title: insight ? insight.headline : 'Ask Fino',
      subtitle: insight
        ? insight.body
        : 'Your AI money coach. Ask anything about your finances.',
      ctaText: 'Start chatting',
      iconNode: (
        <FinoIntelIcon
          size={48}
          color={isDark ? '#C9B8F5' : colors.lavenderDark}
          filled
        />
      ),
      bgLight: colors.lavenderLight,
      accentLight: colors.insightPurple,
      textLight: colors.lavenderDark,
      bgDark: '#1A1426',
      accentDark: 'rgba(220,210,255,0.7)',
      textDark: '#E8E0FF',
      blobLight: {
        primary: 'rgba(201,184,245,0.4)',
        secondary: 'rgba(201,184,245,0.25)',
      },
      blobDark: {
        primary: 'rgba(176,154,224,0.12)',
        secondary: 'rgba(176,154,224,0.07)',
      },
      layerLight: 'rgba(75,45,163,0.1)',
      layerDark: 'rgba(176,154,224,0.18)',
      borderLight: 'rgba(75,45,163,0.1)',
      borderDark: 'rgba(176,154,224,0.2)',
      shadowColor: isDark ? '#4B2DA3' : '#7B5EA7',
      onPress: () => navigation.navigate('ChatScreen'),
    },
    {
      key: 'splitter',
      badge: 'BILL SPLITTER',
      title: 'Split a Receipt',
      subtitle: 'Divide shared expenses among friends in a few taps.',
      ctaText: 'Split a bill',
      iconNode: (
        <Ionicons name="receipt" size={42} color={isDark ? '#F5B8A8' : '#C0503A'} />
      ),
      bgLight: '#FFE9DD',
      accentLight: '#A4432F',
      textLight: '#7A2F1F',
      bgDark: '#2A1410',
      accentDark: 'rgba(245,184,168,0.7)',
      textDark: '#FFE0D2',
      blobLight: {
        primary: 'rgba(192,80,58,0.18)',
        secondary: 'rgba(192,80,58,0.1)',
      },
      blobDark: {
        primary: 'rgba(192,80,58,0.18)',
        secondary: 'rgba(192,80,58,0.09)',
      },
      layerLight: 'rgba(192,80,58,0.12)',
      layerDark: 'rgba(192,80,58,0.22)',
      borderLight: 'rgba(192,80,58,0.15)',
      borderDark: 'rgba(192,80,58,0.3)',
      shadowColor: isDark ? '#A33D2A' : '#C0503A',
      onPress: () => navigation.navigate('BillSplitter'),
    },
    {
      key: 'utang',
      badge: 'DEBT TRACKER',
      title: 'Track Who Owes You',
      subtitle: 'Keep a record of all debts and payments over time.',
      ctaText: 'Track debt',
      iconNode: (
        <Ionicons name="cash" size={42} color={isDark ? '#7FE0B8' : '#0A8F66'} />
      ),
      bgLight: '#DDF7EB',
      accentLight: '#0A8F66',
      textLight: '#0A5C42',
      bgDark: '#0A1F18',
      accentDark: 'rgba(127,224,184,0.7)',
      textDark: '#D2FFE8',
      blobLight: {
        primary: 'rgba(16,185,129,0.18)',
        secondary: 'rgba(16,185,129,0.1)',
      },
      blobDark: {
        primary: 'rgba(16,185,129,0.18)',
        secondary: 'rgba(16,185,129,0.09)',
      },
      layerLight: 'rgba(16,185,129,0.12)',
      layerDark: 'rgba(16,185,129,0.22)',
      borderLight: 'rgba(16,185,129,0.15)',
      borderDark: 'rgba(16,185,129,0.3)',
      shadowColor: isDark ? '#0A8F66' : '#10B981',
      onPress: () => navigation.navigate('UtangTracker'),
    },
    {
      key: 'education',
      badge: 'FINANCIAL EDUCATION',
      title: 'Level Up Your Money',
      subtitle: 'Bite-sized modules to grow your financial literacy.',
      ctaText: 'Learn more',
      iconNode: (
        <Ionicons name="book" size={42} color={isDark ? '#A8C8F0' : '#2D6BA8'} />
      ),
      bgLight: '#DDEDFF',
      accentLight: '#2D6BA8',
      textLight: '#1B4774',
      bgDark: '#0D1825',
      accentDark: 'rgba(168,200,240,0.7)',
      textDark: '#D6E7FF',
      blobLight: {
        primary: 'rgba(58,128,192,0.18)',
        secondary: 'rgba(58,128,192,0.1)',
      },
      blobDark: {
        primary: 'rgba(58,128,192,0.18)',
        secondary: 'rgba(58,128,192,0.09)',
      },
      layerLight: 'rgba(58,128,192,0.12)',
      layerDark: 'rgba(58,128,192,0.22)',
      borderLight: 'rgba(58,128,192,0.15)',
      borderDark: 'rgba(58,128,192,0.3)',
      shadowColor: isDark ? '#2D6BA8' : '#3A80C0',
      onPress: () => navigation.navigate('FinancialEducation'),
    },
  ];

  // Auto-advance every 2.5 seconds. Loops back to the first slide after the last.
  useEffect(() => {
    if (containerWidth === 0) return;
    const timer = setInterval(() => {
      if (userInteractingRef.current) return;
      const next = (indexRef.current + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * containerWidth, animated: true });
      indexRef.current = next;
      setActiveIndex(next);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [containerWidth, slides.length]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    indexRef.current = idx;
    setActiveIndex(idx);
    userInteractingRef.current = false;
  };

  return (
    <View style={styles.container}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.sectionDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{title}</Text>
          </View>
        </View>
      ) : null}

      <View
        style={styles.scrollOuter}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => {
            userInteractingRef.current = true;
          }}
          onMomentumScrollEnd={onMomentumScrollEnd}
          decelerationRate="fast"
        >
          {containerWidth > 0 &&
            slides.map((s) => (
              <ToolCard
                key={s.key}
                width={containerWidth}
                badge={s.badge}
                title={s.title}
                subtitle={s.subtitle}
                ctaText={s.ctaText}
                iconNode={s.iconNode}
                bgLight={s.bgLight}
                accentLight={s.accentLight}
                textLight={s.textLight}
                bgDark={s.bgDark}
                accentDark={s.accentDark}
                textDark={s.textDark}
                blobLight={s.blobLight}
                blobDark={s.blobDark}
                layerLight={s.layerLight}
                layerDark={s.layerDark}
                borderLight={s.borderLight}
                borderDark={s.borderDark}
                shadowColor={s.shadowColor}
                onPress={s.onPress}
              />
            ))}
        </ScrollView>
      </View>

      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.dot,
              {
                backgroundColor: i === activeIndex ? colors.primary : colors.border,
                width: i === activeIndex ? 18 : 6,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_MARGIN,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  sectionLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  scrollOuter: {
    marginHorizontal: HORIZONTAL_MARGIN,
  },
  card: {
    borderRadius: 24,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    overflow: 'hidden',
    borderWidth: 1,
    minHeight: 170,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 20,
    elevation: 8,
  },
  blob1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -40,
    right: -30,
  },
  blob2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    bottom: -20,
    left: 40,
  },
  cardLeft: {
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 26,
    letterSpacing: -0.3,
    marginBottom: 6,
    lineHeight: 30,
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 14,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  ctaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
