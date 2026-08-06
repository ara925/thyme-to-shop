import { describe, expect, it } from 'vitest';
import type { SellingPlansByProductId } from '@/hooks/useProducts';
import type { SellingPlan, ShopifyProduct } from '@/lib/shopify';
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

function plan(id: string): SellingPlan {
  return {
    id,
    name: 'Deliver every week',
    description: null,
    options: [],
    priceAdjustments: [],
    recurringDeliveries: true,
  };
}

describe('Pick n Choose bundle helpers', () => {
  it('finds the live parent bundle across straight and smart apostrophes', () => {
    const parent = product('parent', 'Pick n\u2019 Choose Bundle', 'Juice Bundle', '134.99');
    const similarlyNamedJuice = product('juice', "Pick n' Choose Bundle", 'Juice', '8.50');

    expect(findPickAndChooseBundle([similarlyNamedJuice, parent])).toBe(parent);
  });

  it('only includes exact Juice products carrying the exact resolved plan', () => {
    const green = product('green', 'Green Cleanse', 'Juice', '8.50');
    const teaWithoutPlan = product('tea', 'Tea Add-On', 'Juice', '3.00');
    const parent = product('parent', "Pick n' Choose Bundle", 'Juice Bundle', '134.99');
    const plans: SellingPlansByProductId = {
      green: plan('green-plan'),
      parent: plan('parent-plan'),
    };

    expect(getEligiblePickAndChooseProducts([parent, teaWithoutPlan, green], plans)).toEqual([
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

  it('builds one atomic component payload with per-product plans and shared bundle attributes', () => {
    const green = product('green', 'Green Cleanse', 'Juice', '8.50');
    const shot = product('shot', 'Ginger Shot', 'Juice', '5.00');
    const plans: SellingPlansByProductId = {
      green: plan('green-plan'),
      shot: plan('shot-plan'),
    };

    const lines = buildPickAndChooseCartItems(
      [green, shot],
      { green: 2, shot: 3 },
      plans,
      "Pick n' Choose Bundle",
      'pick-test-instance',
      13499,
      'USD',
    );

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => [line.product.node.id, line.quantity, line.sellingPlanId])).toEqual([
      ['green', 2, 'green-plan'],
      ['shot', 3, 'shot-plan'],
    ]);
    expect(lines.every((line) => line.attributes?.[0].value === 'pick-test-instance')).toBe(true);
    expect(lines.every((line) => line.attributes?.[1].value === "Pick n' Choose Bundle")).toBe(
      true,
    );
    expect(lines.every((line) => line.attributes?.[2].value === 'pick-test-instance')).toBe(true);
    expect(lines.every((line) => line.attributes?.[3].value === '13499')).toBe(true);
  });
});
