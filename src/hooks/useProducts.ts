import { useQuery } from '@tanstack/react-query';
import {
  PRODUCT_BY_HANDLE_QUERY,
  PRODUCTS_QUERY,
  type ProductByHandleQueryData,
  type ProductsQueryData,
  StorefrontApiError,
  storefrontApiRequest,
} from '@/lib/shopify';

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof StorefrontApiError) {
    return error.code === 'network' || (error.code === 'http' && (error.status || 0) >= 500);
  }
  return true;
}

export function useProducts(first = 100, query?: string) {
  return useQuery({
    queryKey: ['products', first, query],
    queryFn: async ({ signal }) => {
      const products: ProductsQueryData['products']['edges'] = [];
      const pageSize = Math.max(1, Math.min(first, 250));
      let after: string | null = null;

      do {
        const data: ProductsQueryData = await storefrontApiRequest<ProductsQueryData>(
          PRODUCTS_QUERY,
          { first: pageSize, after, query },
          signal,
        );
        products.push(...data.products.edges);

        if (!data.products.pageInfo?.hasNextPage) break;
        after = data.products.pageInfo.endCursor;
        if (!after) {
          throw new StorefrontApiError(
            'The catalog response omitted its next-page cursor',
            'invalid-response',
          );
        }
      } while (after);

      return products;
    },
    staleTime: 2 * 60 * 1000,
    retry: shouldRetry,
  });
}

export function useProductByHandle(handle: string) {
  return useQuery({
    queryKey: ['product', handle],
    queryFn: async ({ signal }) => {
      const data = await storefrontApiRequest<ProductByHandleQueryData>(
        PRODUCT_BY_HANDLE_QUERY,
        { handle },
        signal,
      );
      return data.productByHandle ? { node: data.productByHandle } : null;
    },
    enabled: Boolean(handle),
    staleTime: 2 * 60 * 1000,
    retry: shouldRetry,
  });
}
