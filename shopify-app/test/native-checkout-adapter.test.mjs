import test from 'node:test';
import { strict as assert } from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import { deliveryVerificationKey, issueDeliveryProof, verifyDeliveryProof } from '../checkout-validation/delivery-proof.mjs';
import { issueServiceProof, verifyServiceProof } from '../checkout-validation/service-proof.mjs';
import { serviceWeekForPacificDate } from '../checkout-validation/rules.mjs';
import { shopifyCheckoutResult } from '../checkout-validation/shopify-adapter.mjs';

const date = '2026-11-13';
const week = serviceWeekForPacificDate(date);
const { privateKey, publicKey } = generateKeyPairSync('ed25519'); // Ephemeral test keys.
const serviceKeys = generateKeyPairSync('ed25519');
const quoteId = 'a'.repeat(48);
const address = { address1: '110 E La Habra Boulevard', address2: '', city: 'La Habra', provinceCode: 'CA', countryCode: 'US', zip: '90631' };
const outside = { ...address, address1: '1245 N Hacienda Road', city: 'La Habra Heights' };
const planId = id => `gid://shopify/SellingPlan/${id}`;
const variantId = id => `gid://shopify/ProductVariant/${id}`;
const plans = { meal: planId(1), weeklyJuice: planId(2), retiredPrepaid: planId(3) };
const catalog = {
  [variantId(11)]: { mealWeeks: [week.mealWeek] },
  [variantId(12)]: { type: 'juice', retailUnitCents: 13499 },
  [variantId(13)]: { type: 'tea', retailUnitCents: 300 },
};

const money = (cents, currencyCode = 'USD') => ({ amount: (cents / 100).toFixed(2), currencyCode });
function line({ unit, total, id = 14, plan, quantity = 1, group = 'a', currency = 'USD' }) {
  return {
    quantity, deliveryGroups: [{ id: group }], merchandise: { id: variantId(id) },
    mealReference: plan === plans.meal ? { value: quoteId } : null,
    juiceReference: plan === plans.weeklyJuice ? { value: quoteId } : null,
    cost: { amountPerQuantity: money(unit, currency), totalAmount: money(total ?? unit * quantity, currency), discountAllocations: [] },
    sellingPlanAllocation: plan ? { sellingPlan: { id: plan } } : null,
  };
}

const group = (id, deliveryAddress = address, deliveryMethodType = 'LOCAL') => ({ id, deliveryAddress, selectedDeliveryOption: { deliveryMethodType } });
const approve = address => issueDeliveryProof({ address, pacificDate: date, verifiedCounty: 'verified-orange-county' }, privateKey);
function approveService(input) {
  const lines = input.cart.lines.flatMap(item => {
    const planId = item.sellingPlanAllocation?.sellingPlan?.id;
    if (planId !== plans.meal && planId !== plans.weeklyJuice) return [];
    return [{ planId, quoteId: (planId === plans.meal ? item.mealReference : item.juiceReference)?.value, variantId: item.merchandise.id,
      quantity: item.quantity, paidUnitCents: Math.round(Number(item.cost.amountPerQuantity.amount) * 100) }];
  });
  return issueServiceProof({ pacificDate: input.shop.localTime.date, firstServiceDate: input.cart.serviceWeek.value, lines }, serviceKeys.privateKey);
}
function checkout(lines, deliveryGroups, proof = approve(address)) {
  const input = {
    buyerJourney: { step: 'CHECKOUT_COMPLETION' }, shop: { localTime: { date } },
    validation: { metafield: { jsonValue: { plans, catalog, addressVerificationKey: deliveryVerificationKey(publicKey),
      serviceVerificationKey: serviceKeys.publicKey.export({ format: 'jwk' }).x } } },
    cart: { lines, deliveryGroups, countyApproval: { value: proof }, serviceWeek: { value: week.date } },
  };
  input.cart.serviceApproval = { value: approveService(input) };
  return input;
}

const run = input => shopifyCheckoutResult(input, verifyDeliveryProof, verifyServiceProof);
const errors = result => {
  const list = result.operations[0]?.validationAdd.errors ?? [];
  assert.ok(list.every(error => error.target === '$.cart' && typeof error.message === 'string'));
  return list.map(error => error.message);
};
const delivery = /verify this exact Orange County/;
const recurring = /at least \$99 in recurring products/;
const fulfillment = /eligible Orange County local delivery/;

test('exact-address approval is checked for every selected local-delivery group', () => {
  const lines = [line({ unit: 9900, plan: planId(4) }), line({ unit: 300, id: 13, group: 'b' })];
  assert.deepEqual(run(checkout(lines, [group('a'), group('b')])), { operations: [] });
  assert.match(errors(run(checkout(lines, [group('a'), group('b', outside)])))[0], delivery);
  assert.match(errors(run(checkout(lines, [group('a', outside), group('b', outside)])))[0], delivery);
  assert.match(errors(run(checkout(lines, [group('a'), group('b')], 'v1.forged')))[0], delivery);
  assert.match(errors(shopifyCheckoutResult(checkout(lines, [group('a'), group('b')])))[0], delivery);
  assert.match(errors(shopifyCheckoutResult(checkout(lines, [group('a'), group('b')]), () => { throw new Error('Unavailable'); }))[0], delivery);
});

test('ordinary one-time local delivery still requires county approval, but ordinary pickup needs none', () => {
  const lines = [line({ unit: 9900 })];
  assert.deepEqual(run(checkout(lines, [group('a')])), { operations: [] });
  assert.match(errors(run(checkout(lines, [group('a', outside)])))[0], delivery);
  assert.deepEqual(run(checkout(lines, [group('a', null, 'PICK_UP')], null)), { operations: [] });
});

test('direct one-time and fixed-bundle checkouts use the store cutoff for delivery and pickup', () => {
  const closed = /closes Friday at 11:59 PM Pacific and reopens Monday/;
  for (const plan of [undefined, planId(4)]) {
    for (const fulfillment of [group('a'), group('a', null, 'PICK_UP')]) {
      const input = checkout([line({ unit: 9900, plan })], [fulfillment]);
      delete input.cart.serviceWeek;

      for (const [friday, saturday, sunday, monday] of [
        ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
        ['2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06'],
      ]) {
        for (const [storeDate, allowed] of [[friday, true], [saturday, false], [sunday, false], [monday, true], [undefined, false]]) {
          input.shop.localTime.date = storeDate;
          if (allowed) assert.deepEqual(shopifyCheckoutResult(input, () => true), { operations: [] });
          else assert.match(errors(shopifyCheckoutResult(input, () => true))[0], closed);
        }
      }
    }
  }
});

test('delivery uses recurring prices only and fails closed on inconsistent line totals', () => {
  const tea = line({ unit: 300, id: 13 });
  const intro = line({ unit: 9499, plan: planId(4) });
  const near = line({ unit: 9899, plan: planId(4) });
  assert.match(errors(run(checkout([near, tea], [group('a')])))[0], recurring);
  assert.deepEqual(run(checkout([line({ unit: 3300, quantity: 3, plan: planId(4) }), tea], [group('a')])), { operations: [] });
  const mismatch = line({ unit: 9900, total: 9899, plan: planId(4) });
  const mismatchErrors = errors(run(checkout([mismatch, tea], [group('a')])));
  assert.match(mismatchErrors[0], /recurring price could not be verified/);
  assert.match(mismatchErrors[1], recurring);
  const discounted = line({ unit: 9900, plan: planId(4) });
  discounted.cost.discountAllocations = [{ discountApplication: { targetType: 'LINE_ITEM' } }];
  assert.match(errors(run(checkout([discounted, tea], [group('a')])))[0], /recurring price could not be verified/);
  assert.deepEqual(run(checkout([intro, tea], [group('a', null, 'PICK_UP')], null)), { operations: [] });
});

test('checkout uses actual plan IDs, catalog, service week and amounts for meal and juice', () => {
  const pickup = [group('a', null, 'PICK_UP')];
  const meal = line({ unit: 1650, id: 11, plan: plans.meal, quantity: 6 });
  assert.deepEqual(run(checkout([meal], pickup, null)), { operations: [] });
  assert.match(errors(run(checkout([line({ unit: 9899, id: 11, plan: plans.meal }), line({ unit: 1000 })], pickup)))[0], /at least \$99/);
  assert.match(errors(run(checkout([line({ unit: 12000, plan: plans.meal })], pickup)))[0], /not on the menu/);
  const stale = checkout([meal], pickup);
  stale.shop.localTime.date = '2026-11-14';
  assert.match(errors(run(stale))[0], /service week has changed/);
  const tea = line({ unit: 300, id: 13 });
  assert.deepEqual(run(checkout([line({ unit: 12149, id: 12, plan: plans.weeklyJuice }), tea], pickup)), { operations: [] });
  const weekend = checkout([line({ unit: 12149, id: 12, plan: plans.weeklyJuice }), tea], pickup);
  weekend.shop.localTime.date = '2026-11-14';
  assert.match(errors(run(weekend))[0], /service week has changed/);
  weekend.cart.serviceWeek.value = '2026-11-23';
  assert.match(errors(run(weekend))[0], /fresh service-week review/);
  weekend.cart.lines[0].juiceReference.value = 'b'.repeat(48);
  weekend.cart.serviceApproval.value = approveService(weekend);
  assert.deepEqual(run(weekend), { operations: [] });
  const altered = checkout([line({ unit: 13499, id: 12, plan: plans.weeklyJuice }), tea], pickup);
  assert.match(errors(run(altered))[0], /juice or its price does not match/);
  assert.match(errors(run(checkout([line({ unit: 12149, id: 12, plan: plans.retiredPrepaid })], pickup)))[0], /paid weekly/);
});

test('custom cutoff proof requires a trusted signature for the exact recurring plan, reference, quantities and prices', () => {
  const pickup = [group('a', null, 'PICK_UP')];
  const fresh = () => checkout([line({ unit: 1650, id: 11, plan: plans.meal, quantity: 6 })], pickup, null);
  assert.deepEqual(run(fresh()), { operations: [] });
  for (const mutate of [
    input => { delete input.cart.serviceApproval; },
    input => { input.cart.serviceApproval.value = 'v1.' + 'A'.repeat(86); },
    input => { input.cart.lines[0].mealReference.value = 'b'.repeat(48); },
    input => { input.cart.lines[0].quantity = 7; input.cart.lines[0].cost.totalAmount = money(11550); },
    input => { input.cart.lines[0].cost.amountPerQuantity = money(1700); input.cart.lines[0].cost.totalAmount = money(10200); },
    input => { input.validation.metafield.jsonValue.serviceVerificationKey = deliveryVerificationKey(publicKey); },
  ]) {
    const input = fresh();
    mutate(input);
    assert.ok(errors(run(input)).some(error => /fresh service-week review/.test(error)));
  }
  assert.match(errors(shopifyCheckoutResult(fresh(), verifyDeliveryProof))[0], /fresh service-week review/);
  assert.match(errors(shopifyCheckoutResult(fresh(), verifyDeliveryProof, () => { throw new Error('Unavailable'); }))[0], /fresh service-week review/);
});

test('fresh quotes for the next Monday survive cart line reordering but cannot be reassigned to a stale quote', () => {
  const friday = '2026-11-20';
  const saturday = '2026-11-21';
  const start = { variantId: variantId(12), planId: plans.weeklyJuice, quoteId, paidUnitCents: 700, quantity: 2 };
  const more = { ...start, variantId: variantId(19), paidUnitCents: 900 };
  const previous = { firstServiceDate: '2026-11-23', pacificDate: friday, lines: [start, more] };
  const oldProof = issueServiceProof(previous, serviceKeys.privateKey);
  const publicKey = serviceKeys.publicKey.export({ format: 'jwk' }).x;
  assert.ok(oldProof);
  assert.equal(verifyServiceProof(oldProof, previous, publicKey), true);
  assert.equal(verifyServiceProof(oldProof, { ...previous, pacificDate: saturday }, publicKey), false);

  const next = { firstServiceDate: '2026-11-30', pacificDate: saturday, lines: [start, more].map(line => ({ ...line, quoteId: 'b'.repeat(48) })) };
  const nextProof = issueServiceProof(next, serviceKeys.privateKey);
  assert.ok(nextProof);
  assert.equal(verifyServiceProof(nextProof, { ...next, pacificDate: '2026-11-27', lines: [...next.lines].reverse() }, publicKey), true);
  assert.equal(verifyServiceProof(nextProof, { ...next, lines: previous.lines }, publicKey), false);
  assert.equal(verifyServiceProof(nextProof, { ...next, lines: [next.lines[0], next.lines[0]] }, publicKey), false);
});

test('unknown, missing or mixed delivery methods are rejected only when checkout is submitted', () => {
  const lines = [line({ unit: 9900, group: 'a' })];
  for (const groups of [[], [group('b')], [group('a'), group('a')], [group('a', address, 'SHIPPING')],
    [{ id: 'a', selectedDeliveryOption: null }], [group('a'), group('b', null, 'PICK_UP')]]) {
    const input = checkout(lines, groups);
    assert.match(errors(run(input))[0], fulfillment);
    input.buyerJourney.step = 'CHECKOUT_INTERACTION';
    assert.deepEqual(run(input), { operations: [] });
  }
  const input = checkout(lines, [group('a')]);
  input.validation.metafield.jsonValue.catalog = null;
  assert.match(errors(run(input))[0], /store configuration check/);
});
