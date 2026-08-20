import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellingPlan, ShopifyProduct } from '@/lib/shopify';
import { JuiceBundleCards } from './JuiceBundleCards';

const mocks = vi.hoisted(() => ({
  addItems: vi.fn(),
  useJuiceBundleSellingPlans: vi.fn(),
  useProducts: vi.fn(),
}));

vi.mock('@/hooks/useProducts', () => ({
  useJuiceBundleSellingPlans: mocks.useJuiceBundleSellingPlans,
  useProducts: mocks.useProducts,
  normalizeSellingPlanGroupName: (name: string) => name
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US'),
}));

vi.mock('@/stores/cartStore', () => ({
  useCartStore: (selector: (state: { addItems: typeof mocks.addItems; isLoading: boolean }) => unknown) =>
    selector({ addItems: mocks.addItems, isLoading: false }),
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

function createApprovedBundleCatalog(): ShopifyProduct[] {
  return [
    createBundle({
      id: 'pick',
      title: "Pick n' Choose Bundle",
      description: 'Create your own live juice mix.',
      amount: '134.99',
    }),
    createBundle(),
    createBundle({ id: 'shots', title: 'Shot Bundle', description: 'Live shot assortment.', amount: '89.99' }),
    createBundle({ id: 'bundle-1', title: 'Juice Bundle #1', description: 'Live bundle one.', amount: '121.50' }),
    createBundle({ id: 'bundle-2', title: 'Juice Bundle #2', description: 'Live bundle two.', amount: '183.50' }),
    createBundle({ id: 'bundle-3', title: 'Juice Bundle #3', description: 'Live bundle three.', amount: '199.00' }),
  ];
}

function createJuice({
  id = 'hibiscus',
  title = 'Hibiscus Tea (Sweetened)',
  amount = '3.00',
  requiresComponents = false,
}: {
  id?: string;
  title?: string;
  amount?: string;
  requiresComponents?: boolean;
} = {}): ShopifyProduct {
  return {
    node: {
      ...createBundle({ id, title, amount }).node,
      productType: 'Juice',
      variants: {
        edges: [{
          node: {
            id: `${id}-variant`,
            title: 'Default Title',
            price: { amount, currencyCode: 'USD' },
            availableForSale: true,
            requiresComponents,
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
    mocks.addItems.mockResolvedValue(undefined);
    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:"Juice Bundle"'
        ? createApprovedBundleCatalog()
        : [
            createJuice(),
            createJuice({
              id: 'component-only',
              title: 'Hibiscus Tea Add-On',
              requiresComponents: true,
            }),
          ],
      isLoading: false,
      isError: false,
    }));
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
    expect(screen.getAllByRole('link', { name: 'Details' }).find(
      (link) => link.getAttribute('href') === '/product/intro',
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add intro pack bundle to cart one time/i }))
      .toBeEnabled();
    expect(screen.getByRole('button', { name: /subscribe weekly to intro pack bundle/i }))
      .toBeEnabled();
    expect(screen.getByText(/optional one-time add-on: hibiscus tea \(sweetened\) for \$3\.00 each/i))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add one hibiscus tea add-on to intro pack/i }))
      .toBeEnabled();

    const addOnGroup = screen.getByRole('group', {
      name: /hibiscus tea add-on quantity for intro pack bundle/i,
    });
    const addButton = within(addOnGroup).getByRole('button', {
      name: /add one hibiscus tea add-on/i,
    });
    expect(addButton).toHaveClass('h-11', 'w-11');
    expect(within(addOnGroup).getByRole('status', {
      name: /hibiscus tea add-on quantity for intro pack bundle: 0/i,
    })).toBeInTheDocument();
    fireEvent.click(addButton);
    expect(within(addOnGroup).getByRole('status', {
      name: /hibiscus tea add-on quantity for intro pack bundle: 1/i,
    })).toBeInTheDocument();
  });

  it('adds the one-time bundle without a selling plan', async () => {
    renderCards();

    fireEvent.click(screen.getByRole('button', {
      name: /add intro pack bundle to cart one time/i,
    }));

    await waitFor(() => expect(mocks.addItems).toHaveBeenCalledTimes(1));
    expect(mocks.addItems).toHaveBeenCalledWith([expect.objectContaining({
      variantId: 'intro-variant',
      quantity: 1,
      sellingPlanId: undefined,
    })]);
  });

  it('adds the weekly bundle with only the verified Shopify plan id', async () => {
    renderCards();

    fireEvent.click(screen.getByRole('button', {
      name: /subscribe weekly to intro pack bundle/i,
    }));

    await waitFor(() => expect(mocks.addItems).toHaveBeenCalledTimes(1));
    expect(mocks.addItems).toHaveBeenCalledWith([expect.objectContaining({
      variantId: 'intro-variant',
      quantity: 1,
      sellingPlanId: 'intro-weekly',
    })]);
  });

  it('adds the optional Hibiscus Tea once with a one-time bundle', async () => {
    renderCards();

    const addHibiscus = screen.getByRole('button', {
      name: /add one hibiscus tea add-on to intro pack bundle/i,
    });
    fireEvent.click(addHibiscus);
    fireEvent.click(addHibiscus);
    fireEvent.click(screen.getByRole('button', {
      name: /add intro pack bundle to cart one time/i,
    }));

    await waitFor(() => expect(mocks.addItems).toHaveBeenCalledTimes(1));
    const items = mocks.addItems.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(expect.objectContaining({
      variantId: 'intro-variant',
      sellingPlanId: undefined,
    }));
    expect(items[1]).toEqual(expect.objectContaining({
      variantId: 'hibiscus-variant',
      quantity: 2,
      sellingPlanId: undefined,
      attributes: expect.arrayContaining([
        expect.objectContaining({
          key: '_bundle_label',
          value: 'Hibiscus add-on for Intro Pack Bundle',
        }),
        expect.objectContaining({
          key: '_bundle_add_on_type',
          value: 'hibiscus-tea',
        }),
      ]),
    }));
  });

  it('keeps Hibiscus one time when it accompanies a weekly bundle', async () => {
    renderCards();

    fireEvent.click(screen.getByRole('button', {
      name: /add one hibiscus tea add-on to intro pack bundle/i,
    }));
    expect(screen.getByText(/does not become a separate subscription or repeat/i))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: /subscribe weekly to intro pack bundle/i,
    }));

    await waitFor(() => expect(mocks.addItems).toHaveBeenCalledTimes(1));
    const items = mocks.addItems.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0].sellingPlanId).toBe('intro-weekly');
    expect(items[1]).toEqual(expect.objectContaining({
      variantId: 'hibiscus-variant',
      quantity: 1,
      sellingPlanId: undefined,
    }));
  });

  it('revalidates the live Hibiscus add-on configuration when a bundle action is clicked', async () => {
    let addOnQueryHasError = false;
    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:"Juice Bundle"'
        ? createApprovedBundleCatalog()
        : [createJuice()],
      isLoading: false,
      isError: query === 'product_type:"Juice Bundle"' ? false : addOnQueryHasError,
    }));
    const view = renderCards();

    fireEvent.click(screen.getByRole('button', {
      name: /add one hibiscus tea add-on to intro pack bundle/i,
    }));

    addOnQueryHasError = true;
    view.rerender(
      <MemoryRouter>
        <JuiceBundleCards />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', {
      name: /add intro pack bundle to cart one time/i,
    }));

    await waitFor(() => expect(mocks.addItems).not.toHaveBeenCalled());
  });

  it('does not expose the component-only Hibiscus product as a customer add-on', () => {
    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:"Juice Bundle"'
        ? createApprovedBundleCatalog()
        : [createJuice({
            id: 'component-only',
            title: 'Hibiscus Tea Add-On',
            requiresComponents: true,
          })],
      isLoading: false,
      isError: false,
    }));
    renderCards();

    expect(screen.getByText(/optional hibiscus tea add-on is currently unavailable/i))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add one hibiscus tea add-on/i }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subscribe weekly to intro pack bundle/i }))
      .toBeEnabled();
  });

  it('fails closed only for the subscription action when a card has no exact plan', () => {
    mocks.useJuiceBundleSellingPlans.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });
    renderCards();

    expect(screen.getAllByText('Weekly subscription is unavailable for this bundle.'))
      .toHaveLength(5);
    expect(screen.getByRole('button', { name: /subscribe weekly to intro pack bundle/i }))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: /add intro pack bundle to cart one time/i }))
      .toBeEnabled();
    expect(screen.getAllByRole('link', { name: 'Details' })).toHaveLength(5);
  });

  it('distinguishes a plan verification failure from missing configuration', () => {
    mocks.useJuiceBundleSellingPlans.mockReturnValue({
      data: {},
      isLoading: false,
      isError: true,
    });
    renderCards();

    expect(screen.getAllByText(/weekly subscription option could not be verified/i)).toHaveLength(5);
    expect(screen.queryByText(/weekly subscription is unavailable for this bundle/i))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subscribe weekly to intro pack bundle/i }))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: /add intro pack bundle to cart one time/i }))
      .toBeEnabled();
  });

  it('fails visibly and safely when the custom parent appears more than once', () => {
    const catalog = createApprovedBundleCatalog();
    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:"Juice Bundle"'
        ? [
            ...catalog,
            createBundle({
              id: 'pick-duplicate',
              title: 'Pick n\u2019 Choose Bundle',
              amount: '134.99',
            }),
          ]
        : [createJuice()],
      isLoading: false,
      isError: false,
    }));

    renderCards();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Pick n' Choose Bundle appears more than once",
    );
    expect(screen.queryByRole('heading', { name: 'Intro Pack Bundle' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build my bundle' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Build my bundle' })).not.toBeInTheDocument();
  });

  it('rejects an unexpected Juice Bundle product instead of rendering it', () => {
    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:"Juice Bundle"'
        ? [
            ...createApprovedBundleCatalog(),
            createBundle({ id: 'seasonal', title: 'Seasonal Juice Bundle' }),
          ]
        : [createJuice()],
      isLoading: false,
      isError: false,
    }));

    renderCards();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unexpected Juice Bundle product: Seasonal Juice Bundle.',
    );
    expect(screen.queryByRole('heading', { name: 'Seasonal Juice Bundle' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add seasonal juice bundle/i }))
      .not.toBeInTheDocument();
  });

  it('fails closed when an approved fixed bundle is missing', () => {
    const catalog = createApprovedBundleCatalog().filter(
      (product) => product.node.title !== 'Juice Bundle #3',
    );
    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:"Juice Bundle"' ? catalog : [createJuice()],
      isLoading: false,
      isError: false,
    }));

    renderCards();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Juice Bundle #3 is missing from the live Juice Bundle catalog.',
    );
    expect(screen.queryByRole('heading', { name: 'Intro Pack Bundle' })).not.toBeInTheDocument();
  });

  it('fails closed when an approved fixed bundle appears more than once', () => {
    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:"Juice Bundle"'
        ? [
            ...createApprovedBundleCatalog(),
            createBundle({ id: 'bundle-2-copy', title: 'Juice Bundle #2', amount: '183.50' }),
          ]
        : [createJuice()],
      isLoading: false,
      isError: false,
    }));

    renderCards();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Juice Bundle #2 appears more than once in the live Juice Bundle catalog.',
    );
    expect(screen.queryByRole('button', { name: /add intro pack bundle/i }))
      .not.toBeInTheDocument();
  });
});
