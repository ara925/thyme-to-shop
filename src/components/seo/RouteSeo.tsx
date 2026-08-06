import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://thyme-to-shop.lovable.app').replace(/\/$/, '');
const DEFAULT_IMAGE = `${SITE_URL}/favicon.png`;

interface RouteMetadata {
  title: string;
  description: string;
  noIndex?: boolean;
}

const ROUTE_METADATA: Record<string, RouteMetadata> = {
  '/': {
    title: 'Place in Thyme | Fresh Meals & Juices',
    description: 'Shop chef-prepared meals, cold-pressed juices, subscriptions, and ready-made bundles from Place in Thyme.',
  },
  '/weekly-meals': {
    title: 'Weekly Meals | Place in Thyme',
    description: 'Browse the current live menu of chef-prepared Place in Thyme meals and add available dishes to your cart.',
  },
  '/juices': {
    title: 'Juices & Bundles | Place in Thyme',
    description: 'Shop cold-pressed juices, wellness shots, ready-made bundles, and the Pick n’ Choose builder.',
  },
  '/juices/pick-and-choose': {
    title: 'Pick n’ Choose | Place in Thyme',
    description: 'Build a custom recurring juice bundle from eligible live Place in Thyme products and prices.',
  },
  '/subscribe/meals': {
    title: 'Weekly Meal Plan | Place in Thyme',
    description: 'Build a weekly meal subscription from the live rotating Place in Thyme menus.',
  },
  '/subscribe/juices': {
    title: 'Weekly Juice Plan | Place in Thyme',
    description: 'Choose a weekly recurring juice selection using live products, availability, and Shopify purchase plans.',
  },
  '/about': {
    title: 'About | Place in Thyme',
    description: 'Learn about Place in Thyme and its approach to convenient chef-prepared meals and fresh juices.',
  },
  '/how-it-works': {
    title: 'How It Works | Place in Thyme',
    description: 'See how to choose products, select fulfillment, and check out with Place in Thyme.',
  },
  '/product/:handle': {
    title: 'Product Details | Place in Thyme',
    description: 'View live product details, availability, options, and pricing from Place in Thyme.',
  },
  '*': {
    title: 'Page Not Found | Place in Thyme',
    description: 'The requested Place in Thyme page could not be found.',
    noIndex: true,
  },
};

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function RouteSeo() {
  const location = useLocation();

  useEffect(() => {
    const routeKey = location.pathname.startsWith('/product/')
      ? '/product/:handle'
      : location.pathname;
    const metadata = ROUTE_METADATA[routeKey] || ROUTE_METADATA['*'];
    const canonicalUrl = `${SITE_URL}${location.pathname === '/' ? '' : location.pathname}`;

    document.title = metadata.title;
    setMeta('meta[name="description"]', 'name', 'description', metadata.description);
    setMeta('meta[name="robots"]', 'name', 'robots', metadata.noIndex ? 'noindex, nofollow' : 'index, follow');
    setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[property="og:image"]', 'property', 'og:image', DEFAULT_IMAGE);
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', DEFAULT_IMAGE);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const existingOrganization = document.getElementById('place-in-thyme-organization');
    existingOrganization?.remove();
    if (location.pathname === '/') {
      const organization = document.createElement('script');
      organization.id = 'place-in-thyme-organization';
      organization.type = 'application/ld+json';
      organization.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Place in Thyme',
        url: SITE_URL,
        logo: DEFAULT_IMAGE,
      });
      document.head.appendChild(organization);
    }
  }, [location.pathname]);

  return null;
}
