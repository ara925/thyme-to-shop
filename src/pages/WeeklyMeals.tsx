import { Layout } from '@/components/layout/Layout';
import { ProductGrid } from '@/components/products/ProductGrid';
import { useProducts } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/badge';
import { Clock, CalendarDays } from 'lucide-react';

const WeeklyMeals = () => {
  const { data: products = [], isLoading } = useProducts(50);

  // Filter for meal products (in a real scenario, you'd filter by collection or tag)
  const mealProducts = products;

  return (
    <Layout>
      <div className="bg-gradient-to-b from-herb-light to-background">
        <div className="container py-12 md:py-16">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-4">
              <CalendarDays className="mr-1 h-3 w-3" />
              This Week's Menu
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-foreground md:text-5xl">
              Weekly Meal Program
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Chef-prepared meals delivered fresh to your door. Our menu rotates weekly 
              to bring you exciting new dishes while keeping your favorites available.
            </p>
          </div>

          {/* Ordering Info Banner */}
          <div className="mt-8 flex flex-wrap gap-4">
            <div className="inline-flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm border border-border">
              <Clock className="h-4 w-4 text-accent" />
              <span><strong>Order by:</strong> Thursday 6PM</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm border border-border">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span><strong>Delivery:</strong> Sunday</span>
            </div>
          </div>
        </div>
      </div>

      <section className="py-12 md:py-16">
        <div className="container">
          <ProductGrid 
            products={mealProducts} 
            isLoading={isLoading}
            emptyMessage="No meals available this week. Check back soon!"
          />
        </div>
      </section>
    </Layout>
  );
};

export default WeeklyMeals;
