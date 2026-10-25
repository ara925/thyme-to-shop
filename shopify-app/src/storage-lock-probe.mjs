import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { isAbsolute } from 'node:path';

// A separate Node process checks only a transient row in the existing locks table.
let database;
try {
  const [filename, name] = process.argv.slice(2);
  if (!isAbsolute(filename || '') || !/^storage-check-[a-f0-9]{32}$/.test(name || '')) throw Error('Invalid storage check.');
  database = new DatabaseSync(filename); database.exec('PRAGMA busy_timeout=3000');
  const token = randomBytes(16).toString('hex'); const now = Date.now();
  const result = database.prepare('INSERT INTO locks VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE locks.expires<?').run(name, token, now + 30000, now);
  const acquired = result.changes === 1;
  if (acquired) database.prepare('DELETE FROM locks WHERE key=? AND token=?').run(name, token);
  process.stdout.write(JSON.stringify({ acquired }));
} catch { process.stdout.write(JSON.stringify({ failed: true })); process.exitCode = 1; }
finally { database?.close(); }
