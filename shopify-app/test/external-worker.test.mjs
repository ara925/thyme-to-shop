import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createApplication, configuration } from '../src/server.mjs';
import { Store } from '../src/store.mjs';
import { ORIGIN } from '../src/domain.mjs';

const secret = '9a'.repeat(32); // Synthetic test token, never used outside loopback.
const path = '/internal/worker/tick';
const start = Date.parse('2026-11-11T18:00:00Z');
const auth = { Authorization: `Bearer ${secret}` };

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return (route = path, options = {}) => fetch(base + route, { method: 'POST', headers: auth, ...options });
}

async function fixture(t, overrides = {}, gateway = {}) {
  const store = new Store(':memory:');
  let now = start;
  const config = configuration({ PIT_WORKER_MODE: 'external', PIT_WORKER_SECRET: secret, ...overrides });
  const calls = [];
  const shopify = new Proxy(gateway, { get: (api, name) => async (...args) => {
    calls.push(name);
    if (Object.hasOwn(api, name)) return await api[name](...args);
    throw new Error('Unexpected Shopify operation');
  } });
  const app = createApplication(config, { store, shopify, clock: () => now });
  const request = await listen(app);
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); store.close(); });
  return { request, store, app, config, shopify, calls, setTime: value => { now = value; } };
}

test('external mode is opt-in and requires a separate 32-byte secret', () => {
  assert.equal(configuration({}).workerMode, 'interval');
  for (const env of [{}, { PIT_WORKER_SECRET: 'weak' }, { PIT_WORKER_SECRET: secret, SHOPIFY_API_SECRET: secret }]) {
    assert.throws(() => configuration({ PIT_WORKER_MODE: 'external', ...env }), /its own randomly generated/);
  }
  assert.throws(() => configuration({ PIT_WORKER_MODE: 'unknown' }), /worker mode/);
});

test('no public visit, invalid credential, or invalid worker request advances the heartbeat', async t => {
  const { request, store, calls } = await fixture(t);
  assert.equal((await request('/health', { method: 'GET', headers: {} })).status, 200);
  assert.equal((await request('/', { method: 'GET', headers: {} })).status, 200);
  for (const headers of [{}, { Authorization: 'Bearer wrong', Origin: ORIGIN }]) {
    const denied = await request(path, { headers });
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  }
  assert.equal((await request(path, { method: 'GET' })).status, 405);
  assert.equal((await request(path + '?unexpected=true')).status, 400);
  assert.equal((await request(path, { body: '{}' })).status, 400);
  assert.equal((await request('/admin/status', { method: 'GET' })).status, 403);
  assert.equal(store.getSetting('heartbeat'), null);
  assert.deepEqual(calls, []);
});

test('authenticated minute requests run without billing and suppress a retry across app instances', async t => {
  const { request, store, app, config, shopify, calls, setTime } = await fixture(t);
  assert.deepEqual(await (await request()).json(), { outcome: 'completed' });
  assert.equal(store.getSetting('heartbeat'), start);
  assert.equal(app.status().schedulerExternalLastCompleted, new Date(start).toISOString());
  const coldApp = createApplication(config, { store, shopify, clock: () => start + 5000 });
  const coldRequest = await listen(coldApp);
  try {
    assert.deepEqual(await (await coldRequest()).json(), { outcome: 'already-completed' });
    assert.equal(store.getSetting('heartbeat'), start);
  } finally { await new Promise(resolve => coldApp.server.close(resolve)); }
  setTime(start + 60000);
  assert.deepEqual(await (await request()).json(), { outcome: 'completed' });
  assert.equal(store.getSetting('heartbeat'), start + 60000);
  assert.equal(app.status().billingEnabled, false);
  assert.equal(app.status().enrollmentReady, false);
  assert.equal(app.status().juiceEnrollmentReady, false);
  assert.deepEqual(calls, []);
});

test('interval mode does not expose the external route and recovery hold pauses authorized ticks', async t => {
  const interval = await fixture(t, { PIT_WORKER_MODE: 'interval' });
  assert.equal((await interval.request()).status, 404);
  const held = await fixture(t, { PIT_RECOVERY_HOLD: 'true' });
  const id = held.store.create({ cancellationPending: true, cancellationRequestedAt: new Date(start).toISOString() }, 'a'.repeat(64));
  held.store.update(id, { state: 'stopped', contract_id: 'gid://shopify/SubscriptionContract/8', due_at: start });
  const paused = await held.request();
  assert.equal(paused.status, 503);
  assert.deepEqual(await paused.json(), { outcome: 'paused' });
  assert.equal(held.store.getSetting('heartbeat'), null);
  assert.equal(held.store.getSetting('externalWorkerLastCompleted'), null);
  assert.equal(held.store.get(id).data.cancellationPending, true);
  assert.deepEqual(held.calls, []);
});

test('the external worker finishes only a saved customer meal cancellation after Shopify times out, with billing off', async t => {
  const target = 'gid://shopify/SubscriptionContract/123';
  const remote = [];
  const { request, store, app, config, shopify, setTime, calls } = await fixture(t, {}, {
    cancel: async id => {
      remote.push(id);
      if (remote.length === 1) throw new Error('Response lost after send');
    },
  });
  const token = 'b'.repeat(64);
  const id = store.create({ serviceDate: '2026-11-16T09:00:00-08:00' }, token);
  store.update(id, { state: 'active', contract_id: target });
  const other = store.create({}, 'a'.repeat(64));
  store.update(other, { state: 'stopped', contract_id: 'gid://shopify/SubscriptionContract/456', due_at: start });
  const invalid = store.create({ cancellationPending: true }, 'c'.repeat(64));
  store.update(invalid, { state: 'stopped', contract_id: 'gid://shopify/SubscriptionContract/789', due_at: start });

  const action = { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{"action":"cancel"}' };
  assert.equal((await request(`/api/manage/${id}`, action)).status, 503);
  assert.equal(store.get(id).state, 'stopped');
  assert.equal(store.get(id).data.cancellationPending, true);
  assert.equal(store.get(id).data.cancellationConfirmed, undefined);
  assert.equal(store.get(id).due_at, start + 15 * 60_000);
  assert.equal((await request()).status, 200);
  assert.deepEqual(remote, [target]);

  // A new application instance can recover the pending request without the
  // original HTTP request or the customer pressing Cancel again.
  const retry = createApplication(config, { store, shopify, clock: () => start + 15 * 60_000 });
  const onColdStart = await listen(retry);
  try { assert.deepEqual(await (await onColdStart()).json(), { outcome: 'completed' }); }
  finally { await new Promise(resolve => retry.server.close(resolve)); }
  const finished = store.get(id);
  assert.equal(finished.state, 'stopped');
  assert.equal(finished.data.cancellationPending, false);
  assert.equal(finished.data.cancellationConfirmed, true);
  const status = await (await request(`/api/manage/${id}`, { method: 'GET', headers: action.headers })).json();
  assert.equal(status.cancellationConfirmed, true);
  assert.equal(status.canCancel, false);
  setTime(start + 16 * 60_000);
  assert.equal((await request()).status, 200);
  assert.equal((await request(`/api/manage/${id}`, action)).status, 200);
  assert.equal(app.status().billingEnabled, false);
  assert.deepEqual(remote, [target, target]);
  assert.deepEqual(calls, ['cancel', 'cancel']);
});

test('busy and failed cycles cannot report completion and a later request can retry', async t => {
  const { request, store, app } = await fixture(t);
  const lock = store.lease('worker', 120);
  assert.equal((await request()).status, 409);
  assert.equal(store.getSetting('heartbeat'), null);
  store.release('worker', lock);
  const originalBackup = store.backupIfDue.bind(store);
  store.backupIfDue = async () => { throw new Error('Synthetic storage failure'); };
  const failed = await request();
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { outcome: 'failed' });
  assert.equal(app.status().schedulerExternalLastCompleted, null);
  assert.equal(store.getSetting('backupReviewNeeded'), true);
  store.backupIfDue = originalBackup;
  assert.deepEqual(await (await request()).json(), { outcome: 'completed' });
});

test('external billing and enrollment require a recent completed tick, not an interval heartbeat or failed start', async t => {
  const gateNames = ['BILLING', 'CHECKOUT', 'FULFILLMENT', 'STOREFRONT', 'LAUNCH', 'PERSISTENT_STORAGE', 'JUICE'];
  const overrides = Object.fromEntries(gateNames.map(gate => [`PIT_${gate}_VERIFIED`, 'true']));
  const { request, store, app, calls, setTime } = await fixture(t, {
    ...overrides, PIT_ENCRYPTION_KEY: '5b'.repeat(32), SHOPIFY_STOREFRONT_TOKEN: 'test-only',
  });
  store.setSetting('verifiedAt', start);
  store.setSetting('planId', 'gid://shopify/SellingPlan/1');
  store.setSetting('webhooks', ['1', '2', '3']);
  store.setSetting('juiceVerifiedAt', start);
  store.setSetting('juicePlanIds', { weekly: 'gid://shopify/SellingPlan/2', prepaid: 'gid://shopify/SellingPlan/3' });
  store.setSetting('heartbeat', start);
  function readiness(expected) {
    const status = app.status();
    for (const key of ['billingEnabled', 'enrollmentReady', 'juiceEnrollmentReady']) assert.equal(status[key], expected, key);
  }
  readiness(false);
  const originalBackup = store.backupIfDue.bind(store);
  store.backupIfDue = async () => { throw new Error('Synthetic storage failure'); };
  assert.equal((await request()).status, 503);
  readiness(false);
  store.backupIfDue = originalBackup;
  assert.equal((await request()).status, 200);
  readiness(true);
  setTime(start - 1);
  readiness(false);
  setTime(start + 120_001);
  readiness(false);
  assert.deepEqual(calls, []);
});
