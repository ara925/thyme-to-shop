import { Link } from 'react-router-dom';
import { Instagram, Mail, MapPin } from 'lucide-react';
import logo from '@/assets/logo.png';

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-espresso text-white/90">
      <div className="absolute inset-0 bg-gradient-to-br from-espresso via-espresso to-primary/20 opacity-50" />
      
      <div className="container relative py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <Link to="/" className="inline-flex items-center gap-2 group">
              <img
                src={logo}
                alt="Place in Thyme logo"
                className="h-11 w-11 rounded-full object-cover"
              />
              <span className="font-serif text-2xl font-bold text-white tracking-tight">
                Place in Thyme
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm text-white/60 leading-relaxed">
              Fresh, chef-prepared meals and cold-pressed juices delivered to your door. 
              Supporting Operation Helping Hands Southern California.
            </p>
            <div className="mt-6 flex gap-3">
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="mailto:info@placeinthyme.com" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3">
            <h3 className="font-serif text-lg font-bold text-white mb-4">Menu</h3>
            <ul className="space-y-3">
              {[
                { to: '/weekly-meals', label: 'Weekly Meals' },
                { to: '/juices', label: 'Juices & Shots' },
                { to: '/how-it-works', label: 'How It Works' },
                { to: '/about', label: 'About Us' },
              ].map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-white/60 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-4">
            <h3 className="font-serif text-lg font-bold text-white mb-4">Get in Touch</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                <span className="text-sm text-white/60">Southern California</span>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                <a href="mailto:info@placeinthyme.com" className="text-sm text-white/60 hover:text-white transition-colors">
                  info@placeinthyme.com
                </a>
              </li>
            </ul>
            
            <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-sm font-semibold text-white">Order Cutoff</p>
              <p className="text-sm text-white/60 mt-1">Thursday 6PM · Delivery Sunday</p>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-white/40">
            © {new Date().getFullYear()} Place in Thyme. All rights reserved.
          </p>
          <p className="text-sm text-white/40">
            Crafted with ❤️ in Southern California
          </p>
        </div>
      </div>
    </footer>
  );
}