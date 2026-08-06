import { useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { ProductGrid } from '@/components/products/ProductGrid';
import { useProducts } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/badge';
import { Clock, CalendarDays } from 'lucide-react';
import { getCurrentWeekTag, getCurrentWeekLabel } from '@/lib/weekRotation';

const WeeklyMeals = () => {
  const { data: products = [], isLoading, isError } = useProducts(50, 'product_type:Meal');
  const currentWeek = getCurrentWeekTag();
  const currentWeekLabel = getCurrentWeekLabel();

  const mealProducts = useMemo(
    () => products.filter(p => (p.node.tags || []).includes(currentWeek)),
    [products, currentWeek]
  );

  return (
    <Layout>
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-primary/90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--herb-glow)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 backdrop-blur-sm">
              <CalendarDays className="mr-1 h-3 w-3" />
              {currentWeekLabel} — This Week's Menu
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-white md:text-6xl tracking-tight">
              Weekly Meal Program
            </h1>
            <p className="mt-4 text-lg text-white/70 max-w-lg">
              Chef-prepared meals delivered fresh to your door. Our menu rotates weekly 
              to bring you exciting new dishes while keeping your favorites available.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <Clock className="h-4 w-4 text-gold" />
              <span><strong>Order by:</strong> Thursday 6PM</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <CalendarDays className="h-4 w-4 text-gold" />
              <span><strong>Delivery:</strong> Sunday</span>
            </div>
          </div>
        </div>
      </div>

      <section className="py-16 md:py-24">
        <div className="container">
          <ProductGrid 
            products={mealProducts} 
            isLoading={isLoading}
            errorMessage={
              isError ? 'The live meal menu could not be loaded.' : undefined
            }
            emptyMessage="No meals available this week. Check back soon!"
          />
        </div>
      </section>
    </Layout>
  );
};

export default WeeklyMeals;
