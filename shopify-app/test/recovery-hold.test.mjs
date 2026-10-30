import test from 'node:test';
import { strict as assert } from 'node:assert';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { createApplication, configuration } from '../src/server.mjs';
import { ORIGIN } from '../src/domain.mjs';

const key = Buffer.alloc(32, 31).toString('base64');
const now = Date.parse('2026-10-30T18:00:00Z');
const accepted = Object.fromEntries(['billing', 'checkout', 'fulfillment', 'storefront', 'launch', 'persistentStorage', 'juice'].map(name => [name, true]));
function fixture() {
  const store = new Store(':memory:', key);
  for (const name of ['verifiedAt', 'juiceVerifiedAt', 'heartbeat']) store.setSetting(name, now);
  store.setSetting('planId', 'gid://shopify/SellingPlan/1');
  store.setSetting('juicePlanIds', { weekly: 'gid://shopify/SellingPlan/2', prepaid: 'gid://shopify/SellingPlan/3' });
  store.setSetting('webhooks', ['TEST-ONLY-one', 'TEST-ONLY-two', 'TEST-ONLY-three']);
  const meal = store.create({ kind: 'meal', weeks: {}, cycle: 2, idempotencyKey: 'TEST-ONLY-same-billing-key' }, 'a'.repeat(64));
  store.update(meal, { contract_id: 'gid://shopify/SubscriptionContract/11', state: 'active', due_at: now - 1 });
  const juice = store.create({ kind: 'juice', mix: {}, paidWeeks: 4, cancelAfterPaidWeeks: 4,
    cancellationRequested: true, cancellationPending: true }, 'b'.repeat(64));
  store.update(juice, { contract_id: 'gid://shopify/SubscriptionContract/12', state: 'cancelling', due_at: now - 1 });
  store.enqueue('TEST-ONLY-webhook-0001', 'gid://shopify/SubscriptionContract/11');
  const calls = [];
  const api = new Proxy({}, { get: (_, operation) => async () => { calls.push(operation); throw new Error('TEST-ONLY: no network permitted'); } });
  return { store, meal, juice, api, calls };
}

test('recovery hold is explicit, defaults off and does not enable any acceptance gate', () => {
  assert.equal(configuration({}).recoveryHold, false);
  assert.equal(configuration({ PIT_RECOVERY_HOLD: 'true' }).recoveryHold, true);
  assert.equal(configuration({ PIT_RECOVERY_HOLD: 'false' }).recoveryHold, false);
  assert.equal(configuration({ PIT_RECOVERY_HOLD: 'true' }).gates.billing, false);
});

test('recovery hold pauses webhook work, due renewals and queued cancellation without changing saved checkpoints', async () => {
  const { store, api, calls } = fixture();
  try {
    const worker = new Worker(store, api, { gates: accepted, now: () => now, identityKey: key, recoveryHold: true });
    const beforeRows = store.db.prepare('SELECT * FROM rotations ORDER BY id').all();
    const beforeEvents = store.db.prepare('SELECT * FROM events').all();
    assert.equal(worker.enabled(), false);
    assert.equal(worker.juices.enabled(), false);
    await worker.tick();
    await worker.juices.stepDue();
    assert.deepEqual(calls, []);
    assert.deepEqual(store.db.prepare('SELECT * FROM rotations ORDER BY id').all(), beforeRows);
    assert.deepEqual(store.db.prepare('SELECT * FROM events').all(), beforeEvents);
  } finally { store.close(); }
});

test('normal cancellation retries are preserved when recovery hold is not enabled', async () => {
  const { store, api, calls } = fixture();
  try {
    const worker = new Worker(store, api, { gates: {}, now: () => now, identityKey: key });
    await worker.juices.stepDue();
    assert.deepEqual(calls, ['cancel']);
  } finally { store.close(); }
});

test('recovery-held HTTP endpoints reject changes while authenticated read-only management remains available', async () => {
  const { store, meal, juice, api, calls } = fixture();
  const config = { baseUrl: 'https://TEST-ONLY-app.example', clientSecret: 'TEST-ONLY-secret', encryptionKey: key,
    storefrontToken: 'TEST-ONLY-public-token', gates: accepted, recoveryHold: true };
  const app = createApplication(config, { store, shopify: api, clock: () => now });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const session = store.ticket('admin', 1800);
  try {
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.recoveryHold, true);
    assert.equal(health.enrollmentReady, false);
    assert.equal(health.juiceEnrollmentReady, false);
    assert.equal(health.billingEnabled, false);
    assert.equal(health.previewReady, false);
    assert.match(await (await fetch(base + '/')).text(), /Recovery pause is active/);
    for (const [path, token] of [['/api/manage/' + meal, 'a'.repeat(64)], ['/api/juice/manage/' + juice, 'b'.repeat(64)]]) {
      const headers = { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      assert.equal((await fetch(base + path, { headers })).status, 200);
      const changed = await fetch(base + path, { method: 'POST', headers, body: '{"action":"cancel"}' });
      assert.equal(changed.status, 503);
      assert.equal((await changed.json()).code, 'pit_recovery_hold');
    }
    for (const path of ['/api/preview', '/api/quote', '/api/juice/preview', '/api/juice/quote']) {
      const response = await fetch(base + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'pit_recovery_hold');
    }
    const adminHeaders = { Origin: config.baseUrl, Cookie: `pit_app_session=${session}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(base + '/admin/status', { headers: adminHeaders })).status, 200);
    for (const path of ['/admin/setup', '/admin/preview', '/admin/juice/prepare']) {
      const response = await fetch(base + path, { method: 'POST', headers: adminHeaders, body: '{}' });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'pit_recovery_hold');
    }
    assert.equal((await fetch(base + '/admin/setup', { method: 'POST', body: '{}' })).status, 403);
    assert.deepEqual(calls, []);
    assert.equal(store.get(meal).state, 'active');
    assert.equal(store.get(juice).state, 'cancelling');
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); store.close(); }
});
