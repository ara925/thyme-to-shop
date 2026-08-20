import type { ShopifyProduct } from '@/lib/shopify';

// These products are used only as internal plan/component records. Keeping
// their redirects here prevents any catalog or direct product URL from
// accidentally exposing a standalone purchase path.
const HIDDEN_STOREFRONT_PRODUCT_REDIRECTS = new Map<string, string>([
  ['weekly-meal-package-rotating-3-menu-cycle', '/subscribe/meals'],
  ['hibiscus-tea-sweetened', '/juices'],
  ['hibiscus-tea-add-on', '/juices'],
]);

export function getHiddenStorefrontProductRedirect(handle: string): string | null {
  return HIDDEN_STOREFRONT_PRODUCT_REDIRECTS.get(handle.trim().toLowerCase()) ?? null;
}

export function isHiddenStorefrontProductHandle(handle: string): boolean {
  return getHiddenStorefrontProductRedirect(handle) !== null;
}

export function isCustomerFacingProduct(product: ShopifyProduct): boolean {
  return !isHiddenStorefrontProductHandle(product.node.handle);
}
