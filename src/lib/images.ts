const SHOPIFY_IMAGE_HOST = /(^|\.)(cdn\.shopify\.com|shopifycdn\.com)$/i;

export function getShopifyImageUrl(url: string, width: number): string {
  if (!Number.isInteger(width) || width < 1 || width > 5760) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !SHOPIFY_IMAGE_HOST.test(parsed.hostname)) return url;
    parsed.searchParams.set('width', String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

export function getShopifyImageSrcSet(url: string, widths: number[]): string | undefined {
  const entries = [...new Set(widths)]
    .filter((width) => Number.isInteger(width) && width > 0 && width <= 5760)
    .map((width) => ({ width, url: getShopifyImageUrl(url, width) }));
  if (entries.length === 0 || entries.every((entry) => entry.url === url)) return undefined;
  return entries.map((entry) => `${entry.url} ${entry.width}w`).join(', ');
}
