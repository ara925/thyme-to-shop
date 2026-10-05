/**
 * Order cutoff logic: end of Friday in Pacific time.
 *
 * The client's phrase "Friday at midnight" is represented unambiguously as
 * Saturday 12:00 AM America/Los_Angeles (the instant immediately after Friday
 * 11:59:59 PM). A fulfillment cycle runs Monday through Sunday. Once the
 * current cycle's cutoff has passed, getNextCutoff points to the next cycle's
 * cutoff while the status API continues to report this cycle as closed.
 */

export const ORDER_TIME_ZONE = 'America/Los_Angeles';
export const ORDER_CUTOFF_LABEL = 'Friday at 11:59 PM PT';
export const ORDER_CUTOFF_CLOSED_MESSAGE =
  'The Friday 11:59 PM PT order cutoff has passed. Online ordering is closed for this delivery cycle.';
export const FULFILLMENT_SETUP_BANNER_MESSAGE =
  'Local ordering setup is in progress · Delivery and pickup checkout are not open yet';

export function getCutoffBannerMessage(
  fulfillmentReady: boolean,
  cutoffPassed: boolean,
): string {
  if (!fulfillmentReady) return FULFILLMENT_SETUP_BANNER_MESSAGE;
  return cutoffPassed
    ? ORDER_CUTOFF_CLOSED_MESSAGE
    : `Order by ${ORDER_CUTOFF_LABEL} · Monday or Tuesday Orange County delivery`;
}

const CUTOFF_ISO_DAY = 6; // Saturday (Monday = 1, Sunday = 7)
const CUTOFF_HOUR = 0;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

const BUSINESS_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
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

function getBusinessDateTimeParts(date: Date): ZonedDateTimeParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};

  for (const part of BUSINESS_DATE_TIME_FORMATTER.formatToParts(date)) {
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
  const parts = getBusinessDateTimeParts(date);
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

/** Converts an unambiguous business-local wall-clock time into its UTC instant. */
function businessDateTimeToInstant(date: CalendarDate, hour: number): Date {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0, 0);
  let candidate = wallClockAsUtc;

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
  const businessNow = getBusinessDateTimeParts(now);
  const today = { year: businessNow.year, month: businessNow.month, day: businessNow.day };
  const currentCycleCutoffDay = addCalendarDays(today, CUTOFF_ISO_DAY - getIsoDay(today));
  const currentCycleCutoff = businessDateTimeToInstant(currentCycleCutoffDay, CUTOFF_HOUR);
  const isCurrentCycleCutoffPassed = now.getTime() >= currentCycleCutoff.getTime();
  const nextCutoff = isCurrentCycleCutoffPassed
    ? businessDateTimeToInstant(addCalendarDays(currentCycleCutoffDay, 7), CUTOFF_HOUR)
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

/** The next instant when local ordering changes between open and closed. */
export function getNextOrderAvailabilityTransition(now: Date = new Date()): Date {
  const status = getOrderCutoffStatus(now);
  if (!status.isCurrentCycleCutoffPassed) return status.currentCycleCutoff;

  const businessNow = getBusinessDateTimeParts(now);
  const today = { year: businessNow.year, month: businessNow.month, day: businessNow.day };
  const nextMonday = addCalendarDays(today, 8 - getIsoDay(today));
  return businessDateTimeToInstant(nextMonday, 0);
}

export function getTimeUntilCutoff(now: Date = new Date()): CutoffTimeRemaining | null {
  return getOrderCutoffStatus(now).timeUntilCurrentCycleCutoff;
}

export function formatCutoffCountdown(now: Date = new Date()): string {
  const time = getTimeUntilCutoff(now);
  if (!time) return ORDER_CUTOFF_CLOSED_MESSAGE;

  const parts: string[] = [];
  if (time.days > 0) parts.push(`${time.days}d`);
  if (time.hours > 0) parts.push(`${time.hours}h`);
  parts.push(`${time.minutes}m`);
  return parts.join(' ');
}

export type FulfillmentMethod = 'delivery' | 'pickup';
