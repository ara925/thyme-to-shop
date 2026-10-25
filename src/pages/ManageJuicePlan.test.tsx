import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageJuicePlan from './ManageJuicePlan';
import type { ManagedJuicePlan } from '@/lib/juiceSubscriptionService';

const id = 'a'.repeat(48); const token = 'b'.repeat(64);
const mocks = vi.hoisted(() => ({ get: vi.fn(), cancel: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'a'.repeat(48) }) }));
vi.mock('@/components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/juiceSubscriptionService', () => ({ getManagedJuicePlan: mocks.get, cancelManagedJuicePlan: mocks.cancel }));
const plan: ManagedJuicePlan = { state: 'active', mix: { billingPreference: 'weekly', minimumCents: 13499, discountPercent: 10, commitmentWeeks: 4, deliveriesPerPayment: 1,
  retailSubtotalCents: 13500, subtotalCents: 12150, fourWeekSubtotalCents: 48600, firstSubtotalCents: 12150,
  lines: [{ variantId: 'gid://shopify/ProductVariant/100', title: 'TEST-ONLY Juice', quantity: 9, retailPriceCents: 1500, priceCents: 1350 }], oneTimeAddOn: null },
  firstServiceDate: '2026-11-02T09:00:00-08:00', nextServiceDate: '2026-11-09T09:00:00-08:00', nextBillingDate: '2026-11-02T09:00:00-08:00', paidWeeks: 1,
  cancellationRequested: false, cancellationPending: false, cancellationConfirmed: false, cancellationEffectiveDate: null, cancelAfterPaidWeeks: null, canCancel: true };
describe('private juice-plan management', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); history.replaceState(null, '', `/juice-plan/${id}#token=${token}`); mocks.get.mockResolvedValue(plan); });
  it('consumes the private token from a fragment and displays a funded-week count, not a fulfillment claim', async () => {
    render(<ManageJuicePlan />); await screen.findByText('Juice Plan Active'); expect(location.hash).toBe(''); expect(mocks.get).toHaveBeenCalledWith({ id, token }, expect.any(AbortSignal));
    expect(screen.getByText(/This is a payment count, not a claim/)).toBeInTheDocument(); expect(localStorage.length).toBe(0);
  });
  it('requires a separate confirmation and then shows scheduled, not already cancelled', async () => {
    mocks.cancel.mockResolvedValue({ state: 'scheduled', effectiveDate: '2026-11-30T09:00:00-08:00', afterPaidWeeks: 4 }); render(<ManageJuicePlan />); await screen.findByText('Juice Plan Active');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel at the Four-Week Boundary' })); expect(mocks.cancel).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Yes, Stop the Next Period' }));
    await screen.findByText('Cancellation Scheduled'); expect(screen.queryByText('Future Juice Renewals Cancelled')).not.toBeInTheDocument(); expect(screen.getByText(/The saved cancellation applies after 4 paid weeks/)).toBeInTheDocument();
  });
  it('allows keeping the plan without submitting a cancellation', async () => {
    render(<ManageJuicePlan />); await screen.findByText('Juice Plan Active'); fireEvent.click(screen.getByRole('button', { name: 'Cancel at the Four-Week Boundary' })); fireEvent.click(screen.getByRole('button', { name: 'Keep My Juice Plan' })); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('retains an uncertain remote cancellation as pending and offers a retry', async () => {
    const pending = { ...plan, state: 'cancelling', paidWeeks: 4, cancellationRequested: true, cancellationPending: true, cancelAfterPaidWeeks: 4, cancellationEffectiveDate: '2026-11-30T09:00:00-08:00' };
    mocks.get.mockResolvedValueOnce(plan).mockResolvedValue(pending); mocks.cancel.mockRejectedValue(new Error('TEST-ONLY Shopify confirmation pending')); render(<ManageJuicePlan />); await screen.findByText('Juice Plan Active');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel at the Four-Week Boundary' })); fireEvent.click(screen.getByRole('button', { name: 'Yes, Stop the Next Period' }));
    await screen.findByText('Cancellation Awaiting Shopify Confirmation'); expect(screen.queryByText('Future Juice Renewals Cancelled')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Retry Shopify Cancellation Confirmation' })).toBeEnabled();
  });
  it('does not request saved private data without a valid link', async () => {
    history.replaceState(null, '', `/juice-plan/${id}`); render(<ManageJuicePlan />); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('complete private juice-plan link')); expect(mocks.get).not.toHaveBeenCalled();
  });
});
