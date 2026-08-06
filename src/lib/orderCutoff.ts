/**
 * Order cutoff logic: Thursday at exactly 6 PM America/New_York.
 *
 * A fulfillment cycle runs Monday through Sunday. Once the current cycle's
 * Thursday cutoff has passed, getNextCutoff points to the following Thursday
 * while the status API continues to report that this cycle is closed.
 */

export const ORDER_TIME_ZONE = 'America/New_York';

const CUTOFF_ISO_DAY = 4; // Thursday (Monday = 1, Sunday = 7)
const CUTOFF_HOUR = 18;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

const NEW_YORK_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: ORDER_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface ZonedDateTimeParts extends CalendarDate {
  hour: number;
  minute: number;
  second: number;
}

export interface CutoffTimeRemaining {
  days: number;
  hours: number;
  minutes: number;
}

export interface OrderCutoffStatus {
  currentCycleCutoff: Date;
  nextCutoff: Date;
  isCurrentCycleCutoffPassed: boolean;
  timeUntilCurrentCycleCutoff: CutoffTimeRemaining | null;
}

function getNewYorkDateTimeParts(date: Date): ZonedDateTimeParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};

  for (const part of NEW_YORK_DATE_TIME_FORMATTER.formatToParts(date)) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second'
    ) {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    second: values.second!,
  };
}

function getTimeZoneOffsetMilliseconds(date: Date): number {
  const parts = getNewYorkDateTimeParts(date);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const instantWithoutMilliseconds = Math.floor(date.getTime() / 1000) * 1000;

  return representedAsUtc - instantWithoutMilliseconds;
}

/** Converts an unambiguous New York wall-clock time into its UTC instant. */
function newYorkDateTimeToInstant(date: CalendarDate, hour: number): Date {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0, 0);
  let candidate = wallClockAsUtc;

  // Re-evaluate the offset because the first candidate can be on the other
  // side of a daylight-saving transition from the requested wall-clock time.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = getTimeZoneOffsetMilliseconds(new Date(candidate));
    const adjustedCandidate = wallClockAsUtc - offset;

    if (adjustedCandidate === candidate) break;
    candidate = adjustedCandidate;
  }

  return new Date(candidate);
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));

  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

function getIsoDay(date: CalendarDate): number {
  const utcDay = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

function toTimeRemaining(milliseconds: number): CutoffTimeRemaining {
  const days = Math.floor(milliseconds / MILLISECONDS_PER_DAY);
  const hours = Math.floor((milliseconds % MILLISECONDS_PER_DAY) / MILLISECONDS_PER_HOUR);
  const minutes = Math.floor((milliseconds % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE);

  return { days, hours, minutes };
}

export function getOrderCutoffStatus(now: Date = new Date()): OrderCutoffStatus {
  const newYorkNow = getNewYorkDateTimeParts(now);
  const today = { year: newYorkNow.year, month: newYorkNow.month, day: newYorkNow.day };
  const currentCycleThursday = addCalendarDays(today, CUTOFF_ISO_DAY - getIsoDay(today));
  const currentCycleCutoff = newYorkDateTimeToInstant(currentCycleThursday, CUTOFF_HOUR);
  const isCurrentCycleCutoffPassed = now.getTime() >= currentCycleCutoff.getTime();
  const nextCutoff = isCurrentCycleCutoffPassed
    ? newYorkDateTimeToInstant(addCalendarDays(currentCycleThursday, 7), CUTOFF_HOUR)
    : currentCycleCutoff;
  const timeUntilCurrentCycleCutoff = isCurrentCycleCutoffPassed
    ? null
    : toTimeRemaining(currentCycleCutoff.getTime() - now.getTime());

  return {
    currentCycleCutoff,
    nextCutoff,
    isCurrentCycleCutoffPassed,
    timeUntilCurrentCycleCutoff,
  };
}

export function getNextCutoff(now: Date = new Date()): Date {
  return getOrderCutoffStatus(now).nextCutoff;
}

export function isBeforeCutoff(now: Date = new Date()): boolean {
  return !getOrderCutoffStatus(now).isCurrentCycleCutoffPassed;
}

export function getTimeUntilCutoff(now: Date = new Date()): CutoffTimeRemaining | null {
  return getOrderCutoffStatus(now).timeUntilCurrentCycleCutoff;
}

export function formatCutoffCountdown(now: Date = new Date()): string {
  const time = getTimeUntilCutoff(now);
  if (!time) return 'Cutoff passed — orders apply to next week';

  const parts: string[] = [];
  if (time.days > 0) parts.push(`${time.days}d`);
  if (time.hours > 0) parts.push(`${time.hours}h`);
  parts.push(`${time.minutes}m`);

  return parts.join(' ');
}

/** Fulfillment method */
export type FulfillmentMethod = 'delivery' | 'pickup';

/** Delivery window labels */
export const DROPOFF_WINDOWS = [
  { value: '9am-11am', label: '9:00 AM – 11:00 AM' },
  { value: '11am-1pm', label: '11:00 AM – 1:00 PM' },
  { value: '1pm-3pm', label: '1:00 PM – 3:00 PM' },
  { value: '3pm-5pm', label: '3:00 PM – 5:00 PM' },
  { value: '5pm-7pm', label: '5:00 PM – 7:00 PM' },
] as const;

/** Pickup window labels */
export const PICKUP_WINDOWS = [
  { value: 'pickup-10am-12pm', label: '10:00 AM – 12:00 PM' },
  { value: 'pickup-12pm-2pm', label: '12:00 PM – 2:00 PM' },
  { value: 'pickup-2pm-4pm', label: '2:00 PM – 4:00 PM' },
] as const;

export type DropoffWindow = typeof DROPOFF_WINDOWS[number]['value'];
export type PickupWindow = typeof PICKUP_WINDOWS[number]['value'];
export type FulfillmentWindow = DropoffWindow | PickupWindow;
