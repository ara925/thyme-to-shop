import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { ProductGrid } from '@/components/products/ProductGrid';

export function FeaturedProducts() {
  const { data: products = [], isLoading } = useProducts(4);

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
              This Week's Favorites
            </h2>
            <p className="mt-2 text-muted-foreground">
              Chef-selected dishes from our current menu
            </p>
          </div>
          <Button asChild variant="ghost" className="hidden sm:flex">
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

        <div className="mt-8 text-center sm:hidden">
          <Button asChild>
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
