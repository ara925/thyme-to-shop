import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellingPlan, ShopifyProduct } from '@/lib/shopify';
import MealSubscription from './MealSubscription';

const mocks = vi.hoisted(() => ({
  addItems: vi.fn(),
  useProducts: vi.fn(),
  useSellingPlans: vi.fn(),
}));

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: mocks.useProducts,
  useSellingPlans: mocks.useSellingPlans,
}));

vi.mock('@/stores/cartStore', () => ({
  useCartStore: (selector: (state: { addItems: typeof mocks.addItems; isLoading: boolean }) => unknown) =>
    selector({ addItems: mocks.addItems, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function createProduct(): ShopifyProduct {
  return {
    node: {
      id: 'meal-product',
      title: 'Weekly Meal',
      description: 'A live meal product.',
      handle: 'weekly-meal',
      productType: 'Meal',
      tags: ['week-a', 'week-b', 'week-c'],
      priceRange: { minVariantPrice: { amount: '120.00', currencyCode: 'USD' } },
      images: { edges: [] },
      options: [{ name: 'Title', values: ['Default Title'] }],
      variants: {
        edges: [{
          node: {
            id: 'meal-variant',
            title: 'Default Title',
            price: { amount: '120.00', currencyCode: 'USD' },
            availableForSale: true,
            requiresComponents: false,
            selectedOptions: [],
          },
        }],
      },
    },
  };
}

const weeklyPlan: SellingPlan = {
  id: 'weekly-meal-plan',
  name: 'Deliver every week',
  description: null,
  options: [],
  priceAdjustments: [],
  recurringDeliveries: true,
};

describe('MealSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addItems.mockResolvedValue(undefined);
    mocks.useProducts.mockReturnValue({ data: [createProduct()], isLoading: false });
    mocks.useSellingPlans.mockReturnValue({
      data: { 'meal-product': weeklyPlan },
      isLoading: false,
      isError: false,
    });
  });

  it('adds only the selected menu as one weekly attributed batch', async () => {
    render(<MealSubscription />);

    expect(mocks.useSellingPlans).toHaveBeenCalledWith(
      'product_type:Meal',
      'Weekly Meal Subscription - $120 Minimum',
    );
    fireEvent.click(screen.getByRole('button', { name: /add one weekly meal to week 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /add weekly meal selection to cart/i }));

    await waitFor(() => expect(mocks.addItems).toHaveBeenCalledTimes(1));
    expect(mocks.addItems).toHaveBeenCalledWith([expect.objectContaining({
      variantId: 'meal-variant',
      price: { amount: '120.00', currencyCode: 'USD' },
      quantity: 1,
      sellingPlanId: 'weekly-meal-plan',
      attributes: expect.arrayContaining([
        { key: 'Menu Week', value: 'Week 1' },
        { key: '_minimum_group', value: 'meal-plan:week-a' },
        { key: '_minimum_cents', value: '12000' },
      ]),
    })]);
  });

  it('preserves selections but blocks checkout when they span multiple menu weeks', () => {
    render(<MealSubscription />);

    fireEvent.click(screen.getByRole('button', { name: /add one weekly meal to week 1/i }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /week 2/i }), { button: 0 });
    fireEvent.click(screen.getByRole('button', { name: /add one weekly meal to week 2/i }));

    expect(screen.getByText(/choose exactly one menu week/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add weekly meal selection to cart/i })).toBeDisabled();
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('discloses that the selected menu repeats without automatic rotation', () => {
    render(<MealSubscription />);

    expect(screen.getByText(/selected menu and quantities repeat every week/i)).toBeInTheDocument();
    expect(screen.getByText(/automatic a\/b\/c menu rotation is not configured in shopify/i)).toBeInTheDocument();
  });

  it('fails closed when the exact live selling-plan group is absent', () => {
    mocks.useSellingPlans.mockReturnValue({ data: {}, isLoading: false, isError: false });
    render(<MealSubscription />);

    expect(screen.getByText(/adding a one-time order is disabled/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add one weekly meal to week 1/i })).toBeDisabled();
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('uses accessible layout-preserving skeletons while meal products load', () => {
    mocks.useProducts.mockReturnValue({ data: [], isLoading: true, isError: false });
    render(<MealSubscription />);

    expect(screen.getAllByText(/loading live meal options/i)).toHaveLength(1);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
