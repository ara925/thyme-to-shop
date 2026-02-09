import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { ProductGrid } from '@/components/products/ProductGrid';

export function FeaturedProducts() {
  const { data: products = [], isLoading } = useProducts(4);

  return (
    <section className="py-24 md:py-32">
      <div className="container">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-accent mb-2">Fresh This Week</p>
            <h2 className="font-serif text-4xl font-bold text-foreground md:text-5xl tracking-tight">
              This Week's Favorites
            </h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-md">
              Chef-selected dishes from our current rotating menu
            </p>
          </div>
          <Button asChild variant="outline" className="hidden sm:flex rounded-full px-6 border-primary/30 hover:bg-primary hover:text-primary-foreground transition-all">
            <Link to="/weekly-meals">
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <ProductGrid 
          products={products.slice(0, 4)} 
          isLoading={isLoading}
          emptyMessage="No products yet. Check back soon!"
        />

        <div className="mt-10 text-center sm:hidden">
          <Button asChild className="rounded-full px-8 bg-primary hover:bg-primary/90">
            <Link to="/weekly-meals">
              View All Meals
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}