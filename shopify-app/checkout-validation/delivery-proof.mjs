import { createPublicKey, sign, verify } from 'node:crypto';
import { serviceWeekForPacificDate } from './rules.mjs';

export const deliveryProofAttribute = '_pit_county_approval_v1';
const b64url = /^[A-Za-z0-9_-]+$/;
const publicKeyPrefix = Buffer.from('302a300506032b6570032100', 'hex'); // RFC 8410 Ed25519 SPKI
const shopDomain = 'thyme-time-store-brreo.myshopify.com';

function field(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
}

// Do not drop directionals, house numbers or unit information. When Shopify
// standardizes a street differently, require a new check rather than guessing.
export function canonicalDeliveryAddress(address) {
  const country = field(address?.countryCode, 2);
  const province = field(address?.provinceCode, 2);
  const street = field(address?.address1, 150);
  const unit = field(address?.address2 ?? '', 80);
  const city = field(address?.city, 90);
  const postal = field(address?.zip, 10);
  if (country !== 'US' || province !== 'CA' || !street || unit === null || !city || !/^\d{5}(?:-\d{4})?$/.test(postal ?? '')) return null;
  return [street, unit, city, province, postal, country];
}

function signedMessage(address, pacificDate) {
  const normalized = canonicalDeliveryAddress(address);
  const service = serviceWeekForPacificDate(pacificDate);
  if (!normalized || !service) return null;
  return Buffer.from(JSON.stringify(['pit-county-v1', shopDomain, '06059', pacificDate, service.date, ...normalized]), 'utf8');
}

function decodeCanonical(value, size) {
  if (typeof value !== 'string' || value.length !== Math.ceil(size * 4 / 3) || !b64url.test(value)) return null;
  const raw = Buffer.from(value, 'base64url');
  return raw.length === size && raw.toString('base64url') === value ? raw : null;
}

export function deliveryVerificationKey(publicKey) {
  if (publicKey?.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') return null;
  const exported = publicKey.export({ format: 'jwk' });
  return decodeCanonical(exported.x, 32) ? exported.x : null;
}

/**
 * Only call after checking the exact normalized address against a trusted
 * county source. Caller cannot accept the county as a shopper-provided value.
 * The token contains no address or coordinates. It cannot be used for a
 * different address or day, and it is not a checkout or billing credential.
 */
export function issueDeliveryProof({ address, pacificDate, verifiedCounty }, privateKey) {
  const message = signedMessage(address, pacificDate);
  if (verifiedCounty !== 'verified-orange-county' || !message
    || privateKey?.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') return null;
  return `v1.${pacificDate}.${sign(null, message, privateKey).toString('base64url')}`;
}

// The Shopify rule only needs the public verification key. The private key is
// never part of the cart, rule configuration, app bundle or test fixture data.
export function verifyDeliveryProof(token, { address, pacificDate }, publicKey) {
  if (typeof token !== 'string' || token.length !== 100) return false;
  const [version, issuedDate, signature] = token.split('.');
  if (version !== 'v1' || issuedDate !== pacificDate) return false;
  const rawSignature = decodeCanonical(signature, 64);
  const rawKey = decodeCanonical(publicKey, 32);
  const message = signedMessage(address, pacificDate);
  if (!rawSignature || !rawKey || !message) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([publicKeyPrefix, rawKey]), format: 'der', type: 'spki' });
    return verify(null, message, key, rawSignature);
  } catch {
    return false;
  }
}
