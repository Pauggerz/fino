function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Reused across feed rows. Constructing Intl.DateTimeFormat is ~100× slower
// than .format() on an existing instance.
const TIME_FMT = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit',
});

const SECTION_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/* eslint-disable import/prefer-default-export */

/**
 * Returns "Today", "Yesterday", or a short date string like "Mon, Mar 22"
 * for a given ISO date string.
 */
export function formatSectionTitle(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();

  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return SECTION_DATE_FMT.format(date);
}

export function formatRowTime(isoDate: string): string {
  return TIME_FMT.format(new Date(isoDate));
}
