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

  it.each(['99junk', '99.001', '9.9e1', '-99.00', 'NaN'])('does not count a malformed total %s toward delivery', amount => {
    expect(getDeliveryMinimumStatus(usd(amount), 'delivery').isMet).toBe(false);
    expect(() => validateFulfillmentForCheckout(usd(amount), 'pickup', new Date('2026-10-19T18:00:00Z'))).toThrow(/total could not be verified/);
  });

  it('rejects an unsupported runtime fulfillment method', () => {
    expect(() => validateFulfillmentForCheckout(usd('99.00'), 'shipping' as 'delivery', new Date('2026-10-19T18:00:00Z'))).toThrow(/Shipping is not offered/);
  });

  it('does not suggest adding $0 or switching pickup when the total itself is unverified', () => {
    for (const subtotal of [null, { amount: '100.00', currencyCode: 'CAD' }, usd('100oops')]) {
      expect(getDeliveryMinimumStatus(subtotal, 'delivery')).toEqual({ isMet: false, shortfallCents: 0,
        message: 'Your order total could not be verified. Refresh the cart before checkout.' });
    }
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
