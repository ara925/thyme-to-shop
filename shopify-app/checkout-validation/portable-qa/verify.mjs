// Local checkout runtime qualification only; do not include signing keys or
// add this directory to the application release package.
import { hashes, verify } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { decodeProofBytes, serviceApprovalBytes } from '../service-proof-wire.mjs';
import { shopifyCheckoutResult } from '../shopify-adapter.mjs';

hashes.sha512 = sha512;

export function verifyPortableServiceProof(token, approval, publicKey) {
  if (typeof token !== 'string' || token.length !== 89 || !token.startsWith('v1.')) return false;
  const signature = decodeProofBytes(token.slice(3), 64);
  const key = decodeProofBytes(publicKey, 32);
  const message = serviceApprovalBytes(approval);
  if (!signature || !key || !message) return false;
  try {
    return verify(signature, message, key, { zip215: false }) === true;
  } catch {
    return false;
  }
}

// Only for the local cutoff probe. Delivery still fails closed because this
// probe is not an address verifier or a production checkout configuration.
export function qualifyCutoffInProbe(input) {
  return shopifyCheckoutResult(input, undefined, verifyPortableServiceProof);
}
