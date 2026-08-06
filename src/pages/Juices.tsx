import { useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { ProductGrid } from '@/components/products/ProductGrid';
import { useProducts } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/badge';
import { Leaf } from 'lucide-react';
import { useOrderCycle } from '@/hooks/useOrderCycle';

const Juices = () => {
  const { data: allJuices = [], isLoading, error, refetch } = useProducts(250, 'product_type:Juice OR product_type:"Juice Bundle"');
  const { orderableWeek, orderableWeekLabel } = useOrderCycle();

  // Individual juices filtered by current week; bundles always shown
  const juiceProducts = useMemo(
    () => allJuices.filter(p => {
      const tags = p.node.tags || [];
      if (p.node.productType === 'Juice Bundle') return true;
      return tags.includes(orderableWeek);
    }),
    [allJuices, orderableWeek]
  );

  return (
    <Layout>
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-accent/80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(var(--terracotta)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 border-inverse-foreground/20 bg-inverse-foreground/10 text-inverse-foreground backdrop-blur-sm">
              <Leaf className="mr-1 h-3 w-3" />
              {orderableWeekLabel} — Fresh & Cold-Pressed
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-inverse-foreground md:text-6xl tracking-tight">
              Fresh Juices & Shots
            </h1>
            <p className="mt-4 text-lg text-inverse-foreground/70 max-w-lg">
              Browse cold-pressed juices and wellness shots from the live store catalog, available individually and in bundles.
            </p>
          </div>
        </div>
      </div>

      <section className="py-16 md:py-24">
        <div className="container">
          <ProductGrid 
            products={juiceProducts} 
            isLoading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            emptyMessage="No juices available right now. Check back soon!"
          />
        </div>
      </section>
    </Layout>
  );
};

export default Juices;
