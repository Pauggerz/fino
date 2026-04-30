import React from 'react';
import { Path } from 'react-native-svg';

export interface CategoryIconConfig {
  paths: React.ReactNode;
  viewBox?: string;
}

// Filled icon SVG paths per category key
export const CATEGORY_ICON_PATHS: Record<string, CategoryIconConfig> = {
  food: {
    viewBox: '0 0 24 24',
    paths: (
      <Path
        fill="#CURRENT"
        d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8-15.03-8-15.03 0h15.03zM1.02 17h15v2h-15z"
      />
    ),
  },
  transport: {
    viewBox: '0 0 24 24',
    paths: (
      <Path
        fill="#CURRENT"
        d="M17 5H3c-1.1 0-2 .89-2 2v9h2c0 1.65 1.34 3 3 3s3-1.35 3-3h5.5c0 1.65 1.34 3 3 3s3-1.35 3-3H23v-5l-6-6zM3 11V7h4v4H3zm3 6.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm7-6.5H9V7h4v4zm4.5 6.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM15 11V7h1l4 4h-5z"
      />
    ),
  },
  shopping: {
    viewBox: '0 0 24 24',
    paths: (
      <Path
        fill="#CURRENT"
        d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm0 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
      />
    ),
  },
  bills: {
    viewBox: '0 0 24 24',
    // receipt — long bill paper with zigzag edges (replaces the previous
    // credit-card glyph which read as "card" rather than "bill").
    paths: (
      <Path
        fill="#CURRENT"
        d="M3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20zm3-7h12v2H6v-2zm0-4h12v2H6v-2zm0-4h12v2H6V7z"
      />
    ),
  },
  health: {
    viewBox: '0 0 24 24',
    paths: (
      <Path
        fill="#CURRENT"
        d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"
      />
    ),
  },
  // ── Income categories ────────────────────────────────────────────────────────
  salary: {
    viewBox: '0 0 24 24',
    // monetization_on — coin with currency symbol
    paths: (
      <Path
        fill="#CURRENT"
        d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"
      />
    ),
  },
  allowance: {
    viewBox: '0 0 24 24',
    // account_balance_wallet
    paths: (
      <Path
        fill="#CURRENT"
        d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
      />
    ),
  },
  freelance: {
    viewBox: '0 0 24 24',
    // laptop_mac
    paths: (
      <Path
        fill="#CURRENT"
        d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"
      />
    ),
  },
  business: {
    viewBox: '0 0 24 24',
    // store / storefront
    paths: (
      <Path
        fill="#CURRENT"
        d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z"
      />
    ),
  },
  gifts: {
    viewBox: '0 0 24 24',
    // card_giftcard — gift box with center ribbon and two bow loops on top
    paths: (
      <Path
        fill="#CURRENT"
        d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5h-7V8h7v6zm-9 0H4V8h7v6z"
      />
    ),
  },
  investment: {
    viewBox: '0 0 24 24',
    // trending_up
    paths: (
      <Path
        fill="#CURRENT"
        d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"
      />
    ),
  },
  // ── Custom category icons (picker library) ──────────────────────────────────
  // Filled Material-Symbols paths, single 24×24 viewBox, single Path, mirrors
  // the visual weight of the existing five so all rows look uniform.
  others: {
    viewBox: '0 0 24 24',
    // category — triangle/circle/square trio (also used as the visual default
    // for any unrecognised key once the user creates a custom category).
    paths: (
      <Path
        fill="#CURRENT"
        d="M12 2l-5.5 9h11L12 2zm5.5 11c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zM3 21.5h8v-8H3v8z"
      />
    ),
  },
  car: {
    viewBox: '0 0 24 24',
    // directions_car
    paths: (
      <Path
        fill="#CURRENT"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    ),
  },
  home: {
    viewBox: '0 0 24 24',
    // home — solid roof + door
    paths: (
      <Path
        fill="#CURRENT"
        d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
      />
    ),
  },
  entertainment: {
    viewBox: '0 0 24 24',
    // movie — clapperboard
    paths: (
      <Path
        fill="#CURRENT"
        d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"
      />
    ),
  },
  education: {
    viewBox: '0 0 24 24',
    // school — graduation cap
    paths: (
      <Path
        fill="#CURRENT"
        d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"
      />
    ),
  },
  fitness: {
    viewBox: '0 0 24 24',
    // fitness_center — dumbbell
    paths: (
      <Path
        fill="#CURRENT"
        d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"
      />
    ),
  },
  travel: {
    viewBox: '0 0 24 24',
    // flight — airplane
    paths: (
      <Path
        fill="#CURRENT"
        d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
      />
    ),
  },
  pet: {
    viewBox: '0 0 24 24',
    // pets — paw print: 4 toe pads in arc + 1 large heel pad below.
    // Explicit M commands for each subpath so renderers don't get tripped
    // up by relative-move math producing off-canvas coords.
    paths: (
      <Path
        fill="#CURRENT"
        d="M4.5 9.5C5.88 9.5 7 8.38 7 7s-1.12-2.5-2.5-2.5S2 5.62 2 7s1.12 2.5 2.5 2.5zM9.5 6.5C10.88 6.5 12 5.38 12 4s-1.12-2.5-2.5-2.5S7 2.62 7 4s1.12 2.5 2.5 2.5zM14.5 6.5C15.88 6.5 17 5.38 17 4s-1.12-2.5-2.5-2.5S12 2.62 12 4s1.12 2.5 2.5 2.5zM19.5 9.5C20.88 9.5 22 8.38 22 7s-1.12-2.5-2.5-2.5S17 5.62 17 7s1.12 2.5 2.5 2.5zM17.34 14.86c-.87-1.02-1.6-1.89-2.48-2.91-.46-.54-1.05-1.08-1.75-1.32-.11-.04-.22-.07-.33-.09-.25-.04-.52-.04-.78-.04s-.53 0-.79.05c-.11.02-.22.05-.33.09-.7.24-1.28.78-1.75 1.32-.87 1.02-1.6 1.89-2.48 2.91-1.31 1.55-2.92 3.36-2.62 5.55.32 1.43 1.34 2.16 2.45 2.31.83.11 3.28-.65 5.07-.65h.18c1.79 0 4.24.76 5.07.65 1.11-.15 2.13-.88 2.45-2.31.3-2.19-1.31-4-2.62-5.55z"
      />
    ),
  },
  subscription: {
    viewBox: '0 0 24 24',
    // subscriptions — stacked rectangles with play arrow
    paths: (
      <Path
        fill="#CURRENT"
        d="M20 8H4V6h16v2zm-2-6H6v2h12V2zm4 10v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-8c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2zm-6 4l-6-3.27v6.53L16 16z"
      />
    ),
  },
  coffee: {
    viewBox: '0 0 24 24',
    // local_cafe — coffee cup with handle and saucer
    paths: (
      <Path
        fill="#CURRENT"
        d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.9 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4v-2z"
      />
    ),
  },
  groceries: {
    viewBox: '0 0 24 24',
    // shopping_cart — cart with two wheels
    paths: (
      <Path
        fill="#CURRENT"
        d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"
      />
    ),
  },
  phone: {
    viewBox: '0 0 24 24',
    // smartphone — mobile phone with screen
    paths: (
      <Path
        fill="#CURRENT"
        d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-4 2h-2v-1h2v1z"
      />
    ),
  },
  fuel: {
    viewBox: '0 0 24 24',
    // local_gas_station — gas pump
    paths: (
      <Path
        fill="#CURRENT"
        d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"
      />
    ),
  },
  clothing: {
    viewBox: '0 0 24 24',
    // checkroom — coat hanger
    paths: (
      <Path
        fill="#CURRENT"
        d="M21.6 18.2L13 11.75v-.91c1.65-.49 2.8-2.17 2.43-4.05-.26-1.31-1.3-2.4-2.61-2.7C10.54 3.57 8.5 5.3 8.5 7.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .84-.69 1.52-1.53 1.5-.54-.01-.97.45-.97.99v1.76L2.4 18.2c-.77.58-.36 1.8.6 1.8h18c.96 0 1.37-1.22.6-1.8zM6 18l6-4.5 6 4.5H6z"
      />
    ),
  },
  books: {
    viewBox: '0 0 24 24',
    // menu_book — open book
    paths: (
      <Path
        fill="#CURRENT"
        d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"
      />
    ),
  },
  drinks: {
    viewBox: '0 0 24 24',
    // local_bar — martini glass with olive
    paths: (
      <Path
        fill="#CURRENT"
        d="M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7L5.66 5h12.69l-1.78 2H7.43z"
      />
    ),
  },
  gaming: {
    viewBox: '0 0 24 24',
    // sports_esports — game controller
    paths: (
      <Path
        fill="#CURRENT"
        d="M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19h.49c.65 0 1.27-.26 1.73-.72L9 16.5h6l1.84 1.78c.46.46 1.08.72 1.73.72h.49c1.55 0 2.74-1.37 2.52-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"
      />
    ),
  },
  beauty: {
    viewBox: '0 0 24 24',
    // content_cut — scissors
    paths: (
      <Path
        fill="#CURRENT"
        d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z"
      />
    ),
  },
  charity: {
    viewBox: '0 0 24 24',
    // favorite — filled heart. Universal symbol for giving / care.
    // Replaces a previous volunteer_activism path whose multiple
    // disjoint sub-shapes did not coalesce into a recognisable glyph.
    paths: (
      <Path
        fill="#CURRENT"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    ),
  },
  // Fallback for any custom category the user creates whose key isn't in
  // the picker library (e.g. legacy data) — same triangle/circle/square as `others`.
  default: {
    viewBox: '0 0 24 24',
    paths: (
      <Path
        fill="#CURRENT"
        d="M12 2l-5.5 9h11L12 2zm5.5 11c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zM3 21.5h8v-8H3v8z"
      />
    ),
  },
};
