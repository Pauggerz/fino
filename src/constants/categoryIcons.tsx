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
    paths: (
      <Path
        fill="#CURRENT"
        d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"
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
    // redeem / gift card
    paths: (
      <Path
        fill="#CURRENT"
        d="M23 12v-2h-3.28c.17-.52.28-1.06.28-1.63C20 5.56 17.42 3 14.25 3c-1.7 0-3.21.8-4.25 2.05C8.96 3.8 7.45 3 5.75 3 2.58 3 0 5.56 0 8.37c0 .57.11 1.11.28 1.63H0v2h11v-2.5h2V12h10zM14.25 5c1.76 0 3.25 1.46 3.25 3.37 0 .64-.23 1.44-.66 1.63H11.6c-.43-.19-.6-1-.6-1.63C11 6.46 12.5 5 14.25 5zM5.75 5C7.5 5 9 6.46 9 8.37c0 .64-.17 1.44-.6 1.63H4.16C3.73 9.81 3.5 9 3.5 8.37 3.5 6.46 5 5 5.75 5zM2 20c0 1.1.9 2 2 2h7v-8H2v6zm11 2h7c1.1 0 2-.9 2-2v-6h-9v8z"
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
    // pets — paw print
    paths: (
      <Path
        fill="#CURRENT"
        d="M4.5 9.5C5.88 9.5 7 8.38 7 7s-1.12-2.5-2.5-2.5S2 5.62 2 7s1.12 2.5 2.5 2.5zm5-3C10.88 6.5 12 5.38 12 4s-1.12-2.5-2.5-2.5S7 2.62 7 4s1.12 2.5 2.5 2.5zm5 0c1.38 0 2.5-1.12 2.5-2.5S15.88 1.5 14.5 1.5 12 2.62 12 4s1.12 2.5 2.5 2.5zm5 3c1.38 0 2.5-1.12 2.5-2.5s-1.12-2.5-2.5-2.5S17 5.62 17 7s1.12 2.5 2.5 2.5zm-2.96 4.06c-.84-1-1.43-1.96-2.13-2.83-.62-.78-1.23-1.49-2.05-1.91-.95-.49-1.86-.49-2.81 0-.81.42-1.42 1.13-2.04 1.91-.7.87-1.29 1.83-2.13 2.83-1.27 1.5-3.49 4.06-2.59 6.06.9 1.99 3.16 2.13 5.27 1.49.84-.25 1.73-.84 2.96-.84s2.13.59 2.96.84c2.11.64 4.37.5 5.27-1.49.9-2-1.32-4.56-2.59-6.06z"
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
