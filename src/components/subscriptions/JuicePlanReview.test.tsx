import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JuicePlanReview } from './JuicePlanReview';
import type { JuicePreview, JuiceSelections } from '@/lib/juiceSubscriptionService';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), quote: vi.fn(), checkout: vi.fn() }));
vi.mock('@/lib/juiceSubscriptionService', () => ({ previewJuicePlan: mocks.preview, quoteJuiceEnrollment: mocks.quote, startJuiceEnrollmentCheckout: mocks.checkout }));
const selections: JuiceSelections = { selections: { 'gid://shopify/ProductVariant/100': 9 }, billingPreference: 'prepaid', teaQuantity: 2 };
const preview: JuicePreview = { mix: { billingPreference: 'prepaid', minimumCents: 13499, discountPercent: 10, commitmentWeeks: 4, deliveriesPerPayment: 4,
  retailSubtotalCents: 13500, subtotalCents: 12150, fourWeekSubtotalCents: 48600, firstSubtotalCents: 49200,
  lines: [{ variantId: 'gid://shopify/ProductVariant/100', title: 'TEST-ONLY Juice', quantity: 9, retailPriceCents: 1500, priceCents: 1350 }],
  oneTimeAddOn: { variantId: 'gid://shopify/ProductVariant/200', title: 'Hibiscus Tea (Sweetened)', quantity: 2, priceCents: 300, subtotalCents: 600 } },
  firstServiceDate: '2026-11-02', deliveryDates: ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'], currencyCode: 'USD', pricingVerified: true, enrollmentReady: false };
describe('customer juice-plan review', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', 'https://TEST-ONLY-app.sg-host.com/api'); sessionStorage.clear(); });
  afterEach(() => vi.unstubAllEnvs());
  it('reviews all four weeks and the one-time tea without creating an enrollment or checkout', async () => {
    mocks.preview.mockResolvedValue(preview); render(<JuicePlanReview selections={selections} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review Juice Plan — No Charge' }));
    await screen.findByText('First four-week payment subtotal'); expect(screen.getByText('$492.00')).toBeInTheDocument(); expect(screen.getByText(/Week 4: Monday, November 23/)).toBeInTheDocument();
    expect(mocks.quote).not.toHaveBeenCalled(); expect(mocks.checkout).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Continue to Shopify Checkout' })).not.toBeInTheDocument();
  });
  it('invalidates a previous review as soon as quantities or billing preference change', async () => {
    mocks.preview.mockResolvedValue(preview); const view = render(<JuicePlanReview selections={selections} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review Juice Plan — No Charge' })); await screen.findByText('First four-week payment subtotal');
    view.rerender(<JuicePlanReview selections={{ ...selections, billingPreference: 'weekly' }} />); expect(screen.queryByText('First four-week payment subtotal')).not.toBeInTheDocument();
  });
  it('prepares only the reviewed quote after pickup and recurring terms are acknowledged', async () => {
    const navigate = vi.fn(); const reviewed = { ...preview, enrollmentReady: true }; const quote = { ...reviewed, id: 'a'.repeat(48), manageToken: 'b'.repeat(64), expiresAt: new Date(Date.now() + 1800000).toISOString() };
    mocks.preview.mockResolvedValue(reviewed); mocks.quote.mockResolvedValue(quote); mocks.checkout.mockResolvedValue('https://checkout.placeinthyme.com/cart/c/TEST-ONLY');
    render(<JuicePlanReview selections={selections} navigate={navigate} />); fireEvent.click(screen.getByRole('button', { name: 'Review Juice Plan — No Charge' })); await screen.findByText('Continue to Secure Checkout');
    fireEvent.click(screen.getByRole('radio', { name: /Free pickup/ })); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Continue to Shopify Checkout' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://checkout.placeinthyme.com/cart/c/TEST-ONLY'));
    expect(mocks.checkout).toHaveBeenCalledWith(quote, { method: 'pickup', window: 'monday-after-9am' }, expect.any(AbortSignal)); expect(sessionStorage.getItem(`pit-juice-access-${quote.id}`)).toBe(quote.manageToken);
  });
  it('keeps a failed review retryable without dropping selections', async () => {
    mocks.preview.mockRejectedValue(new Error('TEST-ONLY temporary error')); render(<JuicePlanReview selections={selections} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review Juice Plan — No Charge' })); expect(await screen.findByRole('alert')).toHaveTextContent('temporary error'); expect(screen.getByRole('button', { name: 'Review Juice Plan — No Charge' })).toBeEnabled();
  });
});
