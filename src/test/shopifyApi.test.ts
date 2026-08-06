import { afterEach, describe, expect, it, vi } from 'vitest';
import { storefrontApiRequest } from '@/lib/shopify';

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

    await expect(storefrontApiRequest('query Test { shop { name } }')).rejects.toMatchObject({
      name: 'StorefrontApiError',
      code: 'network',
      message: 'Failed to fetch',
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

  it('surfaces GraphQL errors even when the HTTP response succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          payload: {
            data: { shop: null },
            errors: [{ message: 'Access denied' }, { message: 'Query is invalid' }],
          },
        }),
      ),
    );

    await expect(storefrontApiRequest('query GraphqlTest { shop { name } }')).rejects.toMatchObject({
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
