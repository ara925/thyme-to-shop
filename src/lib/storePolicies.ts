import { storefrontApiRequest, SHOPIFY_CHECKOUT_DOMAIN, SHOPIFY_STORE_PERMANENT_DOMAIN } from './shopify';

export interface StorePolicy { title: string; body: string; url: string }
export interface StorePolicies {
  privacyPolicy: StorePolicy | null;
  refundPolicy: StorePolicy | null;
  termsOfService: StorePolicy | null;
  shippingPolicy: StorePolicy | null;
}

export async function fetchStorePolicies(signal?: AbortSignal): Promise<StorePolicies> {
  const response = await storefrontApiRequest<{ shop: StorePolicies }>(`
    query StorePolicies {
      shop {
        privacyPolicy { title body url }
        refundPolicy { title body url }
        termsOfService { title body url }
        shippingPolicy { title body url }
      }
    }
  `, {}, signal);
  if (!response.data.shop) throw new Error('Published store policies could not be loaded.');
  return response.data.shop;
}

export function safePolicyUrl(value?: string): string | null {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && [SHOPIFY_CHECKOUT_DOMAIN, SHOPIFY_STORE_PERMANENT_DOMAIN].includes(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

/** Render Shopify's published policy as text, never execute remote HTML. */
export function policyParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed').forEach(element => element.remove());
  doc.querySelectorAll('p, div, h1, h2, h3, h4, li, br').forEach(element => {
    element.appendChild(doc.createTextNode('\n'));
  });
  return (doc.body.textContent || '').split('\n').map(line => line.trim()).filter(Boolean);
}
