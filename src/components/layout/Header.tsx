import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/weekly-meals', label: 'Weekly Meals' },
  { href: '/juices', label: 'Juices' },
  { href: '/subscribe/meals', label: 'Meal Plan' },
  { href: '/subscribe/juices', label: 'Juice Plan' },
  { href: '/about', label: 'About' },
  { href: '/how-it-works', label: 'How It Works' },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "bg-background/95 backdrop-blur-lg shadow-md border-b border-border/50"
          : "bg-transparent"
      )}
    >
      <div className="container flex h-18 items-center justify-between md:h-20">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-serif font-bold text-lg transition-transform group-hover:scale-110">
            P
          </div>
          <span className="font-serif text-xl font-bold text-foreground md:text-2xl tracking-tight">
            Place in Thyme
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex md:items-center md:gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                "relative px-4 py-2 text-sm font-semibold tracking-wide uppercase transition-colors rounded-full",
                location.pathname === link.href
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Cart & Mobile Menu */}
        <div className="flex items-center gap-3">
          <CartDrawer />
          
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div
        className={cn(
          "md:hidden overflow-hidden transition-all duration-300 ease-in-out bg-background/95 backdrop-blur-lg",
          mobileMenuOpen ? "max-h-96 border-b border-border" : "max-h-0"
        )}
      >
        <nav className="container flex flex-col gap-1 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                "py-3 px-4 text-base font-semibold rounded-lg transition-colors",
                location.pathname === link.href
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}