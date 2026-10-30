import test from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';

test('a restored synthetic snapshot boots in a new process without replaying renewals, cancellation or webhooks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pit-cutover-fixture-'));
  const originalFile = join(directory, 'original', 'rotation.sqlite');
  const restoredFile = join(directory, 'restored', 'rotation.sqlite');
  const store = new Store(originalFile, Buffer.alloc(32, 31).toString('base64'));
  let originalClosed = false;
  try {
    for (const name of ['verifiedAt', 'juiceVerifiedAt', 'heartbeat']) store.setSetting(name, Date.now());
    store.setSetting('planId', 'gid://shopify/SellingPlan/1');
    store.setSetting('juicePlanIds', { weekly: 'gid://shopify/SellingPlan/2', prepaid: 'gid://shopify/SellingPlan/3' });
    store.setSetting('webhooks', ['TEST-ONLY-1', 'TEST-ONLY-2', 'TEST-ONLY-3']);
    store.saveSecret('access_token', 'TEST-ONLY-private-access');
    store.saveSecret('refresh_token', 'TEST-ONLY-private-refresh');
    const meal = store.create({ kind: 'meal', cycle: 2, idempotencyKey: 'TEST-ONLY-retained-billing-key',
      attemptId: 'TEST-ONLY-existing-attempt' }, 'a'.repeat(64));
    store.update(meal, { state: 'billing', contract_id: 'gid://shopify/SubscriptionContract/1', due_at: Date.now() - 1 });
    const juice = store.create({ kind: 'juice', paidWeeks: 4, cancelAfterPaidWeeks: 4,
      cancellationRequested: true, cancellationPending: true }, 'b'.repeat(64));
    store.update(juice, { state: 'cancelling', contract_id: 'gid://shopify/SubscriptionContract/2', due_at: Date.now() - 1 });
    store.enqueue('TEST-ONLY-event-00001', 'gid://shopify/SubscriptionContract/1');
    assert.equal(await store.backupIfDue(), true);
    store.close(); originalClosed = true;
    const snapshot = join(dirname(originalFile), 'backups', 'rotation-latest.sqlite');
    const originalBytes = readFileSync(originalFile);
    const snapshotBytes = readFileSync(snapshot);
    mkdirSync(dirname(restoredFile), { recursive: true, mode: 0o700 });
    copyFileSync(snapshot, restoredFile);
    const output = execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/recovery-drill-child.mjs', import.meta.url)), restoredFile], {
      encoding: 'utf8', timeout: 10000, maxBuffer: 2048, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      env: Object.fromEntries(['PATH', 'SystemRoot'].filter(name => process.env[name]).map(name => [name, process.env[name]])),
    });
    assert.deepEqual(JSON.parse(output), { restoredInNewProcess: true, encryptedValuesRecovered: true,
      savedCheckpointsPreserved: true, duplicateWebhookNotRequeued: true, recoveryHold: true, externalRequests: 0 });
    assert.doesNotMatch(output, /private-access|private-refresh|sqlite|existing-attempt/);
    assert.deepEqual(readFileSync(originalFile), originalBytes);
    assert.deepEqual(readFileSync(snapshot), snapshotBytes);
  } finally {
    if (!originalClosed) store.close();
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('pit-cutover-fixture-'));
    rmSync(target, { recursive: true });
  }
});
