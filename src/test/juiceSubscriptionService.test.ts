import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewJuicePlan, quoteJuiceEnrollment, getManagedJuicePlan, cancelManagedJuicePlan, type JuicePreview, type JuiceSelections } from '@/lib/juiceSubscriptionService';
import { consumeRotationAccess } from '@/lib/rotationService';

const id = 'c'.repeat(48); const token = 'd'.repeat(64); const access = { id, token };
const input: JuiceSelections = { selections: { 'gid://shopify/ProductVariant/100': 9 }, billingPreference: 'prepaid', teaQuantity: 2 };
const preview: JuicePreview = { mix: { billingPreference: 'prepaid', minimumCents: 13499, discountPercent: 10, commitmentWeeks: 4, deliveriesPerPayment: 4,
  retailSubtotalCents: 13500, subtotalCents: 12150, fourWeekSubtotalCents: 48600, firstSubtotalCents: 49200,
  lines: [{ variantId: 'gid://shopify/ProductVariant/100', title: 'TEST-ONLY Green Juice', quantity: 9, retailPriceCents: 1500, priceCents: 1350 }],
  oneTimeAddOn: { variantId: 'gid://shopify/ProductVariant/200', title: 'Hibiscus Tea (Sweetened)', quantity: 2, priceCents: 300, subtotalCents: 600 } },
  firstServiceDate: '2026-11-02', deliveryDates: ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'], currencyCode: 'USD', pricingVerified: true, enrollmentReady: false };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
describe('private four-week juice service', () => {
  beforeEach(() => { vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', 'https://TEST-ONLY-app.sg-host.com/api'); sessionStorage.clear(); localStorage.clear(); history.replaceState(null, '', '/'); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('validates a no-charge prepaid quote with one tea purchase and four separate delivery weeks', async () => {
    const fetch = vi.fn().mockResolvedValue(reply(preview)); vi.stubGlobal('fetch', fetch);
    expect(await previewJuicePlan(input)).toEqual(preview); expect(fetch.mock.calls[0][0]).toMatch(/\/juice\/preview$/); expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
  });
  it.each(['subtotal', 'tea', 'schedule', 'discount', 'minimum'])('rejects an inconsistent server %s result', async field => {
    const value = structuredClone(preview);
    if (field === 'subtotal') value.mix.firstSubtotalCents++;
    if (field === 'tea') value.mix.oneTimeAddOn.priceCents = 200 as 300;
    if (field === 'schedule') value.deliveryDates[2] = value.deliveryDates[1];
    if (field === 'discount') value.mix.discountPercent = 20 as 10;
    if (field === 'minimum') value.mix.retailSubtotalCents = 10000;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(value))); await expect(previewJuicePlan(input)).rejects.toThrow('incomplete');
  });
  it('does not create enrollment while the extra juice acceptance is off', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(quoteJuiceEnrollment(input, preview)).rejects.toThrow('not open'); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not reuse a meal management token from the separate meal session key', () => {
    sessionStorage.setItem(`pit-rotation-access-${id}`, token); expect(consumeRotationAccess(id, location, history, sessionStorage, 'juice')).toBeNull();
    history.replaceState(null, '', `/juice-plan/${id}#token=${token}`); expect(consumeRotationAccess(id, location, history, sessionStorage, 'juice')).toEqual(access); expect(location.hash).toBe('');
    expect(sessionStorage.getItem(`pit-juice-access-${id}`)).toBe(token); expect(localStorage.length).toBe(0);
  });
  it('requests a period-end cancellation instead of a cancel-anytime meal operation', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ state: 'scheduled', effectiveDate: '2026-11-30T09:00:00-08:00', afterPaidWeeks: 4 })); vi.stubGlobal('fetch', fetch);
    expect((await cancelManagedJuicePlan(access)).state).toBe('scheduled'); expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'cancel_at_period_end' });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`); expect(fetch.mock.calls[0][0]).not.toContain(token);
  });
  it('never presents an uncertain cancellation as a confirmed cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'pit_juice_cancel_pending', message: 'TEST-ONLY private detail' }, 503)));
    await expect(cancelManagedJuicePlan(access)).rejects.toThrow('temporarily unavailable');
  });
  it('requires a private bearer before retrieving saved juice data', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(getManagedJuicePlan({ id, token: 'invalid' })).rejects.toThrow('invalid'); expect(fetch).not.toHaveBeenCalled();
  });
});
