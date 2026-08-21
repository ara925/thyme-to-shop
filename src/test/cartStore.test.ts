import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CART_ATTRIBUTES_UPDATE_MUTATION,
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_REMOVE_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_QUERY,
  type CartAttribute,
  type CartAttributesUpdateData,
  type CartCreateData,
  type CartLinesAddData,
  type CartLinesUpdateData,
  type CartQueryData,
  type MoneyV2,
  type ShopifyCart,
  type ShopifyCartLine,
  type ShopifyCartWarning,
  type ShopifyProduct,
  StorefrontApiError,
} from '@/lib/shopify';

const storefrontMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock('@/lib/shopify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shopify')>();
  return {
    ...actual,
    storefrontApiRequest: storefrontMocks.request,
  };
});

import {
  type CartItem,
  type CartItemInput,
  useCartStore,
  validateCartBundleDependencies,
  validateCartMinimums,
} from '@/stores/cartStore';

function usd(amount: string): MoneyV2 {
  return { amount, currencyCode: 'USD' };
}

const product: ShopifyProduct = {
  node: {
    id: 'gid://shopify/Product/meal',
    title: 'Seasonal Meal',
    description: 'Dinner',
    handle: 'seasonal-meal',
    productType: 'Meal',
    tags: ['week-a'],
    priceRange: { minVariantPrice: usd('10.00') },
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: 'gid://shopify/ProductVariant/meal',
            title: 'Default Title',
            price: usd('10.00'),
            availableForSale: true,
            requiresComponents: false,
            selectedOptions: [],
          },
        },
      ],
    },
    options: [],
    metafields: [],
  },
};

const input: CartItemInput = {
  product,
  variantId: 'gid://shopify/ProductVariant/meal',
  variantTitle: 'Default Title',
  price: usd('999.00'),
  quantity: 2,
  selectedOptions: [],
  sellingPlanId: 'gid://shopify/SellingPlan/weekly',
};

const stockWarning: ShopifyCartWarning = {
  code: 'MERCHANDISE_NOT_ENOUGH_STOCK',
  message: 'Quantity was adjusted to the available stock.',
  target: 'gid://shopify/CartLine/subscription',
};

function line({
  lineId = 'gid://shopify/CartLine/subscription',
  quantity = 2,
  sellingPlanId = 'gid://shopify/SellingPlan/weekly' as string | null,
  unitAmount = '8.10',
  totalAmount = '16.20',
  attributes = [],
}: {
  lineId?: string;
  quantity?: number;
  sellingPlanId?: string | null;
  unitAmount?: string;
  totalAmount?: string;
  attributes?: CartAttribute[];
} = {}): ShopifyCartLine {
  const { variants: _variants, sellingPlanGroups: _sellingPlanGroups, ...lineProduct } = product.node;
  return {
    id: lineId,
    quantity,
    attributes,
    merchandise: {
      ...product.node.variants.edges[0].node,
      price: usd(unitAmount),
      product: lineProduct,
    },
    sellingPlanAllocation: sellingPlanId
      ? { sellingPlan: { id: sellingPlanId, name: 'Weekly' } }
      : null,
    cost: {
      amountPerQuantity: usd(unitAmount),
      subtotalAmount: usd(totalAmount),
      totalAmount: usd(totalAmount),
    },
  };
}

function cart({
  id = 'gid://shopify/Cart/current',
  checkoutUrl = 'https://thyme-time-store-brreo.myshopify.com/checkouts/test',
  lines = [line()],
  attributes = [],
  subtotal = '16.20',
}: {
  id?: string;
  checkoutUrl?: string;
  lines?: ShopifyCartLine[];
  attributes?: CartAttribute[];
  subtotal?: string;
} = {}): ShopifyCart {
  return {
    id,
    checkoutUrl,
    totalQuantity: lines.reduce((total, item) => total + item.quantity, 0),
    attributes,
    cost: {
      subtotalAmount: usd(subtotal),
      totalAmount: usd(subtotal),
    },
    lines: { edges: lines.map((node) => ({ node })) },
  };
}

function setCartState(serverCart: ShopifyCart) {
  const firstLine = serverCart.lines.edges[0].node;
  useCartStore.setState({
    cartId: serverCart.id,
    checkoutUrl: serverCart.checkoutUrl,
    items: [
      {
        ...input,
        lineId: firstLine.id,
        price: firstLine.cost.amountPerQuantity,
        lineSubtotal: firstLine.cost.totalAmount,
      },
    ],
    subtotal: serverCart.cost.subtotalAmount,
    isLoading: false,
    isSyncing: false,
    error: null,
  });
}

function cartItem(
  lineId: string,
  subtotal: string,
  attributes: CartAttribute[] = [],
  quantity = input.quantity,
  unitAmount = subtotal,
  currencyCode = 'USD',
): CartItem {
  return {
    ...input,
    lineId,
    price: { amount: unitAmount, currencyCode },
    lineSubtotal: { amount: subtotal, currencyCode },
    quantity,
    attributes,
  };
}

describe('Shopify cart mutation warning contract', () => {
  it.each([
    ['create', CART_CREATE_MUTATION],
    ['add lines', CART_LINES_ADD_MUTATION],
    ['update lines', CART_LINES_UPDATE_MUTATION],
    ['remove lines', CART_LINES_REMOVE_MUTATION],
    ['update attributes', CART_ATTRIBUTES_UPDATE_MUTATION],
  ])('requests warnings for %s', (_operation, mutation) => {
    expect(mutation).toMatch(/warnings\s*{\s*code\s+message\s+target\s*}/);
  });
});

describe('cart purchase minimums', () => {
  const minimumAttributes: CartAttribute[] = [
    { key: '_minimum_group', value: 'pick-test' },
    { key: '_minimum_cents', value: '13499' },
    { key: '_minimum_currency', value: 'USD' },
    { key: '_minimum_label', value: "Pick n' Choose Bundle" },
  ];

  function minimumItem(lineId: string, subtotal: string): CartItem {
    return {
      ...input,
      lineId,
      price: usd(subtotal),
      lineSubtotal: usd(subtotal),
      attributes: minimumAttributes,
    };
  }

  it('sums Shopify-returned line costs across a bundle group', () => {
    expect(() =>
      validateCartMinimums([minimumItem('line-a', '80.00'), minimumItem('line-b', '55.00')]),
    ).not.toThrow();
  });

  it('blocks checkout when quantity edits put a configured group below its minimum', () => {
    expect(() => validateCartMinimums([minimumItem('line-a', '134.50')])).toThrow(
      "Pick n' Choose Bundle needs $0.49 more before checkout.",
    );
  });
});

describe('cart bundle dependencies', () => {
  const primary = (instance: string): CartAttribute[] => [
    { key: '_bundle_instance', value: instance },
    { key: '_bundle_role', value: 'primary' },
  ];
  const addOn = (instance: string): CartAttribute[] => [
    { key: '_bundle_instance', value: instance },
    { key: '_bundle_role', value: 'add-on' },
    { key: '_bundle_add_on_type', value: 'hibiscus-tea' },
  ];

  it('accepts a fixed bundle primary with its optional add-on', () => {
    expect(() => validateCartBundleDependencies([
      cartItem('fixed-primary', '94.99', primary('fixed-1')),
      cartItem('fixed-add-on', '3.00', addOn('fixed-1'), 1),
    ])).not.toThrow();
  });

  it('accepts an exact $3 USD add-on subtotal for each selected unit', () => {
    expect(() => validateCartBundleDependencies([
      cartItem('fixed-primary', '94.99', primary('fixed-2')),
      cartItem('fixed-add-on', '6.00', addOn('fixed-2'), 2, '3.00'),
    ])).not.toThrow();
  });

  it('accepts a Pick n Choose mix whose add-on is excluded from the minimum', () => {
    const minimumAttributes: CartAttribute[] = [
      { key: '_minimum_group', value: 'pick-1' },
      { key: '_minimum_cents', value: '13499' },
      { key: '_minimum_currency', value: 'USD' },
      { key: '_minimum_label', value: "Pick n' Choose Bundle" },
    ];
    const items = [
      cartItem('pick-primary-a', '80.00', [...primary('pick-1'), ...minimumAttributes]),
      cartItem('pick-primary-b', '55.00', [...primary('pick-1'), ...minimumAttributes]),
      cartItem('pick-add-on', '3.00', addOn('pick-1'), 1),
    ];

    expect(() => validateCartMinimums(items)).not.toThrow();
    expect(() => validateCartBundleDependencies(items)).not.toThrow();
  });

  it('rejects an add-on after every primary in its group is removed', () => {
    expect(() => validateCartBundleDependencies([
      cartItem('orphan-add-on', '3.00', addOn('orphaned'), 1),
    ])).toThrow('An add-on must remain with its bundle');
  });

  it.each([
    ['server unit price drift', '3.00', 1, '4.00', 'USD'],
    ['server subtotal drift', '4.00', 1, '3.00', 'USD'],
    ['server currency drift', '3.00', 1, '3.00', 'CAD'],
  ] as const)('rejects %s for Hibiscus', (_case, subtotal, quantity, unitAmount, currencyCode) => {
    expect(() => validateCartBundleDependencies([
      cartItem('primary', '94.99', primary('price-check')),
      cartItem(
        'add-on',
        subtotal,
        addOn('price-check'),
        quantity,
        unitAmount,
        currencyCode,
      ),
    ])).toThrow('approved $3.00 USD Hibiscus add-on price could not be verified');
  });

  it.each([
    [
      'missing add-on type',
      [
        { key: '_bundle_instance', value: 'typed-add-on' },
        { key: '_bundle_role', value: 'add-on' },
      ],
      'incomplete',
    ],
    [
      'unknown add-on type',
      [
        { key: '_bundle_instance', value: 'typed-add-on' },
        { key: '_bundle_role', value: 'add-on' },
        { key: '_bundle_add_on_type', value: 'unknown' },
      ],
      'invalid',
    ],
  ] as Array<[string, CartAttribute[], string]>)('rejects %s', (_case, attributes, message) => {
    expect(() => validateCartBundleDependencies([
      cartItem('primary', '94.99', primary('typed-add-on')),
      cartItem('add-on', '3.00', attributes, 1),
    ])).toThrow(message);
  });

  it('preserves ordinary lines and primary-only bundles', () => {
    expect(() => validateCartBundleDependencies([
      cartItem('ordinary', '10.00'),
      cartItem('primary', '94.99', primary('primary-only')),
    ])).not.toThrow();
  });

  it.each([
    [
      'missing role',
      [{ key: '_bundle_instance', value: 'broken' }],
      'incomplete',
    ],
    [
      'missing instance',
      [{ key: '_bundle_role', value: 'add-on' }],
      'incomplete',
    ],
    [
      'blank relationship values',
      [
        { key: '_bundle_instance', value: '' },
        { key: '_bundle_role', value: '' },
      ],
      'incomplete',
    ],
    [
      'unknown role',
      [
        { key: '_bundle_instance', value: 'broken' },
        { key: '_bundle_role', value: 'extra' },
      ],
      'invalid',
    ],
    [
      'orphaned add-on type marker',
      [{ key: '_bundle_add_on_type', value: 'hibiscus-tea' }],
      'incomplete',
    ],
    [
      'add-on type on a primary',
      [
        { key: '_bundle_instance', value: 'broken' },
        { key: '_bundle_role', value: 'primary' },
        { key: '_bundle_add_on_type', value: 'hibiscus-tea' },
      ],
      'invalid',
    ],
  ] as Array<[string, CartAttribute[], string]>)('rejects %s metadata', (_case, attributes, message) => {
    expect(() => validateCartBundleDependencies([
      cartItem('broken-line', '3.00', attributes),
    ])).toThrow(message);
  });
});

describe('useCartStore Shopify synchronization', () => {
  beforeEach(() => {
    storefrontMocks.request.mockReset();
    localStorage.clear();
    useCartStore.getState().clearCart();
    useCartStore.setState({ isLoading: false, isSyncing: false, error: null });
  });

  it('reconstructs cart lines and totals from Shopify instead of trusting submitted prices', async () => {
    const serverCart = cart();
    storefrontMocks.request.mockResolvedValueOnce({
      data: { cartCreate: { cart: serverCart, userErrors: [], warnings: [] } },
    } satisfies { data: CartCreateData });

    await useCartStore.getState().addItem(input);

    expect(storefrontMocks.request).toHaveBeenCalledWith(CART_CREATE_MUTATION, {
      input: {
        lines: [
          {
            quantity: 2,
            merchandiseId: input.variantId,
            sellingPlanId: input.sellingPlanId,
          },
        ],
      },
    });
    expect(useCartStore.getState()).toMatchObject({
      cartId: serverCart.id,
      subtotal: usd('16.20'),
      items: [
        {
          lineId: 'gid://shopify/CartLine/subscription',
          variantId: input.variantId,
          sellingPlanId: input.sellingPlanId,
          quantity: 2,
          price: usd('8.10'),
          lineSubtotal: usd('16.20'),
        },
      ],
    });
    expect(useCartStore.getState().getTotalPrice()).toBe(16.2);
  });

  it('fails closed when Shopify returns the headless storefront as its checkout host', async () => {
    const serverCart = cart({
      checkoutUrl: 'https://shop.placeinthyme.com/cart/c/test-key?locale=en',
    });
    storefrontMocks.request.mockResolvedValueOnce({
      data: { cartCreate: { cart: serverCart, userErrors: [], warnings: [] } },
    } satisfies { data: CartCreateData });

    await expect(useCartStore.getState().addItem(input)).rejects.toThrow(
      'invalid checkout URL',
    );

    expect(useCartStore.getState()).toMatchObject({
      cartId: null,
      checkoutUrl: null,
      items: [],
      error: 'The store could not complete that request. Please try again.',
    });
  });

  it('rejects a variant that Shopify marks as requiring bundle components', async () => {
    const componentProduct: ShopifyProduct = {
      node: {
        ...product.node,
        title: 'Bundle Component',
        variants: {
          edges: product.node.variants.edges.map(({ node }) => ({
            node: { ...node, requiresComponents: true },
          })),
        },
      },
    };

    await expect(
      useCartStore.getState().addItem({ ...input, product: componentProduct }),
    ).rejects.toThrow('cannot be added on its own');
    expect(storefrontMocks.request).not.toHaveBeenCalled();
  });

  it('rejects a Shopify user error so callers cannot report a successful add', async () => {
    storefrontMocks.request.mockResolvedValueOnce({
      data: {
        cartCreate: {
          cart: null,
          userErrors: [{ field: ['input', 'lines'], message: 'Selling plan is not available' }],
          warnings: [],
        },
      },
    } satisfies { data: CartCreateData });

    await expect(useCartStore.getState().addItem(input)).rejects.toMatchObject({
      code: 'graphql',
      message: 'Selling plan is not available',
    });
    expect(useCartStore.getState()).toMatchObject({ cartId: null, items: [], isLoading: false });
  });

  it('keeps non-blocking mutation warnings and replaces or dismisses them', async () => {
    const adjustedCart = cart({
      lines: [line({ quantity: 1, totalAmount: '8.10' })],
      subtotal: '8.10',
    });
    const locationWarning: ShopifyCartWarning = {
      code: 'PRODUCT_UNAVAILABLE_IN_BUYER_LOCATION',
      message: 'An item may not be available at the selected location.',
      target: product.node.id,
    };
    storefrontMocks.request
      .mockResolvedValueOnce({
        data: {
          cartCreate: { cart: adjustedCart, userErrors: [], warnings: [stockWarning] },
        },
      } satisfies { data: CartCreateData })
      .mockResolvedValueOnce({
        data: {
          cartLinesUpdate: {
            cart: adjustedCart,
            userErrors: [],
            warnings: [locationWarning],
          },
        },
      } satisfies { data: CartLinesUpdateData });

    await useCartStore.getState().addItem(input);
    expect(useCartStore.getState()).toMatchObject({
      items: [{ quantity: 1 }],
      warnings: [stockWarning],
    });

    await useCartStore
      .getState()
      .updateQuantity('gid://shopify/CartLine/subscription', 2);
    expect(useCartStore.getState().warnings).toEqual([locationWarning]);

    useCartStore.getState().clearWarnings();
    expect(useCartStore.getState().warnings).toEqual([]);
  });

  it('sends a batch with selling-plan and rotation attributes intact', async () => {
    const weekA = { ...input, attributes: [{ key: 'Rotation Week', value: 'week-a' }] };
    const weekB = { ...input, attributes: [{ key: 'Rotation Week', value: 'week-b' }] };
    storefrontMocks.request.mockResolvedValueOnce({
      data: { cartCreate: { cart: cart(), userErrors: [], warnings: [] } },
    } satisfies { data: CartCreateData });

    await useCartStore.getState().addItems([weekA, weekB]);

    expect(storefrontMocks.request).toHaveBeenCalledWith(CART_CREATE_MUTATION, {
      input: {
        lines: [
          {
            quantity: 2,
            merchandiseId: input.variantId,
            sellingPlanId: input.sellingPlanId,
            attributes: weekA.attributes,
          },
          {
            quantity: 2,
            merchandiseId: input.variantId,
            sellingPlanId: input.sellingPlanId,
            attributes: weekB.attributes,
          },
        ],
      },
    });
  });

  it('recreates an expired cart and retries the requested lines once', async () => {
    setCartState(cart({ id: 'gid://shopify/Cart/expired' }));
    storefrontMocks.request
      .mockResolvedValueOnce({
        data: {
          cartLinesAdd: {
            cart: null,
            userErrors: [{ field: ['cartId'], message: 'Cart not found' }],
            warnings: [],
          },
        },
      } satisfies { data: CartLinesAddData })
      .mockResolvedValueOnce({
        data: {
          cartCreate: {
            cart: cart({ id: 'gid://shopify/Cart/recreated' }),
            userErrors: [],
            warnings: [],
          },
        },
      } satisfies { data: CartCreateData });

    await useCartStore.getState().addItem(input);

    expect(storefrontMocks.request.mock.calls[0][0]).toBe(CART_LINES_ADD_MUTATION);
    expect(storefrontMocks.request.mock.calls[1][0]).toBe(CART_CREATE_MUTATION);
    expect(useCartStore.getState().cartId).toBe('gid://shopify/Cart/recreated');
  });

  it('keeps same-variant purchase options distinct and updates by Shopify line ID', async () => {
    const oneTimeLine = line({
      lineId: 'gid://shopify/CartLine/one-time',
      quantity: 1,
      sellingPlanId: null,
      unitAmount: '10.00',
      totalAmount: '10.00',
    });
    const subscriptionLine = line();
    const initialCart = cart({ lines: [oneTimeLine, subscriptionLine], subtotal: '26.20' });
    const updatedCart = cart({
      lines: [
        oneTimeLine,
        line({ quantity: 3, totalAmount: '24.30' }),
      ],
      subtotal: '34.30',
    });
    storefrontMocks.request
      .mockResolvedValueOnce({
        data: { cartCreate: { cart: initialCart, userErrors: [], warnings: [] } },
      } satisfies { data: CartCreateData })
      .mockResolvedValueOnce({
        data: { cartLinesUpdate: { cart: updatedCart, userErrors: [], warnings: [] } },
      } satisfies { data: CartLinesUpdateData });

    await useCartStore.getState().addItem(input);
    expect(useCartStore.getState().items).toMatchObject([
      { lineId: 'gid://shopify/CartLine/one-time', sellingPlanId: undefined },
      { lineId: 'gid://shopify/CartLine/subscription', sellingPlanId: input.sellingPlanId },
    ]);

    await useCartStore.getState().updateQuantity('gid://shopify/CartLine/subscription', 3);

    expect(storefrontMocks.request.mock.calls[1]).toEqual([
      CART_LINES_UPDATE_MUTATION,
      {
        cartId: initialCart.id,
        lines: [{ id: 'gid://shopify/CartLine/subscription', quantity: 3 }],
      },
    ]);
    expect(useCartStore.getState().items[1]).toMatchObject({
      lineId: 'gid://shopify/CartLine/subscription',
      quantity: 3,
      lineSubtotal: usd('24.30'),
    });
  });

  it('rehydrates the cart without erasing an undismissed mutation warning', async () => {
    setCartState(cart());
    useCartStore.setState({ warnings: [stockWarning] });
    const pickupAttributes: CartAttribute[] = [
      { key: 'Fulfillment Method', value: 'Pickup' },
      { key: 'Preferred Pickup Window', value: '10:00 AM – 12:00 PM' },
    ];
    const remote = cart({
      attributes: pickupAttributes,
      subtotal: '24.30',
      lines: [
        line({
          quantity: 3,
          totalAmount: '24.30',
          attributes: [{ key: 'Rotation Week', value: 'week-b' }],
        }),
      ],
    });
    storefrontMocks.request.mockResolvedValueOnce({
      data: { cart: remote },
    } satisfies { data: CartQueryData });

    await useCartStore.getState().syncCart();

    expect(storefrontMocks.request).toHaveBeenCalledWith(CART_QUERY, { id: remote.id });
    expect(useCartStore.getState()).toMatchObject({
      subtotal: usd('24.30'),
      fulfillmentMethod: 'pickup',
      deliveryWindow: 'pickup-10am-12pm',
      fulfillmentAttributesConfirmed: true,
      warnings: [stockWarning],
      items: [
        {
          quantity: 3,
          lineSubtotal: usd('24.30'),
          sellingPlanId: input.sellingPlanId,
          attributes: [{ key: 'Rotation Week', value: 'week-b' }],
        },
      ],
    });
  });

  it('keeps the last cart on a transient sync error and clears a missing remote cart', async () => {
    const existing = cart();
    setCartState(existing);
    useCartStore.setState({ warnings: [stockWarning] });
    storefrontMocks.request
      .mockRejectedValueOnce(new StorefrontApiError('Offline', 'network'))
      .mockResolvedValueOnce({ data: { cart: null } } satisfies { data: CartQueryData });

    await useCartStore.getState().syncCart();
    expect(useCartStore.getState()).toMatchObject({
      cartId: existing.id,
      items: [{ lineId: existing.lines.edges[0].node.id }],
      warnings: [stockWarning],
      error: 'We could not reach the store. Check your connection and try again.',
    });

    await useCartStore.getState().syncCart();
    expect(useCartStore.getState()).toMatchObject({ cartId: null, items: [], warnings: [] });
  });
});

describe('fulfillment confirmation and checkout', () => {
  beforeEach(() => {
    storefrontMocks.request.mockReset();
    localStorage.clear();
    useCartStore.getState().clearCart();
    setCartState(cart());
  });

  it('confirms delivery attributes and reconfirms them immediately before checkout', async () => {
    const attributes: CartAttribute[] = [
      { key: 'Fulfillment Method', value: 'Delivery' },
      { key: 'Preferred Dropoff Window', value: 'Monday, 9:00 AM – 11:00 AM' },
    ];
    const confirmed = cart({ attributes });
    storefrontMocks.request
      .mockResolvedValueOnce({
        data: { cartAttributesUpdate: { cart: confirmed, userErrors: [], warnings: [] } },
      } satisfies { data: CartAttributesUpdateData })
      .mockResolvedValueOnce({
        data: { cartAttributesUpdate: { cart: confirmed, userErrors: [], warnings: [] } },
      } satisfies { data: CartAttributesUpdateData });

    await useCartStore.getState().setDeliveryWindow('9am-11am');
    expect(useCartStore.getState().fulfillmentAttributesConfirmed).toBe(true);
    await expect(useCartStore.getState().prepareCheckout()).resolves.toBe(
      'https://thyme-time-store-brreo.myshopify.com/checkouts/test?channel=online_store',
    );
    expect(storefrontMocks.request).toHaveBeenNthCalledWith(2, CART_ATTRIBUTES_UPDATE_MUTATION, {
      cartId: confirmed.id,
      attributes,
    });
  });

  it('blocks checkout when Shopify returns an orphaned bundle add-on', async () => {
    const attributes: CartAttribute[] = [
      { key: 'Fulfillment Method', value: 'Delivery' },
      { key: 'Preferred Dropoff Window', value: 'Monday, 9:00 AM – 11:00 AM' },
    ];
    const orphanedCart = cart({
      attributes,
      lines: [line({
        lineId: 'gid://shopify/CartLine/orphan-add-on',
        sellingPlanId: null,
        quantity: 1,
        unitAmount: '3.00',
        totalAmount: '3.00',
        attributes: [
          { key: '_bundle_instance', value: 'removed-bundle' },
          { key: '_bundle_role', value: 'add-on' },
          { key: '_bundle_add_on_type', value: 'hibiscus-tea' },
        ],
      })],
      subtotal: '3.00',
    });
    useCartStore.setState({
      fulfillmentMethod: 'delivery',
      deliveryWindow: '9am-11am',
      fulfillmentAttributesConfirmed: true,
    });
    storefrontMocks.request.mockResolvedValueOnce({
      data: {
        cartAttributesUpdate: { cart: orphanedCart, userErrors: [], warnings: [] },
      },
    } satisfies { data: CartAttributesUpdateData });

    await expect(useCartStore.getState().prepareCheckout()).rejects.toThrow(
      'An add-on must remain with its bundle',
    );
    expect(useCartStore.getState().fulfillmentAttributesConfirmed).toBe(false);
  });

  it('blocks checkout when Shopify returns a changed Hibiscus add-on price', async () => {
    const attributes: CartAttribute[] = [
      { key: 'Fulfillment Method', value: 'Delivery' },
      { key: 'Preferred Dropoff Window', value: 'Monday, 9:00 AM – 11:00 AM' },
    ];
    const bundleInstance = 'server-price-check';
    const changedPriceCart = cart({
      attributes,
      lines: [
        line({
          lineId: 'gid://shopify/CartLine/bundle-primary',
          sellingPlanId: null,
          quantity: 1,
          unitAmount: '94.99',
          totalAmount: '94.99',
          attributes: [
            { key: '_bundle_instance', value: bundleInstance },
            { key: '_bundle_role', value: 'primary' },
          ],
        }),
        line({
          lineId: 'gid://shopify/CartLine/changed-price-add-on',
          sellingPlanId: null,
          quantity: 1,
          unitAmount: '4.00',
          totalAmount: '4.00',
          attributes: [
            { key: '_bundle_instance', value: bundleInstance },
            { key: '_bundle_role', value: 'add-on' },
            { key: '_bundle_add_on_type', value: 'hibiscus-tea' },
          ],
        }),
      ],
      subtotal: '98.99',
    });
    useCartStore.setState({
      fulfillmentMethod: 'delivery',
      deliveryWindow: '9am-11am',
      fulfillmentAttributesConfirmed: true,
    });
    storefrontMocks.request.mockResolvedValueOnce({
      data: {
        cartAttributesUpdate: { cart: changedPriceCart, userErrors: [], warnings: [] },
      },
    } satisfies { data: CartAttributesUpdateData });

    await expect(useCartStore.getState().prepareCheckout()).rejects.toThrow(
      'approved $3.00 USD Hibiscus add-on price could not be verified',
    );
    expect(useCartStore.getState().fulfillmentAttributesConfirmed).toBe(false);
  });

  it('preserves pickup and writes only the pickup-specific window key', async () => {
    const attributes: CartAttribute[] = [
      { key: 'Fulfillment Method', value: 'Pickup' },
      { key: 'Preferred Pickup Window', value: '10:00 AM – 12:00 PM' },
    ];
    const confirmed = cart({ attributes });
    storefrontMocks.request
      .mockResolvedValueOnce({
        data: { cartAttributesUpdate: { cart: confirmed, userErrors: [], warnings: [] } },
      } satisfies { data: CartAttributesUpdateData })
      .mockResolvedValueOnce({
        data: { cartAttributesUpdate: { cart: confirmed, userErrors: [], warnings: [] } },
      } satisfies { data: CartAttributesUpdateData });

    useCartStore.getState().setFulfillmentMethod('pickup');
    await useCartStore.getState().setDeliveryWindow('pickup-10am-12pm');

    expect(storefrontMocks.request).toHaveBeenNthCalledWith(1, CART_ATTRIBUTES_UPDATE_MUTATION, {
      cartId: confirmed.id,
      attributes,
    });
    expect(useCartStore.getState()).toMatchObject({
      fulfillmentMethod: 'pickup',
      deliveryWindow: 'pickup-10am-12pm',
      fulfillmentAttributesConfirmed: true,
    });
    await expect(useCartStore.getState().prepareCheckout()).resolves.toContain('/checkouts/test');
  });

  it('rejects a method/window mismatch before contacting Shopify', async () => {
    useCartStore.getState().setFulfillmentMethod('pickup');
    await expect(useCartStore.getState().setDeliveryWindow('9am-11am')).rejects.toThrow(
      'valid pickup window',
    );
    expect(storefrontMocks.request).not.toHaveBeenCalled();
    expect(useCartStore.getState().fulfillmentAttributesConfirmed).toBe(false);
  });

  it('does not return checkout when Shopify fails to echo fulfillment attributes', async () => {
    useCartStore.setState({
      fulfillmentMethod: 'delivery',
      deliveryWindow: '9am-11am',
      fulfillmentAttributesConfirmed: false,
    });
    storefrontMocks.request.mockResolvedValueOnce({
      data: {
        cartAttributesUpdate: { cart: cart({ attributes: [] }), userErrors: [], warnings: [] },
      },
    } satisfies { data: CartAttributesUpdateData });

    await expect(useCartStore.getState().prepareCheckout()).rejects.toMatchObject({
      code: 'invalid-response',
    });
    expect(useCartStore.getState().fulfillmentAttributesConfirmed).toBe(false);
  });
});
