import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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
  type CartLinesRemoveData,
  type CartLinesUpdateData,
  type CartMutationPayload,
  type CartQueryData,
  type MoneyV2,
  type ShopifyCart,
  type ShopifyCartLine,
  type ShopifyProduct,
  type ShopifyProductNode,
  type ShopifyUserError,
  StorefrontApiError,
  formatCheckoutUrl,
  getStorefrontErrorMessage,
  isCartNotFoundError,
  storefrontApiRequest,
} from '@/lib/shopify';
import {
  DROPOFF_WINDOWS,
  PICKUP_WINDOWS,
  type FulfillmentMethod,
  type FulfillmentWindow,
} from '@/lib/orderCutoff';
import { getOrderableWeekTag } from '@/lib/weekRotation';

export interface CartItemInput {
  product: ShopifyProduct;
  variantId: string;
  variantTitle: string;
  price: MoneyV2;
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
  sellingPlanId?: string;
  attributes?: CartAttribute[];
}

export interface CartItem extends CartItemInput {
  lineId: string;
  lineSubtotal: MoneyV2;
}

interface CartStore {
  items: CartItem[];
  cartId: string | null;
  checkoutUrl: string | null;
  subtotal: MoneyV2 | null;
  deliveryWindow: FulfillmentWindow | '';
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentAttributesConfirmed: boolean;
  error: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  addItem: (item: CartItemInput) => Promise<void>;
  addItems: (items: CartItemInput[]) => Promise<void>;
  updateQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
  setFulfillmentMethod: (method: FulfillmentMethod) => void;
  setDeliveryWindow: (window: FulfillmentWindow) => Promise<void>;
  clearCart: () => void;
  clearError: () => void;
  syncCart: () => Promise<void>;
  prepareCheckout: () => Promise<string>;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

let operationQueue: Promise<void> = Promise.resolve();

function enqueueCartOperation<T>(operation: () => Promise<T>): Promise<T> {
  const queued = operationQueue.then(operation, operation);
  operationQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function getAttribute(attributes: CartAttribute[], key: string): string | undefined {
  return attributes.find((attribute) => attribute.key === key)?.value;
}

function getWindowLabel(window: FulfillmentWindow): string {
  return [...DROPOFF_WINDOWS, ...PICKUP_WINDOWS].find((item) => item.value === window)?.label || window;
}

function getWindowValue(label: string | undefined, method: FulfillmentMethod): FulfillmentWindow | '' {
  if (!label) return '';
  const windows = method === 'pickup' ? PICKUP_WINDOWS : DROPOFF_WINDOWS;
  return windows.find((window) => window.label === label)?.value || '';
}

function buildFulfillmentAttributes(
  method: FulfillmentMethod,
  window: FulfillmentWindow,
): CartAttribute[] {
  const label = getWindowLabel(window);
  const attributes: CartAttribute[] = [
    { key: 'Preferred Dropoff Window', value: label },
    { key: 'Fulfillment Method', value: method === 'pickup' ? 'Pickup' : 'Delivery' },
  ];
  if (method === 'pickup') {
    attributes.push({ key: 'Preferred Pickup Window', value: label });
  }
  return attributes;
}

function fulfillmentAttributesMatch(
  attributes: CartAttribute[],
  method: FulfillmentMethod,
  window: FulfillmentWindow,
): boolean {
  const expected = buildFulfillmentAttributes(method, window);
  return expected.every(
    (attribute) => getAttribute(attributes, attribute.key) === attribute.value,
  );
}

function cartMatchesOrderableCatalog(cart: ShopifyCart, now: Date = new Date()): boolean {
  const orderableWeek = getOrderableWeekTag(now);
  return cart.lines.edges.every(({ node: line }) => {
    const { productType, tags } = line.merchandise.product;
    if (productType !== 'Meal' && productType !== 'Juice') return true;
    return tags.includes(orderableWeek);
  });
}

function throwPayloadErrors(payload: CartMutationPayload | undefined, action: string): ShopifyCart {
  if (!payload) {
    throw new StorefrontApiError(`${action} returned no payload`, 'invalid-response');
  }
  if (payload.userErrors.length > 0) {
    throw new StorefrontApiError(
      payload.userErrors.map((error) => error.message).join(', '),
      'graphql',
    );
  }
  if (!payload.cart) {
    throw new StorefrontApiError(`${action} returned no cart`, 'invalid-response');
  }
  return payload.cart;
}

function toProduct(line: ShopifyCartLine): ShopifyProduct {
  const { product, ...variant } = line.merchandise;
  const node: ShopifyProductNode = {
    ...product,
    variants: { edges: [{ node: variant }] },
  };
  return { node };
}

function toCartItems(cart: ShopifyCart): CartItem[] {
  return cart.lines.edges.map(({ node: line }) => ({
    lineId: line.id,
    product: toProduct(line),
    variantId: line.merchandise.id,
    variantTitle: line.merchandise.title,
    price: line.cost.amountPerQuantity,
    lineSubtotal: line.cost.totalAmount,
    quantity: line.quantity,
    selectedOptions: line.merchandise.selectedOptions,
    sellingPlanId: line.sellingPlanAllocation?.sellingPlan.id,
    attributes: line.attributes,
  }));
}

function getFulfillmentState(cart: ShopifyCart): Pick<
  CartStore,
  'fulfillmentMethod' | 'deliveryWindow' | 'fulfillmentAttributesConfirmed'
> {
  const method: FulfillmentMethod =
    getAttribute(cart.attributes, 'Fulfillment Method') === 'Pickup' ? 'pickup' : 'delivery';
  const preferredLabel =
    method === 'pickup'
      ? getAttribute(cart.attributes, 'Preferred Pickup Window') ||
        getAttribute(cart.attributes, 'Preferred Dropoff Window')
      : getAttribute(cart.attributes, 'Preferred Dropoff Window');
  const deliveryWindow = getWindowValue(preferredLabel, method);
  return {
    fulfillmentMethod: method,
    deliveryWindow,
    fulfillmentAttributesConfirmed:
      deliveryWindow !== '' && fulfillmentAttributesMatch(cart.attributes, method, deliveryWindow),
  };
}

function stateFromCart(cart: ShopifyCart): Partial<CartStore> {
  if (cart.totalQuantity === 0 || cart.lines.edges.length === 0) {
    return emptyCartState();
  }
  return {
    items: toCartItems(cart),
    cartId: cart.id,
    checkoutUrl: formatCheckoutUrl(cart.checkoutUrl),
    subtotal: cart.cost.subtotalAmount,
    error: null,
    ...getFulfillmentState(cart),
  };
}

function emptyCartState(): Pick<
  CartStore,
  | 'items'
  | 'cartId'
  | 'checkoutUrl'
  | 'subtotal'
  | 'deliveryWindow'
  | 'fulfillmentMethod'
  | 'fulfillmentAttributesConfirmed'
  | 'error'
> {
  return {
    items: [],
    cartId: null,
    checkoutUrl: null,
    subtotal: null,
    deliveryWindow: '',
    fulfillmentMethod: 'delivery',
    fulfillmentAttributesConfirmed: false,
    error: null,
  };
}

function toCartLineInput(item: CartItemInput): Record<string, unknown> {
  if (item.quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  const selectedVariant = item.product.node.variants.edges.find(
    ({ node }) => node.id === item.variantId,
  )?.node;
  if (!selectedVariant?.availableForSale) {
    throw new Error(`${item.product.node.title} is sold out.`);
  }
  return {
    quantity: item.quantity,
    merchandiseId: item.variantId,
    ...(item.sellingPlanId ? { sellingPlanId: item.sellingPlanId } : {}),
    ...(item.attributes?.length ? { attributes: item.attributes } : {}),
  };
}

async function createCart(items: CartItemInput[]): Promise<ShopifyCart> {
  const data = await storefrontApiRequest<CartCreateData>(CART_CREATE_MUTATION, {
    input: { lines: items.map(toCartLineInput) },
  });
  return throwPayloadErrors(data.cartCreate, 'Cart creation');
}

async function addCartLines(cartId: string, items: CartItemInput[]): Promise<ShopifyCart> {
  const data = await storefrontApiRequest<CartLinesAddData>(CART_LINES_ADD_MUTATION, {
    cartId,
    lines: items.map(toCartLineInput),
  });
  const errors: ShopifyUserError[] = data.cartLinesAdd?.userErrors || [];
  if (isCartNotFoundError(errors)) {
    return createCart(items);
  }
  return throwPayloadErrors(data.cartLinesAdd, 'Adding cart items');
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      ...emptyCartState(),
      isLoading: false,
      isSyncing: false,

      addItem: async (item) => get().addItems([item]),

      addItems: async (items) =>
        enqueueCartOperation(async () => {
          if (items.length === 0) return;
          set({ isLoading: true, error: null });
          try {
            const cartId = get().cartId;
            const cart = cartId ? await addCartLines(cartId, items) : await createCart(items);
            set(stateFromCart(cart));
          } catch (error) {
            const message = error instanceof Error && !(
              error instanceof StorefrontApiError
            ) ? error.message : getStorefrontErrorMessage(error);
            set({ error: message });
            throw error;
          } finally {
            set({ isLoading: false });
          }
        }),

      updateQuantity: async (lineId, quantity) => {
        if (quantity <= 0) {
          await get().removeItem(lineId);
          return;
        }
        await enqueueCartOperation(async () => {
          const cartId = get().cartId;
          if (!cartId) throw new Error('Your cart is no longer available.');
          set({ isLoading: true, error: null });
          try {
            const data = await storefrontApiRequest<CartLinesUpdateData>(
              CART_LINES_UPDATE_MUTATION,
              { cartId, lines: [{ id: lineId, quantity }] },
            );
            const errors = data.cartLinesUpdate?.userErrors || [];
            if (isCartNotFoundError(errors)) {
              set(emptyCartState());
              throw new Error('Your cart expired. Please add the item again.');
            }
            set(stateFromCart(throwPayloadErrors(data.cartLinesUpdate, 'Updating cart item')));
          } catch (error) {
            const message = error instanceof Error && !(error instanceof StorefrontApiError)
              ? error.message
              : getStorefrontErrorMessage(error);
            set({ error: message });
            throw error;
          } finally {
            set({ isLoading: false });
          }
        });
      },

      removeItem: async (lineId) =>
        enqueueCartOperation(async () => {
          const cartId = get().cartId;
          if (!cartId) return;
          set({ isLoading: true, error: null });
          try {
            const data = await storefrontApiRequest<CartLinesRemoveData>(
              CART_LINES_REMOVE_MUTATION,
              { cartId, lineIds: [lineId] },
            );
            const errors = data.cartLinesRemove?.userErrors || [];
            if (isCartNotFoundError(errors)) {
              set(emptyCartState());
              return;
            }
            set(stateFromCart(throwPayloadErrors(data.cartLinesRemove, 'Removing cart item')));
          } catch (error) {
            const message = getStorefrontErrorMessage(error);
            set({ error: message });
            throw error;
          } finally {
            set({ isLoading: false });
          }
        }),

      setFulfillmentMethod: (method) =>
        set({
          fulfillmentMethod: method,
          deliveryWindow: '',
          fulfillmentAttributesConfirmed: false,
          error: null,
        }),

      setDeliveryWindow: async (window) =>
        enqueueCartOperation(async () => {
          const { cartId, fulfillmentMethod } = get();
          if (!cartId) throw new Error('Add an item before selecting a fulfillment window.');
          set({ isLoading: true, fulfillmentAttributesConfirmed: false, error: null });
          try {
            const attributes = buildFulfillmentAttributes(fulfillmentMethod, window);
            const data = await storefrontApiRequest<CartAttributesUpdateData>(
              CART_ATTRIBUTES_UPDATE_MUTATION,
              { cartId, attributes },
            );
            const cart = throwPayloadErrors(
              data.cartAttributesUpdate,
              'Saving fulfillment preferences',
            );
            if (!fulfillmentAttributesMatch(cart.attributes, fulfillmentMethod, window)) {
              throw new StorefrontApiError(
                'Shopify did not confirm the fulfillment preferences',
                'invalid-response',
              );
            }
            set(stateFromCart(cart));
          } catch (error) {
            const message = getStorefrontErrorMessage(error);
            set({ error: message, fulfillmentAttributesConfirmed: false });
            throw error;
          } finally {
            set({ isLoading: false });
          }
        }),

      prepareCheckout: async () =>
        enqueueCartOperation(async () => {
          const { cartId, fulfillmentMethod, deliveryWindow, items } = get();
          if (!cartId || items.length === 0) throw new Error('Your cart is empty.');
          if (!deliveryWindow) throw new Error('Select a fulfillment window before checkout.');
          set({ isLoading: true, fulfillmentAttributesConfirmed: false, error: null });
          try {
            const attributes = buildFulfillmentAttributes(fulfillmentMethod, deliveryWindow);
            const data = await storefrontApiRequest<CartAttributesUpdateData>(
              CART_ATTRIBUTES_UPDATE_MUTATION,
              { cartId, attributes },
            );
            const cart = throwPayloadErrors(data.cartAttributesUpdate, 'Preparing checkout');
            if (cart.totalQuantity === 0) throw new Error('Your cart is empty.');
            if (!cartMatchesOrderableCatalog(cart)) {
              throw new Error(
                'The ordering menu has changed. Remove unavailable weekly items and add them again before checkout.',
              );
            }
            if (!fulfillmentAttributesMatch(cart.attributes, fulfillmentMethod, deliveryWindow)) {
              throw new StorefrontApiError(
                'Shopify did not confirm the fulfillment preferences',
                'invalid-response',
              );
            }
            const checkoutUrl = formatCheckoutUrl(cart.checkoutUrl);
            set(stateFromCart(cart));
            return checkoutUrl;
          } catch (error) {
            const message = error instanceof Error && !(error instanceof StorefrontApiError)
              ? error.message
              : getStorefrontErrorMessage(error);
            set({ error: message, fulfillmentAttributesConfirmed: false });
            throw error;
          } finally {
            set({ isLoading: false });
          }
        }),

      clearCart: () => set(emptyCartState()),
      clearError: () => set({ error: null }),

      syncCart: async () => {
        const { cartId, isSyncing } = get();
        if (!cartId || isSyncing) return;
        set({ isSyncing: true });
        try {
          const data = await storefrontApiRequest<CartQueryData>(CART_QUERY, { id: cartId });
          if (!data.cart) {
            set(emptyCartState());
            return;
          }
          set(stateFromCart(data.cart));
        } catch (error) {
          set({ error: getStorefrontErrorMessage(error) });
        } finally {
          set({ isSyncing: false });
        }
      },

      getTotalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
      getTotalPrice: () => Number.parseFloat(get().subtotal?.amount || '0'),
    }),
    {
      name: 'place-in-thyme-cart',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: () => ({ ...emptyCartState(), isLoading: false, isSyncing: false }),
      partialize: (state) => ({
        items: state.items,
        cartId: state.cartId,
        checkoutUrl: state.checkoutUrl,
        subtotal: state.subtotal,
        deliveryWindow: state.deliveryWindow,
        fulfillmentMethod: state.fulfillmentMethod,
        fulfillmentAttributesConfirmed: state.fulfillmentAttributesConfirmed,
      }),
    },
  ),
);
