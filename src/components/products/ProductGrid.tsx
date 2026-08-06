import { ShopifyProduct } from '@/lib/shopify';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductCard } from './ProductCard';

const PRODUCT_GRID_SKELETONS = 8;

function ProductGridLoadingState() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading products</span>
      <div
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: PRODUCT_GRID_SKELETONS }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl bg-card shadow-md"
          >
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="space-y-3 p-5 pb-2">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-6 w-3/5" />
                <Skeleton className="h-6 w-16 shrink-0" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <div className="px-5 pb-5 pt-3">
              <Skeleton className="h-11 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProductGridProps {
  products: ShopifyProduct[];
  isLoading?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
}

export function ProductGrid({
  products,
  isLoading,
  errorMessage,
  emptyMessage = 'No products found',
}: ProductGridProps) {
  if (isLoading) {
    return <ProductGridLoadingState />;
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      >
        <p className="text-lg font-semibold text-destructive">{errorMessage}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Please refresh the page or try again in a few moments.
        </p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg text-muted-foreground">{emptyMessage}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Check back soon for our latest offerings!
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.node.id} product={product} />
      ))}
    </div>
  );
}
