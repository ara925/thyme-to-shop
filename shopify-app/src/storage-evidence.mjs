import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { assert } from './domain.mjs';

// Only these two fixed private files are inspectable. HTTP input never supplies a path.
export function inspectRecoveryCopy(store, source) {
  assert(['snapshot', 'restored-copy'].includes(source) && store.filename !== ':memory:' && store.key, 'Private persistent storage is required.');
  const file = join(dirname(store.filename), source === 'snapshot' ? 'backups' : 'restore-probe', 'rotation-latest.sqlite');
  const information = lstatSync(file);
  assert(information.isFile() && !information.isSymbolicLink() && information.size > 0 && information.size <= 67108864, 'A regular private recovery copy is required.');
  const copy = new DatabaseSync(file, { readOnly: true });
  try {
    assert(copy.prepare('PRAGMA quick_check').get().quick_check === 'ok', 'Recovery copy integrity failed.');
    const settings = new Map(copy.prepare('SELECT key,value FROM settings').all().map(row => [row.key, JSON.parse(row.value)]));
    assert(Number(settings.get('verifiedAt')) > 0 && settings.has('secret_access_token') && store.decryptSecret(settings.get('secret_access_token')), 'Recovery authorization could not be decrypted.');
    let encryptedValuesChecked = 0;
    for (const [key, value] of settings) if (key.startsWith('secret_')) { store.decryptSecret(value); encryptedValuesChecked++; }
    const rotations = copy.prepare('SELECT payload FROM rotations').all();
    for (const row of rotations) { const value = JSON.parse(row.payload); assert(value && typeof value === 'object' && !Array.isArray(value), 'Recovery record needs review.'); }
    const eventCount = Number(copy.prepare('SELECT COUNT(*) AS n FROM events').get().n);
    const matches = ['planId', 'juicePlanIds', 'webhooks'].every(key => JSON.stringify(settings.get(key) ?? null) === JSON.stringify(store.getSetting(key)));
    assert(matches, 'Recovery copy configuration differs from the active app. Reconciliation is required.');
    return { source, integrity: 'ok', encryptedValuesChecked, credentialsDecryptable: true, configurationMatches: true,
      savedPlanCount: rotations.length, eventCount, readOnlyInspection: true, shopifyReconciliationRequired: true, billingActivationPermitted: false };
  } finally { copy.close(); }
}

export function checkProcessLock(store) {
  assert(store.filename !== ':memory:', 'Private persistent storage is required.');
  const name = `storage-check-${randomBytes(16).toString('hex')}`;
  const run = () => JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./storage-lock-probe.mjs', import.meta.url)), store.filename, name], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 512, windowsHide: true,
    env: Object.fromEntries(['PATH', 'SystemRoot'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
    stdio: ['ignore', 'pipe', 'ignore'],
  }));
  const lease = store.lease(name, 30); assert(lease, 'Storage verification is busy.');
  let conflict;
  try { conflict = run(); } finally { store.release(name, lease); }
  const released = run();
  assert(conflict.acquired === false && released.acquired === true, 'Independent-process locking did not pass.');
  return { independentProcessBlockedWhileHeld: true, independentProcessAcquiredAfterRelease: true, orderOrBillingMutation: false, billingActivationPermitted: false };
}
