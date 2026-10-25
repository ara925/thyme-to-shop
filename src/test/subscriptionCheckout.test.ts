import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quoteMealEnrollment, retainEnrollmentAccess, startMealEnrollmentCheckout, type MealEnrollmentQuote } from '@/lib/subscriptionCheckout';
import type { RotationPreview, RotationSelections } from '@/lib/rotationService';

const id = 'a'.repeat(48); const token = 'b'.repeat(64);
const selections: RotationSelections = { 'week-a': { 'gid://shopify/ProductVariant/1': 6 }, 'week-b': { 'gid://shopify/ProductVariant/2': 7 }, 'week-c': { 'gid://shopify/ProductVariant/3': 7 } };
const weeks = {
  'week-a': { subtotalCents: 13200, lines: [{ variantId: 'gid://shopify/ProductVariant/1', title: 'TEST-ONLY A', quantity: 6, priceCents: 2200 }] },
  'week-b': { subtotalCents: 14000, lines: [{ variantId: 'gid://shopify/ProductVariant/2', title: 'TEST-ONLY B', quantity: 7, priceCents: 2000 }] },
  'week-c': { subtotalCents: 12600, lines: [{ variantId: 'gid://shopify/ProductVariant/3', title: 'TEST-ONLY C', quantity: 7, priceCents: 1800 }] },
};
const preview: RotationPreview = { weeks, firstWeek: 'week-a', firstServiceDate: '2026-11-02', currencyCode: 'USD', enrollmentReady: true };
const quote = (): MealEnrollmentQuote => ({ ...preview, id, manageToken: token, expiresAt: new Date(Date.now() + 1800000).toISOString(), sellingPlanId: 'gid://shopify/SellingPlan/123' });
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
describe('isolated customer subscription checkout', () => {
  beforeEach(() => { vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', 'https://TEST-ONLY-rotation.sg-host.com/api'); sessionStorage.clear(); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('does not request an enrollment when the backend acceptance gate is off', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(quoteMealEnrollment(selections, { ...preview, enrollmentReady: false })).rejects.toThrow('not open'); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects changed live prices or a changed first service week instead of taking the shopper to checkout', async () => {
    const changed = quote(); changed.firstServiceDate = '2026-11-09'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(changed, 201)));
    await expect(quoteMealEnrollment(selections, preview)).rejects.toThrow('changed');
  });
  it('keeps management access in session storage only and uses a fragment, never a query string', () => {
    const link = retainEnrollmentAccess({ id, token });
    expect(link).toBe(`/meal-plan/${id}#token=${token}`); expect(sessionStorage.getItem(`pit-rotation-access-${id}`)).toBe(token); expect(localStorage.length).toBe(0);
    expect(retainEnrollmentAccess({ id, token }, 'juice')).toBe(`/juice-plan/${id}#token=${token}`); expect(sessionStorage.getItem(`pit-juice-access-${id}`)).toBe(token);
  });
  it('does not silently continue without a recoverable private management link', () => {
    expect(() => retainEnrollmentAccess({ id, token }, 'meal', { setItem: () => { throw Error('TEST-ONLY-blocked'); } } as unknown as Storage)).toThrow('before checkout');
  });
  it('sends only fulfillment details and a bearer header to the separate checkout endpoint', async () => {
    const value = quote(); const destination = 'https://checkout.placeinthyme.com/cart/c/TEST-ONLY-checkout';
    const fetch = vi.fn().mockResolvedValue(reply({ checkoutUrl: destination, expiresAt: value.expiresAt, firstWeek: value.firstWeek, firstServiceDate: value.firstServiceDate, firstSubtotalCents: 13200, fulfillment: { method: 'pickup', window: 'monday-after-9am' } })); vi.stubGlobal('fetch', fetch);
    expect(await startMealEnrollmentCheckout(value, { method: 'pickup', window: 'monday-after-9am' })).toBe(destination);
    const [url, options] = fetch.mock.calls[0]; expect(url).toMatch(new RegExp(`/checkout/${id}$`)); expect(url).not.toContain(token);
    expect(options.headers.Authorization).toBe(`Bearer ${token}`); expect(JSON.parse(options.body)).toEqual({ fulfillment: { method: 'pickup', window: 'monday-after-9am' } });
    expect(options.credentials).toBe('omit'); expect(options.redirect).toBe('error');
  });
  it.each(['https://evil.test/checkouts/x', 'https://checkout.placeinthyme.com.evil.test/cart/c/x', 'http://checkout.placeinthyme.com/cart/c/x'])('rejects an untrusted checkout URL: %s', async destination => {
    const value = quote(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ checkoutUrl: destination, expiresAt: value.expiresAt, firstWeek: 'week-a', firstServiceDate: value.firstServiceDate, firstSubtotalCents: 13200, fulfillment: { method: 'pickup', window: 'monday-after-9am' } })));
    await expect(startMealEnrollmentCheckout(value, { method: 'pickup', window: 'monday-after-9am' })).rejects.toThrow('incomplete');
  });
  it('rejects a changed subtotal even when Shopify returns a trusted hostname', async () => {
    const value = quote(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ checkoutUrl: 'https://checkout.placeinthyme.com/cart/c/TEST-ONLY', expiresAt: value.expiresAt, firstWeek: 'week-a', firstServiceDate: value.firstServiceDate, firstSubtotalCents: 99999, fulfillment: { method: 'pickup', window: 'monday-after-9am' } })));
    await expect(startMealEnrollmentCheckout(value, { method: 'pickup', window: 'monday-after-9am' })).rejects.toThrow('no longer matches');
  });
});
