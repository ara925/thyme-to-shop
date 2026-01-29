import { useQuery } from '@tanstack/react-query';
import { storefrontApiRequest, PRODUCTS_QUERY, PRODUCT_BY_HANDLE_QUERY, ShopifyProduct } from '@/lib/shopify';

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
