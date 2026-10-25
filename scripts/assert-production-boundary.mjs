import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const forbidden = ['LOCAL ONLY — Shopify delivery inspection', 'Synthetic minimum-message check',
  'NO-CHARGE delivery inspection; do not fulfill', 'checkoutDeliveryProbe', 'createDeliveryInspection'];
readFileSync(join(root, 'index.html'));
let inspected = 0;
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.(?:html|js|json)$/i.test(entry.name)) {
      if (statSync(file).size > 10_000_000) throw new Error('Unexpectedly large build artifact; production boundary needs review.');
      const text = readFileSync(file, 'utf8'); inspected++;
      if (forbidden.some(value => text.includes(value))) throw new Error(`Local-only checkout tooling leaked into production: ${relative(root, file)}`);
    }
  }
}
inspect(root);
process.stdout.write(`Production boundary passed: ${inspected} artifacts inspected; local checkout inspection tools excluded.\n`);
