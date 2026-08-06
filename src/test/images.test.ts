import { describe, expect, it } from 'vitest';
import { getShopifyImageSrcSet, getShopifyImageUrl } from '@/lib/images';

describe('Shopify image transforms', () => {
  it('adds a safe width transform to Shopify CDN images', () => {
    expect(getShopifyImageUrl('https://cdn.shopify.com/s/files/product.jpg?v=1', 640)).toBe(
      'https://cdn.shopify.com/s/files/product.jpg?v=1&width=640',
    );
  });

  it('does not rewrite untrusted or non-HTTPS image hosts', () => {
    expect(getShopifyImageUrl('https://example.com/product.jpg', 640)).toBe(
      'https://example.com/product.jpg',
    );
    expect(getShopifyImageUrl('http://cdn.shopify.com/product.jpg', 640)).toBe(
      'http://cdn.shopify.com/product.jpg',
    );
  });

  it('builds responsive source candidates only for Shopify images', () => {
    expect(getShopifyImageSrcSet('https://cdn.shopify.com/product.jpg', [320, 640])).toContain(
      'width=640 640w',
    );
    expect(getShopifyImageSrcSet('https://example.com/product.jpg', [320, 640])).toBeUndefined();
  });
});
