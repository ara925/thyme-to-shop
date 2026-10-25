import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionCheckoutForm, MealEnrollmentCheckout } from './SubscriptionCheckout';
import type { RotationPreview, RotationSelections } from '@/lib/rotationService';

const mocks = vi.hoisted(() => ({ quote: vi.fn(), start: vi.fn(), retain: vi.fn() }));
vi.mock('@/lib/subscriptionCheckout', () => ({ quoteMealEnrollment: mocks.quote, startMealEnrollmentCheckout: mocks.start, retainEnrollmentAccess: mocks.retain }));
const preview: RotationPreview = { firstWeek: 'week-a', firstServiceDate: '2026-11-02', weeks: { 'week-a': { subtotalCents: 13200, lines: [] }, 'week-b': { subtotalCents: 14000, lines: [] }, 'week-c': { subtotalCents: 12600, lines: [] } }, currencyCode: 'USD', enrollmentReady: true };
const selections: RotationSelections = { 'week-a': { a: 6 }, 'week-b': { b: 7 }, 'week-c': { c: 7 } };
describe('separate subscription checkout form', () => {
  beforeEach(() => vi.clearAllMocks()); afterEach(() => vi.unstubAllEnvs());
  it('requires an explicit local fulfillment choice and billing acknowledgement', () => {
    const submit = vi.fn(); render(<SubscriptionCheckoutForm busy={false} error="" billingSummary="TEST-ONLY first week" onSubmit={submit} />);
    const button = screen.getByRole('button', { name: 'Continue to Shopify Checkout' }); expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Free pickup/ })); expect(button).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button); expect(submit).toHaveBeenCalledWith({ method: 'pickup', window: 'monday-after-9am' });
    expect(screen.queryByRole('textbox', { name: /card|password/i })).not.toBeInTheDocument();
  });
  it('passes Tuesday delivery without offering national shipping or invented delivery hours', () => {
    const submit = vi.fn(); render(<SubscriptionCheckoutForm busy={false} error="" billingSummary="TEST-ONLY" onSubmit={submit} />);
    fireEvent.click(screen.getByRole('radio', { name: /Orange County delivery/ })); fireEvent.change(screen.getByRole('combobox', { name: 'Preferred delivery day' }), { target: { value: 'tuesday' } });
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Continue to Shopify Checkout' })); expect(submit).toHaveBeenCalledWith({ method: 'delivery', window: 'tuesday' });
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
  it('keeps failed preparation retryable and shows a private link without claiming an order was created', () => {
    render(<SubscriptionCheckoutForm busy={false} error="TEST-ONLY checkout unavailable" managementLink="/meal-plan/TEST-ONLY#token=TEST-ONLY" billingSummary="TEST-ONLY" onSubmit={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable'); expect(screen.getByRole('link', { name: 'Your private plan-management link' })).toBeInTheDocument();
    expect(screen.getByText(/No order or charge is made until/)).toBeInTheDocument();
  });
  it('creates a quote, saves private access and redirects only after server checkout verification', async () => {
    const navigate = vi.fn(); const quote = { id: 'a'.repeat(48), manageToken: 'b'.repeat(64) }; mocks.quote.mockResolvedValue(quote); mocks.start.mockResolvedValue('https://checkout.placeinthyme.com/cart/c/TEST-ONLY'); mocks.retain.mockReturnValue('/meal-plan/TEST-ONLY#token=TEST-ONLY');
    render(<MealEnrollmentCheckout preview={preview} selections={selections} navigate={navigate} />);
    fireEvent.click(screen.getByRole('radio', { name: /Free pickup/ })); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Continue to Shopify Checkout' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://checkout.placeinthyme.com/cart/c/TEST-ONLY'));
    expect(mocks.retain).toHaveBeenCalledWith({ id: quote.id, token: quote.manageToken }); expect(mocks.start).toHaveBeenCalledWith(quote, { method: 'pickup', window: 'monday-after-9am' }, expect.any(AbortSignal));
  });
  it('does not expose an active checkout form when enrollment is closed', () => {
    render(<MealEnrollmentCheckout preview={{ ...preview, enrollmentReady: false }} selections={selections} />); expect(screen.queryByRole('button', { name: 'Continue to Shopify Checkout' })).not.toBeInTheDocument();
  });
});
