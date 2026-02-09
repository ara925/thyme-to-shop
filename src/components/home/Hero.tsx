import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Leaf, Clock, Truck, Sparkles } from 'lucide-react';
import heroBg from '@/assets/hero-bg.jpg';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Hero Image with Overlay */}
      <div className="relative min-h-[85vh] flex items-center">
        <img
          src={heroBg}
          alt="Fresh meal prep containers"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-espresso/90 via-espresso/70 to-espresso/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-espresso/60 via-transparent to-transparent" />
        
        <div className="container relative z-10 py-20 md:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/30 px-4 py-1.5 text-sm font-medium text-primary-foreground backdrop-blur-sm mb-6 opacity-0 animate-fade-in">
              <Sparkles className="h-4 w-4" />
              Fresh Weekly Menus Available Now
            </div>
            
            <h1 className="font-serif text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl leading-[1.1] opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              Chef-Prepared Meals,
              <span className="block italic text-gold">Made with Love</span>
            </h1>
            
            <p className="mt-6 text-lg text-white/80 md:text-xl max-w-lg leading-relaxed opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              Weekly rotating menus crafted from scratch by Place in Thyme. 
              Nutritious, delicious, and delivered fresh to your door.
            </p>
            
            <div className="mt-10 flex flex-col gap-4 sm:flex-row opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <Button asChild size="lg" className="bg-accent hover:bg-terracotta-dark text-white shadow-lg shadow-accent/30 text-base px-8 h-14 rounded-full">
                <Link to="/weekly-meals">
                  View This Week's Menu
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/40 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm text-base px-8 h-14 rounded-full">
                <Link to="/juices">
                  Browse Juices
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="relative -mt-16 z-20">
        <div className="container">
          <div className="grid gap-4 sm:grid-cols-3 mx-auto max-w-4xl">
            {[
              { icon: Leaf, title: "Farm Fresh", desc: "Locally sourced premium ingredients", color: "bg-primary" },
              { icon: Clock, title: "Weekly Menus", desc: "New rotating dishes every week", color: "bg-accent" },
              { icon: Truck, title: "Local Delivery", desc: "Straight to your door, SoCal", color: "bg-primary" },
            ].map((item, i) => (
              <div
                key={item.title}
                className="glass rounded-2xl p-6 text-center shadow-xl opacity-0 animate-slide-up"
                style={{ animationDelay: `${0.4 + i * 0.1}s` }}
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${item.color} text-white shadow-lg`}>
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-3 font-serif text-lg font-bold text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}