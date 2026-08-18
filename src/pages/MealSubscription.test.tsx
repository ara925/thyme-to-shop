import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellingPlan, ShopifyProduct } from '@/lib/shopify';
import { parseMoneyAmountToCents } from '@/lib/mealRotation';
import MealSubscription from './MealSubscription';

const mocks = vi.hoisted(() => ({
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

function createProduct({
  amount = '120.00',
  availableForSale = true,
}: {
  amount?: string;
  availableForSale?: boolean;
} = {}): ShopifyProduct {
  return {
    node: {
      id: 'meal-product',
      title: 'Weekly Meal',
      description: 'A live meal product.',
      handle: 'weekly-meal',
      productType: 'Meal',
      tags: ['week-a', 'week-b', 'week-c'],
      priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } },
      images: { edges: [] },
      options: [{ name: 'Title', values: ['Default Title'] }],
      variants: {
        edges: [{
          node: {
            id: 'meal-variant',
            title: 'Default Title',
            price: { amount, currencyCode: 'USD' },
            availableForSale,
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

const switchToWeek = (weekNumber: number) => {
  fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(`week ${weekNumber}`, 'i') }), { button: 0 });
};

const addOneMealToWeek = (weekNumber: number) => {
  switchToWeek(weekNumber);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`add one weekly meal to week ${weekNumber}`, 'i') }));
};

describe('parseMoneyAmountToCents', () => {
  it('converts and rounds Shopify decimal strings without accumulating floating-point totals', () => {
    expect(parseMoneyAmountToCents('120')).toBe(12000);
    expect(parseMoneyAmountToCents('39.99')).toBe(3999);
    expect(parseMoneyAmountToCents('19.995')).toBe(2000);
    expect(parseMoneyAmountToCents('not-a-price')).toBeNull();
  });
});

describe('MealSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProducts.mockReturnValue({
      data: [createProduct()],
      isLoading: false,
      isError: false,
    });
    mocks.useSellingPlans.mockReturnValue({
      data: { 'meal-product': weeklyPlan },
      isLoading: false,
      isError: false,
    });
  });

  it('collects all three independent weeks and produces a complete manual-enrollment handoff', () => {
    render(<MealSubscription />);

    expect(mocks.useSellingPlans).toHaveBeenCalledWith(
      'product_type:Meal',
      'Weekly Meal Subscription - $120 Minimum',
    );

    addOneMealToWeek(1);
    addOneMealToWeek(2);
    addOneMealToWeek(3);

    const summary = screen.getByRole('region', { name: /three-week rotation summary/i });
    expect(within(summary).getByText(/week 1 → week 2 → week 3 → repeat/i)).toBeInTheDocument();
    expect(within(summary).getAllByText('$120.00')).toHaveLength(3);
    expect(within(summary).getAllByText(/1 × weekly meal/i)).toHaveLength(3);

    expect(screen.getByText(/each week, billing is for that active menu's actual selected total/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cancel anytime/i).length).toBeGreaterThan(0);

    const requestLink = within(summary).getByRole('link', { name: /send plan for manual setup/i });
    const decodedHref = decodeURIComponent(requestLink.getAttribute('href') || '');
    expect(decodedHref).toContain('mailto:info@placeinthyme.com');
    expect(decodedHref).toContain('Set up my three-week meal plan');
    expect(decodedHref).toContain("Billing: Charge only the active week's actual selected total, once per week.");
    expect(decodedHref).toContain('Cancellation: Cancel anytime.');
    expect(decodedHref).toContain('Week 1 - $120.00');
    expect(decodedHref).toContain('Week 2 - $120.00');
    expect(decodedHref).toContain('Week 3 - $120.00');
    expect(decodedHref).toContain('1 x Weekly Meal at $120.00 each');
    expect(decodedHref).toContain('Rotation: Week 1 -> Week 2 -> Week 3 -> repeat');
    expect(decodedHref).not.toContain('Please confirm availability, the weekly billing amount');
  });

  it('hands off each actual selected weekly total instead of replacing it with a flat minimum', () => {
    mocks.useProducts.mockReturnValue({
      data: [createProduct({ amount: '65.00' })],
      isLoading: false,
      isError: false,
    });
    render(<MealSubscription />);

    addOneMealToWeek(1);
    addOneMealToWeek(1);
    addOneMealToWeek(2);
    addOneMealToWeek(2);
    addOneMealToWeek(2);
    addOneMealToWeek(3);
    addOneMealToWeek(3);

    const summary = screen.getByRole('region', { name: /three-week rotation summary/i });
    const requestLink = within(summary).getByRole('link', { name: /send plan for manual setup/i });
    const decodedHref = decodeURIComponent(requestLink.getAttribute('href') || '');

    expect(decodedHref).toContain('Week 1 - $130.00');
    expect(decodedHref).toContain('Week 2 - $195.00');
    expect(decodedHref).toContain('Week 3 - $130.00');
    expect(decodedHref).toContain('Three-week total: $455.00');
  });

  it('preserves each week while switching tabs and requires every week to meet the minimum', () => {
    render(<MealSubscription />);

    addOneMealToWeek(1);
    addOneMealToWeek(2);
    switchToWeek(1);

    expect(screen.getByRole('button', { name: /remove one weekly meal from week 1/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /complete all three weeks to send plan/i })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /send plan for manual setup/i })).not.toBeInTheDocument();
    expect(screen.getByText(/complete all three menus at \$120.00 or more per week/i)).toBeInTheDocument();
  });

  it('announces the changing week total without a second quantity live region', () => {
    render(<MealSubscription />);

    const addButton = screen.getByRole('button', {
      name: /add one weekly meal to week 1/i,
    });
    const controls = addButton.parentElement;
    expect(controls).not.toBeNull();
    const quantity = within(controls as HTMLElement).getByText('0');

    expect(quantity).not.toHaveAttribute('role');
    expect(quantity).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('status')).toHaveTextContent('Week 1 Total: $0.00');
  });

  it('does not send ordinary weekly selling plans to cart and explains the Shopify limitation', () => {
    render(<MealSubscription />);

    expect(screen.getByText(/will not add all three sets to your cart/i)).toBeInTheDocument();
    expect(screen.getByText(/ordinary weekly plans cannot alternate three different menu selections/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add.*cart/i })).not.toBeInTheDocument();
  });

  it('still allows planning when no standard selling plan exists, without pretending checkout works', () => {
    mocks.useSellingPlans.mockReturnValue({ data: {}, isLoading: false, isError: false });
    render(<MealSubscription />);

    expect(screen.getByText(/one or more meal items do not expose the expected weekly plan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add one weekly meal to week 1/i })).toBeEnabled();
  });

  it('keeps sold-out meals visible but prevents selecting them', () => {
    mocks.useProducts.mockReturnValue({
      data: [createProduct({ availableForSale: false })],
      isLoading: false,
      isError: false,
    });
    render(<MealSubscription />);

    expect(screen.getByText(/sold out/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add one weekly meal to week 1/i })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /send plan for manual setup/i })).not.toBeInTheDocument();
  });

  it('uses accessible layout-preserving skeletons while meal products load', () => {
    mocks.useProducts.mockReturnValue({ data: [], isLoading: true, isError: false });
    render(<MealSubscription />);

    expect(screen.getAllByText(/loading live meal options/i)).toHaveLength(1);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
