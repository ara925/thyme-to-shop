import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Browse the Menu",
      description: "Check out this week's rotating menu or our permanent juice collection."
    },
    {
      number: "02",
      title: "Place Your Order",
      description: "Add your favorites to cart and checkout before the weekly cutoff."
    },
    {
      number: "03",
      title: "We Prepare & Deliver",
      description: "Our chefs prepare your meals fresh and deliver them to your door."
    },
    {
      number: "04",
      title: "Heat & Enjoy",
      description: "Simply reheat and savor restaurant-quality meals at home."
    }
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
            How It Works
          </h2>
          <p className="mt-2 text-muted-foreground">
            Getting delicious meals has never been easier
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.number} className="relative text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground font-serif text-xl font-bold">
                {step.number}
              </div>
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-[60%] w-[80%] border-t-2 border-dashed border-border" />
              )}
              <h3 className="mt-4 font-serif text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
            <Link to="/how-it-works">
              Learn More
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
