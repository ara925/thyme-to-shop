import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const env = loadEnv(process.env.NODE_ENV || 'production', projectRoot, 'VITE_');
const defaultSiteUrl = 'https://shop.placeinthyme.com';

const resolveSiteUrl = (value) => {
  const candidate = (value || defaultSiteUrl).trim();
  const url = new URL(candidate);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_SITE_URL must be an absolute HTTP(S) URL without credentials, a query, or a hash.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
};

const apiVersion = '2026-07';
const storeDomain =
  env.VITE_SHOPIFY_STORE_DOMAIN || 'thyme-time-store-brreo.myshopify.com';
const storefrontToken =
  env.VITE_SHOPIFY_STOREFRONT_TOKEN || '5f7c48d7ed775a943e87a6308e72948f';
const siteUrl = resolveSiteUrl(env.VITE_SITE_URL);
const staticRoutes = [
  '/',
  '/weekly-meals',
  '/juices',
  '/juices/pick-and-choose',
  '/subscribe/meals',
  '/subscribe/juices',
  '/about',
  '/how-it-works',
];
const excludedProductHandles = new Set([
  // These products are routed to an approved category or planner instead of
  // having a customer-facing product-detail page.
  'weekly-meal-package-rotating-3-menu-cycle',
  'hibiscus-tea-sweetened',
  'hibiscus-tea-add-on',
  // Pick n' Choose has a dedicated builder route.
  'pick-n-choose-bundle',
]);

const response = await fetch(`https://${storeDomain}/api/${apiVersion}/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': storefrontToken,
  },
  body: JSON.stringify({
    query: `query SitemapProducts {
      products(first: 250) {
        edges {
          node {
            handle
            variants(first: 100) {
              edges { node { requiresComponents } }
            }
          }
        }
      }
    }`,
  }),
});

if (!response.ok) {
  throw new Error(`Shopify sitemap query failed with HTTP ${response.status}.`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join(', '));
}

const productRoutes = (payload.data?.products?.edges || [])
  .map(({ node }) => node)
  .filter((node) => {
    if (!node || typeof node.handle !== 'string' || node.handle.length === 0) return false;
    if (excludedProductHandles.has(node.handle.trim().toLowerCase())) return false;
    return (node.variants?.edges || []).some(({ node: variant }) => !variant.requiresComponents);
  })
  .map((node) => node.handle)
  .sort((left, right) => left.localeCompare(right))
  .map((handle) => `/product/${encodeURIComponent(handle)}`);
const routes = [...new Set([...staticRoutes, ...productRoutes])];
const escapeXml = (value) =>
  value.replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]);
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map((route) => `  <url><loc>${escapeXml(`${siteUrl}${route === '/' ? '' : route}`)}</loc></url>`),
  '</urlset>',
  '',
].join('\n');
const robots = [
  '# Generated at build time from VITE_SITE_URL.',
  '',
  'User-agent: Googlebot',
  'Allow: /',
  '',
  'User-agent: Bingbot',
  'Allow: /',
  '',
  'User-agent: Twitterbot',
  'Allow: /',
  '',
  'User-agent: facebookexternalhit',
  'Allow: /',
  '',
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: ${siteUrl}/sitemap.xml`,
  '',
].join('\n');

await Promise.all([
  writeFile(new URL('../public/sitemap.xml', import.meta.url), sitemap, 'utf8'),
  writeFile(new URL('../public/robots.txt', import.meta.url), robots, 'utf8'),
]);
console.log(`Generated sitemap and robots.txt for ${siteUrl} with ${routes.length} published routes.`);
