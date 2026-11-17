// Reference verifier for the future native checkout adapter. No production
// issuer, Shopify installation, or live key is created by this module.
import { createPublicKey, sign, verify } from 'node:crypto';
import { decodeProofBytes, serviceApprovalBytes } from './service-proof-wire.mjs';

const publicKeyPrefix = Buffer.from('302a300506032b6570032100', 'hex');

// Call only with server-reviewed quote data, never cart input from a shopper.
// The proof remains valid only for the intended week, reference and exact lines.
export function issueServiceProof(approval, privateKey) {
  const bytes = serviceApprovalBytes(approval);
  if (!bytes || privateKey?.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') return null;
  return `v1.${sign(null, bytes, privateKey).toString('base64url')}`;
}

export function verifyServiceProof(token, approval, publicKey) {
  if (typeof token !== 'string' || !token.startsWith('v1.')) return false;
  const signature = decodeProofBytes(token.slice(3), 64);
  const rawKey = decodeProofBytes(publicKey, 32);
  const bytes = serviceApprovalBytes(approval);
  if (!signature || !rawKey || !bytes) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([publicKeyPrefix, rawKey]), format: 'der', type: 'spki' });
    return verify(null, bytes, key, signature);
  } catch {
    return false;
  }
}
