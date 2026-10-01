import { describe, expect, it } from 'vitest';
import {
  formatCutoffCountdown,
  getNextCutoff,
  getNextOrderAvailabilityTransition,
  getOrderCutoffStatus,
  getTimeUntilCutoff,
  isBeforeCutoff,
} from '@/lib/orderCutoff';

describe('end-of-Friday Pacific order cutoff', () => {
  it('stays open through Friday and closes at Saturday 12:00 AM PT', () => {
    const immediatelyBefore = new Date('2026-03-14T06:59:59.999Z');
    const exactCutoff = new Date('2026-03-14T07:00:00.000Z');

    expect(isBeforeCutoff(immediatelyBefore)).toBe(true);
    expect(getOrderCutoffStatus(immediatelyBefore).isCurrentCycleCutoffPassed).toBe(false);
    expect(isBeforeCutoff(exactCutoff)).toBe(false);
    expect(getOrderCutoffStatus(exactCutoff).isCurrentCycleCutoffPassed).toBe(true);
    expect(getTimeUntilCutoff(exactCutoff)).toBeNull();
    expect(getNextCutoff(exactCutoff).toISOString()).toBe('2026-03-21T07:00:00.000Z');
  });

  it('is independent of the visitor timezone at the Pacific boundary', () => {
    expect(isBeforeCutoff(new Date('2026-03-14T06:59:59.000Z'))).toBe(true);
    expect(isBeforeCutoff(new Date('2026-03-14T07:00:00.000Z'))).toBe(false);
  });

  it('keeps a passed state Saturday and Sunday while pointing to next Friday cutoff', () => {
    const saturday = new Date('2026-03-14T16:00:00.000Z');
    const sunday = new Date('2026-03-15T16:00:00.000Z');

    for (const now of [saturday, sunday]) {
      const status = getOrderCutoffStatus(now);
      expect(status.currentCycleCutoff.toISOString()).toBe('2026-03-14T07:00:00.000Z');
      expect(status.nextCutoff.toISOString()).toBe('2026-03-21T07:00:00.000Z');
      expect(status.isCurrentCycleCutoffPassed).toBe(true);
      expect(status.timeUntilCurrentCycleCutoff).toBeNull();
      expect(formatCutoffCountdown(now)).toBe(
        'The Friday 11:59 PM PT order cutoff has passed. Online ordering is closed for this delivery cycle.',
      );
    }
  });

  it('starts a fresh fulfillment cycle on Monday', () => {
    const monday = new Date('2026-03-16T16:00:00.000Z');
    const status = getOrderCutoffStatus(monday);

    expect(status.isCurrentCycleCutoffPassed).toBe(false);
    expect(status.currentCycleCutoff.toISOString()).toBe('2026-03-21T07:00:00.000Z');
    expect(status.nextCutoff.toISOString()).toBe('2026-03-21T07:00:00.000Z');
    expect(getTimeUntilCutoff(monday)).toEqual({ days: 4, hours: 15, minutes: 0 });
  });

  it('reports the next UI transition at cutoff or Monday reopening', () => {
    expect(getNextOrderAvailabilityTransition(
      new Date('2026-03-13T18:00:00.000Z'),
    ).toISOString()).toBe('2026-03-14T07:00:00.000Z');
    expect(getNextOrderAvailabilityTransition(
      new Date('2026-03-14T16:00:00.000Z'),
    ).toISOString()).toBe('2026-03-16T07:00:00.000Z');
  });

  it('uses the correct UTC offset on both sides of spring DST', () => {
    expect(getNextCutoff(new Date('2026-03-02T12:00:00.000Z')).toISOString()).toBe(
      '2026-03-07T08:00:00.000Z',
    );
    expect(getNextCutoff(new Date('2026-03-09T12:00:00.000Z')).toISOString()).toBe(
      '2026-03-14T07:00:00.000Z',
    );
  });

  it('uses the correct UTC offset on both sides of fall DST', () => {
    expect(getNextCutoff(new Date('2026-10-26T12:00:00.000Z')).toISOString()).toBe(
      '2026-10-31T07:00:00.000Z',
    );
    expect(getNextCutoff(new Date('2026-11-02T12:00:00.000Z')).toISOString()).toBe(
      '2026-11-07T08:00:00.000Z',
    );
  });

  it('formats a deterministic countdown before cutoff', () => {
    const oneHourAndThirtyMinutesBefore = new Date('2026-03-14T05:30:00.000Z');

    expect(getTimeUntilCutoff(oneHourAndThirtyMinutesBefore)).toEqual({
      days: 0,
      hours: 1,
      minutes: 30,
    });
    expect(formatCutoffCountdown(oneHourAndThirtyMinutesBefore)).toBe('1h 30m');
  });
});
