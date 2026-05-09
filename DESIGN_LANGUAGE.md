# Fino Design Language

A comprehensive reference for the visual and interaction design of Fino — a personal finance app built with React Native.

---

## Principles

1. **Warm tonality** — Light and dark modes avoid clinical whites/blacks. The palette uses warm off-white (#F7F5F2) and warm near-black (#0E0E10) as base surfaces.
2. **Layered elevation** — Depth is communicated through stacked shadows, not borders alone. Surfaces rise gradually from background → card → sheet → overlay.
3. **Spring-driven motion** — Interactions respond with spring physics (damping 16–18, stiffness 200–260). Motion feels alive but never sloppy.
4. **Semantic color** — Category, status, and brand colors carry consistent meaning across light and dark modes.
5. **Financial clarity** — Numbers use DM Mono; large amounts are rendered at display scale with tight negative tracking.
6. **44 px floor** — All interactive touch targets meet or exceed 44 px for accessibility.

---

## Color

### Accent Themes

Fino supports seven accent themes. Each replaces the `primary` token.

| Theme | Primary |
|---|---|
| Forest (default) | `#5B8C6E` |
| Ocean | `#3A7BD5` |
| Violet | `#7B5EA7` |
| Rose | `#C96B8A` |
| Amber | `#B87A20` |
| Sunset | `#E07A5F` |
| Slate | `#4A7FA5` |

### Light Mode

| Token | Value |
|---|---|
| `primary` | `#5B8C6E` |
| `primaryDark` | `#3f6b52` |
| `primaryLight` | `#EBF2EE` |
| `background` | `#F7F5F2` |
| `surface` (card) | `#FFFFFF` |
| `surfaceSubdued` | `#F0EFEA` |
| `border` | `#e0dfd7` |
| `borderCard` | `rgba(30,30,46,0.08)` |
| `textPrimary` | `#1E1E2E` |
| `textSecondary` | `#8A8A9A` |

### Dark Mode

| Token | Value |
|---|---|
| `primary` | `#5DB87E` |
| `primaryDark` | `#3D8A5E` |
| `primaryLight` | `#172A1E` |
| `background` | `#0E0E10` |
| `surface` (card) | `#18181C` |
| `surfaceSubdued` | `#202024` |
| `border` | `#28282E` |
| `textPrimary` | `#EEEAE4` |
| `textSecondary` | `#88888F` |

### Semantic Colors

| Token | Light | Dark |
|---|---|---|
| Expense | `#C0503A` | `#C0503A` |
| Income | `#3f6b52` | `#5DB87E` |
| AI / Insight | `#4B2DA3` | `#C9B8F5` |
| Lavender surface | `#F0ECFD` | `#1E1530` |
| Coral | `#E8856A` | — |
| Coral surface | `#FBF0EC` | — |
| Sync: synced | `#10B981` | — |
| Sync: syncing | `#F59E0B` | — |
| Sync: offline | `#EF4444` | — |

### Category Colors

Each category has a background, border, and text color pair for pills and tile variants.

| Category | Pill bg | Pill border | Pill text |
|---|---|---|---|
| Food | `#faeeda` | `#BA7517` | `#633806` |
| Transport | `#ddeeff` | `#2E7AB8` | `#0A3D6B` |
| Shopping | `#ffe0ec` | `#C0503A` | `#7A0A3D` |
| Bills | `#ede5ff` | `#7A4AB8` | `#3A0A7A` |
| Health | `#e8f5ee` | `#2d6a4f` | `#27500A` |

### Account Brand Colors

| Account | Color |
|---|---|
| Cash | `#1C9E4B` |
| GCash | `#007DFF` |
| BDO | `#CC0000` |
| Maya | `#F5841F` |
| GoTyme | `#00C07B` |
| BPI | `#B22222` |

### Transparency Palette

| Token | Value |
|---|---|
| white07 | `rgba(255,255,255,0.07)` |
| white12 | `rgba(255,255,255,0.12)` |
| white30 | `rgba(255,255,255,0.30)` |
| white55 | `rgba(255,255,255,0.55)` |
| white80 | `rgba(255,255,255,0.80)` |
| black15 | `rgba(0,0,0,0.15)` |
| primary30 | `rgba(91,140,110,0.30)` |
| primary50 | `rgba(91,140,110,0.50)` |

---

## Typography

### Typefaces

| Family | Weights | Role |
|---|---|---|
| **Nunito** | 700, 800, 900 | Display — large amounts, headings, brand watermarks |
| **Inter** | 400, 500, 600, 700 | UI — labels, buttons, body copy |
| **DM Mono** | 400, 500 | Financial numbers — balances, masked PANs |

### Size Scale

| px | Usage |
|---|---|
| 10 | Small pill labels |
| 11 | Card body text |
| 12 | Tags, secondary info |
| 13 | Standard body |
| 14 | Body large, buttons |
| 15 | Primary button text |
| 16 | Action buttons |
| 17 | Sheet headers |
| 18 | Subheadings |
| 20 | Small headings |
| 22 | Section headings, wallet card brand name |
| 24 | Wallet card balance |
| 28 | Card headers |
| 32 | Balance card amount |
| 36 | Cash flow net amount |
| 40–56 | Amount display (responsive clamp) |

### Letter Spacing

Positive tracking for labels and UI chrome; negative tracking for financial figures and display text.

| Value | Used on |
|---|---|
| `2px` | Typeface labels, caps |
| `1.2px` | Bar labels, card titles |
| `1px` | Chip labels, numpad rows |
| `0.6px` | Beta pill, button text |
| `0.4px` | Tab labels, category pills |
| `0.2px` | Status bar text |
| `−0.2px` | Sheet titles |
| `−0.5px` | Wallet card balance |
| `−1px` | Cash flow net amount |
| `−1.5px` | Amount display |
| `−2px` | Watermark text |

---

## Spacing & Layout

### Global Tokens

| Token | Value |
|---|---|
| `screenPadding` | 20 px |
| `sectionGap` | 28 px |
| `cardPadding` | 20 px |
| `rowGap` | 12 px |
| `iconToText` | 10 px |
| `touchTargetMin` | 44 px |
| `tabBarHeight` | 82 px |
| `statusBarHeight` | 47 px |

### Common Spacing Values

`4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 28`

---

## Border Radius

| Token | Value | Used on |
|---|---|---|
| `pill` | 9999 px | Chips, pills, toggles |
| `heroCard` | 28 px | Hero cards, category tiles |
| `sheet` | 24 px | Bottom sheets (top corners) |
| `cardLarge` | 20 px | Large cards |
| `card` | 16 px | Standard cards, buttons, inputs |
| `input` | 12 px | Form fields, chips |
| `iconBox` | 10 px | Icon containers |
| `badge` | 4 px | Small inline badges |
| Chat bubble (AI) | `[4, 16, 16, 16]` | Top-left flat |
| Chat bubble (user) | `[16, 4, 16, 16]` | Top-right flat |

---

## Shadows & Elevation

### Shadow Tokens

| Component | Offset | Opacity | Radius | Elevation |
|---|---|---|---|---|
| Wallet card | (0, 16) | 0.42 | 24 | 14 |
| FAB | (0, 6) | 0.28 | 14 | 14 |
| Tab bar pill | (0, 8) | 0.12 | 20 | 16 |
| Speed-dial pills | (0, 8) | 0.18 | 18 | 10 |
| Toast | (0, 6) | 0.35 | 24 | 10 |
| EMV chip | (0, 1) | 0.30 | 3 | — |

### Elevation Scale

| Level | Usage |
|---|---|
| 1–2 | Subtle cards |
| 3 | Interactive elements |
| 4 | Prominent containers |
| 6 | Active selection |
| 8 | Modal sheets |
| 14–16 | FAB, tab bar pill |
| 20 | Full-screen overlays |

---

## Animation

### Timing Constants

| Name | Duration |
|---|---|
| Chip select | 160 ms |
| AI mapping confirm | 200 ms |
| Sheet dismiss (swipe) | 220 ms |
| Toast enter | 220 ms |
| Sheet dismiss (save) | 280 ms |
| Slide out | 280 ms |
| AI mapping debounce | 300 ms |
| Parsing reveal | 300 ms |
| Sheet open | 340 ms |
| Balance update | 400 ms |
| Skeleton pulse | 800 ms |
| Toast auto-dismiss | 3500 ms |

### Easing Functions

| Name | Curve | Used on |
|---|---|---|
| Sheet spring | `cubic-bezier(0.22, 1, 0.36, 1)` | Bottom sheet open |
| Bounce spring | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Chips, amount pulse |
| Swift exit | `cubic-bezier(0.55, 0, 1, 0.45)` | Dismiss transitions |
| Smooth fade | `Easing.inOut(Easing.ease)` | Skeleton loaders |

### Reanimated Spring Presets

| Preset | Damping | Stiffness | Mass |
|---|---|---|---|
| Standard | 16 | 220 | 0.55 |
| Tight | 18 | 200 | — |

---

## Components

### Wallet Card

A landscape payment card rendered per account brand.

- **Shape** — aspect ratio ~1.586, 22 px corner radius (scaled)
- **Surface** — 3-stop `LinearGradient` per brand; frosted overlay strips
- **Chip** — EMV gold rectangle, 5 px radius, with inset lines and shadow
- **NFC arcs** — 3 concentric arcs, top-right corner
- **PAN** — `●●●●  ●●●●  ●●●●  XXXX` in DM Mono, 13 px, white 80%
- **Balance** — DM Mono Bold, 24 px, white, −0.5 px tracking
- **Watermark** — brand name at 180 px, Nunito Black, white 07%
- **Shadow** — (0, 16, 24) opacity 0.42, elevation 14

### Tab Bar Pill

Floating navigation bar fixed above the bottom safe area.

- **Height** — 64 px, 100 px border-radius
- **Items** — 4 tabs (Home, Transactions, Reports, More)
- **Active indicator** — scaled icon + label, primary color
- **FAB** — 64 px circle positioned above pill center; opens speed-dial on hold
- **Speed-dial** — 3 action pills spring in with staggered delay

### Bottom Sheet

Modal surface anchored to bottom of screen.

- **Top corners** — 24–28 px radius
- **Grabber** — 38 × 5 px, fully rounded, textSecondary color, centered 8 px from top
- **Max height** — 92 vh
- **Backdrop** — semi-transparent with 2 px blur
- **Open animation** — sheet spring, 340 ms

### Cards

| Variant | Radius | Notes |
|---|---|---|
| Hero | 28 px | Gradient fill, balance display |
| Standard | 16 px | White/surface fill, hairline border |
| Large | 20 px | Section containers |

### Category Tiles

Grid cells showing spend by category.

- **Shape** — 28 px radius square
- **Anatomy** — icon (top) + name + amount; optional wave-fill overlay
- **Badge** — percent or "Over!" label, absolute top-right

### Chips & Pills

Inline selectable elements.

- **Shape** — fully rounded (9999 px)
- **States** — resting, selected (scale 1.04, spring bounce), pressed (opacity 0.8)
- **Anatomy** — optional leading icon/avatar + label + optional trailing badge

### Buttons

| Variant | Height | Radius | Notes |
|---|---|---|---|
| Primary | 50 px | 16 px | Solid primary fill |
| Icon | 36–38 px | 10 px | Square icon container |
| FAB | 64 px | 32 px | Circle, elevated |

### Inputs

- **Height** — 50 px standard
- **Radius** — 16 px (form) / 9999 px (amount display)
- **Focus state** — gradient border

### Toast

Notification overlay displayed at top of screen.

- **Position** — 56 px from top, horizontally centered
- **Radius** — 14 px
- **Icon box** — 28 × 28 px, 14 px radius
- **Auto-dismiss** — 3500 ms

### Skeleton Loaders

Placeholders shown during async loads.

- **Animation** — opacity pulses 0.3 → 0.7 → 0.3, 800 ms, `Easing.inOut(Easing.ease)`, infinite
- **Color** — `surfaceSubdued` token

---

## Icons

### Icon Library

Uses **Ionicons** for system icons.

| Category | Icons |
|---|---|
| Navigation | `home`, `receipt`, `bar-chart`, `grid` |
| Transaction | `add`, `add-circle`, `cash-outline`, `repeat`, `refresh` |
| Action | `search`, `pencil-outline`, `trash`, `close`, `image-outline` |
| Status | `checkmark`, `checkmark-circle`, `alert-circle` |
| Brand | `logo-apple`, `logo-google` |
| Misc | `leaf`, `wallet`, `scan-outline`, `cloud-offline-outline` |

Custom SVG category icons (24 × 24 viewBox) cover: Food, Transport, Shopping, Bills, Health, Salary, Allowance, Freelance, Business, Gifts, and more. Paths use current theme primary/category colors.

### Icon Sizes

| px | Role |
|---|---|
| 14 | Small badges |
| 18 | Inline action |
| 20 | Grid items |
| 22 | Navigation tabs |
| 24 | Pill avatars, category icons |
| 28 | FAB, chat |
| 32–38 | Avatar / icon boxes |

---

## Source Files

| File | Contents |
|---|---|
| [src/constants/theme.ts](src/constants/theme.ts) | Color and spacing tokens, radius scale |
| [src/constants/transitions.ts](src/constants/transitions.ts) | Animation durations and spring presets |
| [src/constants/iconLibrary.ts](src/constants/iconLibrary.ts) | Category swatches and tile configs |
| [src/constants/categoryIcons.tsx](src/constants/categoryIcons.tsx) | Custom SVG category icon definitions |
| [src/contexts/ThemeContext.tsx](src/contexts/ThemeContext.tsx) | Theme provider, accent theme switching |
| [src/components/WalletCard.tsx](src/components/WalletCard.tsx) | Wallet card with per-brand configs |
| [src/components/TabBar.tsx](src/components/TabBar.tsx) | Floating tab bar and speed-dial FAB |
