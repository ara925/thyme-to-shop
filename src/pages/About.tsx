import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, Users, Leaf } from 'lucide-react';

const About = () => {
  return (
    <Layout>
      <div className="bg-gradient-to-b from-herb-light to-background">
        <div className="container py-12 md:py-16">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-serif text-4xl font-bold text-foreground md:text-5xl">
              About Place in Thyme
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              We're passionate about bringing fresh, chef-prepared meals to your table 
              while supporting our local community through Operation Helping Hands Southern California.
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 md:py-16">
        <div className="container">
          <h2 className="sr-only">What guides Place in Thyme</h2>
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="border-border bg-card">
              <CardContent className="p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-herb-light">
                  <Leaf className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mt-4 font-serif text-xl font-semibold">Fresh & Local</h3>
                <p className="mt-2 text-muted-foreground">
                  We source the finest local ingredients to create meals that are both 
                  nutritious and delicious.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-terracotta-light">
                  <Heart className="h-8 w-8 text-accent" />
                </div>
                <h3 className="mt-4 font-serif text-xl font-semibold">Made with Love</h3>
                <p className="mt-2 text-muted-foreground">
                  Every dish is prepared by our skilled chefs who pour their passion 
                  into creating memorable meals.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-herb-light">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mt-4 font-serif text-xl font-semibold">Community Focused</h3>
                <p className="mt-2 text-muted-foreground">
                  We're proud to support Operation Helping Hands and give back to 
                  our Southern California community.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-16 max-w-3xl mx-auto">
            <h2 className="font-serif text-3xl font-bold text-foreground text-center">
              Our Story
            </h2>
            <div className="mt-8 space-y-6 text-muted-foreground">
              <p>
                Place in Thyme was born from a simple belief: everyone deserves access to 
                delicious, wholesome meals without the stress of daily cooking. Our journey 
                began in Southern California, where we set out to create a meal delivery 
                service that feels like home.
              </p>
              <p>
                What sets us apart is our commitment to quality and community. We partner 
                with local farmers and suppliers to bring you the freshest ingredients, 
                while our rotating weekly menus ensure you're always discovering something new.
              </p>
              <p>
                As part of Operation Helping Hands Southern California, we believe in the 
                power of food to bring people together and make a difference. Every meal 
                you order helps support our mission to serve our community.
              </p>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default About;
