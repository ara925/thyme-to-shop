import { describe, expect, it } from 'vitest';
import type { ShopifyProduct } from '@/lib/shopify';
import {
  buildPickAndChooseCartItems,
  buildHibiscusAddOnCartItem,
  calculateSelectionCents,
  findHibiscusTeaAddOn,
  findPickAndChooseBundle,
  getEligiblePickAndChooseProducts,
} from './PickAndChoose';

function product(
  id: string,
  title: string,
  productType: string,
  price: string,
  availableForSale = true,
  requiresComponents = false,
): ShopifyProduct {
  return {
    node: {
      id,
      title,
      productType,
      description: `${title} description`,
      handle: id,
      tags: [],
      priceRange: { minVariantPrice: { amount: price, currencyCode: 'USD' } },
      images: { edges: [] },
      variants: {
        edges: [
          {
            node: {
              id: `${id}-variant`,
              title: 'Default Title',
              price: { amount: price, currencyCode: 'USD' },
              availableForSale,
              requiresComponents,
              selectedOptions: [],
            },
          },
        ],
      },
      options: [],
    },
  };
}

describe('Pick n Choose bundle helpers', () => {
  it('finds the live parent bundle across straight and smart apostrophes', () => {
    const parent = product('parent', 'Pick n\u2019 Choose Bundle', 'Juice Bundle', '134.99');
    const similarlyNamedJuice = product('juice', "Pick n' Choose Bundle", 'Juice', '8.50');

    expect(findPickAndChooseBundle([similarlyNamedJuice, parent])).toBe(parent);
  });

  it('does not silently select one of two exact custom parent products', () => {
    const first = product('parent-1', "Pick n' Choose Bundle", 'Juice Bundle', '134.99');
    const second = product('parent-2', 'Pick n\u2019 Choose Bundle', 'Juice Bundle', '134.99');

    expect(findPickAndChooseBundle([first, second])).toBeUndefined();
  });

  it('only includes available standalone Juice products', () => {
    const green = product('green', 'Green Cleanse', 'Juice', '8.50');
    const soldOutTea = product('tea', 'Tea Add-On', 'Juice', '3.00', false);
    const hibiscus = product('hibiscus', 'Hibiscus Tea (Sweetened)', 'Juice', '3.00');
    const parent = product('parent', "Pick n' Choose Bundle", 'Juice Bundle', '134.99');

    expect(getEligiblePickAndChooseProducts([parent, soldOutTea, hibiscus, green])).toEqual([
      green,
    ]);
    expect(findHibiscusTeaAddOn([parent, soldOutTea, hibiscus, green])).toBe(hibiscus);
  });

  it('uses live variant prices and ignores unavailable products in the selected value', () => {
    const green = product('green', 'Green Cleanse', 'Juice', '8.50');
    const soldOut = product('shot', 'Ginger Shot', 'Juice', '5.00', false);
    const componentOnly = product('addon', 'Tea Add-On', 'Juice', '3.00', true, true);

    expect(
      calculateSelectionCents(
        [green, soldOut, componentOnly],
        { green: 4, shot: 10, addon: 20 },
      ),
    ).toBe(3400);
  });

  it('builds one atomic one-time payload with shared bundle attributes', () => {
    const green = product('green', 'Green Cleanse', 'Juice', '8.50');
    const shot = product('shot', 'Ginger Shot', 'Juice', '5.00');

    const lines = buildPickAndChooseCartItems(
      [green, shot],
      { green: 2, shot: 3 },
      "Pick n' Choose Bundle",
      'pick-test-instance',
      13499,
      'USD',
    );

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => [line.product.node.id, line.quantity, line.sellingPlanId])).toEqual([
      ['green', 2, undefined],
      ['shot', 3, undefined],
    ]);
    expect(lines.every((line) => line.attributes?.[0].value === 'pick-test-instance')).toBe(true);
    expect(lines.every((line) => line.attributes?.[1].value === "Pick n' Choose Bundle")).toBe(
      true,
    );
    expect(lines.every((line) => line.attributes?.[2].value === 'pick-test-instance')).toBe(true);
    expect(lines.every((line) => line.attributes?.[3].value === '13499')).toBe(true);
    expect(lines.every((line) => line.attributes?.some(
      ({ key, value }) => key === '_bundle_role' && value === 'primary',
    ))).toBe(true);
  });

  it('builds Hibiscus as a separate one-time add-on that cannot satisfy the minimum', () => {
    const hibiscus = product('hibiscus', 'Hibiscus Tea (Sweetened)', 'Juice', '3.00');
    const line = buildHibiscusAddOnCartItem(
      hibiscus,
      2,
      "Pick n' Choose Bundle",
      'pick-test-instance',
    );

    expect(line).toEqual(expect.objectContaining({
      variantId: 'hibiscus-variant',
      quantity: 2,
      sellingPlanId: undefined,
    }));
    expect(line?.attributes).toEqual([
      { key: '_bundle_instance', value: 'pick-test-instance' },
      { key: '_bundle_label', value: "Hibiscus add-on for Pick n' Choose Bundle" },
      { key: '_bundle_role', value: 'add-on' },
      { key: '_bundle_add_on_type', value: 'hibiscus-tea' },
    ]);
    expect(line?.attributes?.some(({ key }) => key === '_minimum_cents')).toBe(false);
  });

  it('rejects a Hibiscus add-on whose price is no longer exactly $3.00 USD', () => {
    const hibiscus = product('hibiscus', 'Hibiscus Tea (Sweetened)', 'Juice', '4.00');

    expect(() => buildHibiscusAddOnCartItem(
      hibiscus,
      1,
      "Pick n' Choose Bundle",
      'pick-test-instance',
    )).toThrow(/approved \$3\.00 USD Hibiscus add-on price could not be verified/i);
  });

  it('rejects mixed-price duplicate exact-title Hibiscus products as ambiguous', () => {
    const approvedPrice = product(
      'hibiscus-approved',
      'Hibiscus Tea (Sweetened)',
      'Juice',
      '3.00',
    );
    const changedPrice = product(
      'hibiscus-changed',
      'Hibiscus Tea (Sweetened)',
      'Juice',
      '4.00',
    );

    expect(findHibiscusTeaAddOn([approvedPrice, changedPrice])).toBeUndefined();
    expect(getEligiblePickAndChooseProducts([approvedPrice, changedPrice])).toEqual([]);
  });
});
