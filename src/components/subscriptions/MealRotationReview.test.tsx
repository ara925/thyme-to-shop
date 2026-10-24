import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MealRotationReview } from './MealRotationReview';

const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('@/lib/rotationService', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/rotationService')>(), previewMealRotation: mocks.preview }));
const selections = { 'week-a': { 'gid://shopify/ProductVariant/1': 7 }, 'week-b': { 'gid://shopify/ProductVariant/2': 7 }, 'week-c': { 'gid://shopify/ProductVariant/3': 7 } };
const preview = { firstWeek: 'week-b', firstServiceDate: '2026-10-26', weeks: { 'week-a': { subtotalCents: 12600 }, 'week-b': { subtotalCents: 13300 }, 'week-c': { subtotalCents: 14000 } }, enrollmentReady: false, currencyCode: 'USD' };
describe('meal rotation live review', () => {
  beforeEach(() => { vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', 'https://pit-rotation-test.sg-host.com/api'); vi.clearAllMocks(); mocks.preview.mockResolvedValue(preview); });
  it('requires all three menus before reviewing', () => {
    render(<MealRotationReview selections={null} />);
    expect(screen.getByRole('button', { name: /review rotation/i })).toBeDisabled();
  });
  it('shows four upcoming weeks in calendar order with actual totals and no billing', async () => {
    render(<MealRotationReview selections={selections} />);
    fireEvent.click(screen.getByRole('button', { name: /review rotation/i }));
    const result = await screen.findByRole('status');
    expect(result).toHaveTextContent('Monday, October 26, 2026 (Week 2)');
    expect(result.querySelectorAll('li')[0]).toHaveTextContent('First week: Week 2$133.00');
    expect(result.querySelectorAll('li')[1]).toHaveTextContent('Week 3$140.00');
    expect(result.querySelectorAll('li')[2]).toHaveTextContent('Week 1$126.00');
    expect(result.querySelectorAll('li')[3]).toHaveTextContent('Week 2$133.00');
    expect(result).toHaveTextContent('has not started a subscription');
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });
  it('invalidates a previously verified result immediately after any selection changes', async () => {
    const view = render(<MealRotationReview selections={selections} />);
    fireEvent.click(screen.getByRole('button', { name: /review rotation/i }));
    await screen.findByRole('status');
    view.rerender(<MealRotationReview selections={{ ...selections, 'week-a': { 'gid://shopify/ProductVariant/1': 8 } }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('ignores an old in-flight review when the customer edits quantities', async () => {
    let resolve!: (value: unknown) => void;
    mocks.preview.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = render(<MealRotationReview selections={selections} />);
    fireEvent.click(screen.getByRole('button', { name: /review rotation/i }));
    view.rerender(<MealRotationReview selections={null} />);
    resolve(preview);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
  it('preserves the planner and offers a retry after a service error', async () => {
    mocks.preview.mockRejectedValueOnce(new Error('Please try again.'));
    render(<MealRotationReview selections={selections} />);
    fireEvent.click(screen.getByRole('button', { name: /review rotation/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.');
    expect(screen.getByRole('button', { name: /review rotation/i })).toBeEnabled();
  });
});
