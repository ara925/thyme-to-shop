import { describe, expect, it } from 'vitest';
import { getCurrentWeekLabel, getCurrentWeekTag } from '@/lib/weekRotation';

describe('three-week menu rotation in New York time', () => {
  it('keeps Week 3 through Sunday night and changes at local Monday midnight', () => {
    expect(getCurrentWeekTag(new Date('2026-04-06T03:59:59.999Z'))).toBe('week-c');
    expect(getCurrentWeekTag(new Date('2026-04-06T04:00:00.000Z'))).toBe('week-a');
  });

  it('anchors March 16, 2026 as Week 1 and advances by calendar weeks', () => {
    expect(getCurrentWeekTag(new Date('2026-03-16T12:00:00.000Z'))).toBe('week-a');
    expect(getCurrentWeekTag(new Date('2026-03-23T12:00:00.000Z'))).toBe('week-b');
    expect(getCurrentWeekLabel(new Date('2026-03-30T12:00:00.000Z'))).toBe('Week 3');
  });

  it('handles dates before the anchor without producing a negative index', () => {
    expect(getCurrentWeekTag(new Date('2026-03-09T12:00:00.000Z'))).toBe('week-c');
  });
});
