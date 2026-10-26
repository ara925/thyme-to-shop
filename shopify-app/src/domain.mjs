import { createHmac, timingSafeEqual } from 'node:crypto';

export const SHOP = 'thyme-time-store-brreo.myshopify.com';
export const CLIENT_ID = '7d9a72b3188adb3a745370a1768b751d';
export const ORIGIN = 'https://shop.placeinthyme.com';
export const PICKUP_LOCATION_ID = 'gid://shopify/Location/111856681258';
export const WEEKS = ['week-a', 'week-b', 'week-c'];
export const ZONE = 'America/Los_Angeles';
export const SCOPES = ['write_products', 'write_purchase_options', 'write_own_subscription_contracts'];
export class ReviewRequiredError extends Error {}
export function assert(condition, message) { if (!condition) throw new ReviewRequiredError(message); }
export function cents(value) {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(value), 'Invalid USD price.');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function amount(value) { assert(Number.isSafeInteger(value) && value >= 0, 'Invalid cents.'); return (value / 100).toFixed(2); }
export function localDay(value) { return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
const dayNumber = day => Date.parse(`${day}T00:00:00Z`) / 86400000;
export const addDays = (day, days) => new Date((dayNumber(day) + days) * 86400000).toISOString().slice(0, 10);
export function weekAt(value) { const index = Math.floor((dayNumber(localDay(value)) - dayNumber('2026-03-16')) / 7); return WEEKS[((index % 3) + 3) % 3]; }
export function pacificTime(day, hour = 9) {
  const probe = new Date(`${day}T12:00:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'shortOffset' }).formatToParts(probe).find(part => part.type === 'timeZoneName').value;
  assert(/^GMT-0?[78]$/.test(offset), 'Pacific offset unavailable.');
  return `${day}T${String(hour).padStart(2, '0')}:00:00-0${offset.slice(4)}:00`;
}
export function firstServiceDate(now = Date.now()) {
  const today = localDay(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return pacificTime(addDays(today, ((8 - weekday) % 7 || 7) + (weekday === 6 || weekday === 0 ? 7 : 0)));
}
export const nextServiceDate = date => pacificTime(addDays(localDay(date), 7));
export function nextBillingDate(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return pacificTime(addDays(localDay(value), 7), Number(parts.hour)).replace(':00:00-', `:${parts.minute}:${parts.second}-`);
}
export const serviceCutoff = date => Date.parse(pacificTime(addDays(localDay(date), -2), 0));
export function validateSelections(selections, catalog) {
  assert(selections && typeof selections === 'object' && !Array.isArray(selections)
    && Object.keys(selections).length === 3 && WEEKS.every(week => Object.hasOwn(selections, week)), 'Choose all three menus.');
  return Object.fromEntries(WEEKS.map(week => {
    const selected = selections[week];
    assert(selected && typeof selected === 'object' && !Array.isArray(selected), 'Invalid menu.');
    const entries = Object.entries(selected);
    assert(entries.length > 0 && entries.length <= 50, 'Every menu needs meals.');
    let subtotalCents = 0;
    const lines = entries.map(([variantId, quantity]) => {
      assert(/^gid:\/\/shopify\/ProductVariant\/[0-9]+$/.test(variantId) && Number.isInteger(quantity) && quantity >= 1 && quantity <= 50, 'Invalid meal quantity.');
      const meal = catalog[variantId];
      assert(meal && meal.type === 'Meal' && meal.status === 'ACTIVE' && meal.currency === 'USD' && meal.available && !meal.requiresComponents && meal.tags.includes(week), 'Meal unavailable or in another menu.');
      const priceCents = cents(meal.price); assert(priceCents > 0, 'Invalid meal price.');
      subtotalCents += quantity * priceCents;
      return { variantId, quantity, priceCents, title: meal.title };
    });
    assert(subtotalCents >= 12000 && subtotalCents <= 1000000, 'Each menu must be $120–$10,000.');
    return [week, { subtotalCents, lines }];
  }));
}
export function validateUnchanged(weeks, catalog) {
  const selections = Object.fromEntries(WEEKS.map(week => [week, Object.fromEntries(weeks[week].lines.map(line => [line.variantId, line.quantity]))]));
  const live = validateSelections(selections, catalog);
  for (const week of WEEKS) assert(live[week].lines.every((line, index) => line.priceCents === weeks[week].lines[index].priceCents), 'Prices changed; customer approval required.');
}
export function matchLines(expected, actual = []) {
  if (!expected?.length || actual.length !== expected.length || new Set(actual.map(line => line.variantId)).size !== actual.length) return false;
  return expected.every(wanted => actual.some(line => line.variantId === wanted.variantId && line.quantity === wanted.quantity
    && line.currentPrice?.currencyCode === 'USD' && cents(line.currentPrice.amount) === wanted.priceCents));
}
function sorted(value) { return Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value; }
export const fingerprint = (value, key) => createHmac('sha256', key).update(JSON.stringify(sorted(value))).digest('hex');
export function assertLocal(contract, { billingIntervalCount = 1 } = {}) {
  const method = contract.deliveryMethod;
  const kind = method?.__typename;
  const expected = { SubscriptionDeliveryMethodPickup: 0, SubscriptionDeliveryMethodLocalDelivery: 1500 };
  assert(Object.hasOwn(expected, kind) && contract.deliveryPrice?.currencyCode === 'USD' && cents(contract.deliveryPrice.amount) === expected[kind], 'Only free pickup or $15 native local delivery is supported.');
  if (kind === 'SubscriptionDeliveryMethodPickup') assert(method.pickupOption?.location?.id === PICKUP_LOCATION_ID, 'Pickup must use the approved Place in Thyme location.');
  else {
    const address = method.address;
    assert(address?.countryCodeV2 === 'US' && address.provinceCode === 'CA' && address.address1 && address.city && /^\d{5}(?:-\d{4})?$/.test(address.zip), 'Native local-delivery address needs review.');
  }
  assert(contract.billingPolicy?.interval === 'WEEK' && contract.billingPolicy.intervalCount === billingIntervalCount
    && contract.deliveryPolicy?.interval === 'WEEK' && contract.deliveryPolicy.intervalCount === 1, 'The approved billing interval and weekly delivery are required.');
}
export function assertReviewedFulfillment(contract, selection) {
  const pickup = selection?.method === 'pickup' && selection.window === 'monday-after-9am';
  const delivery = selection?.method === 'delivery' && ['monday', 'tuesday'].includes(selection.window);
  assert(pickup || delivery, 'The reviewed local fulfillment choice is missing or invalid.');
  assert(contract.deliveryMethod?.__typename === (pickup ? 'SubscriptionDeliveryMethodPickup' : 'SubscriptionDeliveryMethodLocalDelivery'),
    'Shopify fulfillment differs from the reviewed choice; manual reconciliation is required.');
}
export function assertCalculation(calculation, week, contract) {
  assert(calculation.__typename === 'SubscriptionContractCalculationSuccess' && !calculation.warnings?.length, 'Calculation needs review.');
  const snapshot = calculation.calculatedContract; assertLocal(snapshot);
  assert(snapshot.currencyCode === 'USD' && !snapshot.discounts?.nodes?.length && !snapshot.lines?.pageInfo?.hasNextPage
    && matchLines(week.lines, snapshot.lines?.nodes) && JSON.stringify(sorted(snapshot.deliveryMethod)) === JSON.stringify(sorted(contract.deliveryMethod)), 'Calculated contract differs from approval.');
  for (const [key, expected] of Object.entries({ subtotal: week.subtotalCents, totalDelivery: cents(contract.deliveryPrice.amount), totalMerchandiseDiscounts: 0 })) {
    const money = calculation.projectedOrderTotals?.[key]; assert(money?.currencyCode === 'USD' && cents(money.amount) === expected, 'Calculated totals differ from approval.');
  }
}
export function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
export function validWebhook(body, signature, shop, secret) {
  return Boolean(secret) && shop === SHOP && equalSecret(signature, createHmac('sha256', secret).update(body).digest('base64'));
}
export function validOauth(params, secret, now = Date.now()) {
  if (!secret || params.get('shop') !== SHOP || !Number.isFinite(Number(params.get('timestamp'))) || Math.abs(now / 1000 - Number(params.get('timestamp'))) > 300 || !params.get('timestamp')) return false;
  if (new Set([...params.keys()]).size !== [...params.keys()].length) return false;
  const fields = [...params].filter(([key]) => key !== 'hmac' && key !== 'signature');
  if (new Set(fields.map(([key]) => key)).size !== fields.length) return false;
  const message = fields.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
  return equalSecret(params.get('hmac'), createHmac('sha256', secret).update(message).digest('hex'));
}
export function validSessionToken(token, secret, now = Date.now()) {
  try {
    const [head, body, signature, extra] = token.split('.'); if (extra || !secret) return false;
    const header = JSON.parse(Buffer.from(head, 'base64url')); const payload = JSON.parse(Buffer.from(body, 'base64url'));
    return header.alg === 'HS256' && payload.aud === CLIENT_ID && payload.dest === `https://${SHOP}`
      && payload.iss === `https://${SHOP}/admin` && Number.isFinite(payload.exp) && Number.isFinite(payload.nbf)
      && Number.isFinite(payload.iat) && payload.exp > now / 1000 && payload.nbf <= now / 1000 + 10
      && payload.iat <= now / 1000 + 10 && payload.exp - payload.iat <= 300
      && equalSecret(signature, createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url'));
  } catch { return false; }
}
