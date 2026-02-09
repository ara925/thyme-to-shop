import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Browse the Menu",
      description: "Check out this week's rotating menu or our juice collection.",
      emoji: "🍽️",
    },
    {
      number: "02",
      title: "Place Your Order",
      description: "Add favorites to cart and checkout before the weekly cutoff.",
      emoji: "🛒",
    },
    {
      number: "03",
      title: "We Prepare & Deliver",
      description: "Our chefs prepare your meals fresh and deliver to your door.",
      emoji: "🚚",
    },
    {
      number: "04",
      title: "Heat & Enjoy",
      description: "Simply reheat and savor restaurant-quality meals at home.",
      emoji: "✨",
    },
  ];

  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-herb-light/30 to-background" />
      
      <div className="container relative">
        <div className="text-center mb-16">
          <p className="text-sm font-bold uppercase tracking-widest text-accent mb-2">Simple Process</p>
          <h2 className="font-serif text-4xl font-bold text-foreground md:text-5xl tracking-tight">
            How It Works
          </h2>
          <p className="mt-3 text-lg text-muted-foreground max-w-md mx-auto">
            From our kitchen to your table in four easy steps
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="relative group"
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[60%] w-[80%] border-t-2 border-dashed border-primary/20 z-0" />
              )}
              
              <div className="relative bg-card rounded-2xl p-6 shadow-lg border border-border/50 hover:shadow-xl hover:border-primary/20 transition-all duration-300 hover:-translate-y-1">
                <div className="text-4xl mb-4">{step.emoji}</div>
                <div className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-primary/10 text-primary font-bold text-sm mb-3">
                  Step {step.number}
                </div>
                <h3 className="font-serif text-xl font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Button asChild size="lg" className="rounded-full px-8 h-14 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 text-base">
            <Link to="/how-it-works">
              Learn More About Our Process
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}