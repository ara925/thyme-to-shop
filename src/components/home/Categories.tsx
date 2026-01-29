import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, UtensilsCrossed, GlassWater } from 'lucide-react';

export function Categories() {
  return (
    <section className="py-16 md:py-24 bg-secondary/30">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
            What We Offer
          </h2>
          <p className="mt-2 text-muted-foreground">
            Choose from our weekly meal program or fresh-pressed juices
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Weekly Meals Card */}
          <Card className="group overflow-hidden border-border bg-card transition-all duration-300 hover:shadow-xl hover:border-primary/30">
            <CardContent className="p-0">
              <div className="aspect-[16/9] bg-gradient-to-br from-herb-light to-herb/20 flex items-center justify-center">
                <UtensilsCrossed className="h-24 w-24 text-primary/60 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div className="p-6">
                <h3 className="font-serif text-2xl font-bold text-foreground">Weekly Meals</h3>
                <p className="mt-2 text-muted-foreground">
                  Rotating chef-prepared meals delivered fresh. Three unique menus throughout the month with new dishes every week.
                </p>
                <Button asChild className="mt-6 bg-primary hover:bg-primary/90">
                  <Link to="/weekly-meals">
                    Browse Meals
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Juices Card */}
          <Card className="group overflow-hidden border-border bg-card transition-all duration-300 hover:shadow-xl hover:border-accent/30">
            <CardContent className="p-0">
              <div className="aspect-[16/9] bg-gradient-to-br from-terracotta-light to-accent/20 flex items-center justify-center">
                <GlassWater className="h-24 w-24 text-accent/60 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div className="p-6">
                <h3 className="font-serif text-2xl font-bold text-foreground">Fresh Juices</h3>
                <p className="mt-2 text-muted-foreground">
                  Cold-pressed, nutrient-rich juices made from premium fruits and vegetables. Available for individual purchase anytime.
                </p>
                <Button asChild variant="outline" className="mt-6 border-accent text-accent hover:bg-accent hover:text-accent-foreground">
                  <Link to="/juices">
                    Browse Juices
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
