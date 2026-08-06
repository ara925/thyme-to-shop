import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CartAttribute,
  CartCreateData,
  CartLinesAddData,
  CartLinesUpdateData,
  CartAttributesUpdateData,
  MoneyV2,
  ShopifyCart,
  ShopifyCartLine,
  ShopifyProduct,
} from '@/lib/shopify';
import {
  CART_ATTRIBUTES_UPDATE_MUTATION,
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_UPDATE_MUTATION,
} from '@/lib/shopify';
import { getOrderableWeekTag, type WeekTag } from '@/lib/weekRotation';

const storefrontMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock('@/lib/shopify', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shopify')>('@/lib/shopify');
  return {
    ...actual,
    storefrontApiRequest: storefrontMocks.request,
  };
});

import { type CartItemInput, useCartStore } from '@/stores/cartStore';

const usd = (amount: string): MoneyV2 => ({ amount, currencyCode: 'USD' });

const product: ShopifyProduct = {
  node: {
    id: 'gid://shopify/Product/1',
    title: 'Test Meal',
    description: 'A test meal',
    handle: 'test-meal',
    productType: 'Meal',
    tags: ['meal', 'week-a', 'week-b', 'week-c'],
    priceRange: { minVariantPrice: usd('99.00') },
    images: {
      edges: [
        {
          node: {
            url: 'https://cdn.shopify.com/test-meal.jpg',
            altText: 'Test Meal',
            width: 800,
            height: 800,
          },
        },
      ],
    },
    variants: {
      edges: [
        {
          node: {
            id: 'gid://shopify/ProductVariant/1',
            title: 'Default Title',
            price: usd('99.00'),
            availableForSale: true,
            selectedOptions: [{ name: 'Title', value: 'Default Title' }],
          },
        },
      ],
    },
    options: [{ name: 'Title', values: ['Default Title'] }],
    metafields: [],
  },
};

const input: CartItemInput = {
  product,
  variantId: 'gid://shopify/ProductVariant/1',
  variantTitle: 'Default Title',
  price: usd('99.00'),
  quantity: 2,
  selectedOptions: [{ name: 'Title', value: 'Default Title' }],
  sellingPlanId: 'gid://shopify/SellingPlan/weekly',
};

function line({
  lineId = 'gid://shopify/CartLine/subscription',
  quantity = 2,
  sellingPlanId = 'gid://shopify/SellingPlan/weekly',
  unitAmount = '8.10',
  totalAmount = '16.20',
  attributes = [],
  productTags,
}: {
  lineId?: string;
  quantity?: number;
  sellingPlanId?: string | null;
  unitAmount?: string;
  totalAmount?: string;
  attributes?: CartAttribute[];
  productTags?: string[];
} = {}): ShopifyCartLine {
  const { variants: _variants, ...productWithoutVariants } = product.node;
  return {
    id: lineId,
    quantity,
    attributes,
    merchandise: {
      ...product.node.variants.edges[0].node,
      price: usd('99.00'),
      product: { ...productWithoutVariants, tags: productTags || productWithoutVariants.tags },
    },
    sellingPlanAllocation: sellingPlanId
      ? { sellingPlan: { id: sellingPlanId, name: 'Weekly delivery' } }
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
  lines = [line()],
  attributes = [],
  subtotal = '16.20',
}: {
  id?: string;
  lines?: ShopifyCartLine[];
  attributes?: CartAttribute[];
  subtotal?: string;
} = {}): ShopifyCart {
  return {
    id,
    checkoutUrl: 'https://thyme-time-store-brreo.myshopify.com/checkouts/test',
    totalQuantity: lines.reduce((total, item) => total + item.quantity, 0),
    attributes,
    cost: {
      subtotalAmount: usd(subtotal),
      totalAmount: usd(subtotal),
    },
    lines: { edges: lines.map((node) => ({ node })) },
  };
}

function resetStore() {
  localStorage.clear();
  useCartStore.getState().clearCart();
  useCartStore.setState({ isLoading: false, isSyncing: false });
}

describe('useCartStore Shopify synchronization', () => {
  beforeEach(() => {
    storefrontMocks.request.mockReset();
    resetStore();
  });

  it('reconstructs cart lines and totals from Shopify instead of trusting submitted prices', async () => {
    const serverCart = cart();
    storefrontMocks.request.mockResolvedValueOnce({
      cartCreate: { cart: serverCart, userErrors: [] },
    } satisfies CartCreateData);

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
    const state = useCartStore.getState();
    expect(state.cartId).toBe(serverCart.id);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      lineId: 'gid://shopify/CartLine/subscription',
      variantId: input.variantId,
      sellingPlanId: input.sellingPlanId,
      quantity: 2,
      price: usd('8.10'),
      lineSubtotal: usd('16.20'),
    });
    expect(state.getTotalItems()).toBe(2);
    expect(state.getTotalPrice()).toBe(16.2);
    expect(state.subtotal).toEqual(usd('16.20'));
  });

  it('rejects a Shopify add error so callers cannot report a successful add', async () => {
    storefrontMocks.request.mockResolvedValueOnce({
      cartCreate: {
        cart: null,
        userErrors: [{ field: ['input', 'lines'], message: 'Selling plan is not available' }],
      },
    } satisfies CartCreateData);

    await expect(useCartStore.getState().addItem(input)).rejects.toMatchObject({
      code: 'graphql',
      message: 'Selling plan is not available',
    });
    expect(useCartStore.getState()).toMatchObject({
      cartId: null,
      items: [],
      isLoading: false,
    });
  });

  it('recreates an expired cart and retries the requested lines once', async () => {
    useCartStore.setState({
      cartId: 'gid://shopify/Cart/expired',
      items: [
        {
          ...input,
          lineId: 'gid://shopify/CartLine/old',
          lineSubtotal: usd('198.00'),
        },
      ],
      checkoutUrl: 'https://thyme-time-store-brreo.myshopify.com/checkouts/expired',
      subtotal: usd('198.00'),
    });
    const recreated = cart({ id: 'gid://shopify/Cart/recreated' });
    storefrontMocks.request
      .mockResolvedValueOnce({
        cartLinesAdd: {
          cart: null,
          userErrors: [{ field: ['cartId'], message: 'Cart not found' }],
        },
      } satisfies CartLinesAddData)
      .mockResolvedValueOnce({
        cartCreate: { cart: recreated, userErrors: [] },
      } satisfies CartCreateData);

    await useCartStore.getState().addItem(input);

    expect(storefrontMocks.request).toHaveBeenCalledTimes(2);
    expect(storefrontMocks.request.mock.calls[0]).toEqual([
      CART_LINES_ADD_MUTATION,
      {
        cartId: 'gid://shopify/Cart/expired',
        lines: [
          {
            quantity: 2,
            merchandiseId: input.variantId,
            sellingPlanId: input.sellingPlanId,
          },
        ],
      },
    ]);
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
    const subscriptionLine = line({
      lineId: 'gid://shopify/CartLine/subscription',
      quantity: 2,
      sellingPlanId: 'gid://shopify/SellingPlan/weekly',
      unitAmount: '8.10',
      totalAmount: '16.20',
    });
    const initialCart = cart({ lines: [oneTimeLine, subscriptionLine], subtotal: '26.20' });
    const updatedCart = cart({
      lines: [
        oneTimeLine,
        line({
          lineId: 'gid://shopify/CartLine/subscription',
          quantity: 3,
          sellingPlanId: 'gid://shopify/SellingPlan/weekly',
          unitAmount: '8.10',
          totalAmount: '24.30',
        }),
      ],
      subtotal: '34.30',
    });
    storefrontMocks.request
      .mockResolvedValueOnce({
        cartCreate: { cart: initialCart, userErrors: [] },
      } satisfies CartCreateData)
      .mockResolvedValueOnce({
        cartLinesUpdate: { cart: updatedCart, userErrors: [] },
      } satisfies CartLinesUpdateData);

    await useCartStore.getState().addItem(input);
    expect(useCartStore.getState().items).toMatchObject([
      { lineId: 'gid://shopify/CartLine/one-time', sellingPlanId: undefined },
      {
        lineId: 'gid://shopify/CartLine/subscription',
        sellingPlanId: 'gid://shopify/SellingPlan/weekly',
      },
    ]);

    await useCartStore
      .getState()
      .updateQuantity('gid://shopify/CartLine/subscription', 3);

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

  it('does not return a checkout URL until Shopify confirms fulfillment attributes', async () => {
    const baseCart = cart();
    useCartStore.setState({
      cartId: baseCart.id,
      checkoutUrl: baseCart.checkoutUrl,
      items: [
        {
          ...input,
          lineId: baseCart.lines.edges[0].node.id,
          price: usd('8.10'),
          lineSubtotal: usd('16.20'),
        },
      ],
      subtotal: usd('16.20'),
      fulfillmentMethod: 'delivery',
      deliveryWindow: '9am-11am',
      fulfillmentAttributesConfirmed: false,
    });
    storefrontMocks.request.mockResolvedValueOnce({
      cartAttributesUpdate: { cart: baseCart, userErrors: [] },
    } satisfies CartAttributesUpdateData);

    await expect(useCartStore.getState().prepareCheckout()).rejects.toMatchObject({
      code: 'invalid-response',
    });
    expect(useCartStore.getState().fulfillmentAttributesConfirmed).toBe(false);

    const confirmedAttributes: CartAttribute[] = [
      { key: 'Preferred Dropoff Window', value: '9:00 AM – 11:00 AM' },
      { key: 'Fulfillment Method', value: 'Delivery' },
    ];
    storefrontMocks.request.mockResolvedValueOnce({
      cartAttributesUpdate: {
        cart: cart({ attributes: confirmedAttributes }),
        userErrors: [],
      },
    } satisfies CartAttributesUpdateData);

    await expect(useCartStore.getState().prepareCheckout()).resolves.toBe(
      'https://thyme-time-store-brreo.myshopify.com/checkouts/test?channel=online_store',
    );
    expect(storefrontMocks.request.mock.calls[1]).toEqual([
      CART_ATTRIBUTES_UPDATE_MUTATION,
      {
        cartId: baseCart.id,
        attributes: confirmedAttributes,
      },
    ]);
    expect(useCartStore.getState().fulfillmentAttributesConfirmed).toBe(true);
  });

  it('blocks checkout when a rotating item belongs to a closed menu week', async () => {
    const currentWeek = getOrderableWeekTag();
    const staleWeek = (['week-a', 'week-b', 'week-c'] as WeekTag[]).find(
      (week) => week !== currentWeek,
    )!;
    const confirmedAttributes: CartAttribute[] = [
      { key: 'Preferred Dropoff Window', value: '9:00 AM – 11:00 AM' },
      { key: 'Fulfillment Method', value: 'Delivery' },
    ];
    const staleCart = cart({
      attributes: confirmedAttributes,
      lines: [line({ productTags: [staleWeek] })],
    });
    useCartStore.setState({
      cartId: staleCart.id,
      items: [
        {
          ...input,
          lineId: staleCart.lines.edges[0].node.id,
          price: staleCart.lines.edges[0].node.cost.amountPerQuantity,
          lineSubtotal: staleCart.lines.edges[0].node.cost.totalAmount,
        },
      ],
      fulfillmentMethod: 'delivery',
      deliveryWindow: '9am-11am',
    });
    storefrontMocks.request.mockResolvedValueOnce({
      cartAttributesUpdate: { cart: staleCart, userErrors: [] },
    } satisfies CartAttributesUpdateData);

    await expect(useCartStore.getState().prepareCheckout()).rejects.toThrow(
      'The ordering menu has changed',
    );
  });
});
