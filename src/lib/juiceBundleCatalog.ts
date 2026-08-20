import type { ShopifyProduct } from '@/lib/shopify';

export const PICK_AND_CHOOSE_BUNDLE_TITLE = "Pick n' Choose Bundle";

export const APPROVED_FIXED_JUICE_BUNDLE_TITLES = [
  'Intro Pack Bundle',
  'Shot Bundle',
  'Juice Bundle #1',
  'Juice Bundle #2',
  'Juice Bundle #3',
] as const;

export function normalizeJuiceBundleTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u2018\u2019\u02bc']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

export interface JuiceBundleCatalogContract {
  fixedBundles: ShopifyProduct[];
  pickAndChooseBundle?: ShopifyProduct;
  issues: string[];
  isValid: boolean;
}

export function resolveJuiceBundleCatalog(
  products: ShopifyProduct[],
): JuiceBundleCatalogContract {
  const bundleProducts = products.filter(
    (product) => product.node.productType === 'Juice Bundle',
  );
  const approvedTitles = [
    PICK_AND_CHOOSE_BUNDLE_TITLE,
    ...APPROVED_FIXED_JUICE_BUNDLE_TITLES,
  ];
  const approvedByNormalizedTitle = new Map(
    approvedTitles.map((title) => [normalizeJuiceBundleTitle(title), title]),
  );
  const productsByNormalizedTitle = new Map<string, ShopifyProduct[]>();

  for (const product of bundleProducts) {
    const normalizedTitle = normalizeJuiceBundleTitle(product.node.title);
    const matches = productsByNormalizedTitle.get(normalizedTitle) || [];
    matches.push(product);
    productsByNormalizedTitle.set(normalizedTitle, matches);
  }

  const issues = new Set<string>();
  for (const product of bundleProducts) {
    if (!approvedByNormalizedTitle.has(normalizeJuiceBundleTitle(product.node.title))) {
      issues.add(`Unexpected Juice Bundle product: ${product.node.title}.`);
    }
  }

  for (const title of approvedTitles) {
    const matches = productsByNormalizedTitle.get(normalizeJuiceBundleTitle(title)) || [];
    if (matches.length === 0) {
      issues.add(`${title} is missing from the live Juice Bundle catalog.`);
    } else if (matches.length > 1) {
      issues.add(`${title} appears more than once in the live Juice Bundle catalog.`);
    }
  }

  const pickMatches = productsByNormalizedTitle.get(
    normalizeJuiceBundleTitle(PICK_AND_CHOOSE_BUNDLE_TITLE),
  ) || [];
  const fixedBundles = APPROVED_FIXED_JUICE_BUNDLE_TITLES.flatMap((title) => {
    const matches = productsByNormalizedTitle.get(normalizeJuiceBundleTitle(title)) || [];
    return matches.length === 1 ? matches : [];
  });

  return {
    fixedBundles,
    pickAndChooseBundle: pickMatches.length === 1 ? pickMatches[0] : undefined,
    issues: [...issues],
    isValid: issues.size === 0,
  };
}
