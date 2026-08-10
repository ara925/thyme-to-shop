import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellingPlan, ShopifyProduct } from '@/lib/shopify';
import { JuiceBundleCards } from './JuiceBundleCards';

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  useJuiceBundleSellingPlans: vi.fn(),
  useProducts: vi.fn(),
}));

vi.mock('@/hooks/useProducts', () => ({
  useJuiceBundleSellingPlans: mocks.useJuiceBundleSellingPlans,
  useProducts: mocks.useProducts,
}));

vi.mock('@/stores/cartStore', () => ({
  useCartStore: (selector: (state: { addItem: typeof mocks.addItem; isLoading: boolean }) => unknown) =>
    selector({ addItem: mocks.addItem, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function createBundle({
  id = 'intro',
  title = 'Intro Pack Bundle',
  description = '4 Hearty Red, 4 Green Cleanse, 4 Ginger Shots, 4 Turmeric Shots, and 4 Teas.',
  amount = '94.99',
}: {
  id?: string;
  title?: string;
  description?: string;
  amount?: string;
} = {}): ShopifyProduct {
  return {
    node: {
      id,
      title,
      description,
      handle: id,
      productType: 'Juice Bundle',
      tags: [],
      priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } },
      images: { edges: [] },
      options: [{ name: 'Title', values: ['Default Title'] }],
      variants: {
        edges: [{
          node: {
            id: `${id}-variant`,
            title: 'Default Title',
            price: { amount, currencyCode: 'USD' },
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
  id: 'intro-weekly',
  name: 'Deliver every week',
  description: null,
  options: [],
  priceAdjustments: [],
  recurringDeliveries: true,
  billingPolicy: {
    __typename: 'SellingPlanRecurringBillingPolicy',
    interval: 'WEEK',
    intervalCount: 1,
  },
  deliveryPolicy: {
    __typename: 'SellingPlanRecurringDeliveryPolicy',
    interval: 'WEEK',
    intervalCount: 1,
  },
};

function renderCards() {
  return render(
    <MemoryRouter>
      <JuiceBundleCards />
    </MemoryRouter>,
  );
}

describe('JuiceBundleCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addItem.mockResolvedValue(undefined);
    mocks.useProducts.mockReturnValue({
      data: [createBundle()],
      isLoading: false,
      isError: false,
    });
    mocks.useJuiceBundleSellingPlans.mockReturnValue({
      data: { intro: weeklyPlan },
      isLoading: false,
      isError: false,
    });
  });

  it('keeps live bundle content and offers distinct one-time, details, and weekly actions', () => {
    renderCards();

    expect(screen.getByRole('heading', { name: 'Intro Pack Bundle' })).toBeInTheDocument();
    expect(screen.getByText(/4 Hearty Red, 4 Green Cleanse/)).toBeInTheDocument();
    expect(screen.getByText('$94.99')).toBeInTheDocument();
    expect(screen.getByText('Subscription repeats weekly at $94.99.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/product/intro');
    expect(screen.getByRole('button', { name: /add intro pack bundle to cart one time/i }))
      .toBeEnabled();
    expect(screen.getByRole('button', { name: /subscribe weekly to intro pack bundle/i }))
      .toBeEnabled();
  });

  it('adds the one-time bundle without a selling plan', async () => {
    renderCards();

    fireEvent.click(screen.getByRole('button', {
      name: /add intro pack bundle to cart one time/i,
    }));

    await waitFor(() => expect(mocks.addItem).toHaveBeenCalledTimes(1));
    expect(mocks.addItem).toHaveBeenCalledWith(expect.objectContaining({
      variantId: 'intro-variant',
      quantity: 1,
      sellingPlanId: undefined,
    }));
  });

  it('adds the weekly bundle with only the verified Shopify plan id', async () => {
    renderCards();

    fireEvent.click(screen.getByRole('button', {
      name: /subscribe weekly to intro pack bundle/i,
    }));

    await waitFor(() => expect(mocks.addItem).toHaveBeenCalledTimes(1));
    expect(mocks.addItem).toHaveBeenCalledWith(expect.objectContaining({
      variantId: 'intro-variant',
      quantity: 1,
      sellingPlanId: 'intro-weekly',
    }));
  });

  it('fails closed only for the subscription action when a card has no exact plan', () => {
    mocks.useJuiceBundleSellingPlans.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });
    renderCards();

    expect(screen.getByText('Weekly subscription is unavailable for this bundle.'))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subscribe weekly to intro pack bundle/i }))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: /add intro pack bundle to cart one time/i }))
      .toBeEnabled();
    expect(screen.getByRole('link', { name: 'Details' })).toBeInTheDocument();
  });

  it('distinguishes a plan verification failure from missing configuration', () => {
    mocks.useJuiceBundleSellingPlans.mockReturnValue({
      data: {},
      isLoading: false,
      isError: true,
    });
    renderCards();

    expect(screen.getByText(/weekly subscription option could not be verified/i)).toBeInTheDocument();
    expect(screen.queryByText(/weekly subscription is unavailable for this bundle/i))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subscribe weekly to intro pack bundle/i }))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: /add intro pack bundle to cart one time/i }))
      .toBeEnabled();
  });
});
