import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RotationServiceError } from '@/lib/rotationService';
import ManageMealRotation from './ManageMealRotation';
const mocks = vi.hoisted(() => ({ access: vi.fn(), get: vi.fn(), cancel: vi.fn() }));
vi.mock('@/components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/rotationService', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/rotationService')>(), consumeRotationAccess: mocks.access, getManagedRotation: mocks.get, cancelManagedRotation: mocks.cancel }));
const week = { subtotalCents: 12600, lines: [{ variantId: 'gid://shopify/ProductVariant/1', title: 'Fixture meal', quantity: 7, priceCents: 1800 }] };
const plan = { state: 'active', weeks: { 'week-a': week, 'week-b': week, 'week-c': week }, nextWeek: 'week-b', serviceDate: '2026-10-26T09:00:00-07:00', nextBillingDate: '2026-10-23T09:00:00-07:00', canCancel: true, cancellationPending: false, cancellationConfirmed: false };
const show = () => render(<MemoryRouter initialEntries={['/meal-plan/' + 'a'.repeat(48)]}><Routes><Route path="/meal-plan/:id" element={<ManageMealRotation />} /></Routes></MemoryRouter>);
describe('private meal plan management', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.access.mockReturnValue({ id: 'a'.repeat(48), token: 'b'.repeat(64) });
    mocks.get.mockResolvedValue(plan); mocks.cancel.mockResolvedValue(undefined);
  });
  it('does not request private data without a complete valid link', async () => {
    mocks.access.mockReturnValue(null); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('complete private meal-plan link');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('shows all three saved menus and the active week', async () => {
    show(); expect(await screen.findByText('Rotation Active')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Monday, October 26, 2026 (Week 2)');
    expect(screen.getAllByText('7 × Fixture meal')).toHaveLength(3);
  });
  it('requires a second explicit confirmation before canceling', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Cancel Meal Rotation' }));
    expect(mocks.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep My Rotation' }));
    expect(mocks.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Meal Rotation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Cancel Future Renewals' }));
    expect(await screen.findByText('Cancellation Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Meal Rotation' })).not.toBeInTheDocument();
  });
  it('keeps remote confirmation retryable and never claims an uncertain cancellation succeeded', async () => {
    mocks.cancel.mockRejectedValueOnce(new RotationServiceError('Shopify confirmation pending.', true));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Cancel Meal Rotation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Cancel Future Renewals' }));
    expect(await screen.findByText('Cancellation Awaiting Shopify Confirmation')).toBeInTheDocument();
    expect(screen.queryByText('Cancellation Confirmed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Shopify Cancellation Confirmation' }));
    expect(await screen.findByText('Cancellation Confirmed')).toBeInTheDocument();
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
  });
  it('does not label an unenrolled quote an active subscription', async () => {
    mocks.get.mockResolvedValue({ ...plan, state: 'quoted', canCancel: false }); show();
    expect(await screen.findByText('Plan Not Enrolled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Meal Rotation' })).not.toBeInTheDocument();
  });
  it('explains that paused/review plans do not initiate new renewals', async () => {
    mocks.get.mockResolvedValue({ ...plan, state: 'review' }); show();
    expect(await screen.findByText('Renewals Stopped — Review Needed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('payment already in progress');
  });
});
