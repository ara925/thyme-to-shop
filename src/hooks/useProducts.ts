import { useQuery } from '@tanstack/react-query';
import { storefrontApiRequest, PRODUCTS_QUERY, PRODUCT_BY_HANDLE_QUERY, SELLING_PLANS_QUERY, ShopifyProduct, SellingPlan } from '@/lib/shopify';

export function useProducts(first: number = 50, query?: string) {
  return useQuery({
    queryKey: ['products', first, query],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCTS_QUERY, { first, query });
      return (data?.data?.products?.edges || []) as ShopifyProduct[];
    },
  });
}

export function useProductByHandle(handle: string) {
  return useQuery({
    queryKey: ['product', handle],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCT_BY_HANDLE_QUERY, { handle });
      if (!data?.data?.productByHandle) return null;
      return { node: data.data.productByHandle } as ShopifyProduct;
    },
    enabled: !!handle,
  });
}

export function useMealProducts() {
  return useProducts(50, 'product_type:Meal OR tag:meal OR tag:weekly-menu');
}

export function useJuiceProducts() {
  return useProducts(50, 'product_type:Juice OR tag:juice');
}

// Fetch selling plans separately — fails gracefully if scope not enabled
export function useSellingPlans(productQuery?: string) {
  return useQuery({
    queryKey: ['sellingPlans', productQuery],
    queryFn: async (): Promise<SellingPlan | null> => {
      try {
        const data = await storefrontApiRequest(SELLING_PLANS_QUERY, { first: 5, query: productQuery });
        const products = data?.data?.products?.edges || [];
        for (const product of products) {
          const groups = product.node.sellingPlanGroups?.edges || [];
          for (const group of groups) {
            const plans = group.node.sellingPlans.edges;
            if (plans.length > 0) return plans[0].node;
          }
        }
        return null;
      } catch {
        // Scope not enabled yet — return null gracefully
        console.warn('Selling plans not available — enable unauthenticated_read_selling_plans scope in Shopify admin');
        return null;
      }
    },
    retry: false,
  });
}
