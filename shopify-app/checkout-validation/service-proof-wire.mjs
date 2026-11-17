// Shared, deterministic service proof input for the issuer and native runtime.
// All fields are ASCII by construction; no Node or browser host APIs required.
import { serviceWeekForPacificDate } from './rules.mjs';

const shopDomain = 'thyme-time-store-brreo.myshopify.com';
const quotePattern = /^[a-f0-9]{48}$/;
const planPattern = /^gid:\/\/shopify\/SellingPlan\/\d+$/;
const variantPattern = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function decodeProofBytes(value, length) {
  if (typeof value !== 'string' || value.length !== Math.ceil(length * 4 / 3)) return null;
  const bytes = new Uint8Array(length);
  let index = 0;
  let pending = 0;
  let bits = 0;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return null;
    pending = (pending << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = pending >> bits;
      pending &= (1 << bits) - 1;
    }
  }
  return index === length && pending === 0 ? bytes : null;
}

export function serviceApprovalBytes(approval) {
  const { firstServiceDate, lines, pacificDate } = approval ?? {};
  if (serviceWeekForPacificDate(pacificDate)?.date !== firstServiceDate || typeof firstServiceDate !== 'string'
    || !Array.isArray(lines) || !lines.length || lines.length > 50) return null;
  const { quoteId, planId } = lines[0] || {};
  if (typeof quoteId !== 'string' || !quotePattern.test(quoteId) || typeof planId !== 'string' || !planPattern.test(planId)) return null;
  const items = new Map();
  for (const line of lines) {
    if (!line || line.quoteId !== quoteId || line.planId !== planId || typeof line.variantId !== 'string' || !variantPattern.test(line.variantId)
      || items.has(line.variantId) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
      || !Number.isSafeInteger(line.paidUnitCents) || line.paidUnitCents <= 0
      || !Number.isSafeInteger(line.paidUnitCents * line.quantity)) return null;
    items.set(line.variantId, [line.variantId, line.quantity, line.paidUnitCents]);
  }
  const text = JSON.stringify(['pit-service-v1', shopDomain, firstServiceDate, quoteId, planId,
    [...items.keys()].sort().map(id => items.get(id))]);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
