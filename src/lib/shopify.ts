// Shopify API Configuration
export const SHOPIFY_API_VERSION = '2026-07';
export const SHOPIFY_STORE_PERMANENT_DOMAIN =
  (import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || 'thyme-time-store-brreo.myshopify.com')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
export const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
export const SHOPIFY_STOREFRONT_TOKEN =
  import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN || '5f7c48d7ed775a943e87a6308e72948f';

// TypeScript Types
export interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface Connection<T> {
  edges: Array<{ node: T }>;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width?: number | null;
  height?: number | null;
}

export interface SelectedOption {
  name: string;
  value: string;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  price: MoneyV2;
  availableForSale: boolean;
  requiresComponents: boolean;
  selectedOptions: SelectedOption[];
}

export type SellingPlanInterval = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export interface SellingPlanRecurringBillingPolicy {
  __typename: 'SellingPlanRecurringBillingPolicy';
  interval: SellingPlanInterval;
  intervalCount: number;
}

export interface SellingPlanRecurringDeliveryPolicy {
  __typename: 'SellingPlanRecurringDeliveryPolicy';
  interval: SellingPlanInterval;
  intervalCount: number;
}

export interface SellingPlan {
  id: string;
  name: string;
  description: string | null;
  options: Array<{ name: string; value: string }>;
  priceAdjustments: Array<{
    adjustmentValue: {
      __typename: string;
      percentage?: number;
      adjustmentAmount?: { amount: string; currencyCode: string };
    };
  }>;
  recurringDeliveries: boolean;
  billingPolicy?: SellingPlanRecurringBillingPolicy | null;
  deliveryPolicy?: SellingPlanRecurringDeliveryPolicy | null;
}

export interface SellingPlanGroup {
  name: string;
  options: Array<{ name: string; values: string[] }>;
  sellingPlans: {
    edges: Array<{ node: SellingPlan }>;
  };
}

export interface ProductMetafield {
  key: string;
  value: string;
  type: string;
}

export interface NutritionInfo {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sodium?: number;
  sugar?: number;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  description: string;
  handle: string;
  priceRange: { minVariantPrice: MoneyV2 };
  images: Connection<ShopifyImage>;
  variants: Connection<ShopifyVariant>;
  options: Array<{ name: string; values: string[] }>;
  sellingPlanGroups?: Connection<SellingPlanGroup>;
  tags: string[];
  productType: string;
  metafields?: Array<ProductMetafield | null>;
}

export interface ShopifyProduct {
  node: ShopifyProductNode;
}

export interface CartAttribute {
  key: string;
  value: string;
}

export interface ShopifyUserError {
  field: string[] | null;
  message: string;
  code?: string;
}

export interface ShopifyCartWarning {
  code: string;
  message: string;
  target: string;
}

export interface ShopifyCartLine {
  id: string;
  quantity: number;
  attributes: CartAttribute[];
  merchandise: ShopifyVariant & {
    product: Omit<ShopifyProductNode, 'variants' | 'sellingPlanGroups'>;
  };
  sellingPlanAllocation: {
    sellingPlan: Pick<SellingPlan, 'id' | 'name'>;
  } | null;
  cost: {
    amountPerQuantity: MoneyV2;
    subtotalAmount: MoneyV2;
    totalAmount: MoneyV2;
  };
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  attributes: CartAttribute[];
  cost: {
    subtotalAmount: MoneyV2;
    totalAmount: MoneyV2;
  };
  lines: Connection<ShopifyCartLine>;
}

export interface CartMutationPayload {
  cart: ShopifyCart | null;
  userErrors: ShopifyUserError[];
  warnings: ShopifyCartWarning[];
}

export interface CartCreateData {
  cartCreate: CartMutationPayload;
}

export interface CartLinesAddData {
  cartLinesAdd: CartMutationPayload;
}

export interface CartLinesUpdateData {
  cartLinesUpdate: CartMutationPayload;
}

export interface CartLinesRemoveData {
  cartLinesRemove: CartMutationPayload;
}

export interface CartAttributesUpdateData {
  cartAttributesUpdate: CartMutationPayload;
}

export interface CartQueryData {
  cart: ShopifyCart | null;
}

export function parseNutrition(metafields?: Array<ProductMetafield | null>): NutritionInfo | null {
  if (!metafields) return null;
  const get = (key: string) => {
    const mf = metafields.find(m => m?.key === key);
    return mf ? parseFloat(mf.value) : undefined;
  };
  const info: NutritionInfo = {
    calories: get('calories'),
    protein: get('protein'),
    carbs: get('carbs'),
    fat: get('fat'),
    fiber: get('fiber'),
    sodium: get('sodium'),
    sugar: get('sugar'),
  };
  return Object.values(info).some(v => v !== undefined) ? info : null;
}

export function getHeatingInstructions(metafields?: Array<ProductMetafield | null>): string | null {
  const mf = metafields?.find(m => m?.key === 'heating_instructions');
  return mf?.value || null;
}

// GraphQL Queries
const METAFIELD_IDENTIFIERS = `[
  {namespace: "custom", key: "calories"},
  {namespace: "custom", key: "protein"},
  {namespace: "custom", key: "carbs"},
  {namespace: "custom", key: "fat"},
  {namespace: "custom", key: "fiber"},
  {namespace: "custom", key: "sodium"},
  {namespace: "custom", key: "sugar"},
  {namespace: "custom", key: "heating_instructions"}
]`;

export const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          description
          handle
          productType
          tags
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                availableForSale
                requiresComponents
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          options {
            name
            values
          }
          metafields(identifiers: ${METAFIELD_IDENTIFIERS}) {
            key
            value
            type
          }
        }
      }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query GetProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      description
      handle
      productType
      tags
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      images(first: 10) {
        edges {
          node {
            url
            altText
          }
        }
      }
      variants(first: 20) {
        edges {
          node {
            id
            title
            price {
              amount
              currencyCode
            }
            availableForSale
            requiresComponents
            selectedOptions {
              name
              value
            }
          }
        }
      }
      options {
        name
        values
      }
      metafields(identifiers: ${METAFIELD_IDENTIFIERS}) {
        key
        value
        type
      }
    }
  }
`;

const CART_FIELDS = `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    attributes { key value }
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
    }
    lines(first: 100) {
      edges {
        node {
          id
          quantity
          attributes { key value }
          sellingPlanAllocation { sellingPlan { id name } }
          cost {
            amountPerQuantity { amount currencyCode }
            subtotalAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
          merchandise {
            ... on ProductVariant {
              id
              title
              availableForSale
              requiresComponents
              price { amount currencyCode }
              selectedOptions { name value }
              product {
                id
                title
                description
                handle
                productType
                tags
                priceRange { minVariantPrice { amount currencyCode } }
                images(first: 1) { edges { node { url altText } } }
                options { name values }
                metafields(identifiers: ${METAFIELD_IDENTIFIERS}) { key value type }
              }
            }
          }
        }
      }
    }
  }
`;

// Cart Mutations
export const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { ...CartFields }
      userErrors { field message code }
      warnings { code message target }
    }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message code }
      warnings { code message target }
    }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message code }
      warnings { code message target }
    }
  }
  ${CART_FIELDS}
`;

// Separate selling plans query — requires unauthenticated_read_selling_plans scope
export const SELLING_PLANS_QUERY = `
  query GetSellingPlans($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          sellingPlanGroups(first: 20) {
            edges {
              node {
                name
                options {
                  name
                  values
                }
                sellingPlans(first: 10) {
                  edges {
                    node {
                      id
                      name
                      description
                      options {
                        name
                        value
                      }
                      priceAdjustments {
                        adjustmentValue {
                          __typename
                          ... on SellingPlanPercentagePriceAdjustment {
                            percentage: adjustmentPercentage
                          }
                          ... on SellingPlanFixedAmountPriceAdjustment {
                            adjustmentAmount {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
                      recurringDeliveries
                      billingPolicy {
                        __typename
                        ... on SellingPlanRecurringBillingPolicy {
                          interval
                          intervalCount
                        }
                      }
                      deliveryPolicy {
                        __typename
                        ... on SellingPlanRecurringDeliveryPolicy {
                          interval
                          intervalCount
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { ...CartFields }
      userErrors { field message code }
      warnings { code message target }
    }
  }
  ${CART_FIELDS}
`;

export const CART_QUERY = `
  query cart($id: ID!) {
    cart(id: $id) { ...CartFields }
  }
  ${CART_FIELDS}
`;

export const CART_ATTRIBUTES_UPDATE_MUTATION = `
  mutation cartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart { ...CartFields }
      userErrors { field message code }
      warnings { code message target }
    }
  }
  ${CART_FIELDS}
`;

interface StorefrontGraphQLError {
  message: string;
  extensions?: { code?: string };
}

interface StorefrontGraphQLPayload<T> {
  data?: T;
  errors?: StorefrontGraphQLError[];
}

export interface StorefrontApiResponse<T> {
  data: T;
}

interface DefaultStorefrontData {
  products?: Connection<ShopifyProductNode>;
  productByHandle?: ShopifyProductNode | null;
}

export type StorefrontErrorCode =
  | 'billing'
  | 'network'
  | 'http'
  | 'graphql'
  | 'invalid-response';

export class StorefrontApiError extends Error {
  readonly code: StorefrontErrorCode;
  readonly status?: number;

  constructor(message: string, code: StorefrontErrorCode, status?: number) {
    super(message);
    this.name = 'StorefrontApiError';
    this.code = code;
    this.status = status;
  }
}

export function getStorefrontErrorMessage(error: unknown): string {
  if (error instanceof StorefrontApiError) {
    if (error.code === 'billing') {
      return 'Ordering is temporarily unavailable. Please try again later.';
    }
    if (error.code === 'network') {
      return 'We could not reach the store. Check your connection and try again.';
    }
    return 'The store could not complete that request. Please try again.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'The store could not complete that request. Please try again.';
}

// Keeps the historical `{ data }` response shape used by the catalog hooks while
// enforcing a typed, bounded boundary for every Storefront request.
export async function storefrontApiRequest<T = DefaultStorefrontData>(
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<StorefrontApiResponse<T>> {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  const timeoutId = window.setTimeout(abortRequest, 15_000);
  signal?.addEventListener('abort', abortRequest, { once: true });

  try {
    const response = await fetch(SHOPIFY_STOREFRONT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      signal: requestController.signal,
    });

    if (response.status === 402) {
      throw new StorefrontApiError('Shopify billing is inactive', 'billing', response.status);
    }
    if (!response.ok) {
      throw new StorefrontApiError(`Storefront HTTP ${response.status}`, 'http', response.status);
    }

    let payload: StorefrontGraphQLPayload<T>;
    try {
      payload = (await response.json()) as StorefrontGraphQLPayload<T>;
    } catch (error) {
      if (requestController.signal.aborted) throw error;
      throw new StorefrontApiError(
        'Storefront returned invalid JSON',
        'invalid-response',
        response.status,
      );
    }

    if (payload.errors?.length) {
      throw new StorefrontApiError(
        payload.errors.map((error) => error.message).join(', '),
        'graphql',
        response.status,
      );
    }
    if (payload.data === undefined) {
      throw new StorefrontApiError(
        'Storefront response did not include data',
        'invalid-response',
        response.status,
      );
    }

    return { data: payload.data };
  } catch (error) {
    if (error instanceof StorefrontApiError) throw error;
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new StorefrontApiError(message, 'network');
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortRequest);
  }
}

// Helper Functions
export function formatPrice(amount: string, currencyCode: string = 'USD'): string {
  const numericAmount = Number.parseFloat(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

export function formatCheckoutUrl(checkoutUrl: string): string {
  let url: URL;
  try {
    url = new URL(checkoutUrl);
  } catch {
    throw new StorefrontApiError('Shopify returned an invalid checkout URL', 'invalid-response');
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== SHOPIFY_STORE_PERMANENT_DOMAIN
  ) {
    throw new StorefrontApiError('Shopify returned an invalid checkout URL', 'invalid-response');
  }

  url.searchParams.set('channel', 'online_store');
  return url.toString();
}

export function isCartNotFoundError(userErrors: ShopifyUserError[]): boolean {
  return userErrors.some((error) => {
    const message = error.message.toLowerCase();
    return message.includes('cart not found') || message.includes('does not exist');
  });
}
