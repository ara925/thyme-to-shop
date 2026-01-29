import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-border bg-secondary/30">
      <div className="container py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="inline-block">
              <span className="font-serif text-xl font-bold text-primary">
                Place in Thyme
              </span>
            </Link>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Fresh, chef-prepared meals delivered to your door. Supporting Operation Helping Hands Southern California.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Quick Links</h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link to="/weekly-meals" className="text-sm text-muted-foreground hover:text-primary">
                  Weekly Meals
                </Link>
              </li>
              <li>
                <Link to="/juices" className="text-sm text-muted-foreground hover:text-primary">
                  Juices
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-sm text-muted-foreground hover:text-primary">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-sm text-muted-foreground hover:text-primary">
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Contact</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Southern California</li>
              <li>
                <a href="mailto:info@placeinthyme.com" className="hover:text-primary">
                  info@placeinthyme.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Place in Thyme. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
