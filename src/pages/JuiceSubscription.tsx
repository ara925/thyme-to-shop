import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const JuiceSubscription = () => (
  <Layout>
    <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-accent/80">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(var(--terracotta)/0.3),transparent_60%)]" />
      <div className="container relative py-16 md:py-24">
        <div className="max-w-2xl">
          <Badge className="mb-4 border-inverse-foreground/20 bg-inverse-foreground/10 text-inverse-foreground backdrop-blur-sm">
            <CalendarDays className="mr-1 h-3 w-3" aria-hidden="true" />
            Juice Plan Subscription
          </Badge>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-inverse-foreground md:text-6xl">
            Weekly Juice Plan
          </h1>
          <p className="mt-4 max-w-lg text-lg text-inverse-foreground">
            Juice subscription enrollment is currently paused while pricing and commitment terms are verified.
          </p>
        </div>
      </div>
    </div>

    <section className="py-16 md:py-24">
      <div className="container">
        <Card className="mx-auto max-w-2xl border-accent/30 bg-card shadow-lg">
          <CardContent className="p-8 text-center md:p-10">
            <AlertTriangle className="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
            <h2 className="mt-4 font-serif text-2xl font-bold">
              Online enrollment is temporarily unavailable
            </h2>
            <p className="mt-3 text-muted-foreground">
              New juice subscriptions are paused until the four-week commitment and Shopify subscription pricing are fully configured and verified.
            </p>
            <Button asChild className="mt-7">
              <Link to="/juices">
                Browse one-time juices
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  </Layout>
);

export default JuiceSubscription;
