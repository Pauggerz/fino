// Legacy currency formatter. Defaults to PHP for backward compat with screens
// that haven't migrated to `useCurrency().format()` yet. New code should pull
// from CurrencyContext so user-selected currency propagates everywhere.

import { getCurrencyMeta } from './currency';

let activeCode = 'PHP';

/** Internal — called by CurrencyProvider whenever the user changes currency. */
export function _setActiveCurrencyCode(code: string) {
  activeCode = code;
}

export default function fmtPeso(
  n: number,
  isPrivacyMode: boolean = false
): string {
  const meta = getCurrencyMeta(activeCode);
  if (isPrivacyMode) return `${meta.symbol}***`;
  return `${meta.symbol}${Math.abs(n).toLocaleString(meta.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}
