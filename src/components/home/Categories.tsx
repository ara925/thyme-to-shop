import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, UtensilsCrossed, GlassWater } from 'lucide-react';

export function Categories() {
  return (
    <section className="py-24 md:py-32 bg-secondary/40 section-pattern">
      <div className="container">
        <div className="text-center mb-16">
          <p className="text-sm font-bold uppercase tracking-widest text-accent mb-2">Our Offerings</p>
          <h2 className="font-serif text-4xl font-bold text-foreground md:text-5xl tracking-tight">
            What We Serve
          </h2>
          <p className="mt-3 text-lg text-muted-foreground max-w-md mx-auto">
            From hearty meals to refreshing cold-pressed juices
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 max-w-5xl mx-auto">
          {/* Weekly Meals Card */}
          <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-herb-glow p-1">
            <div className="rounded-[calc(1.5rem-4px)] bg-card p-8 md:p-10 h-full flex flex-col">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 group-hover:scale-110 transition-transform duration-300">
                <UtensilsCrossed className="h-8 w-8" />
              </div>
              <h3 className="font-serif text-3xl font-bold text-foreground">Weekly Meals</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed flex-1">
                Three rotating chef-prepared menus delivered fresh. New dishes every week to keep things exciting while keeping your favorites available.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <Button asChild className="rounded-full px-6 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                  <Link to="/weekly-meals">
                    Browse Meals
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <span className="text-sm text-muted-foreground">From $10/meal</span>
              </div>
            </div>
          </div>

          {/* Juices Card */}
          <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-terracotta-dark p-1">
            <div className="rounded-[calc(1.5rem-4px)] bg-card p-8 md:p-10 h-full flex flex-col">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mb-6 group-hover:scale-110 transition-transform duration-300">
                <GlassWater className="h-8 w-8" />
              </div>
              <h3 className="font-serif text-3xl font-bold text-foreground">Fresh Juices</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed flex-1">
                Cold-pressed, nutrient-rich juices and wellness shots. Bundles available for maximum savings and freshness every day.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <Button asChild className="rounded-full px-6 bg-accent hover:bg-terracotta-dark text-white shadow-lg shadow-accent/20">
                  <Link to="/juices">
                    Browse Juices
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <span className="text-sm text-muted-foreground">From $3/bottle</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}