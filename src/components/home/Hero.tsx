import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Leaf, Clock, Truck, Sparkles } from 'lucide-react';
import heroBgJpg from '@/assets/hero-bg.jpg';
import heroBgAvif from '@/assets/hero-bg.avif';
import heroBgAvif1280 from '@/assets/hero-bg-1280.avif';
import heroBgAvif768 from '@/assets/hero-bg-768.avif';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Hero Image with Overlay */}
      <div className="relative min-h-[85vh] flex items-center">
        <picture className="absolute inset-0">
          <source
            type="image/avif"
            srcSet={`${heroBgAvif768} 768w, ${heroBgAvif1280} 1280w, ${heroBgAvif} 1920w`}
            sizes="100vw"
          />
          <img
            src={heroBgJpg}
            alt="Prepared meals, salads, and green juices arranged on a wooden table"
            width="1920"
            height="1080"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-espresso/90 via-espresso/70 to-espresso/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-espresso/60 via-transparent to-transparent" />
        
        <div className="container relative z-10 py-20 md:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/30 px-4 py-1.5 text-sm font-medium text-primary-foreground backdrop-blur-sm mb-6 opacity-0 animate-fade-in">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Fresh Weekly Menus Available Now
            </div>
            
            <h1 className="font-serif text-5xl font-bold tracking-tight text-inverse-foreground sm:text-6xl md:text-7xl leading-[1.1] opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              Chef-Prepared Meals,
              <span className="block italic text-gold">Made with Love</span>
            </h1>
            
            <p className="mt-6 text-lg text-inverse-foreground md:text-xl max-w-lg leading-relaxed opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              Browse the weekly rotating menu from Place in Thyme and choose a Sunday delivery window.
            </p>
            
            <div className="mt-10 flex flex-col gap-4 sm:flex-row opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-terracotta-dark shadow-lg shadow-accent/30 text-base px-8 h-14 rounded-full">
                <Link to="/weekly-meals">
                  View This Week's Menu
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-inverse-foreground/40 bg-inverse-foreground/10 text-inverse-foreground hover:bg-inverse-foreground/20 backdrop-blur-sm text-base px-8 h-14 rounded-full">
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
          <h2 className="sr-only">Ordering highlights</h2>
          <div className="grid gap-4 sm:grid-cols-3 mx-auto max-w-4xl">
            {[
              { icon: Leaf, title: "Rotating Menus", desc: "A three-week meal rotation", color: "bg-primary" },
              { icon: Clock, title: "One-Time Orders", desc: "Choose meals and juices", color: "bg-accent" },
              { icon: Truck, title: "Sunday Delivery", desc: "Choose a dropoff window", color: "bg-primary" },
            ].map((item, i) => (
              <div
                key={item.title}
                className="glass rounded-2xl p-6 text-center shadow-xl opacity-0 animate-slide-up"
                style={{ animationDelay: `${0.4 + i * 0.1}s` }}
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${item.color} text-primary-foreground shadow-lg`}>
                  <item.icon className="h-6 w-6" aria-hidden="true" />
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
