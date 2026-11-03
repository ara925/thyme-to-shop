import { describe, expect, it } from 'vitest';
import {
  getDeliveryMinimumStatus,
  getRecurringDeliveryMinimumStatus,
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

describe('weekly delivery minimum', () => {
  const weekly = (amount: string, currencyCode = 'USD') => ({
    sellingPlanId: 'gid://shopify/SellingPlan/weekly', lineSubtotal: { amount, currencyCode },
  });
  const extra = { lineSubtotal: usd('100.00') };

  it('does not let one-time items pad a $94.99 weekly bundle to the $99 delivery minimum', () => {
    const result = getRecurringDeliveryMinimumStatus([weekly('94.99'), extra], 'delivery');
    expect(result).toMatchObject({ isMet: false, shortfallCents: 401 });
    expect(result.message).toContain('Add $4.01 in weekly items or choose free pickup');
    expect(result.message).toContain('One-time extras only count toward the first order');
  });

  it('keeps free pickup available for the same weekly bundle', () => {
    expect(getRecurringDeliveryMinimumStatus([weekly('94.99'), extra], 'pickup').isMet).toBe(true);
  });

  it.each(['99.00', '122.40'])('accepts a recurring delivery subtotal of %s', amount => {
    expect(getRecurringDeliveryMinimumStatus([weekly(amount), extra], 'delivery').isMet).toBe(true);
  });

  it('uses the actual recurring subtotal after discounts rather than the retail price', () => {
    expect(getRecurringDeliveryMinimumStatus([weekly('89.10'), extra], 'delivery'))
      .toMatchObject({ isMet: false, shortfallCents: 990 });
  });

  it('leaves ordinary one-time delivery orders to the existing order minimum', () => {
    expect(getRecurringDeliveryMinimumStatus([extra], 'delivery').isMet).toBe(true);
    expect(getDeliveryMinimumStatus(usd('98.00'), 'delivery').isMet).toBe(false);
  });

  it.each([weekly('99junk'), weekly('99.001'), weekly('100.00', 'CAD')])(
    'fails closed for an unverifiable recurring subtotal %#', item => {
      expect(getRecurringDeliveryMinimumStatus([item, extra], 'delivery'))
        .toEqual({ isMet: false, shortfallCents: 0,
          message: 'Your order total could not be verified. Refresh the cart before checkout.' });
    },
  );
});
