import { Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from '@/assets/logo.png';

const footerLinks = [
  { to: '/weekly-meals', label: 'Weekly Meals' },
  { to: '/juices', label: 'Juices & Shots' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About Us' },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-inverse text-inverse-foreground">
      <div className="absolute inset-0 bg-gradient-to-br from-inverse via-inverse to-primary/20 opacity-50" />

      <div className="container relative py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link
              to="/"
              className="group inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-inverse"
            >
              <img
                src={logo}
                alt=""
                width="200"
                height="200"
                className="h-11 w-11 rounded-full object-cover"
              />
              <span className="font-serif text-2xl font-bold tracking-tight text-inverse-foreground">
                Place in Thyme
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-inverse-foreground/70">
              Fresh, chef-prepared meals and cold-pressed juices delivered to your door. Supporting Operation Helping
              Hands Southern California.
            </p>
            <a
              href="mailto:info@placeinthyme.com"
              aria-label="Email Place in Thyme"
              className="mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-inverse-foreground/10 transition-colors hover:bg-inverse-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-inverse"
            >
              <Mail aria-hidden="true" className="h-5 w-5" />
            </a>
          </div>

          <nav aria-labelledby="footer-menu-heading" className="md:col-span-3">
            <h2 id="footer-menu-heading" className="mb-4 font-serif text-lg font-bold text-inverse-foreground">
              Menu
            </h2>
            <ul className="space-y-1">
              {footerLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="inline-flex min-h-11 items-center rounded-sm text-sm text-inverse-foreground/70 transition-colors hover:text-inverse-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-inverse"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-4">
            <h2 className="mb-4 font-serif text-lg font-bold text-inverse-foreground">Get in Touch</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                <span className="text-sm text-inverse-foreground/70">Southern California</span>
              </li>
              <li className="flex items-start gap-3">
                <Mail aria-hidden="true" className="mt-3 h-5 w-5 shrink-0 text-gold" />
                <a
                  href="mailto:info@placeinthyme.com"
                  className="inline-flex min-h-11 items-center rounded-sm text-sm text-inverse-foreground/70 transition-colors hover:text-inverse-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-inverse"
                >
                  info@placeinthyme.com
                </a>
              </li>
            </ul>

            <div className="mt-6 rounded-xl border border-inverse-foreground/15 bg-inverse-foreground/5 p-4">
              <p className="text-sm font-semibold text-inverse-foreground">Order Cutoff</p>
              <p className="mt-1 text-sm text-inverse-foreground/70">Thursday 6 PM ET · Delivery Sunday</p>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-inverse-foreground/15 pt-8 sm:flex-row">
          <p className="text-sm text-inverse-foreground/70">
            © {new Date().getFullYear()} Place in Thyme. All rights reserved.
          </p>
          <p className="text-sm text-inverse-foreground/70">Crafted with ❤️ in Southern California</p>
        </div>
      </div>
    </footer>
  );
}
