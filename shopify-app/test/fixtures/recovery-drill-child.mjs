import { strict as assert } from 'node:assert';
import { configuration, createApplication } from '../../src/server.mjs';

// Entirely synthetic configuration: never inherit real Shopify/hosting credentials.
const config = configuration({ PIT_APP_URL: 'https://TEST-ONLY-recovered-app.example',
  PIT_DATABASE_PATH: process.argv[2], PIT_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString('base64'),
  SHOPIFY_API_SECRET: 'TEST-ONLY-secret', SHOPIFY_STOREFRONT_TOKEN: 'TEST-ONLY-public', PIT_RECOVERY_HOLD: 'true',
  ...Object.fromEntries(['BILLING', 'CHECKOUT', 'FULFILLMENT', 'STOREFRONT', 'LAUNCH', 'PERSISTENT_STORAGE', 'JUICE']
    .map(name => [`PIT_${name}_VERIFIED`, 'true'])) });
let externalRequests = 0;
const localFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== '127.0.0.1') { externalRequests++; throw new Error('TEST-ONLY: external requests are blocked'); }
  return localFetch(input, options);
};
const app = createApplication(config);
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
try {
  assert.equal(app.store.secret('access_token'), 'TEST-ONLY-private-access');
  assert.equal(app.store.secret('refresh_token'), 'TEST-ONLY-private-refresh');
  assert.equal(app.store.db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  const beforeRows = app.store.db.prepare('SELECT * FROM rotations ORDER BY id').all();
  const beforeEvents = app.store.db.prepare('SELECT * FROM events').all();
  const beforeBackup = app.store.getSetting('backupLastCompleted');
  assert.equal(beforeRows.length, 2);
  assert.equal(beforeEvents.length, 1);
  await app.worker.tick();
  await app.worker.tick();
  await app.worker.juices.stepDue();
  assert.deepEqual(app.store.db.prepare('SELECT * FROM rotations ORDER BY id').all(), beforeRows);
  assert.deepEqual(app.store.db.prepare('SELECT * FROM events').all(), beforeEvents);
  assert.equal(app.store.getSetting('backupLastCompleted'), beforeBackup);
  app.store.enqueue(beforeEvents[0].id, beforeEvents[0].resource_id);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
  const response = await localFetch(`http://127.0.0.1:${app.server.address().port}/api/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.configured, true);
  assert.equal(health.recoveryHold, true);
  for (const name of ['previewReady', 'enrollmentReady', 'juiceEnrollmentReady', 'billingEnabled']) assert.equal(health[name], false);
  assert.equal(externalRequests, 0);
  process.stdout.write(JSON.stringify({ restoredInNewProcess: true, encryptedValuesRecovered: true,
    savedCheckpointsPreserved: true, duplicateWebhookNotRequeued: true, recoveryHold: true, externalRequests }));
} finally {
  app.server.closeAllConnections();
  await new Promise(resolve => app.server.close(resolve));
  app.store.close();
}
