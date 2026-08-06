/**
 * Determines the current week in the 3-week rotation (A, B, C).
 * Anchored to a known Week A start date. Cycles every 3 weeks.
 */

const BUSINESS_TIME_ZONE = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_A_START_DAY = Date.UTC(2026, 2, 16); // Monday of a known Week A
const WEEKS = ['week-a', 'week-b', 'week-c'] as const;
const WEEK_LABELS = { 'week-a': 'Week 1', 'week-b': 'Week 2', 'week-c': 'Week 3' } as const;

const businessDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export type WeekTag = typeof WEEKS[number];

function getBusinessCalendarDay(now: Date): number {
  const parts = businessDateFormatter.formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  if (![year, month, day].every(Number.isFinite)) {
    throw new Error('The current menu week could not be determined.');
  }
  return Date.UTC(year, month - 1, day);
}

export function getCurrentWeekTag(now: Date = new Date()): WeekTag {
  const diffDays = Math.floor((getBusinessCalendarDay(now) - WEEK_A_START_DAY) / DAY_MS);
  const diffWeeks = Math.floor(diffDays / 7);
  const index = ((diffWeeks % 3) + 3) % 3; // handles negative too
  return WEEKS[index];
}

export function getCurrentWeekLabel(now: Date = new Date()): string {
  return WEEK_LABELS[getCurrentWeekTag(now)];
}
