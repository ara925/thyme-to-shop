import { describe, expect, it } from 'vitest';
import type { ShopifyProduct } from '@/lib/shopify';
import {
  buildPickAndChooseCartItems,
  calculateSelectionCents,
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

  it('only includes available standalone Juice products', () => {
    const green = product('green', 'Green Cleanse', 'Juice', '8.50');
    const soldOutTea = product('tea', 'Tea Add-On', 'Juice', '3.00', false);
    const parent = product('parent', "Pick n' Choose Bundle", 'Juice Bundle', '134.99');

    expect(getEligiblePickAndChooseProducts([parent, soldOutTea, green])).toEqual([
      green,
    ]);
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
  });
});
