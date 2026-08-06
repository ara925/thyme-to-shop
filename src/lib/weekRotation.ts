import { getOrderCutoffStatus } from './orderCutoff';

/**
 * Determines the current week in the three-week menu rotation.
 *
 * The rotation changes at midnight in America/New_York. Calendar-date math is
 * used deliberately so a visitor's local timezone and daylight-saving changes
 * cannot move the menu into another week.
 */

const MENU_TIME_ZONE = 'America/New_York';
const WEEK_A_START = { year: 2026, month: 3, day: 16 } as const;
const WEEKS = ['week-a', 'week-b', 'week-c'] as const;
const WEEK_LABELS = { 'week-a': 'Week 1', 'week-b': 'Week 2', 'week-c': 'Week 3' } as const;
const DAYS_PER_WEEK = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const NEW_YORK_DATE_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: MENU_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type WeekTag = typeof WEEKS[number];

function getNewYorkCalendarDate(date: Date): CalendarDate {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};

  for (const part of NEW_YORK_DATE_FORMATTER.formatToParts(date)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
  };
}

function toCalendarDayNumber(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) / MILLISECONDS_PER_DAY;
}

export function getCurrentWeekTag(now: Date = new Date()): WeekTag {
  const newYorkToday = getNewYorkCalendarDate(now);
  const differenceInDays = toCalendarDayNumber(newYorkToday) - toCalendarDayNumber(WEEK_A_START);
  const differenceInWeeks = Math.floor(differenceInDays / DAYS_PER_WEEK);
  const index = ((differenceInWeeks % WEEKS.length) + WEEKS.length) % WEEKS.length;

  return WEEKS[index];
}

export function getCurrentWeekLabel(now: Date = new Date()): string {
  return WEEK_LABELS[getCurrentWeekTag(now)];
}

export function getNextWeekTag(week: WeekTag): WeekTag {
  return WEEKS[(WEEKS.indexOf(week) + 1) % WEEKS.length];
}

export function getWeekLabel(week: WeekTag): string {
  return WEEK_LABELS[week];
}

export function getOrderableWeekTag(now: Date = new Date()): WeekTag {
  const currentWeek = getCurrentWeekTag(now);
  return getOrderCutoffStatus(now).isCurrentCycleCutoffPassed
    ? getNextWeekTag(currentWeek)
    : currentWeek;
}

export function getOrderableWeekLabel(now: Date = new Date()): string {
  return getWeekLabel(getOrderableWeekTag(now));
}
