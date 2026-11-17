import test from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import scheduler, { dispatchWorkerTick } from '../scheduler/worker.mjs';
import { configuration, createApplication } from '../src/server.mjs';
import { Store } from '../src/store.mjs';

const secret = 'b2'.repeat(32);
const env = { PIT_WORKER_SECRET: secret };
const endpoint = 'https://corys32.sg-host.com/internal/worker/tick';
const json = (body, status = 200) => Response.json(body, { status });

test('scheduler sends the separate credential only to the fixed endpoint, without a body or redirect', async () => {
  const outcome = await dispatchWorkerTick(env, async (url, options) => {
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return json({ outcome: 'completed' });
  });
  assert.equal(outcome, 'completed');
  assert.equal(await dispatchWorkerTick(env, async () => json({ outcome: 'already-completed' })), 'already-completed');
});

test('scheduler rejects invalid input without sending anything and exposes no HTTP trigger', async () => {
  for (const value of [undefined, 'bad', secret.toUpperCase(), [secret]]) {
    await assert.rejects(dispatchWorkerTick({ PIT_WORKER_SECRET: value }, () => assert.fail('sent an invalid token')), /credential missing or invalid/);
  }
  await assert.rejects(scheduler.scheduled({ cron: '0 * * * *' }, env), /Unexpected cron schedule/);
  assert.equal(scheduler.fetch().status, 404);
});

test('busy, paused, missing, and invalid responses never appear as successful cron events', async () => {
  for (const [status, outcome] of [[409, 'busy'], [503, 'paused'], [404, 'missing'], [302, 'redirect']]) {
    await assert.rejects(dispatchWorkerTick(env, async () => json({ outcome }, status)), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(dispatchWorkerTick(env, async () => new Response('<html>Not the app</html>')), /unexpected scheduler response/);
  await assert.rejects(dispatchWorkerTick(env, async () => new Response('not json', { headers: { 'Content-Type': 'application/json' } })), /did not confirm/);
  await assert.rejects(dispatchWorkerTick(env, async () => json({ outcome: 'failed' })), /did not confirm/);
  await assert.rejects(dispatchWorkerTick(env, async () => { throw new Error(secret); }), {
    message: 'Scheduler could not reach the app',
  });
});

test('scheduler and app interoperate after reopening persisted storage, with paid gates off', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pit-scheduler-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = join(directory, 'fixture.sqlite');
  const start = Date.parse('2026-11-11T18:00:00Z');
  let shopifyCalls = 0;
  const shopify = new Proxy({}, { get: () => async () => { shopifyCalls++; throw new Error('Unexpected Shopify operation'); } });
  const config = configuration({ ...env, PIT_WORKER_MODE: 'external' });

  async function openAt(time, expectedOutcome, previousHeartbeat) {
    const store = new Store(database);
    const app = createApplication(config, { store, shopify, clock: () => time });
    try {
      await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${app.server.address().port}`;
      assert.equal((await fetch(base + '/health')).status, 200);
      assert.equal(store.getSetting('heartbeat'), previousHeartbeat);
      const result = await dispatchWorkerTick(env, (url, options) => {
        assert.equal(url, endpoint);
        return fetch(base + new URL(url).pathname, options);
      });
      assert.equal(result, expectedOutcome);
      const completionTime = expectedOutcome === 'completed' ? time : previousHeartbeat;
      const status = app.status();
      assert.equal(status.schedulerExternalLastCompleted, new Date(completionTime).toISOString());
      assert.equal(status.billingEnabled, false);
      assert.equal(status.enrollmentReady, false);
      assert.equal(status.juiceEnrollmentReady, false);
    } finally {
      await new Promise(resolve => app.server.close(resolve));
      store.close();
    }
  }
  await openAt(start, 'completed', null);
  await openAt(start + 5000, 'already-completed', start);
  await openAt(start + 60_000, 'completed', start);
  assert.equal(shopifyCalls, 0);
});
