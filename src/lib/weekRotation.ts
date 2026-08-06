/**
 * Determines the current week in the 3-week rotation (A, B, C).
 * Anchored to a known Week A start date. Cycles every 3 weeks.
 */

const WEEK_A_START = new Date('2026-03-16'); // Monday of a known Week A
const WEEKS = ['week-a', 'week-b', 'week-c'] as const;
const WEEK_LABELS = { 'week-a': 'Week 1', 'week-b': 'Week 2', 'week-c': 'Week 3' } as const;

export type WeekTag = typeof WEEKS[number];

export function getCurrentWeekTag(): WeekTag {
  const now = new Date();
  const diffMs = now.getTime() - WEEK_A_START.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const index = ((diffWeeks % 3) + 3) % 3; // handles negative too
  return WEEKS[index];
}

export function getCurrentWeekLabel(): string {
  return WEEK_LABELS[getCurrentWeekTag()];
}
