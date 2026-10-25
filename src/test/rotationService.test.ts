import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelManagedRotation, consumeRotationAccess, getManagedRotation, previewMealRotation, rotationApiUrl, rotationDateLabel, validRotationAccess } from '@/lib/rotationService';

const id = 'a'.repeat(48);
const token = 'b'.repeat(64);
const access = { id, token };
const week = { subtotalCents: 12600, lines: [{ variantId: 'gid://shopify/ProductVariant/1', title: 'Meal', quantity: 7, priceCents: 1800 }] };
const weeks = { 'week-a': week, 'week-b': week, 'week-c': week };
const selections = { 'week-a': { 'gid://shopify/ProductVariant/1': 7 }, 'week-b': { 'gid://shopify/ProductVariant/2': 7 }, 'week-c': { 'gid://shopify/ProductVariant/3': 7 } };
const preview = { firstWeek: 'week-b', firstServiceDate: '2026-10-26', weeks, currencyCode: 'USD', enrollmentReady: false };
const plan = { state: 'active', weeks, nextWeek: 'week-b', serviceDate: '2026-10-26T09:00:00-07:00', nextBillingDate: '2026-10-23T09:00:00-07:00', canCancel: true, cancellationPending: false, cancellationConfirmed: false };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('private meal-rotation service', () => {
  beforeEach(() => { vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', 'https://pit-rotation-test.sg-host.com/api'); sessionStorage.clear(); localStorage.clear(); history.replaceState(null, '', '/'); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('uses the approved independent app in production without changing any customer website domain', () => {
    vi.stubEnv('PROD', true); vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', undefined); expect(rotationApiUrl()).toBe('https://corys32.sg-host.com/api');
    vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', ''); expect(rotationApiUrl()).toBeNull();
  });
  it.each(['', 'https://placeinthyme.com/api', 'https://shop.placeinthyme.com/api', 'https://checkout.placeinthyme.com/api', 'http://app.example/api', 'https://app.example/api?secret=bad'])('never falls back to WordPress or an unsafe app origin: %s', value => {
    vi.stubEnv('VITE_SHOPIFY_ROTATION_API_URL', value); expect(rotationApiUrl()).toBeNull();
  });
  it('keeps management tokens out of URLs, referrers, cookies, and persistent storage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(plan));
    vi.stubGlobal('fetch', fetchMock);
    await getManagedRotation(access);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://pit-rotation-test.sg-host.com/api/manage/${id}`);
    expect(url).not.toContain(token);
    expect(options).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${token}` } });
    expect(localStorage.length).toBe(0);
  });
  it('consumes a fragment once and permits session-only reloads', () => {
    history.replaceState(null, '', `/meal-plan/${id}#token=${token}`);
    expect(consumeRotationAccess(id, location, history, sessionStorage)).toEqual(access);
    expect(location.hash).toBe('');
    expect(consumeRotationAccess(id, location, history, sessionStorage)).toEqual(access);
    expect(localStorage.length).toBe(0);
  });
  it('strips invalid fragments and never silently reuses an older token', () => {
    sessionStorage.setItem(`pit-rotation-access-${id}`, token);
    history.replaceState(null, '', `/meal-plan/${id}#token=wrong`);
    expect(consumeRotationAccess(id, location, history, sessionStorage)).toBeNull();
    expect(location.hash).toBe('');
  });
  it('still works for the current page if session storage is blocked', () => {
    history.replaceState(null, '', `/meal-plan/${id}#token=${token}`);
    const blocked = { getItem() { throw new Error('Blocked'); } } as unknown as Storage;
    expect(consumeRotationAccess(id, location, history, blocked)).toEqual(access);
    expect(location.hash).toBe('');
  });
  it('does not send malformed tokens or path-injection IDs', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect(validRotationAccess({ id: '../private', token })).toBe(false);
    await expect(getManagedRotation({ id, token: 'wrong' })).rejects.toThrow('invalid');
    await expect(cancelManagedRotation({ id: '../private', token })).rejects.toThrow('invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('submits explicit cancellation only with the private bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ state: 'cancelled' })); vi.stubGlobal('fetch', fetchMock);
    await cancelManagedRotation(access);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"action":"cancel"}', headers: { Authorization: `Bearer ${token}` } });
  });
  it('does not call an uncertain remote cancellation confirmed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'pit_cancel_pending' }, 503)));
    await expect(cancelManagedRotation(access)).rejects.toMatchObject({ cancellationPending: true });
  });
  it('does not accept cancellation success without the exact confirmed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ state: 'stopped' })));
    await expect(cancelManagedRotation(access)).rejects.toThrow('incomplete');
  });
  it('validates a no-charge preview without creating a checkout or contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(preview)); vi.stubGlobal('fetch', fetchMock);
    expect(await previewMealRotation(selections)).toEqual(preview);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/preview$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ selections });
  });
  it.each([
    { ...preview, currencyCode: 'CAD' },
    { ...preview, firstServiceDate: '2026-02-31' },
    { ...preview, firstWeek: 'week-d' },
    { ...preview, weeks: { ...weeks, 'week-a': { ...week, subtotalCents: 12000 } } },
    { ...preview, weeks: { ...weeks, 'week-a': { ...week, subtotalCents: 10000 } } },
  ])('rejects incomplete or contradictory server prices/dates', async bad => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(bad)));
    await expect(previewMealRotation(selections)).rejects.toThrow('incomplete');
  });
  it('rejects non-integer and oversized quantities before sending', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(previewMealRotation({ ...selections, 'week-a': { 'gid://shopify/ProductVariant/1': 51 } })).rejects.toThrow('quantities');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses customer-safe messages instead of echoing remote error data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ message: 'Private payment data' }, 500)));
    await expect(getManagedRotation(access)).rejects.toThrow('temporarily unavailable');
  });
  it('displays the service date in Pacific time, including DST boundaries', () => {
    expect(rotationDateLabel('2026-11-02T09:00:00-08:00')).toBe('Monday, November 2, 2026');
    expect(rotationDateLabel('2026-11-02')).toBe('Monday, November 2, 2026');
  });
});
