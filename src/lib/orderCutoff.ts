/**
 * Order cutoff logic: Thursday 6 PM ET each week.
 * Orders placed after cutoff apply to the following week's delivery.
 */

const CUTOFF_DAY = 4; // Thursday (0 = Sunday)
const CUTOFF_HOUR = 18; // 6 PM

export function getNextCutoff(): Date {
  const now = new Date();
  const cutoff = new Date(now);

  // Set to this week's Thursday 6 PM ET
  const currentDay = cutoff.getDay();
  let daysUntilThursday = (CUTOFF_DAY - currentDay + 7) % 7;

  // If it's Thursday but past 6 PM, move to next Thursday
  if (daysUntilThursday === 0) {
    const etHour = getETHour(cutoff);
    if (etHour >= CUTOFF_HOUR) {
      daysUntilThursday = 7;
    }
  }

  cutoff.setDate(cutoff.getDate() + daysUntilThursday);

  // Set to 6 PM ET (approximate via UTC offset — ET is UTC-5 or UTC-4 during DST)
  // Using toLocaleString to get accurate ET time
  const etString = cutoff.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);
  const offsetMs = cutoff.getTime() - etDate.getTime();
  cutoff.setHours(CUTOFF_HOUR, 0, 0, 0);
  cutoff.setTime(cutoff.getTime() + offsetMs);

  return cutoff;
}

function getETHour(date: Date): number {
  const etString = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(etString, 10);
}

export function isBeforeCutoff(): boolean {
  return new Date() < getNextCutoff();
}

export function getTimeUntilCutoff(): { days: number; hours: number; minutes: number } | null {
  const now = new Date();
  const cutoff = getNextCutoff();
  const diff = cutoff.getTime() - now.getTime();

  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes };
}

export function formatCutoffCountdown(): string {
  const time = getTimeUntilCutoff();
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
