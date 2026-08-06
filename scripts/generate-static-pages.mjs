import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distDirectory = path.join(projectRoot, 'dist');
const siteOrigin = normalizeOrigin(process.env.VITE_SITE_URL || 'https://placeinthyme.com');
const storeDomain = process.env.VITE_SHOPIFY_STORE_DOMAIN || 'thyme-time-store-brreo.myshopify.com';
const storefrontToken = process.env.VITE_SHOPIFY_STOREFRONT_TOKEN || '5f7c48d7ed775a943e87a6308e72948f';
const storefrontApiVersion = '2026-07';
const storefrontUrl = `https://${storeDomain}/api/${storefrontApiVersion}/graphql.json`;
const socialImageUrl = new URL('/favicon.png', `${siteOrigin}/`).toString();
const routeMetadata = JSON.parse(
  await readFile(path.join(projectRoot, 'route-metadata.json'), 'utf8'),
);

const productQuery = `
  query StaticProductPages($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          title
          description
          handle
          images(first: 1) { edges { node { url altText } } }
          variants(first: 1) {
            edges { node { price { amount currencyCode } availableForSale } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('VITE_SITE_URL must use http or https.');
  }
  return url.origin;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", '&apos;');
}

function truncate(value, maximumLength) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 1).trimEnd()}…`;
}

function setMeta(html, attribute, key, content) {
  const escapedContent = escapeHtml(content);
  const pattern = new RegExp(
    `<meta\\s+${attribute}="${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`,
    'i',
  );
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapedContent}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function renderHtml(template, metadata) {
  const canonicalUrl = new URL(metadata.path, `${siteOrigin}/`).toString();
  const hasRouteImage = Boolean(metadata.imageUrl);
  const imageUrl = metadata.imageUrl || socialImageUrl;
  const imageAlt = metadata.imageAlt || 'Place in Thyme';
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`)
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`);

  html = setMeta(html, 'name', 'description', metadata.description);
  html = setMeta(html, 'name', 'robots', metadata.noIndex ? 'noindex, nofollow' : 'index, follow');
  html = setMeta(html, 'property', 'og:title', metadata.title);
  html = setMeta(html, 'property', 'og:description', metadata.description);
  html = setMeta(html, 'property', 'og:type', metadata.type || 'website');
  html = setMeta(html, 'property', 'og:url', canonicalUrl);
  html = setMeta(html, 'property', 'og:image', imageUrl);
  html = setMeta(html, 'property', 'og:image:alt', imageAlt);
  html = setMeta(html, 'name', 'twitter:card', hasRouteImage ? 'summary_large_image' : 'summary');
  html = setMeta(html, 'name', 'twitter:title', metadata.title);
  html = setMeta(html, 'name', 'twitter:description', metadata.description);
  html = setMeta(html, 'name', 'twitter:image', imageUrl);
  html = setMeta(html, 'name', 'twitter:image:alt', imageAlt);

  html = html.replace(/\s*<script type="application\/ld\+json" data-static-seo>[\s\S]*?<\/script>/gi, '');
  if (metadata.jsonLd) {
    const serialized = JSON.stringify(metadata.jsonLd).replaceAll('<', '\\u003c');
    html = html.replace(
      '</head>',
      `    <script type="application/ld+json" data-static-seo>${serialized}</script>\n  </head>`,
    );
  }
  return html;
}

async function writeRoute(routePath, html) {
  const relativePath = routePath === '/' ? '' : routePath.replace(/^\//, '');
  const directory = path.join(distDirectory, relativePath);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html, 'utf8');
}

async function storefrontRequest(query, variables) {
  const response = await fetch(storefrontUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 402) throw new Error('Shopify billing is inactive.');
  if (!response.ok) throw new Error(`Storefront HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(', '));
  }
  if (!payload.data) throw new Error('Storefront response did not include data.');
  return payload.data;
}

async function loadProducts() {
  const products = [];
  let after = null;
  do {
    const data = await storefrontRequest(productQuery, { first: 100, after });
    products.push(...data.products.edges.map(({ node }) => node));
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
    if (!after) throw new Error('Storefront pagination ended without a cursor.');
  } while (true);
  if (products.length === 0) throw new Error('No published products were returned for static pages.');
  return products;
}

const template = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Place in Thyme',
  url: siteOrigin,
  logo: socialImageUrl,
  email: 'info@placeinthyme.com',
};

for (const [routePath, metadata] of Object.entries(routeMetadata)) {
  await writeRoute(
    routePath,
    renderHtml(template, {
      ...metadata,
      path: routePath,
      jsonLd: routePath === '/' ? organizationJsonLd : undefined,
    }),
  );
}

const products = await loadProducts();
for (const product of products) {
  const variant = product.variants.edges[0]?.node;
  const image = product.images.edges[0]?.node;
  const productPath = `/product/${encodeURIComponent(product.handle)}`;
  const title = truncate(`${product.title} | Place in Thyme`, 59);
  const description = truncate(
    product.description || `View ${product.title} availability and pricing from Place in Thyme.`,
    159,
  );
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    ...(product.description ? { description: product.description } : {}),
    ...(image ? { image: [image.url] } : {}),
    ...(variant
      ? {
          offers: {
            '@type': 'Offer',
            url: new URL(productPath, `${siteOrigin}/`).toString(),
            price: variant.price.amount,
            priceCurrency: variant.price.currencyCode,
            availability: variant.availableForSale
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
        }
      : {}),
  };

  await writeRoute(
    productPath,
    renderHtml(template, {
      path: productPath,
      title,
      description,
      type: 'product',
      imageUrl: image?.url,
      imageAlt: image?.altText || product.title,
      jsonLd,
    }),
  );
}

const indexableStaticPaths = Object.entries(routeMetadata)
  .filter(([, metadata]) => !metadata.noIndex)
  .map(([routePath]) => routePath);
const sitemapPaths = [
  ...indexableStaticPaths,
  ...products.map((product) => `/product/${encodeURIComponent(product.handle)}`),
];
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapPaths.map(
    (routePath) => `  <url><loc>${escapeXml(new URL(routePath, `${siteOrigin}/`).toString())}</loc></url>`,
  ),
  '</urlset>',
  '',
].join('\n');
await writeFile(path.join(distDirectory, 'sitemap.xml'), sitemap, 'utf8');

const notFoundHtml = renderHtml(template, {
  path: '/404',
  title: 'Page Not Found | Place in Thyme',
  description: 'The requested page could not be found.',
  noIndex: true,
});
await writeFile(path.join(distDirectory, '404.html'), notFoundHtml, 'utf8');

console.log(`Generated ${Object.keys(routeMetadata).length} route pages, ${products.length} product pages, and sitemap.xml.`);
