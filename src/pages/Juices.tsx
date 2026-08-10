import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Leaf, PackageOpen } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { JuiceBundleCards } from '@/components/juices/JuiceBundleCards';
import { ProductGrid } from '@/components/products/ProductGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProducts } from '@/hooks/useProducts';
import { getCurrentWeekLabel, getCurrentWeekTag } from '@/lib/weekRotation';

const Juices = () => {
  const { data: allJuices = [], isLoading, isError } = useProducts(
    50,
    'product_type:Juice AND NOT product_type:"Juice Bundle"',
  );
  const currentWeek = getCurrentWeekTag();
  const currentWeekLabel = getCurrentWeekLabel();

  const juiceProducts = useMemo(
    () =>
      allJuices.filter((product) => {
        const tags = product.node.tags || [];
        return product.node.productType === 'Juice' && tags.includes(currentWeek);
      }),
    [allJuices, currentWeek],
  );

  return (
    <Layout>
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-accent/80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(var(--terracotta)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 border-white/20 bg-white/10 text-white backdrop-blur-sm">
              <Leaf className="mr-1 h-3 w-3" aria-hidden="true" />
              {currentWeekLabel} - Fresh &amp; Cold-Pressed
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
              Fresh Juices &amp; Shots
            </h1>
            <p className="mt-4 max-w-lg text-lg text-white/70">
              Nutrient-packed, cold-pressed juices and wellness shots made from premium fruits and vegetables.
              Available individually or in value bundles.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/juices/pick-and-choose">
                  Build Pick n&apos; Choose
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
              >
                <a href="#juice-bundles">
                  <PackageOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                  View ready-made bundles
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <section className="py-16 md:py-24">
        <div className="container">
          <div className="mb-10 max-w-2xl">
            <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary">
              {currentWeekLabel}
            </Badge>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              Individual juices, shots, and teas
            </h2>
            <p className="mt-3 text-muted-foreground">
              Add any available item on its own, or open Pick n&apos; Choose to build a one-time custom bundle.
            </p>
          </div>
          <ProductGrid
            products={juiceProducts}
            isLoading={isLoading}
            errorMessage={
              isError ? 'The live juice menu could not be loaded.' : undefined
            }
            emptyMessage="No juices available right now. Check back soon!"
          />
        </div>
      </section>

      <JuiceBundleCards />
    </Layout>
  );
};

export default Juices;
