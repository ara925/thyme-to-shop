import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { assert, equalSecret } from './domain.mjs';

export class Store {
  constructor(filename, encryptionKey) {
    assert(filename === ':memory:' || filename.startsWith('/') || /^[A-Z]:[\\/]/i.test(filename), 'Use an absolute persistent database path.');
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.key = encryptionKey ? Buffer.from(encryptionKey, 'base64') : null;
    assert(!this.key || this.key.length === 32, 'Encryption key must be 32 random bytes encoded as base64.');
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY,token TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rotations (id TEXT PRIMARY KEY,contract_id TEXT UNIQUE,manage_hash TEXT NOT NULL,state TEXT NOT NULL,payload TEXT NOT NULL,due_at INTEGER NOT NULL DEFAULT 0,lease TEXT NOT NULL DEFAULT '',locked_until INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS rotation_work ON rotations(state,due_at);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,resource_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,due_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
    this.db.exec('CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY,kind TEXT NOT NULL,expires INTEGER NOT NULL)');
  }
  getSetting(key, fallback = null) { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  setSetting(key, value) { this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  secret(name) {
    const encoded = this.getSetting(`secret_${name}`); if (!encoded) return '';
    assert(this.key, 'Private credential key required.');
    const value = Buffer.from(encoded, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(0, 12)); decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
  }
  saveSecret(name, value) {
    assert(this.key, 'Private credential key required.');
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    this.setSetting(`secret_${name}`, Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'));
  }
  lease(key, seconds = 180) {
    const token = randomBytes(16).toString('hex'); const now = Date.now();
    const result = this.db.prepare('INSERT INTO locks VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE locks.expires<?').run(key, token, now + seconds * 1000, now);
    return result.changes === 1 ? token : null;
  }
  release(key, token) { this.db.prepare('DELETE FROM locks WHERE key=? AND token=?').run(key, token); }
  rate(key, max = 20) {
    const now = Date.now(); this.db.prepare('DELETE FROM rates WHERE expires<?').run(now);
    this.db.prepare('INSERT INTO rates VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 60000);
    return this.db.prepare('SELECT count FROM rates WHERE key=?').get(key).count <= max;
  }
  create(data, token) {
    const id = randomBytes(24).toString('hex');
    this.db.prepare('INSERT INTO rotations(id,manage_hash,state,payload,created_at) VALUES (?,?,?,?,?)').run(id, createHash('sha256').update(token).digest('hex'), 'quoted', JSON.stringify(data), Date.now()); return id;
  }
  get(id) { const row = this.db.prepare('SELECT * FROM rotations WHERE id=?').get(id); return row ? { ...row, data: JSON.parse(row.payload) } : null; }
  authorized(id, token) {
    if (!/^[a-f0-9]{48}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = this.get(id);
    return row && equalSecret(row.manage_hash, createHash('sha256').update(token).digest('hex')) ? row : null;
  }
  update(id, values, lease = null) {
    const allowed = ['state', 'contract_id', 'due_at', 'data'];
    assert(Object.keys(values).length && Object.keys(values).every(key => allowed.includes(key)), 'Invalid durable update.');
    const entries = Object.entries(values).map(([key, value]) => [key === 'data' ? 'payload' : key, key === 'data' ? JSON.stringify(value) : value]);
    const result = this.db.prepare(`UPDATE rotations SET ${entries.map(([key]) => `${key}=?`).join(',')} WHERE id=?${lease ? ' AND lease=?' : ''}`).run(...entries.map(([, value]) => value), id, ...(lease ? [lease] : []));
    assert(result.changes === 1, 'Durable update failed; billing stopped.');
  }
  claim(id) {
    const lease = randomBytes(16).toString('hex'); const now = Date.now();
    return this.db.prepare('UPDATE rotations SET lease=?,locked_until=? WHERE id=? AND locked_until<?').run(lease, now + 180000, id, now).changes === 1 ? lease : null;
  }
  unlock(id, lease) { this.db.prepare("UPDATE rotations SET lease='',locked_until=0 WHERE id=? AND lease=?").run(id, lease); }
  enqueue(id, resourceId) { this.db.prepare('INSERT INTO events(id,resource_id) VALUES (?,?) ON CONFLICT(id) DO NOTHING').run(id, resourceId); }
  ticket(kind, seconds) {
    this.db.prepare('DELETE FROM tickets WHERE expires<?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO tickets VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), kind, Date.now() + seconds * 1000);
    return token;
  }
  hasTicket(token, kind, consume = false) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return false;
    const hash = createHash('sha256').update(token).digest('hex');
    if (consume) return this.db.prepare('DELETE FROM tickets WHERE hash=? AND kind=? AND expires>? RETURNING hash').get(hash, kind, Date.now()) !== undefined;
    return this.db.prepare('SELECT hash FROM tickets WHERE hash=? AND kind=? AND expires>?').get(hash, kind, Date.now()) !== undefined;
  }
  close() { this.db.close(); }
}
