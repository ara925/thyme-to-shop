import { useQuery } from '@tanstack/react-query';
import {
  PRODUCT_BY_HANDLE_QUERY,
  PRODUCTS_QUERY,
  SELLING_PLANS_QUERY,
  type SellingPlan,
  type SellingPlanGroup,
  type ShopifyProduct,
  storefrontApiRequest,
} from '@/lib/shopify';

export interface SellingPlanProductEdge {
  node: {
    id: string;
    sellingPlanGroups?: {
      edges: Array<{ node: SellingPlanGroup }>;
    };
  };
}

export interface JuiceBundleSellingPlanProductEdge extends SellingPlanProductEdge {
  node: SellingPlanProductEdge['node'] & {
    title: string;
    productType: string;
  };
}

interface SellingPlansQueryData {
  products: {
    edges: SellingPlanProductEdge[];
  };
}

interface JuiceBundleSellingPlansQueryData {
  products: {
    edges: JuiceBundleSellingPlanProductEdge[];
  };
}

export type SellingPlansByProductId = Record<string, SellingPlan>;

export const JUICE_BUNDLE_PRODUCT_QUERY = 'product_type:"Juice Bundle"';

export const JUICE_BUNDLE_SELLING_PLANS_QUERY = `
  query GetJuiceBundleSellingPlans($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          productType
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
                        orderCount
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

export function normalizeSellingPlanGroupName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function isWeeklyRecurringPlan(plan: SellingPlan): boolean {
  const { billingPolicy, deliveryPolicy } = plan;
  return (
    plan.recurringDeliveries === true &&
    billingPolicy?.__typename === 'SellingPlanRecurringBillingPolicy' &&
    billingPolicy.interval === 'WEEK' &&
    billingPolicy.intervalCount === 1 &&
    deliveryPolicy?.__typename === 'SellingPlanRecurringDeliveryPolicy' &&
    deliveryPolicy.interval === 'WEEK' &&
    deliveryPolicy.intervalCount === 1
  );
}

export function resolveSellingPlansByProduct(
  products: SellingPlanProductEdge[],
  exactGroupName: string,
): SellingPlansByProductId {
  const normalizedTarget = normalizeSellingPlanGroupName(exactGroupName);
  if (!normalizedTarget) {
    throw new Error('A selling-plan group name is required.');
  }

  return products.reduce<SellingPlansByProductId>((plansByProduct, product) => {
    const matchingGroups = (product.node.sellingPlanGroups?.edges || []).filter(
      ({ node }) => normalizeSellingPlanGroupName(node.name) === normalizedTarget,
    );

    if (matchingGroups.length > 1) {
      throw new Error(
        `Product ${product.node.id} has multiple selling-plan groups named "${exactGroupName}".`,
      );
    }

    if (matchingGroups.length === 0) return plansByProduct;

    const plans = matchingGroups[0].node.sellingPlans.edges;
    if (plans.length !== 1) {
      throw new Error(
        `Selling-plan group "${exactGroupName}" must contain exactly one plan for product ${product.node.id}.`,
      );
    }

    const plan = plans[0].node;
    if (!isWeeklyRecurringPlan(plan)) {
      throw new Error(
        `Selling plan ${plan.id} in group "${exactGroupName}" for product ${product.node.id} must bill and deliver every week.`,
      );
    }

    plansByProduct[product.node.id] = plan;
    return plansByProduct;
  }, {});
}

export function resolveJuiceBundleSellingPlans(
  products: JuiceBundleSellingPlanProductEdge[],
): SellingPlansByProductId {
  return products.reduce<SellingPlansByProductId>((plansByProduct, product) => {
    const { id, productType, title } = product.node;
    const groups = product.node.sellingPlanGroups?.edges || [];
    const normalizedTitle = normalizeSellingPlanGroupName(title);

    if (
      productType !== 'Juice Bundle' ||
      !normalizedTitle ||
      groups.length !== 1 ||
      normalizeSellingPlanGroupName(groups[0].node.name) !== normalizedTitle
    ) {
      return plansByProduct;
    }

    const plans = groups[0].node.sellingPlans.edges;
    if (
      plans.length !== 1
      || !isWeeklyRecurringPlan(plans[0].node)
      || plans[0].node.priceAdjustments.length !== 0
    ) {
      return plansByProduct;
    }

    plansByProduct[id] = plans[0].node;
    return plansByProduct;
  }, {});
}

export function useProducts(first: number = 50, query?: string) {
  return useQuery({
    queryKey: ['products', first, query],
    queryFn: async () => {
      const response = await storefrontApiRequest<{ products: { edges: ShopifyProduct[] } }>(
        PRODUCTS_QUERY,
        { first, query },
      );
      return response.data.products.edges;
    },
  });
}

export function useProductByHandle(handle: string) {
  return useQuery({
    queryKey: ['product', handle],
    queryFn: async () => {
      const response = await storefrontApiRequest<{ productByHandle: ShopifyProduct['node'] | null }>(
        PRODUCT_BY_HANDLE_QUERY,
        { handle },
      );
      if (!response.data.productByHandle) return null;
      return { node: response.data.productByHandle } as ShopifyProduct;
    },
    enabled: !!handle,
  });
}

export function useMealProducts() {
  return useProducts(50, 'product_type:Meal OR tag:meal OR tag:weekly-menu');
}

export function useJuiceProducts() {
  return useProducts(50, 'product_type:Juice AND NOT product_type:"Juice Bundle"');
}

export function useSellingPlans(productQuery: string, exactGroupName: string) {
  const normalizedGroupName = normalizeSellingPlanGroupName(exactGroupName);

  return useQuery({
    queryKey: ['sellingPlans', productQuery, normalizedGroupName],
    queryFn: async (): Promise<SellingPlansByProductId> => {
      const response = await storefrontApiRequest<SellingPlansQueryData>(SELLING_PLANS_QUERY, {
        first: 50,
        query: productQuery,
      });
      return resolveSellingPlansByProduct(response.data.products.edges, exactGroupName);
    },
    enabled: Boolean(productQuery && normalizedGroupName),
    retry: false,
  });
}

export function useJuiceBundleSellingPlans() {
  return useQuery({
    queryKey: ['sellingPlans', 'juice-bundle-parent-title'],
    queryFn: async (): Promise<SellingPlansByProductId> => {
      const response = await storefrontApiRequest<JuiceBundleSellingPlansQueryData>(
        JUICE_BUNDLE_SELLING_PLANS_QUERY,
        { first: 50, query: JUICE_BUNDLE_PRODUCT_QUERY },
      );
      return resolveJuiceBundleSellingPlans(response.data.products.edges);
    },
    retry: false,
  });
}
