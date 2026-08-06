export const SHOPIFY_API_VERSION = '2026-07';
export const SHOPIFY_STORE_PERMANENT_DOMAIN =
  import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || 'thyme-time-store-brreo.myshopify.com';
export const SHOPIFY_STOREFRONT_TOKEN =
  import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN || '5f7c48d7ed775a943e87a6308e72948f';
export const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;

export interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
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
  selectedOptions: SelectedOption[];
}

export interface SellingPlan {
  id: string;
  name: string;
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
  productType: string;
  tags: string[];
  priceRange: { minVariantPrice: MoneyV2 };
  images: Connection<ShopifyImage>;
  variants: Connection<ShopifyVariant>;
  options: Array<{ name: string; values: string[] }>;
  metafields?: Array<ProductMetafield | null>;
}

export interface ShopifyProduct {
  node: ShopifyProductNode;
}

export interface Connection<T> {
  edges: Array<{ node: T }>;
  pageInfo?: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export interface ShopifyUserError {
  field: string[] | null;
  message: string;
  code?: string;
}

export interface CartAttribute {
  key: string;
  value: string;
}

export interface ShopifyCartLine {
  id: string;
  quantity: number;
  attributes: CartAttribute[];
  merchandise: ShopifyVariant & { product: Omit<ShopifyProductNode, 'variants'> };
  sellingPlanAllocation: { sellingPlan: Pick<SellingPlan, 'id' | 'name'> } | null;
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
}

export interface ProductsQueryData {
  products: Connection<ShopifyProductNode>;
}

export interface ProductByHandleQueryData {
  productByHandle: ShopifyProductNode | null;
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

interface StorefrontGraphQLError {
  message: string;
  extensions?: { code?: string };
}

interface StorefrontGraphQLResponse<T> {
  data?: T;
  errors?: StorefrontGraphQLError[];
}

export type StorefrontErrorCode = 'billing' | 'network' | 'http' | 'graphql' | 'invalid-response';

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
    if (error.code === 'billing') return 'Ordering is temporarily unavailable. Please try again later.';
    if (error.code === 'network') return 'We could not reach the store. Check your connection and try again.';
  }
  return 'The store could not complete that request. Please try again.';
}

export function parseNutrition(metafields?: Array<ProductMetafield | null>): NutritionInfo | null {
  if (!metafields) return null;
  const get = (key: string) => {
    const metafield = metafields.find((item) => item?.key === key);
    if (!metafield) return undefined;
    const value = Number.parseFloat(metafield.value);
    return Number.isFinite(value) ? value : undefined;
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
  return Object.values(info).some((value) => value !== undefined) ? info : null;
}

export function getHeatingInstructions(metafields?: Array<ProductMetafield | null>): string | null {
  return metafields?.find((item) => item?.key === 'heating_instructions')?.value || null;
}

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

const PRODUCT_FIELDS = `
  id
  title
  description
  handle
  productType
  tags
  priceRange { minVariantPrice { amount currencyCode } }
  images(first: 1) { edges { node { url altText width height } } }
  variants(first: 250) {
    edges { node { id title price { amount currencyCode } availableForSale selectedOptions { name value } } }
  }
  options { name values }
  metafields(identifiers: ${METAFIELD_IDENTIFIERS}) { key value type }
`;

export const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges { node { ${PRODUCT_FIELDS} } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query GetProductByHandle($handle: String!) {
    productByHandle(handle: $handle) { ${PRODUCT_FIELDS} }
  }
`;

const CART_FIELDS = `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    attributes { key value }
    cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } }
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
                images(first: 1) { edges { node { url altText width height } } }
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

export const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) { cart { ...CartFields } userErrors { field message code } }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { field message code } }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { field message code } }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ...CartFields } userErrors { field message code } }
  }
  ${CART_FIELDS}
`;

export const CART_ATTRIBUTES_UPDATE_MUTATION = `
  mutation cartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart { ...CartFields }
      userErrors { field message code }
    }
  }
  ${CART_FIELDS}
`;

export const CART_QUERY = `
  query cart($id: ID!) { cart(id: $id) { ...CartFields } }
  ${CART_FIELDS}
`;

export async function storefrontApiRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 15_000);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(SHOPIFY_STOREFRONT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      signal: requestSignal,
    });

    if (response.status === 402) {
      throw new StorefrontApiError('Shopify billing is inactive', 'billing', response.status);
    }
    if (!response.ok) {
      throw new StorefrontApiError(`Storefront HTTP ${response.status}`, 'http', response.status);
    }

    let payload: StorefrontGraphQLResponse<T>;
    try {
      payload = (await response.json()) as StorefrontGraphQLResponse<T>;
    } catch (error) {
      if (requestSignal.aborted) throw error;
      throw new StorefrontApiError('Storefront returned invalid JSON', 'invalid-response', response.status);
    }

    if (payload.errors?.length) {
      throw new StorefrontApiError(
        payload.errors.map((error) => error.message).join(', '),
        'graphql',
        response.status,
      );
    }
    if (payload.data === undefined) {
      throw new StorefrontApiError('Storefront response did not include data', 'invalid-response', response.status);
    }
    return payload.data;
  } catch (error) {
    if (error instanceof StorefrontApiError) throw error;
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new StorefrontApiError(message, 'network');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function formatPrice(amount: string, currencyCode = 'USD'): string {
  const numericAmount = Number.parseFloat(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

export function getShopifyImageUrl(imageUrl: string, width: number): string {
  try {
    const url = new URL(imageUrl);
    if (url.hostname === 'cdn.shopify.com') {
      url.searchParams.set('width', String(width));
    }
    return url.toString();
  } catch {
    return imageUrl;
  }
}

export function formatCheckoutUrl(checkoutUrl: string): string {
  const url = new URL(checkoutUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.myshopify.com')) {
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
