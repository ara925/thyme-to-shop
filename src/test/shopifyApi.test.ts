import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatCheckoutUrl,
  getStorefrontErrorMessage,
  storefrontApiRequest,
} from '@/lib/shopify';

function response({
  status = 200,
  payload,
  jsonError,
}: {
  status?: number;
  payload?: unknown;
  jsonError?: Error;
}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jsonError
      ? vi.fn().mockRejectedValue(jsonError)
      : vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('storefrontApiRequest', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('surfaces network failures with a typed customer-safe error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const request = storefrontApiRequest('query Test { shop { name } }');
    await expect(request).rejects.toMatchObject({
      name: 'StorefrontApiError',
      code: 'network',
      message: 'Failed to fetch',
    });
    await request.catch((error) => {
      expect(getStorefrontErrorMessage(error)).toBe(
        'We could not reach the store. Check your connection and try again.',
      );
    });
  });

  it('distinguishes Shopify billing failures from other HTTP failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 402 }))
      .mockResolvedValueOnce(response({ status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(storefrontApiRequest('query BillingTest { shop { name } }')).rejects.toMatchObject({
      code: 'billing',
      status: 402,
    });
    await expect(storefrontApiRequest('query HttpTest { shop { name } }')).rejects.toMatchObject({
      code: 'http',
      status: 503,
    });
  });

  it('returns the established data wrapper and rejects top-level GraphQL errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ payload: { data: { shop: { name: 'Place in Thyme' } } } }))
      .mockResolvedValueOnce(
        response({
          payload: {
            data: { shop: null },
            errors: [{ message: 'Access denied' }, { message: 'Query is invalid' }],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(storefrontApiRequest<{ shop: { name: string } }>('query Shop { shop { name } }'))
      .resolves.toEqual({ data: { shop: { name: 'Place in Thyme' } } });
    await expect(storefrontApiRequest('query Invalid { shop { name } }')).rejects.toMatchObject({
      code: 'graphql',
      status: 200,
      message: 'Access denied, Query is invalid',
    });
  });

  it.each([
    ['invalid JSON', response({ jsonError: new SyntaxError('Unexpected token') })],
    ['a response without data', response({ payload: {} })],
  ])('rejects %s as an invalid Storefront response', async (_label, mockedResponse) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockedResponse));

    await expect(storefrontApiRequest('query InvalidTest { shop { name } }')).rejects.toMatchObject({
      code: 'invalid-response',
      status: 200,
    });
  });

  it('keeps the timeout active while the response body is being read', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal as AbortSignal;
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            }),
        } as Response);
      }),
    );

    const request = storefrontApiRequest('query SlowBody { shop { name } }');
    const rejection = expect(request).rejects.toMatchObject({ code: 'network' });
    await vi.advanceTimersByTimeAsync(15_001);
    await rejection;
  });
});

describe('formatCheckoutUrl', () => {
  it('accepts the permanent Shopify host and adds the online-store channel', () => {
    expect(
      formatCheckoutUrl('https://thyme-time-store-brreo.myshopify.com/checkouts/test?locale=en'),
    ).toBe(
      'https://thyme-time-store-brreo.myshopify.com/checkouts/test?locale=en&channel=online_store',
    );
  });

  it('rejects checkout URLs that point back to the headless storefront', () => {
    expect(() =>
      formatCheckoutUrl('https://shop.placeinthyme.com/cart/c/test-key?locale=en'),
    ).toThrow('invalid checkout URL');
  });

  it.each([
    'not a URL',
    'http://thyme-time-store-brreo.myshopify.com/checkouts/test',
    'https://evil.myshopify.com/checkouts/test',
    'https://example.com/checkouts/test',
    'https://evil.shop.placeinthyme.com/cart/c/test-key',
    'https://shop.placeinthyme.com.evil.example/cart/c/test-key',
    'https://shop.placeinthyme.com:444/cart/c/test-key',
    'https://user:password@shop.placeinthyme.com/cart/c/test-key',
  ])('rejects an unsafe checkout URL: %s', (checkoutUrl) => {
    expect(() => formatCheckoutUrl(checkoutUrl)).toThrow('invalid checkout URL');
  });
});
