import { describe, expect, it } from 'vitest';
import {
  getDeliveryMinimumStatus,
  validateFulfillmentForCheckout,
} from './fulfillmentRules';

const usd = (amount: string) => ({ amount, currencyCode: 'USD' });

describe('local fulfillment checkout rules', () => {
  it('reports the exact delivery shortfall below $99', () => {
    expect(getDeliveryMinimumStatus(usd('20.00'), 'delivery')).toEqual({
      isMet: false,
      shortfallCents: 7_900,
      message: 'Orange County delivery requires a $99 minimum. Add $79.00 more or choose free pickup.',
    });
  });

  it('accepts delivery at the exact minimum and exempts pickup', () => {
    expect(getDeliveryMinimumStatus(usd('99.00'), 'delivery').isMet).toBe(true);
    expect(getDeliveryMinimumStatus(usd('1.00'), 'pickup').isMet).toBe(true);
  });

  it('rechecks the Friday cutoff using Pacific time', () => {
    expect(() => validateFulfillmentForCheckout(
      usd('99.00'),
      'delivery',
      new Date('2026-03-14T06:59:59.999Z'),
    )).not.toThrow();

    expect(() => validateFulfillmentForCheckout(
      usd('99.00'),
      'delivery',
      new Date('2026-03-14T07:00:00.000Z'),
    )).toThrow(/cutoff has passed/i);
  });
});
