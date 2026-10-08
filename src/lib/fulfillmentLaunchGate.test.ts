import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('closed checkout release gate', () => {
  it('keeps checkout closed without claiming saved Shopify settings are missing', async () => {
    vi.stubEnv('VITE_SHOPIFY_LOCAL_FULFILLMENT_READY', 'false');
    vi.resetModules();
    const config = await import('./fulfillmentConfig');

    expect(config.LOCAL_FULFILLMENT_READY).toBe(false);
    expect(config.DROPOFF_WINDOWS).toEqual([]);
    expect(config.PICKUP_WINDOWS).toEqual([]);
    expect(config.PICKUP_ENABLED).toBe(false);
    expect(config.DROPOFF_CONFIGURATION_ERROR).toBe('Delivery checkout is awaiting launch approval.');
    expect(config.PICKUP_CONFIGURATION_ERROR).toBe('Pickup checkout is awaiting launch approval.');
  });
});
