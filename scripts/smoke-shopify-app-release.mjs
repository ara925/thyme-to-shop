import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// An isolated artifact boot. Never load .env or inherit merchant configuration.
const [directory, expectedVersion] = process.argv.slice(2);
assert(directory && /^\d+\.\d+\.\d+$/.test(expectedVersion || ''), 'Provide an extracted app and expected version.');
const appRoot = resolve(directory);
const metadata = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(appRoot, 'package-lock.json'), 'utf8'));
assert.equal(metadata.version, expectedVersion);
assert.equal(lock.version, expectedVersion);
assert.equal(lock.packages[''].version, expectedVersion);
assert.deepEqual(metadata.dependencies || {}, {});
const nativeFetch = globalThis.fetch;
let externalRequests = 0;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== '127.0.0.1') { externalRequests++; throw new Error('Release drill forbids external requests.'); }
  return nativeFetch(input, options);
};
const { Store } = await import(pathToFileURL(join(appRoot, 'src/store.mjs')).href);
const { configuration, createApplication } = await import(pathToFileURL(join(appRoot, 'src/server.mjs')).href);
const key = Buffer.alloc(32, 37).toString('base64');
const config = configuration({ PIT_APP_URL: 'https://release-drill.invalid',
  PIT_ENCRYPTION_KEY: key, SHOPIFY_API_SECRET: 'TEST-ONLY-release-drill', PIT_RECOVERY_HOLD: 'true' });
assert(Object.values(config.gates).every(value => value === false));
const store = new Store(':memory:', key);
const app = createApplication(config, { store });
let externalSchedulerVerified = false;
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
try {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(base + '/api/health');
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.version, expectedVersion);
  for (const field of ['previewReady', 'enrollmentReady', 'juiceEnrollmentReady', 'billingEnabled']) assert.equal(health[field], false);
  assert.equal(health.mainWebsiteDependency, false);
  const root = await fetch(base + '/');
  assert.equal(root.status, 200);
  assert.match(await root.text(), /Place in Thyme Meal Rotation/);
  if (config.recoveryHold !== undefined) assert.equal(health.recoveryHold, true);
  const quote = await fetch(base + '/api/quote', { method: 'POST',
    headers: { Origin: 'https://shop.placeinthyme.com', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(quote.status, 503);
  assert.equal((await fetch(base + '/admin/status')).status, 403);
  if (config.workerMode !== undefined) {
    const secret = '7c'.repeat(32);
    const headers = { Authorization: `Bearer ${secret}` };
    const path = '/internal/worker/tick';
    assert.equal((await fetch(base + path, { method: 'POST', headers })).status, 404);
    const clock = Date.parse('2026-11-11T18:00:00Z');
    const database = join(appRoot, 'smoke-worker.sqlite');
    async function bootWorker({ hold, offset, outcome, status }) {
      const workerConfig = configuration({
        PIT_APP_URL: 'https://release-drill.invalid', PIT_ENCRYPTION_KEY: key,
        SHOPIFY_API_SECRET: 'TEST-ONLY-release-drill', PIT_WORKER_MODE: 'external',
        PIT_WORKER_SECRET: secret, PIT_DATABASE_PATH: database, PIT_RECOVERY_HOLD: String(hold),
      });
      assert(Object.values(workerConfig.gates).every(value => value === false));
      const workerStore = new Store(database, key);
      const workerApp = createApplication(workerConfig, { store: workerStore, clock: () => clock + offset });
      try {
        await new Promise(resolve => workerApp.server.listen(0, '127.0.0.1', resolve));
        const workerBase = `http://127.0.0.1:${workerApp.server.address().port}`;
        const prior = workerStore.getSetting('externalWorkerLastCompleted');
        assert.equal((await fetch(workerBase + '/health')).status, 200);
        assert.equal((await fetch(workerBase + path, { method: 'POST' })).status, 404);
        assert.equal(workerStore.getSetting('externalWorkerLastCompleted'), prior);
        const tick = await fetch(workerBase + path, { method: 'POST', headers });
        assert.equal(tick.status, status);
        assert.deepEqual(await tick.json(), { outcome });
        assert.equal(workerStore.getSetting('externalWorkerLastCompleted'), outcome === 'completed' ? clock + offset : prior);
        assert.equal(workerApp.status().billingEnabled, false);
        assert.equal(workerApp.status().enrollmentReady, false);
        assert.equal(workerApp.status().juiceEnrollmentReady, false);
      } finally {
        workerApp.server.closeAllConnections();
        await new Promise(resolve => workerApp.server.close(resolve));
        workerStore.close();
      }
    }
    await bootWorker({ hold: true, offset: 0, outcome: 'paused', status: 503 });
    await bootWorker({ hold: false, offset: 0, outcome: 'completed', status: 200 });
    await bootWorker({ hold: false, offset: 5_000, outcome: 'already-completed', status: 200 });
    await bootWorker({ hold: false, offset: 60_000, outcome: 'completed', status: 200 });
    externalSchedulerVerified = true;
  }
  assert.equal(externalRequests, 0);
  process.stdout.write(JSON.stringify({ version: expectedVersion, isolatedArtifactBoot: true,
    allAcceptanceGatesOff: true, enrollmentAndBillingClosed: true, adminAuthenticationRequired: true,
    recoveryHoldSupported: config.recoveryHold !== undefined, externalSchedulerVerified, externalRequests: 0 }));
} finally {
  app.server.closeAllConnections();
  await new Promise(resolve => app.server.close(resolve));
  store.close();
}
