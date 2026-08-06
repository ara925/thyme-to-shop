import { describe, expect, it } from 'vitest';
import {
  formatCutoffCountdown,
  getNextCutoff,
  getOrderCutoffStatus,
  getTimeUntilCutoff,
  isBeforeCutoff,
} from '@/lib/orderCutoff';

describe('Thursday 6 PM New York order cutoff', () => {
  it('stays open immediately before cutoff and closes at exactly 6 PM ET', () => {
    const immediatelyBefore = new Date('2026-03-12T21:59:59.999Z');
    const exactCutoff = new Date('2026-03-12T22:00:00.000Z');

    expect(isBeforeCutoff(immediatelyBefore)).toBe(true);
    expect(getOrderCutoffStatus(immediatelyBefore).isCurrentCycleCutoffPassed).toBe(false);
    expect(isBeforeCutoff(exactCutoff)).toBe(false);
    expect(getOrderCutoffStatus(exactCutoff).isCurrentCycleCutoffPassed).toBe(true);
    expect(getTimeUntilCutoff(exactCutoff)).toBeNull();
    expect(getNextCutoff(exactCutoff).toISOString()).toBe('2026-03-19T22:00:00.000Z');
  });

  it('is independent of the visitor timezone at the Warsaw/New York boundary', () => {
    // These instants are 10:59:59 PM and 11:00 PM in Warsaw, but 5:59:59 PM
    // and 6:00 PM in New York after the US spring DST transition.
    expect(isBeforeCutoff(new Date('2026-03-12T21:59:59.000Z'))).toBe(true);
    expect(isBeforeCutoff(new Date('2026-03-12T22:00:00.000Z'))).toBe(false);
  });

  it('keeps a passed state Friday through Sunday while pointing to next Thursday', () => {
    const friday = new Date('2026-03-13T16:00:00.000Z');
    const sunday = new Date('2026-03-15T16:00:00.000Z');

    for (const now of [friday, sunday]) {
      const status = getOrderCutoffStatus(now);

      expect(status.currentCycleCutoff.toISOString()).toBe('2026-03-12T22:00:00.000Z');
      expect(status.nextCutoff.toISOString()).toBe('2026-03-19T22:00:00.000Z');
      expect(status.isCurrentCycleCutoffPassed).toBe(true);
      expect(status.timeUntilCurrentCycleCutoff).toBeNull();
      expect(formatCutoffCountdown(now)).toBe('Cutoff passed — orders apply to next week');
    }
  });

  it('starts a fresh fulfillment cycle on Monday', () => {
    const monday = new Date('2026-03-16T16:00:00.000Z');
    const status = getOrderCutoffStatus(monday);

    expect(status.isCurrentCycleCutoffPassed).toBe(false);
    expect(status.currentCycleCutoff.toISOString()).toBe('2026-03-19T22:00:00.000Z');
    expect(status.nextCutoff.toISOString()).toBe('2026-03-19T22:00:00.000Z');
    expect(getTimeUntilCutoff(monday)).toEqual({ days: 3, hours: 6, minutes: 0 });
  });

  it('uses the correct UTC offset on both sides of spring DST', () => {
    expect(getNextCutoff(new Date('2026-03-02T12:00:00.000Z')).toISOString()).toBe(
      '2026-03-05T23:00:00.000Z',
    );
    expect(getNextCutoff(new Date('2026-03-09T12:00:00.000Z')).toISOString()).toBe(
      '2026-03-12T22:00:00.000Z',
    );
  });

  it('uses the correct UTC offset on both sides of fall DST', () => {
    expect(getNextCutoff(new Date('2026-10-26T12:00:00.000Z')).toISOString()).toBe(
      '2026-10-29T22:00:00.000Z',
    );
    expect(getNextCutoff(new Date('2026-11-02T12:00:00.000Z')).toISOString()).toBe(
      '2026-11-05T23:00:00.000Z',
    );
  });

  it('formats a deterministic countdown before cutoff', () => {
    const oneHourAndThirtyMinutesBefore = new Date('2026-03-12T20:30:00.000Z');

    expect(getTimeUntilCutoff(oneHourAndThirtyMinutesBefore)).toEqual({ days: 0, hours: 1, minutes: 30 });
    expect(formatCutoffCountdown(oneHourAndThirtyMinutesBefore)).toBe('1h 30m');
  });
});
