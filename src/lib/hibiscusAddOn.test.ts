import { describe, expect, it } from 'vitest';
import {
  HIBISCUS_ADD_ON_ATTRIBUTE_VALUE,
  HIBISCUS_ADD_ON_CURRENCY,
  HIBISCUS_ADD_ON_PRICE_CENTS,
  HIBISCUS_ADD_ON_TITLE,
  HIBISCUS_ADD_ON_TYPE_ATTRIBUTE,
  hasExpectedHibiscusAddOnPrice,
} from './hibiscusAddOn';

describe('Hibiscus add-on contract', () => {
  it('requires the client-approved exact $3 USD price', () => {
    expect(HIBISCUS_ADD_ON_TITLE).toBe('Hibiscus Tea (Sweetened)');
    expect(HIBISCUS_ADD_ON_PRICE_CENTS).toBe(300);
    expect(HIBISCUS_ADD_ON_CURRENCY).toBe('USD');
    expect(HIBISCUS_ADD_ON_TYPE_ATTRIBUTE).toBe('_bundle_add_on_type');
    expect(HIBISCUS_ADD_ON_ATTRIBUTE_VALUE).toBe('hibiscus-tea');
    expect(hasExpectedHibiscusAddOnPrice({ amount: '3.00', currencyCode: 'USD' })).toBe(true);
    expect(hasExpectedHibiscusAddOnPrice({ amount: '4.00', currencyCode: 'USD' })).toBe(false);
    expect(hasExpectedHibiscusAddOnPrice({ amount: '3.00', currencyCode: 'CAD' })).toBe(false);
  });
});
