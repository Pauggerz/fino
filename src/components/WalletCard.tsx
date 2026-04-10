/**
 * WalletCard — premium landscape payment-card for the Home screen.
 *
 * Styling lifted directly from onboarding/AccountsSlide:
 *   - Full 3-stop LinearGradient per brand
 *   - Gold EMV chip (silver for Maya) + contactless NFC arcs
 *   - Masked PAN: ● ● ● ●  ● ● ● ●  ● ● ● ●  XXXX
 *   - DM Mono tabular balance display
 *   - Per-brand bg decorations: GCash/Cash watermark letter, BDO geometric
 *     blocks, BPI radial glow + crest, Maya neon right-edge strip
 */

import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Account } from '@/types';

// ── Dimensions ──────────────────────────────────────────────────────────────
const { width: W } = Dimensions.get('window');
// 75 % of screen width so the next card peeks in from the right edge
export const CARD_WIDTH = Math.round(W * 0.75);
export const CARD_HEIGHT = Math.round(CARD_WIDTH * 0.625); // ISO/IEC 7810 ~1.6 ratio

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtBalance(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `−₱${abs}` : `₱${abs}`;
}

/** Deterministic 4-char token derived from the account UUID tail. */
function pseudo4(id: string): string {
  return id.replace(/-/g, '').slice(-4).toUpperCase();
}

// ── Contactless NFC icon — 3 concentric open arcs (right-facing) ─────────────
function NfcIcon({ color = 'rgba(255,255,255,0.5)' }: { color?: string }) {
  const SZ = 18;
  const cx = SZ / 2;
  const cy = SZ / 2;
  const arcs: Array<{ key: string; r: number; sw: number }> = [
    { key: 'sm', r: 4, sw: 1.4 },
    { key: 'md', r: 7, sw: 1.3 },
    { key: 'lg', r: 10, sw: 1.2 },
  ];
  return (
    <Svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
      {arcs.map(({ key, r, sw }) => {
        const a0 = -55 * (Math.PI / 180);
        const a1 = 55 * (Math.PI / 180);
        const x1 = cx + r * Math.cos(a0);
        const y1 = cy + r * Math.sin(a0);
        const x2 = cx + r * Math.cos(a1);
        const y2 = cy + r * Math.sin(a1);
        return (
          <SvgPath
            key={key}
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

// ── Per-brand visual config ───────────────────────────────────────────────────
interface CardCfg {
  grad: [string, string, string];
  typeLabel: string;
  watermark?: string;
  accentColor?: string; // overrides white on brand name + balance text
  silverChip?: boolean;
  isMaya?: boolean;
  isBDO?: boolean;
  isBPI?: boolean;
}

const BRAND_CFGS: Record<string, CardCfg> = {
  GCash: {
    grad: ['#0055c4', '#0041a0', '#002d7a'],
    typeLabel: 'E-WALLET',
    watermark: 'G',
  },
  Maya: {
    grad: ['#111111', '#0e0e0e', '#141414'],
    typeLabel: 'E-WALLET',
    accentColor: '#3DD68C',
    silverChip: true,
    isMaya: true,
  },
  BDO: {
    grad: ['#44aadf', '#1568c8', '#071e60'],
    typeLabel: 'BANK ACCOUNT',
    isBDO: true,
  },
  BPI: {
    grad: ['#cc2929', '#881010', '#6e0a0a'],
    typeLabel: 'BANK ACCOUNT',
    isBPI: true,
  },
  Cash: {
    grad: ['#1e3d2f', '#163224', '#0f2419'],
    typeLabel: 'CASH WALLET',
    watermark: '₱',
    accentColor: '#A8D5B5',
  },
  GoTyme: {
    grad: ['#00a860', '#007d45', '#005a30'],
    typeLabel: 'E-WALLET',
    watermark: 'G',
  },
  Seabank: {
    grad: ['#0073b1', '#005080', '#003055'],
    typeLabel: 'BANK ACCOUNT',
    watermark: 'S',
  },
};

function getCfg(acc: Account): CardCfg {
  if (BRAND_CFGS[acc.name]) return BRAND_CFGS[acc.name];
  const c = acc.brand_colour || '#2a2a3e';
  return {
    grad: [c, c, c],
    typeLabel: (acc.type || 'ACCOUNT').toUpperCase(),
    watermark: (acc.letter_avatar || acc.name.charAt(0)).toUpperCase(),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WalletCard({ account }: { account: Account }) {
  const cfg = getCfg(account);
  const token = pseudo4(account.id);
  const isNeg = account.balance < 0;
  const balColor = isNeg
    ? 'rgba(255,175,155,0.95)'
    : (cfg.accentColor ?? 'white');

  return (
    // Shadow wrapper — overflow: visible so iOS drop-shadow renders
    <View style={s.shadow}>
      <LinearGradient
        colors={cfg.grad}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.card}
      >
        {/* Base gloss sheen */}
        <LinearGradient
          colors={['rgba(255,255,255,0.14)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Maya — neon right-edge strip */}
        {cfg.isMaya && (
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
            style={s.mayaStrip}
          />
        )}

        {/* BDO — translucent geometric frames */}
        {cfg.isBDO && (
          <>
            <View
              style={[
                s.bdoBlock,
                { width: 100, height: 100, top: 14, right: -22 },
              ]}
            />
            <View
              style={[
                s.bdoBlock,
                { width: 74, height: 74, top: 70, right: 12 },
              ]}
            />
            <View
              style={[
                s.bdoBlock,
                { width: 52, height: 52, top: 116, right: 2 },
              ]}
            />
            <View
              style={[
                s.bdoBlock,
                { width: 40, height: 40, top: 62, right: 74 },
              ]}
            />
            <Text style={s.bdoWm}>BDO</Text>
          </>
        )}

        {/* BPI — radial glow + heraldic crest */}
        {cfg.isBPI && (
          <>
            <View style={s.bpiGlow} />
            <View style={s.bpiGlow2} />
            <View style={s.bpiCrest}>
              <Text style={s.bpiCrown}>♛</Text>
              <View style={{ flexDirection: 'row', gap: 3, marginTop: 2 }}>
                <Text style={s.bpiIcon}>🦁</Text>
                <Text style={s.bpiIcon}>🌻</Text>
              </View>
            </View>
          </>
        )}

        {/* Letter watermark (GCash → G, Cash → ₱ …) */}
        {cfg.watermark && <Text style={s.watermark}>{cfg.watermark}</Text>}

        {/* Top-right: gold EMV chip + NFC arcs */}
        <View style={s.hardware}>
          <LinearGradient
            colors={
              cfg.silverChip
                ? ['#dce0e8', '#a8b0bc', '#cdd2da', '#8c96a2']
                : ['#f0d060', '#c8961e', '#e8c040', '#b07818']
            }
            style={s.chip}
          >
            <View style={s.chipH} />
            <View style={[s.chipH, { top: '50%' as any }]} />
            <View style={s.chipV} />
            <View style={[s.chipV, { left: '50%' as any }]} />
          </LinearGradient>
          <NfcIcon
            color={
              cfg.silverChip
                ? 'rgba(255,255,255,0.55)'
                : 'rgba(255,255,255,0.5)'
            }
          />
        </View>

        {/* Card content */}
        <View style={s.body}>
          {/* Brand name + type */}
          <View>
            <Text
              style={[
                s.brandName,
                cfg.accentColor ? { color: cfg.accentColor } : {},
              ]}
              numberOfLines={1}
            >
              {account.name}
            </Text>
            <Text style={s.typeLabel}>{cfg.typeLabel}</Text>
          </View>

          {/* Masked PAN */}
          <View style={s.panRow}>
            {(['g0', 'g1', 'g2'] as const).map((g) => (
              <View key={g} style={s.dotGroup}>
                {(['d0', 'd1', 'd2', 'd3'] as const).map((d) => (
                  <View key={d} style={s.dot} />
                ))}
              </View>
            ))}
            <Text style={s.last4}>{token}</Text>
          </View>

          {/* Balance */}
          <View style={s.balanceBlock}>
            <Text style={s.balLabel}>TOTAL BALANCE</Text>
            <Text style={[s.balanceAmt, { color: balColor }]}>
              {fmtBalance(account.balance)}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shadow: {
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.42,
    shadowRadius: 24,
    elevation: 14,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 22,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },

  // Maya
  mayaStrip: {
    position: 'absolute',
    top: '8%',
    right: 0,
    width: 2,
    height: '84%',
  },

  // BDO
  bdoBlock: {
    position: 'absolute',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bdoWm: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    fontFamily: 'Nunito_900Black',
    fontSize: 48,
    color: 'rgba(255,255,255,0.06)',
    letterSpacing: -2,
  },

  // BPI
  bpiGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -36,
    right: -36,
    backgroundColor: 'rgba(220,60,60,0.38)',
  },
  bpiGlow2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    bottom: 14,
    left: -18,
    backgroundColor: 'rgba(200,30,30,0.20)',
  },
  bpiCrest: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    opacity: 0.1,
  },
  bpiCrown: { fontSize: 28, color: 'white', lineHeight: 32 },
  bpiIcon: { fontSize: 18, color: 'white' },

  // Watermark
  watermark: {
    position: 'absolute',
    fontFamily: 'Nunito_900Black',
    fontSize: 180,
    color: 'rgba(255,255,255,0.05)',
    bottom: -36,
    right: -8,
    lineHeight: 180,
  },

  // Hardware
  hardware: {
    position: 'absolute',
    top: 22,
    right: 20,
    alignItems: 'flex-end',
    gap: 7,
  },
  chip: {
    width: 38,
    height: 28,
    borderRadius: 5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  chipH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    top: '33%',
  },
  chipV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    left: '33%',
  },

  // Card body
  body: {
    flex: 1,
    justifyContent: 'space-between',
  },
  brandName: {
    fontFamily: 'Nunito_900Black',
    fontSize: 22,
    color: 'white',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  typeLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
  },
  panRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  dotGroup: { flexDirection: 'row', gap: 3.5 },
  dot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  last4: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2,
  },
  balanceBlock: {
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  balLabel: {
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
    marginBottom: 5,
  },
  balanceAmt: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 24,
    color: 'white',
    letterSpacing: -0.5,
    lineHeight: 27,
  },
});
