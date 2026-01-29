import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Leaf, Clock, Truck } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-herb-light via-background to-terracotta-light">
      <div className="container py-16 md:py-24 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl animate-fade-in">
            Fresh, Chef-Prepared Meals
            <span className="block text-primary">Delivered to Your Door</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl animate-fade-in" style={{ animationDelay: '0.1s' }}>
            Weekly rotating menus crafted with love by Place in Thyme. 
            Nutritious, delicious, and ready to enjoy.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
              <Link to="/weekly-meals">
                View This Week's Menu
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/juices">
                Browse Juices
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="border-t border-border bg-card/50">
        <div className="container py-12">
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-herb-light">
                <Leaf className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-semibold">Fresh Ingredients</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Locally sourced, premium quality ingredients in every dish
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-terracotta-light">
                <Clock className="h-6 w-6 text-accent" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-semibold">Weekly Menus</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                New rotating menus every week to keep things exciting
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-herb-light">
                <Truck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-semibold">Local Delivery</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Convenient delivery throughout Southern California
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
