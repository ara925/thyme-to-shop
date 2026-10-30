import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { SHOP, CLIENT_ID, ORIGIN, PICKUP_LOCATION_ID, WEEKS, cents, amount, firstServiceDate, nextServiceDate, nextBillingDate, serviceCutoff, weekAt, validateSelections, validateUnchanged, fingerprint, matchLines, assertLocal, validWebhook, validOauth, validSessionToken } from '../src/domain.mjs';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { Shopify, ShopifyRequestError, CONTRACT, SNAPSHOT } from '../src/shopify.mjs';
import { createApplication, configuration } from '../src/server.mjs';

const key = Buffer.alloc(32, 7).toString('base64');
test('deploy archive needs no parent repository or external runtime dependency', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  assert.deepEqual(Object.keys(manifest.dependencies || {}), []);
  assert.deepEqual(Object.keys(lock.packages), ['']);
});
const catalog = Object.fromEntries(WEEKS.map((week, index) => [`gid://shopify/ProductVariant/${index + 1}`, {
  title: `Fixture meal ${index + 1}`, type: 'Meal', status: 'ACTIVE', currency: 'USD', available: true, requiresComponents: false, tags: [week], price: `${18 + index}.00`,
}]));
const selections = Object.fromEntries(WEEKS.map((week, index) => [week, { [`gid://shopify/ProductVariant/${index + 1}`]: 7 }]));
const approved = validateSelections(selections, catalog);
const memory = () => new Store(':memory:', key);
const gates = Object.fromEntries(['billing', 'checkout', 'fulfillment', 'storefront', 'launch', 'persistentStorage'].map(key => [key, true]));
const contractFor = week => ({ id: 'gid://shopify/SubscriptionContract/123', status: 'ACTIVE', currencyCode: 'USD', revisionId: '1',
  nextBillingDate: new Date(Date.now() - 1000).toISOString(), billingPolicy: { interval: 'WEEK', intervalCount: 1 }, deliveryPolicy: { interval: 'WEEK', intervalCount: 1 },
  deliveryMethod: { __typename: 'SubscriptionDeliveryMethodPickup', pickupOption: { code: 'pickup', location: { id: PICKUP_LOCATION_ID } } },
  deliveryPrice: { amount: '0.00', currencyCode: 'USD' }, customerPaymentMethod: { id: 'payment-1' }, discounts: { nodes: [] },
  lines: { nodes: week.lines.map(line => ({ variantId: line.variantId, quantity: line.quantity, currentPrice: { amount: amount(line.priceCents), currencyCode: 'USD' }, sellingPlanId: 'gid://shopify/SellingPlan/1', customAttributes: [] })), pageInfo: { hasNextPage: false } },
});
function ready(store) {
  store.setSetting('heartbeat', Date.now()); store.setSetting('verifiedAt', Date.now()); store.setSetting('planId', 'gid://shopify/SellingPlan/1'); store.setSetting('webhooks', ['a', 'b', 'c']);
}

test('three separate actual totals, not a flat fee or combined checkout', () => assert.deepEqual(Object.values(approved).map(week => week.subtotalCents), [12600, 13300, 14000]));
for (const invalid of ['-1.00', '1e3', 'NaN', '01.00', '1.001', ' 18.00', '']) test(`reject malformed money ${invalid}`, () => assert.throws(() => cents(invalid)));
for (const quantity of [0, -1, 1.5, '7', 2_147_483_648, Number.MAX_SAFE_INTEGER]) test(`reject malformed quantity ${quantity}`, () => assert.throws(() => validateSelections({ ...selections, 'week-a': { 'gid://shopify/ProductVariant/1': quantity } }, catalog)));
test('fixed weekly menus allow quantities above fifty but reject moving a dish to another menu', () => {
  const larger = validateSelections({ ...selections, 'week-a': { 'gid://shopify/ProductVariant/1': 51 } }, catalog);
  assert.equal(larger['week-a'].lines[0].quantity, 51);
  assert.equal(larger['week-a'].subtotalCents, 91800);
  assert.deepEqual(larger['week-b'], approved['week-b']);
  assert.deepEqual(catalog['gid://shopify/ProductVariant/1'].tags, ['week-a']);
  assert.throws(() => validateSelections({ ...selections, 'week-a': { 'gid://shopify/ProductVariant/2': 51 } }, catalog), /another menu/);
});
for (const [field, value] of Object.entries({ type: 'Juice', status: 'DRAFT', currency: 'CAD', available: false, requiresComponents: true, tags: ['week-b'] })) test(`reject invalid meal ${field}`, () => assert.throws(() => validateSelections(selections, { ...catalog, 'gid://shopify/ProductVariant/1': { ...catalog['gid://shopify/ProductVariant/1'], [field]: value } })));
test('reject a below-minimum week and changed live prices', () => {
  assert.throws(() => validateSelections({ ...selections, 'week-b': { 'gid://shopify/ProductVariant/2': 6 } }, catalog));
  assert.throws(() => validateUnchanged(approved, { ...catalog, 'gid://shopify/ProductVariant/2': { ...catalog['gid://shopify/ProductVariant/2'], price: '20.00' } }));
});
test('Friday-midnight cutoff and weekend enrollment stay in Pacific time', () => {
  assert.equal(firstServiceDate(Date.parse('2026-10-10T06:59:59Z')).slice(0, 10), '2026-10-12');
  assert.equal(firstServiceDate(Date.parse('2026-10-10T07:00:00Z')).slice(0, 10), '2026-10-19');
  assert.equal(firstServiceDate(Date.parse('2026-10-11T18:00:00Z')).slice(0, 10), '2026-10-19');
});
test('service and billing preserve Pacific wall time through both DST changes', () => {
  assert.equal(nextServiceDate('2026-10-26T09:00:00-07:00'), '2026-11-02T09:00:00-08:00');
  assert.equal(nextServiceDate('2027-03-08T09:00:00-08:00'), '2027-03-15T09:00:00-07:00');
  assert.equal(nextBillingDate('2026-10-30T10:23:45-07:00'), '2026-11-06T10:23:45-08:00');
  assert.equal(new Date(serviceCutoff('2026-11-09T09:00:00-08:00')).toISOString(), '2026-11-07T08:00:00.000Z');
});
test('calendar changes on Pacific Monday, not UTC Monday', () => {
  assert.equal(weekAt('2026-04-06T06:59:59Z'), 'week-c'); assert.equal(weekAt('2026-04-06T07:00:00Z'), 'week-a');
  assert.equal(weekAt('2026-11-02T07:59:59Z'), 'week-c'); assert.equal(weekAt('2026-11-02T08:00:00Z'), 'week-a');
});
test('delivery fingerprints are keyed and independent of object-key order', () => assert.equal(fingerprint({ a: 1, b: { c: 2 } }, key), fingerprint({ b: { c: 2 }, a: 1 }, key)));
test('shipping, altered pickup identities, and wrong fees fail closed', () => {
  const contract = contractFor(approved['week-a']); assertLocal(contract);
  assert.throws(() => assertLocal({ ...contract, deliveryMethod: { __typename: 'SubscriptionDeliveryMethodShipping' } }));
  assert.throws(() => assertLocal({ ...contract, deliveryPrice: { amount: '15.00', currencyCode: 'USD' } }));
  assert.throws(() => assertLocal({ ...contract, deliveryMethod: { __typename: 'SubscriptionDeliveryMethodPickup' } }));
  assert.equal(matchLines(approved['week-a'].lines, [...contract.lines.nodes, ...contract.lines.nodes]), false);
});
test('webhook signatures authenticate exact raw bytes and exact shop', () => {
  const body = Buffer.from('{"id":123}'); const signature = createHmac('sha256', 'fixture').update(body).digest('base64');
  assert.equal(validWebhook(body, signature, SHOP, 'fixture'), true);
  assert.equal(validWebhook(Buffer.from(body + ' '), signature, SHOP, 'fixture'), false);
  assert.equal(validWebhook(body, signature, SHOP + '.evil.test', 'fixture'), false);
});
test('OAuth HMAC, shop, timestamp and duplicate-parameter checks', () => {
  const fields = { shop: SHOP, code: 'fixture-code', state: 'fixture-state', host: 'fixture==', timestamp: String(Math.floor(Date.now() / 1000)) };
  const query = new URLSearchParams(fields);
  query.set('hmac', createHmac('sha256', 'fixture').update(Object.entries(fields).sort().map(([key, value]) => `${key}=${value}`).join('&')).digest('hex'));
  assert.equal(validOauth(query, 'fixture'), true); assert.equal(validOauth(query, 'fixture', Date.now() + 301000), false);
  query.append('shop', SHOP); assert.equal(validOauth(query, 'fixture'), false);
});
test('Shopify session tokens verify signature, audience, exact destination, and lifetime', () => {
  const now = Math.floor(Date.now() / 1000);
  function token(extra = {}) { const head = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'); const body = Buffer.from(JSON.stringify({ aud: CLIENT_ID, dest: `https://${SHOP}`, iss: `https://${SHOP}/admin`, iat: now, nbf: now, exp: now + 60, ...extra })).toString('base64url'); return `${head}.${body}.${createHmac('sha256', 'fixture').update(`${head}.${body}`).digest('base64url')}`; }
  assert.equal(validSessionToken(token(), 'fixture'), true);
  for (const extra of [{ aud: 'wrong' }, { dest: `https://${SHOP}.evil.test` }, { exp: now - 1 }, { exp: now + 600 }]) assert.equal(validSessionToken(token(extra), 'fixture'), false);
});
test('secrets are encrypted and database rows survive a process-level reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pit-app-test-'));
  try {
    const filename = join(directory, 'rotation.sqlite'); let store = new Store(filename, key);
    store.saveSecret('access_token', 'TEST-ONLY-token'); const id = store.create({ weeks: approved }, 'a'.repeat(64));
    assert.equal(store.getSetting('secret_access_token').includes('TEST-ONLY-token'), false); store.close();
    store = new Store(filename, key); assert.equal(store.secret('access_token'), 'TEST-ONLY-token'); assert.deepEqual(store.get(id).data.weeks, approved); store.close();
  } finally { assert.ok(directory.startsWith(join(tmpdir(), 'pit-app-test-'))); rmSync(directory, { recursive: true }); }
});
test('consistent private snapshots restore encrypted credentials and records, and failed refresh preserves the last good copy', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pit-app-backup-test-'));
  let store;
  try {
    const filename = join(directory, 'rotation.sqlite'); store = new Store(filename, key);
    store.setSetting('verifiedAt', Date.now()); store.saveSecret('access_token', 'TEST-ONLY-backup-token');
    const id = store.create({ weeks: approved }, 'a'.repeat(64)); const now = Date.now();
    assert.equal(await store.backupIfDue(now), true);
    const snapshot = join(directory, 'backups', 'rotation-latest.sqlite');
    const previous = readFileSync(snapshot);
    assert.equal(previous.includes(Buffer.from('TEST-ONLY-backup-token')), false);
    const restored = new Store(snapshot, key);
    try { assert.equal(restored.secret('access_token'), 'TEST-ONLY-backup-token'); assert.deepEqual(restored.get(id).data.weeks, approved); }
    finally { restored.close(); }
    assert.equal(await store.backupIfDue(now + 1000), false);
    const lastGood = readFileSync(snapshot);
    store.filename = join(filename, 'invalid.sqlite');
    await assert.rejects(store.backupIfDue(now + 86400001));
    assert.deepEqual(readFileSync(snapshot), lastGood);
    assert.equal(store.getSetting('backupLastCompleted'), now); assert.equal(store.getSetting('backupReviewNeeded'), true);
  } finally {
    store?.close(); assert.ok(directory.startsWith(join(tmpdir(), 'pit-app-backup-test-'))); rmSync(directory, { recursive: true });
  }
});
test('unverified and in-memory stores do not create persistent recovery snapshots', async () => {
  const store = memory(); assert.equal(await store.backupIfDue(), false); store.close();
});
test('leases, ownership-safe unlocks, unique events and rate limits are durable', () => {
  const store = memory(); const id = store.create({}, 'a'.repeat(64));
  const first = store.claim(id); assert.ok(first); assert.equal(store.claim(id), null);
  store.unlock(id, 'wrong'); assert.equal(store.claim(id), null); store.unlock(id, first); assert.ok(store.claim(id));
  const lock = store.lease('worker'); assert.ok(lock); store.release('worker', 'wrong'); assert.equal(store.lease('worker'), null); store.release('worker', lock); assert.ok(store.lease('worker'));
  store.enqueue('event-1234567890123456', 'contract-1'); store.enqueue('event-1234567890123456', 'contract-1'); assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
  for (let i = 0; i < 20; i++) assert.equal(store.rate('fixture', 20), true); assert.equal(store.rate('fixture', 20), false); store.close();
});
test('OAuth tickets are one-use, sessions are reusable, raw tokens are never stored', () => {
  const store = memory(); const token = store.ticket('oauth', 300);
  assert.equal(store.hasTicket(token, 'admin'), false); assert.equal(store.hasTicket(token, 'oauth', true), true); assert.equal(store.hasTicket(token, 'oauth', true), false);
  const session = store.ticket('admin', 1800); assert.equal(store.hasTicket(session, 'admin'), true); assert.equal(store.hasTicket(session, 'admin'), true);
  assert.equal(store.db.prepare('SELECT hash FROM tickets').get().hash.includes(session), false); store.close();
});
for (const gate of Object.keys(gates)) test(`no billing with acceptance gate off: ${gate}`, async () => {
  const store = memory(); ready(store); let calls = 0;
  const worker = new Worker(store, { contract() { calls++; throw new Error('Must not call'); } }, { gates: { ...gates, [gate]: false }, identityKey: key });
  await worker.step('unused', 'unused'); assert.equal(calls, 0); store.close();
});
test('no billing with a stale scheduler, absent owned plan, or missing webhooks', () => {
  const store = memory(); ready(store); const worker = new Worker(store, {}, { gates, identityKey: key }); assert.equal(worker.enabled(), true);
  store.setSetting('heartbeat', Date.now() - 121000); assert.equal(worker.enabled(), false); ready(store);
  store.setSetting('webhooks', []); assert.equal(worker.enabled(), false); ready(store); store.setSetting('planId', 'wrong'); assert.equal(worker.enabled(), false); store.close();
});
test('four complete simulated calculate/commit/bill/finalize cycles use exact totals and unique durable keys', async () => {
  const store = memory(); ready(store); let now = Date.now(); let date = firstServiceDate(now);
  while (weekAt(date) !== 'week-b') date = nextServiceDate(date);
  let current = contractFor(approved['week-a']); let calculated; const charged = []; const keys = [];
  const api = { contract: async () => structuredClone(current), catalog: async () => catalog,
    calculate: async (_id, week) => { calculated = contractFor(week); charged.push(week.subtotalCents); return `calculation-${charged.length}`; },
    calculation: async () => ({ __typename: 'SubscriptionContractCalculationSuccess', warnings: [], calculatedContract: calculated,
      projectedOrderTotals: { subtotal: { amount: amount(charged.at(-1)), currencyCode: 'USD' }, totalDelivery: { amount: '0.00', currencyCode: 'USD' }, totalMerchandiseDiscounts: { amount: '0.00', currencyCode: 'USD' } } }),
    commit: async () => { calculated.revisionId = String(Number(current.revisionId) + 1); current = calculated; return current; }, attempt: async (_id, key) => { keys.push(key); return { id: 'attempt-' + keys.length, ready: true, order: { id: 'order-' + keys.length } }; }, nextDate: async (_id, value) => { current.nextBillingDate = value; current.revisionId = String(Number(current.revisionId) + 1); return current; },
  };
  const worker = new Worker(store, api, { gates, now: () => now, identityKey: key });
  const data = { weeks: approved, nextWeek: 'week-b', serviceDate: date, cycle: 1,
    approvedDeliveryFingerprint: fingerprint(current.deliveryMethod, key), approvedRevisionId: String(current.revisionId) };
  const id = store.create(data, 'a'.repeat(64)); store.update(id, { state: 'active', contract_id: current.id, due_at: now - 1000 });
  for (let cycle = 1; cycle <= 4; cycle++) {
    current.nextBillingDate = new Date(now - 1000).toISOString(); store.setSetting('heartbeat', now);
    const lease = store.claim(id);
    for (const state of ['calculating', 'committing', 'billing', 'finalizing', 'active']) { await worker.step(id, lease); assert.equal(store.get(id).state, state); }
    store.unlock(id, lease); assert.equal(store.get(id).data.cycle, cycle + 1); now += 604800000;
  }
  assert.deepEqual(charged, [13300, 14000, 12600, 13300]); assert.equal(new Set(keys).size, 4); store.close();
});
test('failed payments stop without advancing and ambiguous attempts retain the same saved key', async () => {
  const store = memory(); ready(store); const current = contractFor(approved['week-b']); const keys = []; let fail = true;
  const api = { contract: async () => current, attempt: async (_id, key) => { keys.push(key); if (fail) throw new Error('Timeout'); return { id: 'attempt', errorCode: 'PAYMENT_FAILED', ready: true }; } };
  const worker = new Worker(store, api, { gates, identityKey: key });
  const id = store.create({ weeks: approved, nextWeek: 'week-b', serviceDate: '2099-10-19T09:00:00-07:00', cycle: 1, idempotencyKey: 'saved-key', billingOrigin: new Date().toISOString(), approvedDeliveryFingerprint: fingerprint(current.deliveryMethod, key), approvedRevisionId: String(current.revisionId) }, 'a'.repeat(64));
  store.update(id, { state: 'billing', contract_id: current.id }); const lease = store.claim(id);
  await assert.rejects(worker.step(id, lease)); fail = false; await worker.step(id, lease);
  assert.deepEqual(keys, ['saved-key', 'saved-key']); assert.equal(store.get(id).state, 'review'); assert.equal(store.get(id).data.nextWeek, 'week-b'); store.close();
});
test('unexpected contract revisions stop a pending renewal for review without initiating a charge', async () => {
  const store = memory(); ready(store); const current = contractFor(approved['week-b']); current.revisionId = '2'; let billed = 0;
  const worker = new Worker(store, { contract: async () => current, attempt: async () => { billed++; } }, { gates, identityKey: key });
  const id = store.create({ weeks: approved, nextWeek: 'week-b', serviceDate: '2099-10-19T09:00:00-07:00', approvedDeliveryFingerprint: fingerprint(current.deliveryMethod, key), approvedRevisionId: '1' }, 'a'.repeat(64));
  store.update(id, { state: 'billing', contract_id: current.id, due_at: Date.now() - 1 });
  try { await worker.tick(); assert.equal(billed, 0); assert.equal(store.get(id).state, 'review'); } finally { store.close(); }
});
test('renewal queries do not request private payment instruments or add customer-data scopes', () => {
  assert.doesNotMatch(CONTRACT + SNAPSHOT, /customerPaymentMethod|instrument|billingAddress/);
});

async function withServer(callback, apiOverrides = {}) {
  const store = memory(); const config = { baseUrl: 'https://rotation.example.test', clientSecret: 'TEST-ONLY-secret', encryptionKey: key, gates: {} };
  store.setSetting('verifiedAt', Date.now());
  const api = { catalog: async () => catalog, ...apiOverrides };
  const app = createApplication(config, { store, shopify: api });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try { await callback({ ...app, base, config }); }
  finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); store.close(); }
}
test('unconfigured app cannot use the main website as its app origin', () => {
  for (const url of ['https://placeinthyme.com', 'https://shop.placeinthyme.com', 'https://checkout.placeinthyme.com', 'http://rotation.example.test']) assert.throws(() => configuration({ PIT_APP_URL: url }));
});
test('public health is safe, billing is off and WordPress is not a runtime dependency', async () => withServer(async ({ base }) => {
  const response = await fetch(base + '/health'); const body = await response.json();
  assert.equal(body.billingEnabled, false); assert.equal(body.mainWebsiteDependency, false); assert.equal(JSON.stringify(body).includes('secret'), false);
  assert.match(response.headers.get('cache-control'), /no-store/);
}));
test('rendered app JavaScript is valid and no private values are embedded', async () => withServer(async ({ base, config }) => {
  const response = await fetch(base + '/'); const html = await response.text();
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) assert.doesNotThrow(() => new Script(match[1]));
  assert.equal(html.includes(config.clientSecret), false); assert.equal(html.includes(key), false);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors https:\/\/admin.shopify.com/);
}));

test('standalone Shopify launch keeps its signed session without loading embedded App Bridge', async () => withServer(async ({ base, config }) => {
  const fields = { shop: SHOP, timestamp: String(Math.floor(Date.now() / 1000)), host: 'TEST-ONLY-host' };
  const query = new URLSearchParams(fields);
  query.set('hmac', createHmac('sha256', config.clientSecret).update(Object.entries(fields).sort().map(([name, value]) => `${name}=${value}`).join('&')).digest('hex'));
  const response = await fetch(`${base}/?${query}`); const html = await response.text();
  assert.equal(response.status, 200); assert.doesNotMatch(html, /app-bridge\.js|shopify-api-key|shopify\.idToken/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /cdn\.shopify/);
  const cookie = response.headers.get('set-cookie'); assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await fetch(base + '/admin/status', { headers: { Cookie: cookie.split(';')[0] } })).status, 200);
  assert.equal((await fetch(base + '/admin/status')).status, 403);
}));
test('live-price preview is origin-restricted and never persists an enrollment', async () => withServer(async ({ base, store }) => {
  let response = await fetch(base + '/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' }, body: JSON.stringify({ selections }) }); assert.equal(response.status, 403);
  response = await fetch(base + '/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ selections }) }); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).weeks, approved); assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rotations').get().n, 0);
  response = await fetch(base + '/api/quote', { method: 'POST', headers: { Origin: ORIGIN } }); assert.equal(response.status, 503);
}));
test('management rejects absent bearer tokens and never returns saved data to an invalid link', async () => withServer(async ({ base, store }) => {
  const id = store.create({ weeks: approved, expiresAt: Date.now() + 1800000 }, 'a'.repeat(64));
  const response = await fetch(base + '/api/manage/' + id, { headers: { Origin: ORIGIN } }); assert.equal(response.status, 403); assert.equal(JSON.stringify(await response.json()).includes('weeks'), false);
}));
test('cancellation is durably stopped before a remote timeout and can be safely retried', async () => {
  let failures = 1; let remoteCalls = 0;
  await withServer(async ({ base, store }) => {
    const token = 'a'.repeat(64); const id = store.create({ weeks: approved, nextWeek: 'week-b', serviceDate: '2026-10-26T09:00:00-07:00' }, token);
    store.update(id, { state: 'active', contract_id: 'gid://shopify/SubscriptionContract/123' });
    const options = { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{"action":"cancel"}' };
    let response = await fetch(base + '/api/manage/' + id, options); assert.equal(response.status, 503); assert.equal(store.get(id).state, 'stopped');
    response = await fetch(base + '/api/manage/' + id, { headers: options.headers }); const managed = await response.json(); assert.equal(managed.canCancel, true); assert.equal(managed.cancellationPending, true);
    response = await fetch(base + '/api/manage/' + id, options); assert.equal(response.status, 200); assert.equal(store.get(id).data.cancellationConfirmed, true);
    response = await fetch(base + '/api/manage/' + id, options); assert.equal(response.status, 200); assert.equal(remoteCalls, 2);
  }, { cancel: async () => { remoteCalls++; if (failures-- > 0) throw new Error('Uncertain Shopify response'); } });
});
test('admin actions require authenticated Shopify access and same-origin CSRF protection', async () => withServer(async ({ base, store, config }) => {
  let response = await fetch(base + '/admin/status'); assert.equal(response.status, 403);
  const session = store.ticket('admin', 1800);
  response = await fetch(base + '/admin/status', { headers: { Cookie: `pit_app_session=${session}` } }); assert.equal(response.status, 200);
  response = await fetch(base + '/admin/setup', { method: 'POST', headers: { Cookie: `pit_app_session=${session}`, Origin: 'https://evil.test' } }); assert.equal(response.status, 403);
  assert.notEqual(config.baseUrl, ORIGIN);
}));
test('webhook replay is deduplicated and raw customer payloads are never persisted', async () => withServer(async ({ base, store, config }) => {
  const raw = '{"id":123,"customer":{"email":"TEST-ONLY-not-a-person@example.test"}}';
  const headers = { 'x-shopify-topic': 'subscription_contracts/create', 'x-shopify-shop-domain': SHOP, 'x-shopify-webhook-id': 'event-1234567890123456', 'x-shopify-hmac-sha256': createHmac('sha256', config.clientSecret).update(raw).digest('base64') };
  for (let i = 0; i < 2; i++) assert.equal((await fetch(base + '/api/webhook', { method: 'POST', headers, body: raw })).status, 200);
  const events = store.db.prepare('SELECT * FROM events').all(); assert.equal(events.length, 1); assert.equal(JSON.stringify(events).includes('email'), false);
}));
test('private credentials never appear in failed Shopify request messages', async () => {
  const store = memory(); store.saveSecret('access_token', 'TEST-ONLY-private-token');
  const api = new Shopify(store, { clientSecret: 'TEST-ONLY-private-secret', baseUrl: 'https://rotation.example.test', fetchImpl: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(api.request('query Test { shop { name } }'), error => error instanceof ShopifyRequestError && error.code === 'HTTP_403' && !error.message.includes('TEST-ONLY')); store.close();
});
test('Shopify diagnostics expose only allow-listed codes, never remote messages or arbitrary codes', async () => {
  const store = memory(); store.saveSecret('access_token', 'TEST-ONLY-private-token');
  for (const [code, expected] of [['MAX_COST_EXCEEDED', 'MAX_COST_EXCEEDED'], ['TEST-ONLY-private-token', 'SHOPIFY_REQUEST_REJECTED']]) {
    const api = new Shopify(store, { fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ errors: [{ message: 'TEST-ONLY-private-secret', extensions: { code } }] }) }) });
    await assert.rejects(api.request('query Test { shop { name } }'), error => error instanceof ShopifyRequestError && error.code === expected && !error.message.includes('TEST-ONLY'));
  }
  store.close();
});
test('authenticated setup failure identifies a safe stage while keeping billing off', async () => withServer(async ({ base, store, config }) => {
  const session = store.ticket('admin', 1800);
  const response = await fetch(base + '/admin/setup', { method: 'POST', headers: { Cookie: `pit_app_session=${session}`, Origin: config.baseUrl } });
  assert.equal(response.status, 422);
  assert.match((await response.json()).message, /connection and owned-plan verification \(MAX_COST_EXCEEDED\)/);
}, { verify: async () => { throw new ShopifyRequestError('MAX_COST_EXCEEDED'); } }));

test('juice setup diagnostics identify the failed stage without exposing remote details', async () => withServer(async ({ base, store, config }) => {
  const session = store.ticket('admin', 1800);
  const response = await fetch(base + '/admin/juice/prepare', { method: 'POST', headers: { Cookie: `pit_app_session=${session}`, Origin: config.baseUrl }, body: '{}' });
  assert.equal(response.status, 422); const body = await response.json();
  assert.match(body.message, /app-owned juice policy lookup \(undefinedField\)/);
  assert.doesNotMatch(JSON.stringify(body), /TEST-ONLY-private/);
  assert.equal((await (await fetch(base + '/health')).json()).billingEnabled, false);
}, { prepareJuicePlans: async ({ reportStage }) => { reportStage('app-owned juice policy lookup'); const error = new ShopifyRequestError('undefinedField'); error.message = 'TEST-ONLY-private'; throw error; } }));

test('live admin juice catalog remains authenticated and read-only', async () => withServer(async ({ base, store }) => {
  assert.equal((await fetch(base + '/admin/juice/catalog')).status, 403);
  const session = store.ticket('admin', 1800);
  const response = await fetch(base + '/admin/juice/catalog', { headers: { Cookie: `pit_app_session=${session}` } });
  assert.equal(response.status, 200); assert.equal((await response.json()).minimumCents, 13499);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rotations').get().n, 0);
}, { juiceCatalog: async () => ({ minimumCents: 13499, items: {}, tea: null }) }));
test('owned-plan verification uses the app-scoped query, not the unrelated Liquid appId identifier', async () => {
  const store = memory(); const api = new Shopify(store, {}); api.catalog = async () => catalog;
  api.request = async query => {
    assert.match(query, /sellingPlanGroups/); assert.doesNotMatch(query, /currentAppInstallation/);
    return { subscriptionContracts: { nodes: [] }, sellingPlanGroups: { pageInfo: { hasNextPage: false }, nodes: [{ appId: CLIENT_ID, merchantCode: 'pit-three-week-rotation-v1', name: 'Existing fixture plan', sellingPlans: { nodes: [{ id: 'gid://shopify/SellingPlan/1' }] } }] } };
  };
  assert.equal((await api.verify()).hasExistingContracts, false);
  assert.equal(store.getSetting('planId'), 'gid://shopify/SellingPlan/1'); store.close();
});
test('webhook migration verifies the final routing and retires only the three exact legacy app topics', async () => {
  const store = memory(); const api = new Shopify(store, { baseUrl: 'https://rotation.example.test' });
  const topics = ['SUBSCRIPTION_CONTRACTS_CREATE', 'SUBSCRIPTION_CONTRACTS_UPDATE', 'APP_UNINSTALLED'];
  const current = topics.map((topic, index) => ({ id: `new-${index}`, topic, uri: 'https://rotation.example.test/api/webhook' }));
  const legacy = topics.map((topic, index) => ({ id: `old-${index}`, topic, uri: 'https://placeinthyme.com/wp-json/pit-rotation/v1/webhook' }));
  const unrelated = { id: 'leave-alone', topic: 'ORDERS_CREATE', uri: legacy[0].uri };
  let calls = 0; const deleted = [];
  api.request = async () => ({ webhookSubscriptions: { nodes: calls++ ? [...current, unrelated] : [...current, ...legacy, unrelated], pageInfo: { hasNextPage: false } } });
  api.mutation = async (_query, variables) => { deleted.push(variables.id); return { deletedWebhookSubscriptionId: variables.id }; };
  await api.migrateWebhooks(); assert.deepEqual(deleted, legacy.map(hook => hook.id));
  assert.equal(store.getSetting('webhookRouting').legacyRotationEndpoints, 0); assert.deepEqual(store.getSetting('webhooks'), current.map(hook => hook.id));
  api.request = async () => ({ webhookSubscriptions: { nodes: [...current, legacy[0]], pageInfo: { hasNextPage: false } } });
  await assert.rejects(api.migrateWebhooks(), error => error.code === 'WEBHOOK_ROUTING_NEEDS_REVIEW'); store.close();
});
