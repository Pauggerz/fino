// src/constants/theme.ts
export const colors = {
  // Core
  primary: '#5B8C6E', // --p
  primaryDark: '#3f6b52', // --pd
  primaryLight: '#EBF2EE', // --pl
  background: '#F7F5F2', // --bg
  white: '#FFFFFF',
  // Accent
  coral: '#E8856A', // --coral
  coralLight: '#FBF0EC', // --coral-l
  coralDark: '#C0503A', // --exp
  // Lavender (AI surfaces)
  lavender: '#C9B8F5', // --lav
  lavenderLight: '#F0ECFD', // --lav-l ← AI field bg, MUST NOT be swapped with background
  lavenderDark: '#4B2DA3', // AI label colour, ✦ prefix
  // Semantic
  peach: '#FFD6C2',
  mint: '#A8D5B5',
  textPrimary: '#1E1E2E', // --t1
  textSecondary: '#8A8A9A', // --t2
  expenseRed: '#C0503A',
  incomeGreen: '#3f6b52',
  insightPurple: '#4B2DA3',
  greetingPurple: '#7B5EA7', // two-tone name: "[Name]!" colour
  // Account brand colours (from prototype acct-card-icon backgrounds)
  accountCash: '#1C9E4B',
  accountGCash: '#007DFF',
  accountBDO: '#CC0000',
  accountMaya: '#F5841F',
  accountGoTyme: '#00C07B',
  accountBPI: '#B22222',
  // Category tile backgrounds (from prototype cat-tile inline styles)
  catFoodBg: '#FDF6E3',
  catFoodText: '#C97A20',
  catTransportBg: '#EEF6FF',
  catTransportText: '#3A80C0',
  catShoppingBg: '#FFF0F3',
  catShoppingText: '#C0503A',
  catBillsBg: '#F3EFFF',
  catBillsBg2: '#eeebf8',
  catBillsText: '#7A4AB8',
  catHealthBg: '#EFF8F2',
  catHealthText: '#2d6a4f',
  // Category pill colours (from .pill-food, .pill-transport etc.)
  pillFoodBg: '#faeeda',
  pillFoodBorder: '#BA7517',
  pillFoodText: '#633806',
  pillTransportBg: '#ddeeff',
  pillTransportBorder: '#2E7AB8',
  pillTransportText: '#0A3D6B',
  pillShoppingBg: '#ffe0ec',
  pillShoppingBorder: '#C0503A',
  pillShoppingText: '#7A0A3D',
  pillBillsBg: '#ede5ff',
  pillBillsBorder: '#7A4AB8',
  pillBillsText: '#3A0A7A',
  pillHealthBg: '#e8f5ee',
  pillHealthBorder: '#2d6a4f',
  pillHealthText: '#27500A',
  // Stats bar colours (from cat-breakdown-row fills)
  statUnderBar: '#3A80C0',
  statWarnBar: '#BA7517',
  statOverBar: '#C0503A',
  statBillsBar: '#7A4AB8',
  // AI chat colours
  chatAIBubbleBg: '#EEEDFE',
  chatAIBubbleBorder: '#AFA9EC',
  chatAIText: '#26215C',
  chatAILabel: '#534AB7',
  chatUserBg: '#2d6a4f',
  // Merchant tag colours (from .acct-tag-*)
  tagGCashBg: '#e1f0fb',
  tagGCashText: '#185FA5',
  tagCashBg: '#e8f5ee',
  tagCashText: '#27500A',
  tagBDOBg: '#FCEBEB',
  tagBDOText: '#791F1F',
  tagMayaBg: '#FAEEDA',
  tagMayaText: '#633806',
  // On-track status pill
  onTrackBg1: '#EFF8F2',
  onTrackBg2: '#d4eddf',
  onTrackTitle: '#2a5a3d',
  onTrackSub: '#5B8C6E',
  // Stats hero card
  statsHeroBg1: '#2d4a3e',
  statsHeroBg2: '#1a3028',
  statsHeroBar: '#97C459',
  // Bill reminder
  billCardBg: '#fff8f0',
  billCardBorder: '#EF9F27',
  billTagText: '#BA7517',
  
  // Sync status
  syncSynced: '#10B981',
  syncSyncing: '#F59E0B',
  syncOffline: '#EF4444',
  // Fallbacks
  catTileEmptyBg: '#F5F5F5',
  catIconEmpty: '#888780',
  // Home Screen specific
  heroCardBg: '#2a4f3a',
  heroCardShadow: '#1a3028',
  cardShadow: '#1E1E2E',
  staleDataBg: 'rgba(239, 68, 68, 0.15)',
  staleDataText: '#FCA5A5',
  // Transparencies
  primaryTransparent30: 'rgba(91,140,110,0.3)',
  primaryTransparent50: 'rgba(91,140,110,0.5)',
  primaryLight25: 'rgba(168,213,181,0.25)',
  primaryLight60: 'rgba(168,213,181,0.6)',
  whiteTransparent07: 'rgba(255,255,255,0.07)',
  whiteTransparent12: 'rgba(255,255,255,0.12)',
  whiteTransparent15: 'rgba(255,255,255,0.15)',
  whiteTransparent18: 'rgba(255,255,255,0.18)',
  whiteTransparent30: 'rgba(255,255,255,0.3)',
  whiteTransparent55: 'rgba(255,255,255,0.55)',
  whiteTransparent65: 'rgba(255,255,255,0.65)',
  whiteTransparent80: 'rgba(255,255,255,0.8)',
  blackTransparent15: 'rgba(0,0,0,0.15)',
  cardBorderTransparent: 'rgba(30,30,46,0.08)',
  onTrackBorder: 'rgba(45,106,79,0.15)',
  catOverBadgeBg: 'rgba(192,80,58,0.12)',
  insightCardBorder: 'rgba(201,184,245,0.35)',
};

export const spacing = {
  screenPadding: 20,
  sectionGap: 28,
  cardPadding: 20,
  rowGap: 12,
  iconToText: 10,
  touchTargetMin: 44,
  tabBarHeight: 82,
  statusBarHeight: 47,
};

export const radius = {
  heroCard: 28, // hero-card-wrap
  card: 16, // acct-card, more-acct-card, cat-breakdown
  cardLg: 20, // stats-hero, detail-hero
  categoryTile: 28, // cat-tile border-radius from prototype
  button: 16, // btn-p
  pill: 9999, // wallet-chip, filter-chip, prompt-chip
  input: 16, // amount-display, sheet-panel
  sheet: 24, // sheet-panel border-radius
  pill20: 20, // type-btn, date-pill
  chatBubbleAI: [4, 16, 16, 16],
  chatBubbleUser: [16, 4, 16, 16],
};

export const gradients = {
  primaryHero: ['#4a7a5e', '#5B8C6E', '#6a9e7f'], // FAB, hero card (blobs), primary btn
  statsHero: ['#2d4a3e', '#1a3028'], // stats-hero card
  onTrack: ['#EFF8F2', '#d4eddf'], // on-track status pill
} as const;