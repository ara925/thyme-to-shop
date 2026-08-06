import { describe, expect, it } from 'vitest';
import { SELLING_PLANS_QUERY, type SellingPlan, type SellingPlanGroup } from '@/lib/shopify';
import {
  normalizeSellingPlanGroupName,
  resolveSellingPlansByProduct,
  type SellingPlanProductEdge,
} from './useProducts';

function createPlan(id: string, overrides: Partial<SellingPlan> = {}): SellingPlan {
  return {
    id,
    name: 'Deliver every week',
    description: null,
    options: [],
    priceAdjustments: [],
    recurringDeliveries: true,
    billingPolicy: {
      __typename: 'SellingPlanRecurringBillingPolicy',
      interval: 'WEEK',
      intervalCount: 1,
    },
    deliveryPolicy: {
      __typename: 'SellingPlanRecurringDeliveryPolicy',
      interval: 'WEEK',
      intervalCount: 1,
    },
    ...overrides,
  };
}

function createGroup(name: string, plans: SellingPlan[]): SellingPlanGroup {
  return {
    name,
    options: [],
    sellingPlans: { edges: plans.map(plan => ({ node: plan })) },
  };
}

function createProduct(id: string, groups: SellingPlanGroup[]): SellingPlanProductEdge {
  return {
    node: {
      id,
      sellingPlanGroups: { edges: groups.map(group => ({ node: group })) },
    },
  };
}

describe('selling-plan group resolution', () => {
  it('requests recurring billing and delivery cadence from Shopify', () => {
    expect(SELLING_PLANS_QUERY).toContain('billingPolicy {');
    expect(SELLING_PLANS_QUERY).toContain('SellingPlanRecurringBillingPolicy');
    expect(SELLING_PLANS_QUERY).toContain('deliveryPolicy {');
    expect(SELLING_PLANS_QUERY).toContain('SellingPlanRecurringDeliveryPolicy');
    expect(SELLING_PLANS_QUERY).toContain('intervalCount');
  });

  it('normalizes typography and whitespace without fuzzy word matching', () => {
    expect(normalizeSellingPlanGroupName('  Weekly Meal  Subscription – $120 Minimum '))
      .toBe('weekly meal subscription - $120 minimum');
    expect(normalizeSellingPlanGroupName('Pick n’ Choose Bundle'))
      .toBe("pick n' choose bundle");
    expect(normalizeSellingPlanGroupName('Juice Subscription Bundle'))
      .not.toBe(normalizeSellingPlanGroupName('Juice Subscription Bundels'));
  });

  it('selects the exact general plan for each compatible product instead of the first group', () => {
    const mealOnePlan = createPlan('meal-one');
    const generalPlan = createPlan('general-weekly');
    const products = [
      createProduct('week-a-product', [
        createGroup('Meal 1 Menu', [mealOnePlan]),
        createGroup('Weekly Meal Subscription - $120 Minimum', [generalPlan]),
      ]),
      createProduct('unconfigured-product', [createGroup('Meal 2 Menu', [createPlan('meal-two')])]),
    ];

    expect(resolveSellingPlansByProduct(products, 'Weekly Meal Subscription – $120 Minimum'))
      .toEqual({ 'week-a-product': generalPlan });
  });

  it('fails closed when a matched group is ambiguous', () => {
    const products = [
      createProduct('juice-product', [
        createGroup('Juice Subscription Bundels', [createPlan('weekly'), createPlan('monthly')]),
      ]),
    ];

    expect(() => resolveSellingPlansByProduct(products, 'Juice Subscription Bundels'))
      .toThrow('must contain exactly one plan');
  });

  it.each([
    [
      'billing policy is missing',
      { billingPolicy: null },
    ],
    [
      'delivery policy is missing',
      { deliveryPolicy: null },
    ],
    [
      'billing interval is not weekly',
      {
        billingPolicy: {
          __typename: 'SellingPlanRecurringBillingPolicy' as const,
          interval: 'MONTH' as const,
          intervalCount: 1,
        },
      },
    ],
    [
      'billing interval count is not one',
      {
        billingPolicy: {
          __typename: 'SellingPlanRecurringBillingPolicy' as const,
          interval: 'WEEK' as const,
          intervalCount: 2,
        },
      },
    ],
    [
      'delivery interval is not weekly',
      {
        deliveryPolicy: {
          __typename: 'SellingPlanRecurringDeliveryPolicy' as const,
          interval: 'MONTH' as const,
          intervalCount: 1,
        },
      },
    ],
    [
      'delivery interval count is not one',
      {
        deliveryPolicy: {
          __typename: 'SellingPlanRecurringDeliveryPolicy' as const,
          interval: 'WEEK' as const,
          intervalCount: 2,
        },
      },
    ],
    [
      'recurring deliveries are disabled',
      { recurringDeliveries: false },
    ],
  ] satisfies Array<[string, Partial<SellingPlan>]>)('fails closed when %s', (_case, overrides) => {
    const groupName = 'Weekly Meal Subscription - $120 Minimum';
    const products = [
      createProduct('meal-product', [createGroup(groupName, [createPlan('invalid', overrides)])]),
    ];

    expect(() => resolveSellingPlansByProduct(products, groupName))
      .toThrow('must bill and deliver every week');
  });
});
