import { useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { ProductGrid } from '@/components/products/ProductGrid';
import { useProducts } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/badge';
import { Clock, CalendarDays } from 'lucide-react';
import { useOrderCycle } from '@/hooks/useOrderCycle';

const WeeklyMeals = () => {
  const { data: products = [], isLoading, error, refetch } = useProducts(250, 'product_type:Meal');
  const { cutoffPassed, orderableWeek, orderableWeekLabel } = useOrderCycle();

  const mealProducts = useMemo(
    () => products.filter(p => (p.node.tags || []).includes(orderableWeek)),
    [products, orderableWeek]
  );

  return (
    <Layout>
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-primary/90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--herb-glow)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 border-inverse-foreground/20 bg-inverse-foreground/10 text-inverse-foreground backdrop-blur-sm">
              <CalendarDays className="mr-1 h-3 w-3" />
              {orderableWeekLabel} — {cutoffPassed ? 'Next Available Menu' : "This Week's Menu"}
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-inverse-foreground md:text-6xl tracking-tight">
              Weekly Meal Program
            </h1>
            <p className="mt-4 text-lg text-inverse-foreground/70 max-w-lg">
              Chef-prepared meals delivered fresh to your door. Our menu rotates weekly 
              to bring you exciting new dishes while keeping your favorites available.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-inverse-foreground/10 bg-inverse-foreground/10 px-5 py-2.5 text-sm text-inverse-foreground backdrop-blur-sm">
              <Clock className="h-4 w-4 text-gold" />
              <span><strong>Order by:</strong> Thursday 6 PM ET</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-inverse-foreground/10 bg-inverse-foreground/10 px-5 py-2.5 text-sm text-inverse-foreground backdrop-blur-sm">
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
            error={error}
            onRetry={() => void refetch()}
            emptyMessage="No meals available this week. Check back soon!"
          />
        </div>
      </section>
    </Layout>
  );
};

export default WeeklyMeals;
