import { useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { ProductGrid } from '@/components/products/ProductGrid';
import { useProducts } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/badge';
import { Leaf } from 'lucide-react';
import { getCurrentWeekTag, getCurrentWeekLabel } from '@/lib/weekRotation';

const Juices = () => {
  const { data: allJuices = [], isLoading } = useProducts(50, 'product_type:Juice OR product_type:"Juice Bundle"');
  const currentWeek = getCurrentWeekTag();
  const currentWeekLabel = getCurrentWeekLabel();

  const juiceProducts = useMemo(
    () => allJuices.filter(p => (p.node.tags || []).includes(currentWeek)),
    [allJuices, currentWeek]
  );

  return (
    <Layout>
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-accent/80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(var(--terracotta)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 backdrop-blur-sm">
              <Leaf className="mr-1 h-3 w-3" />
              Fresh & Cold-Pressed
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-white md:text-6xl tracking-tight">
              Fresh Juices & Shots
            </h1>
            <p className="mt-4 text-lg text-white/70 max-w-lg">
              Nutrient-packed, cold-pressed juices and wellness shots made from premium fruits and vegetables. 
              Available individually or in value bundles.
            </p>
          </div>
        </div>
      </div>

      <section className="py-16 md:py-24">
        <div className="container">
          <ProductGrid 
            products={juiceProducts} 
            isLoading={isLoading}
            emptyMessage="No juices available right now. Check back soon!"
          />
        </div>
      </section>
    </Layout>
  );
};

export default Juices;