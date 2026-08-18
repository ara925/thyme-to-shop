import type { MoneyV2 } from '@/lib/shopify';

export const HIBISCUS_ADD_ON_TITLE = 'Hibiscus Tea (Sweetened)';
export const HIBISCUS_ADD_ON_PRICE_CENTS = 300;
export const HIBISCUS_ADD_ON_CURRENCY = 'USD';
export const HIBISCUS_ADD_ON_TYPE_ATTRIBUTE = '_bundle_add_on_type';
export const HIBISCUS_ADD_ON_ATTRIBUTE_VALUE = 'hibiscus-tea';

export function hasExpectedHibiscusAddOnPrice(price: MoneyV2): boolean {
  const amount = Number.parseFloat(price.amount);
  return (
    Number.isFinite(amount)
    && Math.round(amount * 100) === HIBISCUS_ADD_ON_PRICE_CENTS
    && price.currencyCode === HIBISCUS_ADD_ON_CURRENCY
  );
}
