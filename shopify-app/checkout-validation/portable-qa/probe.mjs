import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { issueServiceProof, verifyServiceProof } from '../service-proof.mjs';

const built = await build({
  entryPoints: [fileURLToPath(new URL('./verify.mjs', import.meta.url))],
  platform: 'neutral', target: 'es2020', format: 'iife', globalName: 'PitCutoffProbe',
  bundle: true, minify: true, write: false, legalComments: 'inline', metafile: true,
});
const inputs = Object.keys(built.metafile.inputs);
assert.ok(inputs.some(name => name.endsWith('service-proof-wire.mjs')));
assert.ok(inputs.every(name => !name.endsWith('/service-proof.mjs') && !name.endsWith('/probe.mjs')),
  'The checkout bundle must not pull in the issuer or test keys.');
assert.ok(Object.values(built.metafile.outputs).every(output => output.imports.length === 0),
  'The portable probe must not rely on imports at checkout.');
const script = built.outputFiles[0].text;
const limited = Object.create(null);
const checkoutCode = runInNewContext(`${script}\nPitCutoffProbe`, limited, { timeout: 1000 });
for (const field of ['Buffer', 'crypto', 'atob', 'TextEncoder', 'process', 'require', 'fetch']) {
  assert.equal(runInNewContext(`typeof ${field}`, limited), 'undefined', field);
}

const keys = generateKeyPairSync('ed25519'); // Ephemeral; not saved or included in the bundle.
const key = keys.publicKey.export({ format: 'jwk' }).x;
const other = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' }).x;
const plan = id => `gid://shopify/SellingPlan/${id}`;
const variant = id => `gid://shopify/ProductVariant/${id}`;
const plans = { meal: plan(101), weeklyJuice: plan(102), retiredPrepaid: plan(103) };
const friday = '2026-11-20';
const saturday = '2026-11-21';
const approval = {
  pacificDate: friday, firstServiceDate: '2026-11-23',
  lines: [{ planId: plans.weeklyJuice, variantId: variant(201), quoteId: 'a'.repeat(48), paidUnitCents: 12149, quantity: 1 }],
};
const signature = issueServiceProof(approval, keys.privateKey);
const changedLine = changes => ({ ...approval, lines: approval.lines.map(line => ({ ...line, ...changes })) });
const cases = [
  ['valid proof', signature, approval, key, true],
  ['invalid proof', 'v1.' + 'A'.repeat(86), approval, key, false],
  ['missing proof', null, approval, key, false],
  ['different signer', signature, approval, other, false],
  ['noncanonical proof bytes', signature.slice(0, -1) + 'B', approval, key, false],
  ['stale Pacific service week', signature, { ...approval, pacificDate: saturday }, key, false],
  ['relabeled stale date', signature, { ...approval, pacificDate: saturday, firstServiceDate: '2026-11-30' }, key, false],
  ['swapped selling plan', signature, changedLine({ planId: plans.meal }), key, false],
  ['swapped quote', signature, changedLine({ quoteId: 'c'.repeat(48) }), key, false],
  ['changed quantity', signature, changedLine({ quantity: 2 }), key, false],
  ['changed price', signature, changedLine({ paidUnitCents: 12150 }), key, false],
  ['changed variant', signature, changedLine({ variantId: variant(202) }), key, false],
];
const fresh = { ...changedLine({ quoteId: 'b'.repeat(48) }), pacificDate: saturday, firstServiceDate: '2026-11-30' };
const freshSignature = issueServiceProof(fresh, keys.privateKey);
cases.push(['fresh Saturday quote', freshSignature, fresh, key, true]);
for (const [name, token, cart, publicKey, expected] of cases) {
  assert.equal(verifyServiceProof(token, cart, publicKey), expected, `${name}: issuer runtime`);
  assert.equal(checkoutCode.verifyPortableServiceProof(token, cart, publicKey), expected, `${name}: portable runtime`);
}

function checkout(input, proof, { ordinary = false, fixed = false, method = 'PICK_UP' } = {}) {
  const [line] = input.lines;
  const price = { amount: (line.paidUnitCents / 100).toFixed(2), currencyCode: 'USD' };
  return {
    buyerJourney: { step: 'CHECKOUT_COMPLETION' }, shop: { localTime: { date: input.pacificDate } },
    validation: { metafield: { jsonValue: { plans, serviceVerificationKey: key,
      catalog: { [line.variantId]: { type: 'juice', retailUnitCents: 13499 } } } } },
    cart: { serviceWeek: { value: input.firstServiceDate }, serviceApproval: { value: proof },
      deliveryGroups: [{ id: 'pickup', selectedDeliveryOption: { deliveryMethodType: method } }],
      lines: [{ quantity: line.quantity, deliveryGroups: [{ id: 'pickup' }], merchandise: { id: line.variantId },
        cost: { amountPerQuantity: price, totalAmount: price, discountAllocations: [] },
        juiceReference: { value: line.quoteId },
        sellingPlanAllocation: ordinary ? null : { sellingPlan: { id: fixed ? plan(104) : line.planId } } }] },
  };
}

const checkCases = [
  ['Friday custom pickup', checkout(approval, signature), null],
  ['stale checkout link', checkout({ ...approval, pacificDate: saturday }, signature), /service week has changed/],
  ['stale link with edited date', checkout({ ...approval, pacificDate: saturday, firstServiceDate: fresh.firstServiceDate }, signature), /fresh service-week review/],
  ['fresh Saturday next-week pickup', checkout(fresh, freshSignature), null],
  ['Friday ordinary pickup', checkout(approval, null, { ordinary: true }), null],
  ['Saturday ordinary pickup', checkout(fresh, null, { ordinary: true }), /closes Friday/],
  ['Saturday fixed pickup', checkout(fresh, null, { fixed: true }), /closes Friday/],
  ['unverified delivery remains unavailable', checkout(approval, signature, { method: 'LOCAL' }), /exact Orange County/],
];
for (const [label, input, expected] of checkCases) {
  const result = checkoutCode.qualifyCutoffInProbe(input);
  const messages = result.operations.flatMap(op => op.validationAdd.errors.map(error => error.message)).join('\n');
  if (expected) assert.match(messages, expected, label);
  else assert.equal(messages, '', label);
}

const started = performance.now();
for (let i = 0; i < 20; i++) assert.equal(checkoutCode.verifyPortableServiceProof(signature, approval, key), true);
console.log(JSON.stringify({ signatureVectors: cases.length, checkoutFixtures: checkCases.length,
  bundleBytes: built.outputFiles[0].contents.length, averageVerifyMsInNodeVm: Math.round((performance.now() - started) / 2) / 10,
  nativeShopifyExecutionVerified: false, privateKeyInBundle: false }));
