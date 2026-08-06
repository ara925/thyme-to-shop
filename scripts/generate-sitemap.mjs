import { writeFile } from 'node:fs/promises';

const apiVersion = '2026-07';
const storeDomain =
  process.env.VITE_SHOPIFY_STORE_DOMAIN || 'thyme-time-store-brreo.myshopify.com';
const storefrontToken =
  process.env.VITE_SHOPIFY_STOREFRONT_TOKEN || '5f7c48d7ed775a943e87a6308e72948f';
const siteUrl = (process.env.VITE_SITE_URL || 'https://thyme-to-shop.lovable.app').replace(/\/$/, '');
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
    if (node.handle === 'pick-n-choose-bundle') return false;
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

await writeFile(new URL('../public/sitemap.xml', import.meta.url), sitemap, 'utf8');
console.log(`Generated sitemap with ${routes.length} published routes.`);
