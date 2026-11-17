import test from 'node:test';
import { strict as assert } from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import { canonicalDeliveryAddress, deliveryVerificationKey, issueDeliveryProof, verifyDeliveryProof } from '../checkout-validation/delivery-proof.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519'); // Ephemeral test keys.
const key = deliveryVerificationKey(publicKey);
const pacificDate = '2026-11-13';
const address = { address1: '110 E La Habra Boulevard', address2: '', city: 'La Habra', provinceCode: 'CA', countryCode: 'US', zip: '90631' };
const input = { address, pacificDate, verifiedCounty: 'verified-orange-county' };

test('delivery proof covers an exact in-county address without exposing its data', () => {
  const proof = issueDeliveryProof(input, privateKey);
  assert.match(proof, /^v1\.2026-11-13\.[A-Za-z0-9_-]{86}$/);
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(verifyDeliveryProof(proof, input, key), true);
  assert.equal(verifyDeliveryProof(proof, { ...input, address: { ...address, address1: '  110   e la habra boulevard   ' } }, key), true);
});

test('a different address within ZIP 90631, edits to unit and directional, and stale approvals fail', () => {
  const proof = issueDeliveryProof(input, privateKey);
  for (const change of [
    { address1: '1245 N Hacienda Road', city: 'La Habra Heights' },
    { address1: '110 W La Habra Boulevard' },
    { address2: 'Unit 2' }, { zip: '90631-0000' },
  ]) assert.equal(verifyDeliveryProof(proof, { ...input, address: { ...address, ...change } }, key), false);
  assert.equal(verifyDeliveryProof(proof, { ...input, pacificDate: '2026-11-14' }, key), false);
});

test('missing county evidence, unapproved data, invalid credentials and modified proofs fail closed', () => {
  assert.equal(issueDeliveryProof({ ...input, verifiedCounty: 'review' }, privateKey), null);
  assert.equal(issueDeliveryProof({ ...input, verifiedCounty: 'outside-orange-county' }, privateKey), null);
  assert.equal(issueDeliveryProof({ ...input, pacificDate: '2026-02-30' }, privateKey), null);
  assert.equal(issueDeliveryProof(input, 'not-a-key'), null);
  assert.equal(issueDeliveryProof(input, publicKey), null);
  assert.equal(deliveryVerificationKey(privateKey), null);
  assert.equal(canonicalDeliveryAddress({ ...address, countryCode: 'CA' }), null);
  assert.equal(canonicalDeliveryAddress({ ...address, address1: '110 E\nLA HABRA' }), null);
  const proof = issueDeliveryProof(input, privateKey);
  const edited = proof.slice(0, 15) + (proof[15] === 'A' ? 'B' : 'A') + proof.slice(16);
  for (const invalid of [edited, proof + '.', 'v1.2026-11-13.' + 'a'.repeat(87), undefined]) {
    assert.equal(verifyDeliveryProof(invalid, input, key), false);
  }
  assert.equal(verifyDeliveryProof(proof, input, deliveryVerificationKey(generateKeyPairSync('ed25519').publicKey)), false);
  assert.equal(verifyDeliveryProof(proof, input, key + '='), false);
});
