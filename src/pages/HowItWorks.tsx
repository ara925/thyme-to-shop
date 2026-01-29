import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Search, ShoppingCart, Truck, UtensilsCrossed, Clock, CalendarDays } from 'lucide-react';

const HowItWorks = () => {
  const steps = [
    {
      icon: Search,
      title: "1. Browse the Menu",
      description: "Check out this week's rotating meal menu or browse our permanent juice collection. Our chefs update the weekly menu with fresh, seasonal dishes."
    },
    {
      icon: ShoppingCart,
      title: "2. Add to Cart",
      description: "Select your favorite meals and juices, choose quantities, and add them to your cart. Mix and match to create your perfect order."
    },
    {
      icon: Clock,
      title: "3. Order Before Cutoff",
      description: "Place your order by Thursday at 6PM to be included in the week's delivery. Orders placed after cutoff will be delivered the following week."
    },
    {
      icon: UtensilsCrossed,
      title: "4. We Prepare Fresh",
      description: "Our chefs prepare your meals fresh over the weekend using premium, locally-sourced ingredients. No freezing, no preservatives."
    },
    {
      icon: Truck,
      title: "5. Sunday Delivery",
      description: "Your meals arrive at your door on Sunday, packaged to stay fresh. Ready to heat and enjoy throughout the week."
    },
  ];

  return (
    <Layout>
      <div className="bg-gradient-to-b from-secondary to-background">
        <div className="container py-12 md:py-16">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-serif text-4xl font-bold text-foreground md:text-5xl">
              How It Works
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Getting delicious, chef-prepared meals delivered to your door is easy. 
              Here's everything you need to know.
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 md:py-16">
        <div className="container">
          <div className="max-w-3xl mx-auto space-y-6">
            {steps.map((step, index) => (
              <Card key={index} className="border-border bg-card">
                <CardContent className="flex gap-6 p-6">
                  <div className="flex-shrink-0">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <step.icon className="h-6 w-6" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Schedule Summary */}
          <div className="mt-16 max-w-3xl mx-auto">
            <h2 className="font-serif text-2xl font-bold text-foreground text-center mb-8">
              Weekly Schedule
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-primary/20 bg-herb-light/30">
                <CardContent className="p-6 text-center">
                  <Clock className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="mt-4 font-serif text-lg font-semibold">Order Cutoff</h3>
                  <p className="mt-2 text-2xl font-bold text-primary">Thursday 6PM</p>
                </CardContent>
              </Card>
              <Card className="border-accent/20 bg-terracotta-light/30">
                <CardContent className="p-6 text-center">
                  <CalendarDays className="h-8 w-8 text-accent mx-auto" />
                  <h3 className="mt-4 font-serif text-lg font-semibold">Delivery Day</h3>
                  <p className="mt-2 text-2xl font-bold text-accent">Sunday</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <h2 className="font-serif text-2xl font-bold text-foreground">
              Ready to Get Started?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Browse this week's menu and place your first order today.
            </p>
            <Button asChild size="lg" className="mt-6 bg-primary hover:bg-primary/90">
              <Link to="/weekly-meals">
                View This Week's Menu
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default HowItWorks;
