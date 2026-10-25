import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowLocalInspection, createDeliveryInspection } from './checkoutDeliveryProbe';

describe('local-only native delivery inspection', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('cannot be enabled on production domains or production builds', () => {
    expect(allowLocalInspection(true, '127.0.0.1')).toBe(true);
    expect(allowLocalInspection(false, '127.0.0.1')).toBe(false);
    for (const host of ['shop.placeinthyme.com', 'checkout.placeinthyme.com', 'localhost.evil.test']) expect(allowLocalInspection(true, host)).toBe(false);
  });
  it('refuses malformed amounts and quantities before creating any native cart', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const product = { node: { title: 'TEST ONLY' } } as Parameters<typeof createDeliveryInspection>[0];
    for (const quantity of [0, -1, 1.5, 51]) {
      await expect(createDeliveryInspection(product, { availableForSale: true, requiresComponents: false, price: { amount: '18.00', currencyCode: 'USD' } } as Parameters<typeof createDeliveryInspection>[1], quantity, 'delivery')).rejects.toThrow();
    }
    for (const amount of ['18oops', '18.001', '-18', 'NaN']) {
      await expect(createDeliveryInspection(product, { availableForSale: true, requiresComponents: false, price: { amount, currencyCode: 'USD' } } as Parameters<typeof createDeliveryInspection>[1], 6, 'delivery')).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('creates only an isolated one-time cart and verifies its native subtotal', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { cartCreate: {
      userErrors: [], warnings: [], cart: { checkoutUrl: 'https://checkout.placeinthyme.com/checkouts/TEST-ONLY',
        cost: { subtotalAmount: { amount: '108.00', currencyCode: 'USD' } },
        lines: { edges: [{ node: { quantity: 6, merchandise: { id: 'gid://shopify/ProductVariant/1' }, sellingPlanAllocation: null } }] } },
    } } }) });
    vi.stubGlobal('fetch', request);
    const product = { node: { title: 'TEST ONLY' } } as Parameters<typeof createDeliveryInspection>[0];
    const variant = { id: 'gid://shopify/ProductVariant/1', availableForSale: true, requiresComponents: false, price: { amount: '18.00', currencyCode: 'USD' } } as Parameters<typeof createDeliveryInspection>[1];
    const result = await createDeliveryInspection(product, variant, 6, 'delivery');
    expect(result.subtotalCents).toBe(10800);
    const payload = JSON.parse(request.mock.calls[0][1].body);
    expect(payload.variables.input.lines).toEqual([{ merchandiseId: variant.id, quantity: 6 }]);
    expect(payload.query).toContain('cartCreate');
    expect(payload.query).not.toMatch(/orderCreate|checkoutComplete|subscriptionContract|billingAttempt/);
    expect(payload.variables.input.attributes).toContainEqual({ key: '_pit_acceptance', value: 'NO-CHARGE delivery inspection; do not fulfill' });
  });
});
