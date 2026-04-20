export default function fmtPeso(
  n: number,
  isPrivacyMode: boolean = false
): string {
  if (isPrivacyMode) return '₱***';
  return `₱${Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}
