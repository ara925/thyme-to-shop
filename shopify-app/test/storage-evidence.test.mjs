import test from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { inspectRecoveryCopy, checkProcessLock } from '../src/storage-evidence.mjs';
import { createApplication } from '../src/server.mjs';

const key = Buffer.alloc(32, 19).toString('base64');
async function fixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'pit-recovery-proof-')); const store = new Store(join(directory, 'rotation.sqlite'), key);
  try {
    store.setSetting('verifiedAt', Date.now()); store.setSetting('planId', 'TEST-ONLY-plan');
    store.saveSecret('access_token', 'TEST-ONLY-private-access'); store.saveSecret('refresh_token', 'TEST-ONLY-private-refresh');
    store.create({ kind: 'meal', TEST_ONLY: true }, 'a'.repeat(64)); await store.backupIfDue();
    await callback({ store, directory, snapshot: join(directory, 'backups', 'rotation-latest.sqlite') });
  } finally { store.close(); assert.ok(directory.startsWith(join(tmpdir(), 'pit-recovery-proof-'))); rmSync(directory, { recursive: true }); }
}

test('private snapshot inspection is read-only, verifies encrypted values and never exposes them', async () => fixture(async ({ store, snapshot }) => {
  const before = readFileSync(snapshot); const result = inspectRecoveryCopy(store, 'snapshot');
  assert.equal(result.integrity, 'ok'); assert.equal(result.savedPlanCount, 1); assert.equal(result.encryptedValuesChecked, 2);
  assert.equal(result.credentialsDecryptable, true); assert.equal(result.shopifyReconciliationRequired, true); assert.equal(result.billingActivationPermitted, false);
  assert.deepEqual(readFileSync(snapshot), before); assert.doesNotMatch(JSON.stringify(result), /TEST-ONLY-private|rotation\.sqlite|secret_access_token/);
}));

test('a separate restored private copy can be checked without replacing the live database', async () => fixture(async ({ store, directory, snapshot }) => {
  mkdirSync(join(directory, 'restore-probe'), { mode: 0o700 }); copyFileSync(snapshot, join(directory, 'restore-probe', 'rotation-latest.sqlite'));
  const result = inspectRecoveryCopy(store, 'restored-copy'); assert.equal(result.integrity, 'ok'); assert.equal(result.source, 'restored-copy');
  assert.equal(store.secret('access_token'), 'TEST-ONLY-private-access'); assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rotations').get().n, 1);
}));

test('snapshot verification refuses changed configuration, a missing copy and arbitrary paths', async () => fixture(async ({ store }) => {
  for (const source of ['../../private', 'restored-copy', store.filename]) assert.throws(() => inspectRecoveryCopy(store, source));
  store.setSetting('planId', 'TEST-ONLY-another-plan'); assert.throws(() => inspectRecoveryCopy(store, 'snapshot'));
}));

test('a wrong recovery encryption key never passes verification', async () => fixture(async ({ store }) => {
  const original = store.key; store.key = Buffer.alloc(32, 20); assert.throws(() => inspectRecoveryCopy(store, 'snapshot')); store.key = original;
}));

test('two independent Node processes respect and release the existing database lease', async () => fixture(async ({ store }) => {
  const result = checkProcessLock(store); assert.equal(result.independentProcessBlockedWhileHeld, true); assert.equal(result.independentProcessAcquiredAfterRelease, true);
  assert.equal(result.orderOrBillingMutation, false); assert.equal(result.billingActivationPermitted, false);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM locks WHERE key LIKE 'storage-check-%'").get().n, 0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rotations').get().n, 1);
}));

test('storage HTTP actions require admin authentication, same-origin protection and a fixed check', async () => fixture(async ({ store }) => {
  const config = { baseUrl: 'https://TEST-ONLY-app.example', clientSecret: 'TEST-ONLY-secret', encryptionKey: key, gates: {} };
  const app = createApplication(config, { store, shopify: {} }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`; const session = store.ticket('admin', 1800);
  const headers = { Origin: config.baseUrl, Cookie: `pit_app_session=${session}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(base + '/admin/storage/check', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/admin/storage/check', { method: 'POST', headers: { ...headers, Origin: 'https://evil.test' }, body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/admin/storage/check', { method: 'POST', headers, body: '{"check":"snapshot","path":"/private"}' })).status, 422);
    let response = await fetch(base + '/admin/storage/check', { method: 'POST', headers, body: '{"check":"snapshot"}' }); assert.equal(response.status, 200);
    assert.equal((await response.json()).billingActivationPermitted, false); assert.equal(app.status().storageAcceptance, false); assert.equal(app.status().billingEnabled, false);
    response = await fetch(base + '/admin/storage/check', { method: 'POST', headers, body: '{"check":"restored-copy"}' }); assert.equal(response.status, 422);
    assert.doesNotMatch(JSON.stringify(await response.json()), /TEST-ONLY-private|rotation\.sqlite/);
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); }
}));
