import { describe, expect, it } from 'vitest';
import {
  parseMealMinimumCents,
  parsePositiveMoneyCents,
} from './subscriptionMinimum';

describe('subscription minimum parsing', () => {
  it('derives the meal threshold from the exact selling-plan group label', () => {
    expect(parseMealMinimumCents('Weekly Meal Subscription - $120 Minimum')).toBe(12000);
    expect(parseMealMinimumCents('Weekly Meal Subscription - $87.45 Minimum')).toBe(8745);
  });

  it('fails closed for absent or malformed meal minimums', () => {
    expect(parseMealMinimumCents('Weekly Meal Subscription - Minimum')).toBeNull();
    expect(parseMealMinimumCents('Weekly Meal Subscription - $120.999 Minimum')).toBeNull();
    expect(parseMealMinimumCents('Other Subscription - $120 Minimum')).toBeNull();
  });

  it('accepts positive currency amounts and rejects invalid thresholds', () => {
    expect(parsePositiveMoneyCents('134.99')).toBe(13499);
    expect(parsePositiveMoneyCents('120')).toBe(12000);
    expect(parsePositiveMoneyCents('0')).toBeNull();
    expect(parsePositiveMoneyCents('-1.00')).toBeNull();
    expect(parsePositiveMoneyCents('134.999')).toBeNull();
    expect(parsePositiveMoneyCents('not-a-price')).toBeNull();
  });
});
