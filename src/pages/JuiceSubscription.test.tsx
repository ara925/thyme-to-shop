import { fireEvent, render, screen } from '@testing-library/react';
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

const liveDescription = '12oz — celery, spinach, green apple, ginger, cucumber, parsley, lemon, honeydew.\nMay support hydration, digestion, and clean energy.';

function createProduct({
  id = 'green-cleanse',
  title = 'Green Cleanse 12oz',
  amount = '134.99',
  description = liveDescription,
  availableForSale = true,
  requiresComponents = false,
}: {
  id?: string;
  title?: string;
  amount?: string;
  description?: string;
  availableForSale?: boolean;
  requiresComponents?: boolean;
} = {}): ShopifyProduct {
  return {
    node: {
      id,
      title,
      description,
      handle: id,
      productType: 'Juice',
      tags: ['juice'],
      priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } },
      images: { edges: [] },
      options: [{ name: 'Title', values: ['Default Title'] }],
      variants: {
        edges: [{
          node: {
            id: `${id}-variant`,
            title: 'Default Title',
            price: { amount, currencyCode: 'USD' },
            availableForSale,
            requiresComponents,
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
  juices: ShopifyProduct[] = [createProduct()],
  bundles: ShopifyProduct[] = [createPickAndChooseProduct()],
  states: {
    productsLoading?: boolean;
    productsError?: boolean;
    bundleLoading?: boolean;
    bundleError?: boolean;
  } = {},
) {
  mocks.useProducts.mockImplementation((_first: number, query: string) => (
    query === 'product_type:"Juice Bundle"'
      ? {
          data: bundles,
          isLoading: states.bundleLoading || false,
          isError: states.bundleError || false,
        }
      : {
          data: juices,
          isLoading: states.productsLoading || false,
          isError: states.productsError || false,
        }
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

const weeklyPlanWithTenPercent: SellingPlan = {
  ...weeklyPlan,
  id: 'weekly-plan-with-ten-percent',
  priceAdjustments: [{
    orderCount: null,
    adjustmentValue: {
      __typename: 'SellingPlanPercentagePriceAdjustment',
      percentage: 10,
    },
  }],
};

function getPlusButton(productTitle = 'Green Cleanse 12oz'): HTMLButtonElement {
  return screen.getByRole('button', { name: `Add one ${productTitle}` });
}

function chooseWeeklyBilling(): void {
  fireEvent.click(screen.getByRole('radio', { name: /pay weekly for four weeks/i }));
}

function choosePrepaidBilling(): void {
  fireEvent.click(screen.getByRole('radio', { name: /prepay all four weeks/i }));
}

describe('JuiceSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProductQueries();
    mocks.useSellingPlans.mockReturnValue({
      data: { 'green-cleanse': weeklyPlan },
      isLoading: false,
      isError: false,
    });
  });

  it('renders one Pick n Choose mix with the full live product description and no week tabs', () => {
    render(<JuiceSubscription />);

    expect(mocks.useSellingPlans).toHaveBeenCalledWith(
      'product_type:Juice AND NOT product_type:"Juice Bundle"',
      'Pick n’ Choose Bundle',
    );

    expect(screen.getByRole('heading', { name: /build one weekly juice mix/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText(/week 1/i)).not.toBeInTheDocument();
    const description = screen.getByText((_, element) => (
      element?.tagName === 'P' && element.textContent === liveDescription
    ));
    expect(description).toBeInTheDocument();
    expect(description).not.toHaveClass('line-clamp-1');
  });

  it('requires the exact live Pick n Choose minimum before preparing the email request', () => {
    mockProductQueries(
      [createProduct({ amount: '50.00' })],
      [createPickAndChooseProduct('134.99')],
    );
    render(<JuiceSubscription />);

    fireEvent.click(getPlusButton());
    fireEvent.click(getPlusButton());

    expect(screen.getByRole('button', { name: /request this 4-week subscription/i })).toBeDisabled();
    expect(screen.getByText(/add \$34\.99 more to meet the \$134\.99 live weekly minimum/i)).toBeInTheDocument();

    fireEvent.click(getPlusButton());
    expect(screen.getByRole('button', { name: /request this 4-week subscription/i })).toBeDisabled();
    expect(screen.getByText(/choose a billing preference to prepare the enrollment request/i)).toBeInTheDocument();

    chooseWeeklyBilling();
    expect(screen.getByRole('link', { name: /request this 4-week subscription/i })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:info@placeinthyme.com'),
    );
  });

  it('uses a changed live minimum and includes quantities and the retail total in the request', () => {
    mockProductQueries(
      [createProduct({ amount: '150.01' })],
      [createPickAndChooseProduct('150.01')],
    );
    render(<JuiceSubscription />);

    expect(screen.getAllByText(/\$150\.01/).length).toBeGreaterThan(0);
    fireEvent.click(getPlusButton());
    chooseWeeklyBilling();

    const requestLink = screen.getByRole('link', { name: /request this 4-week subscription/i });
    const href = requestLink.getAttribute('href') || '';
    const body = decodeURIComponent(href.split('&body=')[1]);

    expect(body).toContain('1 x Green Cleanse 12oz = $150.01');
    expect(body).toContain('Weekly retail total: $150.01');
    expect(body).toContain('Live weekly minimum: $150.01');
    expect(body).toContain('10% off the selected retail total and a minimum four-week commitment');
    expect(body).toContain('Billing preference: Pay weekly for four weeks.');
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('detects the missing exact 10% adjustment without claiming or charging it', () => {
    render(<JuiceSubscription />);

    expect(screen.getByText(/weekly plan found; exact 10% adjustment missing/i)).toBeInTheDocument();
    expect(screen.getByText(/retail prices only; the confirmed discount must be configured or applied during manual enrollment/i)).toBeInTheDocument();

    fireEvent.click(getPlusButton());
    chooseWeeklyBilling();
    const requestLink = screen.getByRole('link', { name: /request this 4-week subscription/i });
    const body = decodeURIComponent((requestLink.getAttribute('href') || '').split('&body=')[1]);
    expect(body).toContain('Exact 10% percentage adjustment on every selected plan: No');
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('recognizes only an exact single 10% percentage adjustment', () => {
    mocks.useSellingPlans.mockReturnValue({
      data: { 'green-cleanse': weeklyPlanWithTenPercent },
      isLoading: false,
      isError: false,
    });
    render(<JuiceSubscription />);

    expect(screen.getByText(/weekly plan and exact 10% adjustment verified/i)).toBeInTheDocument();
    expect(screen.getByText(/exact 10% percentage adjustment is present on every live weekly juice plan/i)).toBeInTheDocument();

    fireEvent.click(getPlusButton());
    expect(screen.getByText('Estimated weekly total after verified 10%')).toBeInTheDocument();
    expect(screen.getByText('$121.49')).toBeInTheDocument();
    choosePrepaidBilling();
    expect(screen.getByText(/estimated four-week prepaid total: \$485\.96/i)).toBeInTheDocument();
    const requestLink = screen.getByRole('link', { name: /request this 4-week subscription/i });
    const body = decodeURIComponent((requestLink.getAttribute('href') || '').split('&body=')[1]);
    expect(body).toContain('Exact 10% percentage adjustment on every selected plan: Yes');
    expect(body).toContain('Estimated weekly total after verified 10% plan adjustment: $121.49');
    expect(body).toContain('Estimated four-week prepaid total: $485.96');
    expect(body).toContain('Billing preference: Prepay all four weeks.');
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it.each([3, 4])(
    'rejects an exact 10%% adjustment capped at %i orders for the ongoing subscription',
    (orderCount) => {
      mocks.useSellingPlans.mockReturnValue({
        data: {
          'green-cleanse': {
            ...weeklyPlanWithTenPercent,
            priceAdjustments: [{
              orderCount,
              adjustmentValue: {
                __typename: 'SellingPlanPercentagePriceAdjustment',
                percentage: 10,
              },
            }],
          },
        },
        isLoading: false,
        isError: false,
      });

      render(<JuiceSubscription />);

      expect(screen.getByText(/weekly plan found; exact 10% adjustment missing/i)).toBeInTheDocument();
      fireEvent.click(getPlusButton());
      expect(screen.queryByText('Estimated weekly total after verified 10%')).not.toBeInTheDocument();
    },
  );

  it('keeps Sweetened Hibiscus outside the minimum and discount as a one-time add-on', () => {
    const green = createProduct({ amount: '134.99' });
    const hibiscus = createProduct({
      id: 'hibiscus',
      title: 'Hibiscus Tea (Sweetened)',
      amount: '3.00',
      description: '12oz Hibiscus Tea.',
    });
    const componentOnly = createProduct({
      id: 'hibiscus-component',
      title: 'Hibiscus Tea Add-On',
      amount: '3.00',
      requiresComponents: true,
    });
    mockProductQueries([green, hibiscus, componentOnly]);
    mocks.useSellingPlans.mockReturnValue({
      data: { 'green-cleanse': weeklyPlanWithTenPercent },
      isLoading: false,
      isError: false,
    });
    render(<JuiceSubscription />);

    expect(screen.queryByRole('button', { name: 'Add one Hibiscus Tea (Sweetened)' }))
      .not.toBeInTheDocument();
    const addOnButton = screen.getByRole('button', {
      name: /add one one-time hibiscus tea add-on/i,
    });
    fireEvent.click(addOnButton);
    fireEvent.click(addOnButton);
    expect(screen.getByText(/does not count toward the \$134\.99 minimum/i)).toBeInTheDocument();

    fireEvent.click(getPlusButton());
    choosePrepaidBilling();
    expect(screen.getByText('Weekly mix retail total')).toBeInTheDocument();
    expect(screen.getByText(/excluded from the weekly minimum and discount/i)).toBeInTheDocument();
    expect(screen.getByText(/estimated four-week prepaid total: \$485\.96/i)).toBeInTheDocument();

    const requestLink = screen.getByRole('link', { name: /request this 4-week subscription/i });
    const body = decodeURIComponent((requestLink.getAttribute('href') || '').split('&body=')[1]);
    expect(body).toContain('Weekly retail total: $134.99');
    expect(body).toContain('Estimated weekly total after verified 10% plan adjustment: $121.49');
    expect(body).toContain('Estimated four-week prepaid total: $485.96');
    expect(body).toContain('Optional one-time add-on: 2 x Hibiscus Tea (Sweetened) = $6.00');
    expect(body).toContain('One-time Hibiscus add-on total: $6.00');
    expect(body).toContain('excluded from the weekly minimum and 10% discount');
    expect(body).toContain('Billing preference: Prepay all four weeks.');
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('excludes every exact Hibiscus title from the mix when the live add-on match is ambiguous', () => {
    const green = createProduct({ amount: '134.99' });
    const firstHibiscus = createProduct({
      id: 'hibiscus-one',
      title: 'Hibiscus Tea (Sweetened)',
      amount: '3.00',
    });
    const secondHibiscus = createProduct({
      id: 'hibiscus-two',
      title: 'Hibiscus Tea (Sweetened)',
      amount: '3.00',
    });
    mockProductQueries([green, firstHibiscus, secondHibiscus]);
    mocks.useSellingPlans.mockReturnValue({
      data: { 'green-cleanse': weeklyPlanWithTenPercent },
      isLoading: false,
      isError: false,
    });

    render(<JuiceSubscription />);

    expect(screen.queryByRole('button', { name: 'Add one Hibiscus Tea (Sweetened)' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add one one-time hibiscus tea add-on/i }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/one exact live product could not be verified/i);

    fireEvent.click(getPlusButton());
    chooseWeeklyBilling();
    expect(screen.getByRole('link', { name: /request this 4-week subscription/i })).toBeInTheDocument();
  });

  it('fails closed for the add-on when its live price is not exactly $3.00 USD', () => {
    const green = createProduct({ amount: '134.99' });
    const changedPriceHibiscus = createProduct({
      id: 'hibiscus',
      title: 'Hibiscus Tea (Sweetened)',
      amount: '4.00',
    });
    mockProductQueries([green, changedPriceHibiscus]);
    mocks.useSellingPlans.mockReturnValue({
      data: { 'green-cleanse': weeklyPlanWithTenPercent },
      isLoading: false,
      isError: false,
    });

    render(<JuiceSubscription />);

    expect(screen.getByText(/approved \$3\.00 USD add-on price could not be verified/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add one one-time hibiscus tea add-on/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add one Hibiscus Tea (Sweetened)' }))
      .not.toBeInTheDocument();
  });

  it('validates that each selectable product has the exact live weekly plan', () => {
    mocks.useSellingPlans.mockReturnValue({ data: {}, isLoading: false, isError: false });
    render(<JuiceSubscription />);

    expect(getPlusButton()).toBeDisabled();
    expect(screen.getByText(/exact weekly juice plan missing/i)).toBeInTheDocument();
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('disables a sold-out live product', () => {
    mockProductQueries([createProduct({ availableForSale: false })]);
    render(<JuiceSubscription />);

    expect(getPlusButton()).toBeDisabled();
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });

  it('fails closed when the exact live Pick n Choose parent product is absent', () => {
    mockProductQueries(
      [createProduct()],
      [createPickAndChooseProduct('134.99', 'Similar Bundle')],
    );
    render(<JuiceSubscription />);

    expect(screen.getByText(/exact live Pick n' Choose minimum or weekly plan configuration is unavailable/i)).toBeInTheDocument();
    expect(getPlusButton()).toBeDisabled();
    expect(mocks.addItems).not.toHaveBeenCalled();
  });

  it('shows a neutral verification state while the live minimum is still loading', () => {
    mockProductQueries(
      [createProduct()],
      [],
      { bundleLoading: true },
    );
    render(<JuiceSubscription />);

    expect(screen.getByText(/confirming the exact live Pick n' Choose minimum/i)).toBeInTheDocument();
    expect(screen.queryByText(/configuration is unavailable/i)).not.toBeInTheDocument();
  });

  it('uses accessible layout-preserving skeletons while the live catalog loads', () => {
    mockProductQueries([], [createPickAndChooseProduct()], { productsLoading: true });
    render(<JuiceSubscription />);

    expect(screen.getAllByText(/loading live juice options/i)).toHaveLength(1);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
