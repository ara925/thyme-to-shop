import { Layout } from '@/components/layout/Layout';
import { ProductGrid } from '@/components/products/ProductGrid';
import { useProducts } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/badge';
import { Leaf } from 'lucide-react';

const Juices = () => {
  const { data: juiceProducts = [], isLoading } = useProducts(50, 'product_type:Juice OR product_type:"Juice Bundle"');

  return (
    <Layout>
      <div className="bg-gradient-to-b from-terracotta-light to-background">
        <div className="container py-12 md:py-16">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-4 bg-terracotta-light text-accent">
              <Leaf className="mr-1 h-3 w-3" />
              Fresh & Cold-Pressed
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-foreground md:text-5xl">
              Fresh Juices
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Nutrient-packed, cold-pressed juices made from premium fruits and vegetables. 
              Available for purchase anytime — no subscription required.
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 md:py-16">
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
