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
  type ShopifyCartWarning,
  type ShopifyProduct,
  type ShopifyProductNode,
  type ShopifyUserError,
  StorefrontApiError,
  formatCheckoutUrl,
  formatPrice,
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
  warnings: ShopifyCartWarning[];
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
  clearWarnings: () => void;
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

const MINIMUM_GROUP_ATTRIBUTE = '_minimum_group';
const MINIMUM_CENTS_ATTRIBUTE = '_minimum_cents';
const MINIMUM_CURRENCY_ATTRIBUTE = '_minimum_currency';
const MINIMUM_LABEL_ATTRIBUTE = '_minimum_label';

interface CartMinimumGroup {
  label: string;
  minimumCents: number;
  currencyCode: string;
  subtotalCents: number;
}

function moneyToCents(money: MoneyV2): number {
  const amount = Number.parseFloat(money.amount);
  if (!Number.isFinite(amount)) {
    throw new Error('Shopify returned an invalid cart price.');
  }
  return Math.round(amount * 100);
}

/** Revalidates planner and custom-bundle minimums using Shopify-returned line costs. */
export function validateCartMinimums(items: CartItem[]): void {
  const groups = new Map<string, CartMinimumGroup>();

  for (const item of items) {
    const attributes = item.attributes || [];
    const groupId = getAttribute(attributes, MINIMUM_GROUP_ATTRIBUTE);
    const minimumValue = getAttribute(attributes, MINIMUM_CENTS_ATTRIBUTE);

    if (!groupId && !minimumValue) continue;
    if (!groupId || !minimumValue) {
      throw new Error('A cart minimum rule is incomplete. Remove the affected item and add it again.');
    }

    const minimumCents = Number.parseInt(minimumValue, 10);
    if (!Number.isInteger(minimumCents) || minimumCents <= 0) {
      throw new Error('A cart minimum rule is invalid. Remove the affected item and add it again.');
    }

    const currencyCode =
      getAttribute(attributes, MINIMUM_CURRENCY_ATTRIBUTE) || item.lineSubtotal.currencyCode;
    if (currencyCode !== item.lineSubtotal.currencyCode) {
      throw new Error('Items with different currencies cannot share a purchase minimum.');
    }

    const label = getAttribute(attributes, MINIMUM_LABEL_ATTRIBUTE) || 'This selection';
    const existing = groups.get(groupId);
    if (existing) {
      if (
        existing.minimumCents !== minimumCents ||
        existing.currencyCode !== currencyCode ||
        existing.label !== label
      ) {
        throw new Error('A cart minimum rule is inconsistent. Remove the affected items and add them again.');
      }
      existing.subtotalCents += moneyToCents(item.lineSubtotal);
    } else {
      groups.set(groupId, {
        label,
        minimumCents,
        currencyCode,
        subtotalCents: moneyToCents(item.lineSubtotal),
      });
    }
  }

  for (const group of groups.values()) {
    if (group.subtotalCents < group.minimumCents) {
      const remaining = group.minimumCents - group.subtotalCents;
      throw new Error(
        `${group.label} needs ${formatPrice(
          (remaining / 100).toFixed(2),
          group.currencyCode,
        )} more before checkout.`,
      );
    }
  }
}

function getWindows(method: FulfillmentMethod) {
  return method === 'pickup' ? PICKUP_WINDOWS : DROPOFF_WINDOWS;
}

function getWindowLabel(method: FulfillmentMethod, window: FulfillmentWindow): string {
  const definition = getWindows(method).find((item) => item.value === window);
  if (!definition) {
    throw new Error(
      `Select a valid ${method === 'pickup' ? 'pickup' : 'delivery'} window.`,
    );
  }
  return definition.label;
}

function getWindowValue(
  label: string | undefined,
  method: FulfillmentMethod,
): FulfillmentWindow | '' {
  if (!label) return '';
  return getWindows(method).find((window) => window.label === label)?.value || '';
}

function buildFulfillmentAttributes(
  method: FulfillmentMethod,
  window: FulfillmentWindow,
): CartAttribute[] {
  const label = getWindowLabel(method, window);
  return [
    { key: 'Fulfillment Method', value: method === 'pickup' ? 'Pickup' : 'Delivery' },
    {
      key: method === 'pickup' ? 'Preferred Pickup Window' : 'Preferred Dropoff Window',
      value: label,
    },
  ];
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

interface SuccessfulCartMutation {
  cart: ShopifyCart;
  warnings: ShopifyCartWarning[];
}

function throwPayloadErrors(
  payload: CartMutationPayload | undefined,
  action: string,
): SuccessfulCartMutation {
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
  if (!Array.isArray(payload.warnings)) {
    throw new StorefrontApiError(`${action} returned no warnings list`, 'invalid-response');
  }
  return { cart: payload.cart, warnings: payload.warnings };
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
  const preferredLabel = getAttribute(
    cart.attributes,
    method === 'pickup' ? 'Preferred Pickup Window' : 'Preferred Dropoff Window',
  );
  const deliveryWindow = getWindowValue(preferredLabel, method);
  return {
    fulfillmentMethod: method,
    deliveryWindow,
    fulfillmentAttributesConfirmed:
      deliveryWindow !== '' && fulfillmentAttributesMatch(cart.attributes, method, deliveryWindow),
  };
}

function emptyCartState(): Pick<
  CartStore,
  | 'items'
  | 'warnings'
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
    warnings: [],
    cartId: null,
    checkoutUrl: null,
    subtotal: null,
    deliveryWindow: '',
    fulfillmentMethod: 'delivery',
    fulfillmentAttributesConfirmed: false,
    error: null,
  };
}

function stateFromCart(
  cart: ShopifyCart,
  warnings?: ShopifyCartWarning[],
): Partial<CartStore> {
  const warningState = warnings === undefined ? {} : { warnings };
  if (cart.totalQuantity === 0 || cart.lines.edges.length === 0) {
    return { ...emptyCartState(), ...warningState };
  }
  return {
    items: toCartItems(cart),
    ...warningState,
    cartId: cart.id,
    checkoutUrl: formatCheckoutUrl(cart.checkoutUrl),
    subtotal: cart.cost.subtotalAmount,
    error: null,
    ...getFulfillmentState(cart),
  };
}

function toCartLineInput(item: CartItemInput): Record<string, unknown> {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new Error('Quantity must be a positive whole number.');
  }
  const selectedVariant = item.product.node.variants.edges.find(
    ({ node }) => node.id === item.variantId,
  )?.node;
  if (!selectedVariant?.availableForSale) {
    throw new Error(`${item.product.node.title} is sold out.`);
  }
  if (selectedVariant.requiresComponents) {
    throw new Error(
      `${item.product.node.title} is configured as a bundle component and cannot be added on its own.`,
    );
  }
  return {
    quantity: item.quantity,
    merchandiseId: item.variantId,
    ...(item.sellingPlanId ? { sellingPlanId: item.sellingPlanId } : {}),
    ...(item.attributes?.length ? { attributes: item.attributes } : {}),
  };
}

async function createCart(items: CartItemInput[]): Promise<SuccessfulCartMutation> {
  const response = await storefrontApiRequest<CartCreateData>(CART_CREATE_MUTATION, {
    input: { lines: items.map(toCartLineInput) },
  });
  return throwPayloadErrors(response.data.cartCreate, 'Cart creation');
}

async function addCartLines(
  cartId: string,
  items: CartItemInput[],
): Promise<SuccessfulCartMutation> {
  const response = await storefrontApiRequest<CartLinesAddData>(CART_LINES_ADD_MUTATION, {
    cartId,
    lines: items.map(toCartLineInput),
  });
  const errors: ShopifyUserError[] = response.data.cartLinesAdd?.userErrors || [];
  if (isCartNotFoundError(errors)) {
    return createCart(items);
  }
  return throwPayloadErrors(response.data.cartLinesAdd, 'Adding cart items');
}

function operationErrorMessage(error: unknown): string {
  if (error instanceof Error && !(error instanceof StorefrontApiError)) {
    return error.message;
  }
  return getStorefrontErrorMessage(error);
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
            const result = cartId ? await addCartLines(cartId, items) : await createCart(items);
            set(stateFromCart(result.cart, result.warnings));
          } catch (error) {
            set({ error: operationErrorMessage(error) });
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
            const response = await storefrontApiRequest<CartLinesUpdateData>(
              CART_LINES_UPDATE_MUTATION,
              { cartId, lines: [{ id: lineId, quantity }] },
            );
            const errors = response.data.cartLinesUpdate?.userErrors || [];
            if (isCartNotFoundError(errors)) {
              set(emptyCartState());
              throw new Error('Your cart expired. Please add the item again.');
            }
            const result = throwPayloadErrors(
              response.data.cartLinesUpdate,
              'Updating cart item',
            );
            set(stateFromCart(result.cart, result.warnings));
          } catch (error) {
            set({ error: operationErrorMessage(error) });
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
            const response = await storefrontApiRequest<CartLinesRemoveData>(
              CART_LINES_REMOVE_MUTATION,
              { cartId, lineIds: [lineId] },
            );
            const errors = response.data.cartLinesRemove?.userErrors || [];
            if (isCartNotFoundError(errors)) {
              set(emptyCartState());
              return;
            }
            const result = throwPayloadErrors(
              response.data.cartLinesRemove,
              'Removing cart item',
            );
            set(stateFromCart(result.cart, result.warnings));
          } catch (error) {
            set({ error: operationErrorMessage(error) });
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
            const response = await storefrontApiRequest<CartAttributesUpdateData>(
              CART_ATTRIBUTES_UPDATE_MUTATION,
              { cartId, attributes },
            );
            const result = throwPayloadErrors(
              response.data.cartAttributesUpdate,
              'Saving fulfillment preferences',
            );
            const { cart } = result;
            if (!fulfillmentAttributesMatch(cart.attributes, fulfillmentMethod, window)) {
              throw new StorefrontApiError(
                'Shopify did not confirm the fulfillment preferences',
                'invalid-response',
              );
            }
            set(stateFromCart(cart, result.warnings));
          } catch (error) {
            set({
              error: operationErrorMessage(error),
              fulfillmentAttributesConfirmed: false,
            });
            throw error;
          } finally {
            set({ isLoading: false });
          }
        }),

      prepareCheckout: async () =>
        enqueueCartOperation(async () => {
          const { cartId, fulfillmentMethod, deliveryWindow, items } = get();
          if (!cartId || items.length === 0) throw new Error('Your cart is empty.');
          if (!deliveryWindow) {
            throw new Error(
              `Select a ${fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery'} window before checkout.`,
            );
          }
          set({ isLoading: true, fulfillmentAttributesConfirmed: false, error: null });
          try {
            const attributes = buildFulfillmentAttributes(fulfillmentMethod, deliveryWindow);
            const response = await storefrontApiRequest<CartAttributesUpdateData>(
              CART_ATTRIBUTES_UPDATE_MUTATION,
              { cartId, attributes },
            );
            const result = throwPayloadErrors(
              response.data.cartAttributesUpdate,
              'Preparing checkout',
            );
            const { cart } = result;
            if (cart.totalQuantity === 0) throw new Error('Your cart is empty.');
            if (!fulfillmentAttributesMatch(cart.attributes, fulfillmentMethod, deliveryWindow)) {
              throw new StorefrontApiError(
                'Shopify did not confirm the fulfillment preferences',
                'invalid-response',
              );
            }
            validateCartMinimums(toCartItems(cart));
            const checkoutUrl = formatCheckoutUrl(cart.checkoutUrl);
            set(stateFromCart(cart, result.warnings));
            return checkoutUrl;
          } catch (error) {
            set({
              error: operationErrorMessage(error),
              fulfillmentAttributesConfirmed: false,
            });
            throw error;
          } finally {
            set({ isLoading: false });
          }
        }),

      clearCart: () => set(emptyCartState()),
      clearError: () => set({ error: null }),
      clearWarnings: () => set({ warnings: [] }),

      syncCart: async () => {
        const { cartId, isSyncing } = get();
        if (!cartId || isSyncing) return;
        set({ isSyncing: true });
        await enqueueCartOperation(async () => {
          try {
            const currentCartId = get().cartId;
            if (!currentCartId) return;
            const response = await storefrontApiRequest<CartQueryData>(CART_QUERY, {
              id: currentCartId,
            });
            if (!response.data.cart) {
              set(emptyCartState());
              return;
            }
            set(stateFromCart(response.data.cart));
          } catch (error) {
            set({ error: operationErrorMessage(error) });
          } finally {
            set({ isSyncing: false });
          }
        });
      },

      getTotalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
      getTotalPrice: () => Number.parseFloat(get().subtotal?.amount || '0'),
    }),
    {
      name: 'place-in-thyme-cart',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<CartStore> | undefined;
        return {
          ...emptyCartState(),
          cartId: typeof persisted?.cartId === 'string' ? persisted.cartId : null,
          isLoading: false,
          isSyncing: false,
        };
      },
      partialize: (state) => ({ cartId: state.cartId }),
    },
  ),
);
