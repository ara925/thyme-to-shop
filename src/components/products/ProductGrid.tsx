import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ShopifyProduct } from '@/lib/shopify';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: ShopifyProduct[];
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: string;
  ariaLabel?: string;
}

function ProductGridSkeleton({ heading }: { heading: string }) {
  return (
    <section aria-labelledby="product-grid-heading">
      <h2 id="product-grid-heading" className="sr-only">{heading}</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading products">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card p-5">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="mt-5 h-6 w-3/4" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
            <Skeleton className="mt-5 h-11 w-full rounded-full" />
          </div>
        ))}
        <span className="sr-only">Loading products…</span>
      </div>
    </section>
  );
}

export function ProductGrid({
  products,
  isLoading,
  error,
  onRetry,
  emptyMessage = 'No products found',
  ariaLabel = 'Products',
}: ProductGridProps) {
  if (isLoading) return <ProductGridSkeleton heading={ariaLabel} />;

  if (error) {
    return (
      <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center" role="alert" aria-labelledby="product-grid-error-heading">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
        <h2 id="product-grid-error-heading" className="mt-3 text-xl font-bold text-foreground">Products are temporarily unavailable</h2>
        <p className="mt-2 text-muted-foreground">We could not load the live store catalog.</p>
        {onRetry && (
          <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        )}
      </section>
    );
  }

  if (products.length === 0) {
    return (
      <section className="flex flex-col items-center justify-center py-12 text-center" role="status" aria-labelledby="product-grid-empty-heading">
        <h2 id="product-grid-empty-heading" className="sr-only">{ariaLabel}</h2>
        <p className="text-lg text-muted-foreground">{emptyMessage}</p>
        <p className="mt-2 text-sm text-muted-foreground">Check back soon for our latest offerings.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="product-grid-heading">
      <h2 id="product-grid-heading" className="sr-only">{ariaLabel}</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.node.id} product={product} />
        ))}
      </div>
    </section>
  );
}
