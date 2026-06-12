// Legacy currency formatter. Defaults to PHP for backward compat with screens
// that haven't migrated to `useCurrency().format()` yet. New code should pull
// from CurrencyContext so user-selected currency propagates everywhere.

import { getCurrencyMeta } from './currency';

let activeCode = 'PHP';
// App-wide privacy mode. When on, every fmtPeso() call masks the amount so a
// single Settings toggle hides money everywhere without touching call sites.
// Kept in sync with CurrencyContext via _setPrivacyMode().
let privacyMode = false;

/** Internal — called by CurrencyProvider whenever the user changes currency. */
export function _setActiveCurrencyCode(code: string) {
  activeCode = code;
}

/** Internal — called by CurrencyProvider when the privacy toggle flips. */
export function _setPrivacyMode(on: boolean) {
  privacyMode = on;
}

export default function fmtPeso(
  n: number,
  isPrivacyMode: boolean = false
): string {
  const meta = getCurrencyMeta(activeCode);
  if (isPrivacyMode || privacyMode) return `${meta.symbol}***`;
  return `${meta.symbol}${Math.abs(n).toLocaleString(meta.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}
