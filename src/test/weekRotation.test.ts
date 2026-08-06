import { describe, expect, it } from 'vitest';
import { getCurrentWeekLabel, getCurrentWeekTag, getOrderableWeekTag } from '@/lib/weekRotation';

describe('three-week menu rotation', () => {
  it('anchors Week A to March 16, 2026 in New York', () => {
    expect(getCurrentWeekTag(new Date('2026-03-16T04:00:00.000Z'))).toBe('week-a');
    expect(getCurrentWeekLabel(new Date('2026-03-16T12:00:00.000Z'))).toBe('Week 1');
  });

  it('does not roll over while it is Monday in Warsaw but still Sunday in New York', () => {
    const mondayInWarsawSundayInNewYork = new Date('2026-03-16T00:30:00.000Z');

    expect(getCurrentWeekTag(mondayInWarsawSundayInNewYork)).toBe('week-c');
  });

  it('changes weeks at New York midnight rather than UTC midnight', () => {
    expect(getCurrentWeekTag(new Date('2026-03-23T03:59:59.999Z'))).toBe('week-a');
    expect(getCurrentWeekTag(new Date('2026-03-23T04:00:00.000Z'))).toBe('week-b');
  });

  it('uses positive modulo for dates before the anchor', () => {
    expect(getCurrentWeekTag(new Date('2026-03-09T12:00:00.000Z'))).toBe('week-c');
    expect(getCurrentWeekTag(new Date('2026-03-02T12:00:00.000Z'))).toBe('week-b');
    expect(getCurrentWeekTag(new Date('2026-02-23T12:00:00.000Z'))).toBe('week-a');
  });

  it('reports the current August 6, 2026 menu as Week C', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');

    expect(getCurrentWeekTag(now)).toBe('week-c');
    expect(getCurrentWeekLabel(now)).toBe('Week 3');
  });

  it('advances the orderable menu at Thursday 6 PM New York time', () => {
    const immediatelyBeforeCutoff = new Date('2026-08-06T21:59:59.999Z');
    const exactCutoff = new Date('2026-08-06T22:00:00.000Z');

    expect(getCurrentWeekTag(immediatelyBeforeCutoff)).toBe('week-c');
    expect(getOrderableWeekTag(immediatelyBeforeCutoff)).toBe('week-c');
    expect(getOrderableWeekTag(exactCutoff)).toBe('week-a');
  });
});
