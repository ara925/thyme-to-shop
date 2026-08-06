import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellingPlan, ShopifyProduct } from '@/lib/shopify';
import JuiceSubscription from './JuiceSubscription';

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
  normalizeSellingPlanGroupName: (name: string) => name
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
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

function createProduct(availableForSale = true, amount = '134.99'): ShopifyProduct {
  return {
    node: {
      id: 'juice-product',
      title: 'Weekly Juice',
      description: 'A live juice product.',
      handle: 'weekly-juice',
      productType: 'Juice',
      tags: ['juice'],
      priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } },
      images: { edges: [] },
      options: [{ name: 'Title', values: ['Default Title'] }],
      variants: {
        edges: [{
          node: {
            id: 'juice-variant',
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

function createPickAndChooseProduct(
  amount = '134.99',
  title = 'Pick n’ Choose Bundle',
): ShopifyProduct {
  return {
    node: {
      id: 'pick-and-choose-product',
      title,
      description: 'The live Pick n Choose bundle product.',
      handle: 'pick-n-choose-bundle',
      productType: 'Juice Bundle',
      tags: [],
      priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } },
      images: { edges: [] },
      options: [{ name: 'Title', values: ['Default Title'] }],
      variants: { edges: [] },
    },
  };
}

function mockProductQueries(
  juice = createProduct(),
  bundles: ShopifyProduct[] = [createPickAndChooseProduct()],
  bundleState: { isLoading?: boolean; isError?: boolean } = {},
) {
  mocks.useProducts.mockImplementation((_first: number, query: string) => (
    query === 'product_type:"Juice Bundle"'
      ? {
          data: bundles,
          isLoading: bundleState.isLoading || false,
          isError: bundleState.isError || false,
        }
      : { data: [juice], isLoading: false, isError: false }
  ));
}

const weeklyPlan: SellingPlan = {
  id: 'weekly-plan',
  name: 'Deliver every week',
  description: null,
  options: [],
  priceAdjustments: [],
  recurringDeliveries: true,
};

function getPlusButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector('svg.lucide-plus')?.closest('button');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Plus button was not rendered.');
  return button;
}

describe('JuiceSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addItems.mockResolvedValue(undefined);
    mockProductQueries();
    mocks.useSellingPlans.mockReturnValue({
      data: { 'juice-product': weeklyPlan },
      isLoading: false,
      isError: false,
    });
  });

  it('adds the selected week once as a compatible attributed batch at the live base price', async () => {
    const { container } = render(<JuiceSubscription />);

    expect(screen.queryByText(/10%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cancel anytime/i)).not.toBeInTheDocument();
    expect(mocks.useProducts).toHaveBeenCalledWith(50, 'product_type:"Juice Bundle"');

    fireEvent.click(getPlusButton(container));
    fireEvent.click(screen.getByRole('button', { name: /add weekly juice selection to cart/i }));

    await waitFor(() => expect(mocks.addItems).toHaveBeenCalledTimes(1));
    expect(mocks.addItems).toHaveBeenCalledWith([expect.objectContaining({
      variantId: 'juice-variant',
      price: { amount: '134.99', currencyCode: 'USD' },
      quantity: 1,
      sellingPlanId: 'weekly-plan',
      attributes: expect.arrayContaining([
        { key: 'Menu Week', value: 'Week 1' },
        { key: '_minimum_group', value: 'juice-plan:week-a' },
        { key: '_minimum_cents', value: '13499' },
      ]),
    })]);
  });

  it('derives cart enforcement from the exact live Pick n Choose product price', async () => {
    mockProductQueries(createProduct(true, '150.01'), [createPickAndChooseProduct('150.01')]);
    render(<JuiceSubscription />);

    expect(screen.getAllByText(/\$150\.01/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /add one weekly juice to week 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /add weekly juice selection to cart/i }));

    await waitFor(() => expect(mocks.addItems).toHaveBeenCalledTimes(1));
    expect(mocks.addItems).toHaveBeenCalledWith([expect.objectContaining({
      attributes: expect.arrayContaining([
        { key: '_minimum_cents', value: '15001' },
        { key: '_minimum_currency', value: 'USD' },
      ]),
    })]);
  });

  it('blocks checkout when selections span more than one menu week', () => {
    render(<JuiceSubscription />);

    fireEvent.click(screen.getByRole('button', { name: /add one weekly juice to week 1/i }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /week 2/i }), { button: 0 });
    fireEvent.click(screen.getByRole('button', { name: /add one weekly juice to week 2/i }));

    expect(screen.getByText(/choose exactly one menu week/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add weekly juice selection to cart/i })).toBeDisabled();
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('discloses the actual recurrence and unenforced commitment', () => {
    render(<JuiceSubscription />);

    expect(screen.getByText(/selected juices and quantities repeat every week/i)).toBeInTheDocument();
    expect(screen.getByText(/four-billing-cycle commitment is not enforced until shopify/i)).toBeInTheDocument();
  });

  it('disables selection when the live variant is sold out', () => {
    mockProductQueries(createProduct(false));
    const { container } = render(<JuiceSubscription />);

    expect(getPlusButton(container)).toBeDisabled();
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });

  it('shows a blocking configuration state instead of falling back to a one-time order', () => {
    mocks.useSellingPlans.mockReturnValue({ data: {}, isLoading: false, isError: false });
    render(<JuiceSubscription />);

    expect(screen.getByText(/adding a one-time order is disabled/i)).toBeInTheDocument();
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('fails closed when the exact live Pick n Choose product is absent', () => {
    mockProductQueries(createProduct(), [createPickAndChooseProduct('134.99', 'Similar Bundle')]);
    render(<JuiceSubscription />);

    expect(screen.getByText(/live pick n' choose minimum is not configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add one weekly juice to week 1/i })).toBeDisabled();
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('includes the live bundle query in loading and error states', () => {
    mockProductQueries(createProduct(), [], { isError: true });
    render(<JuiceSubscription />);

    expect(screen.getByText(/live pick n' choose minimum is not configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add one weekly juice to week 1/i })).toBeDisabled();
  });

  it('uses accessible layout-preserving skeletons while juice products load', () => {
    mocks.useProducts.mockImplementation((_first: number, query: string) => (
      query === 'product_type:"Juice Bundle"'
        ? { data: [createPickAndChooseProduct()], isLoading: false, isError: false }
        : { data: [], isLoading: true, isError: false }
    ));
    render(<JuiceSubscription />);

    expect(screen.getAllByText(/loading live juice options/i)).toHaveLength(1);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
