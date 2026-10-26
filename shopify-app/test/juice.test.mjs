import test from 'node:test';
import { strict as assert } from 'node:assert';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { JuiceWorker } from '../src/juice-worker.mjs';
import { createApplication } from '../src/server.mjs';
import { Shopify, ShopifyRequestError } from '../src/shopify.mjs';
import { SHOP, ORIGIN, PICKUP_LOCATION_ID, amount, fingerprint } from '../src/domain.mjs';
import { validateJuiceSelection, unchangedJuiceMix, juicePlanInput, validateJuicePlans, cancellationTarget, advanceJuiceBilling } from '../src/juice-domain.mjs';
import { juiceCheckoutInput, verifyJuiceCart, SubscriptionCheckout } from '../src/checkout.mjs';

const key = Buffer.alloc(32, 11).toString('base64');
const juiceId = 'gid://shopify/ProductVariant/100'; const teaId = 'gid://shopify/ProductVariant/200';
const catalog = { minimumCents: 13499, items: { [juiceId]: { id: juiceId, type: 'Juice', status: 'ACTIVE', currency: 'USD', title: 'TEST-ONLY Green Juice', price: '15.00', available: true, requiresComponents: false } },
  tea: { id: teaId, type: 'Juice', status: 'ACTIVE', currency: 'USD', title: 'Hibiscus Tea (Sweetened)', price: '3.00', available: true, requiresComponents: false } };
const plans = { weekly: 'gid://shopify/SellingPlan/1001', prepaid: 'gid://shopify/SellingPlan/1002' };
const input = mode => ({ selections: { [juiceId]: 9 }, billingPreference: mode, teaQuantity: 2 });
const mixFor = mode => validateJuiceSelection(input(mode), catalog);
const gates = Object.fromEntries(['billing', 'checkout', 'fulfillment', 'storefront', 'launch', 'persistentStorage', 'juice'].map(gate => [gate, true]));
const initialNow = Date.parse('2026-10-26T16:00:00Z'); const firstService = '2026-11-02T09:00:00-08:00';
function ready(store, now) { store.setSetting('verifiedAt', now); store.setSetting('juiceVerifiedAt', now); store.setSetting('juicePlanIds', plans); store.setSetting('webhooks', ['a', 'b', 'c']); store.setSetting('heartbeat', now); }
function contractFor(mode, id, now = initialNow) {
  const mix = mixFor(mode); const next = advanceJuiceBilling(new Date(now).toISOString(), mode);
  return { id: 'gid://shopify/SubscriptionContract/100', status: 'ACTIVE', currencyCode: 'USD', revisionId: '1', nextBillingDate: next,
    billingPolicy: { interval: 'WEEK', intervalCount: mode === 'prepaid' ? 4 : 1 }, deliveryPolicy: { interval: 'WEEK', intervalCount: 1 },
    deliveryMethod: { __typename: 'SubscriptionDeliveryMethodPickup', pickupOption: { code: 'pickup', location: { id: PICKUP_LOCATION_ID } } }, deliveryPrice: { amount: '0.00', currencyCode: 'USD' },
    customerPaymentMethod: { id: 'gid://shopify/CustomerPaymentMethod/1' }, discounts: { nodes: [] }, originOrder: { id: 'gid://shopify/Order/1', displayFinancialStatus: 'PAID' },
    lines: { pageInfo: { hasNextPage: false }, nodes: mix.lines.map(line => ({ variantId: line.variantId, quantity: line.quantity, currentPrice: { amount: amount(line.priceCents), currencyCode: 'USD' }, sellingPlanId: plans[mode], customAttributes: [{ key: '_pit_juice_id', value: id }] })) } };
}
function fixture(mode = 'weekly') {
  const store = new Store(':memory:', key); ready(store, initialNow); const mix = mixFor(mode);
  const id = store.create({ kind: 'juice', mix, firstServiceDate: firstService, checkoutFulfillment: { method: 'pickup', window: 'monday-after-9am' }, expiresAt: initialNow + 1800000, paidWeeks: 0 }, 'b'.repeat(64));
  const contract = contractFor(mode, id); return { store, id, mix, contract };
}
test('juice weekly and four-week-prepaid quotes use the same mix and exactly one first-order tea add-on', () => {
  const weekly = mixFor('weekly'); const prepaid = mixFor('prepaid');
  assert.equal(weekly.retailSubtotalCents, 13500); assert.equal(weekly.subtotalCents, 12150); assert.equal(weekly.firstSubtotalCents, 12750);
  assert.equal(prepaid.subtotalCents, 12150); assert.equal(prepaid.firstSubtotalCents, 49200); assert.equal(prepaid.fourWeekSubtotalCents, 48600);
  assert.equal(prepaid.oneTimeAddOn.subtotalCents, 600); assert.equal(prepaid.lines.some(line => line.variantId === teaId), false);
});
test('10% USD unit rounding is deterministic and native checkout must subsequently agree', () => {
  const changed = structuredClone(catalog); changed.items[juiceId].price = '4.99';
  const mix = validateJuiceSelection({ ...input('weekly'), selections: { [juiceId]: 28 }, teaQuantity: 0 }, changed);
  assert.equal(mix.lines[0].priceCents, 449); assert.equal(mix.subtotalCents, 12572);
});
for (const change of [value => { value.selections[juiceId] = 8; }, value => { value.teaQuantity = 51; }, value => { value.billingPreference = 'monthly'; }, value => { value.selections[juiceId] = 9.5; }, value => { value.discountPercent = 99; }]) test('malformed juice enrollment or a below-minimum mix fails closed', () => { const value = input('weekly'); change(value); assert.throws(() => validateJuiceSelection(value, catalog)); });
test('tea cannot pad the $134.99 minimum, receive a discount or become a subscription line', () => {
  assert.throws(() => validateJuiceSelection({ ...input('weekly'), selections: { [juiceId]: 8 }, teaQuantity: 50 }, catalog));
  assert.throws(() => validateJuiceSelection({ ...input('weekly'), selections: { [teaId]: 50 } }, { ...catalog, items: { [teaId]: catalog.tea } }));
  const changed = structuredClone(catalog); changed.tea.price = '2.99'; assert.throws(() => validateJuiceSelection(input('prepaid'), changed));
  assert.throws(() => validateJuiceSelection(input('weekly'), { ...catalog, items: { [juiceId]: { ...catalog.items[juiceId], title: 'Hibiscus Tea Add-On' } } }));
});
test('a changed juice retail price or minimum cannot silently change a saved contract', () => {
  const changed = structuredClone(catalog); changed.items[juiceId].price = '16.00'; assert.throws(() => unchangedJuiceMix(mixFor('weekly'), changed));
  assert.throws(() => validateJuiceSelection(input('weekly'), { ...catalog, minimumCents: 10000 }));
});
function nativeGroup() {
  return { merchantCode: 'pit-custom-juice-four-week-v1', sellingPlans: { pageInfo: { hasNextPage: false }, nodes: ['weekly', 'prepaid'].map(mode => ({ id: plans[mode], category: 'SUBSCRIPTION',
    billingPolicy: { __typename: 'SellingPlanRecurringBillingPolicy', interval: 'WEEK', intervalCount: mode === 'weekly' ? 1 : 4, minCycles: mode === 'weekly' ? 4 : 1, maxCycles: null, anchors: [{ type: 'WEEKDAY', day: 1 }] },
    deliveryPolicy: { __typename: 'SellingPlanRecurringDeliveryPolicy', interval: 'WEEK', intervalCount: 1, cutoff: 2, preAnchorBehavior: 'NEXT', intent: 'FULFILLMENT_BEGIN', anchors: [{ type: 'WEEKDAY', day: 1 }] },
    pricingPolicies: [{ __typename: 'SellingPlanFixedPricingPolicy', adjustmentType: 'PERCENTAGE', adjustmentValue: { percentage: 10 } }] })) } };
}

test('live catalog excludes both Hibiscus records from the recurring minimum', async () => {
  const store = new Store(':memory:', key); const api = new Shopify(store, {});
  const variant = (id, price) => ({ id, price, availableForSale: true, requiresComponents: false });
  const product = (title, productType, item) => ({ title, productType, status: 'ACTIVE', variants: { nodes: [item], pageInfo: { hasNextPage: false } } });
  api.request = async () => ({ shop: { currencyCode: 'USD', ianaTimezone: 'America/Los_Angeles' }, products: { pageInfo: { hasNextPage: false }, nodes: [
    product("Pick n' Choose Bundle", 'Juice Bundle', variant('parent', '134.99')),
    product('Green Cleanse', 'Juice', variant(juiceId, '8.50')),
    product('Hibiscus Tea Add-On', 'Juice', variant('old-tea', '3.00')),
    product('Hibiscus Tea (Sweetened)', 'Juice', variant(teaId, '3.00')),
  ] } });
  try { const live = await api.juiceCatalog(); assert.deepEqual(Object.keys(live.items), [juiceId]); assert.equal(live.tea.id, teaId); }
  finally { store.close(); }
});

test('native juice preparation creates only the two unpublished app-owned plans and re-reads their policies', async () => {
  const store = new Store(':memory:', key); const api = new Shopify(store, {}); let created = false; let writes = 0;
  api.juiceCatalog = async () => catalog;
  api.request = async (query, variables) => {
    if (query.startsWith('mutation JuicePlans')) { writes++; assert.equal(Object.hasOwn(variables, 'resources'), false); assert.deepEqual(variables.input, juicePlanInput()); created = true; return { sellingPlanGroupCreate: { sellingPlanGroup: { id: 'gid://shopify/SellingPlanGroup/123' }, userErrors: [] } }; }
    return { sellingPlanGroups: { pageInfo: { hasNextPage: false }, nodes: created ? [{ ...nativeGroup(), id: 'gid://shopify/SellingPlanGroup/123' }] : [] } };
  };
  try { assert.equal((await api.prepareJuicePlans()).billingEnabled, false); assert.deepEqual(store.getSetting('juicePlanIds'), plans); await api.prepareJuicePlans(); assert.equal(writes, 1); }
  finally { store.close(); }
});

test('native juice creation errors return only a documented code and never arbitrary remote data', async () => {
  const store = new Store(':memory:', key); const api = new Shopify(store, {}); api.juiceCatalog = async () => catalog; api.verifyJuicePlans = async () => null;
  api.request = async () => ({ sellingPlanGroupCreate: { sellingPlanGroup: null, userErrors: [{ code: 'TEST-ONLY-private-data', field: ['TEST-ONLY-private-data'] }] } });
  try { await assert.rejects(api.prepareJuicePlans(), error => error instanceof ShopifyRequestError && error.code === 'JUICE_PLAN_CREATION_REJECTED' && !error.message.includes('TEST-ONLY')); }
  finally { store.close(); }
});
test('native juice plans distinguish four weekly payments from one prepaid four-week billing cycle', () => {
  const prepared = juicePlanInput(); assert.equal(prepared.sellingPlansToCreate[0].billingPolicy.recurring.minCycles, 4);
  assert.equal(prepared.sellingPlansToCreate[1].billingPolicy.recurring.intervalCount, 4); assert.equal(prepared.sellingPlansToCreate[1].billingPolicy.recurring.minCycles, 1);
  for (const plan of prepared.sellingPlansToCreate) assert.deepEqual(plan.billingPolicy.recurring.anchors, plan.deliveryPolicy.recurring.anchors);
  assert.equal(Object.hasOwn(prepared, 'resources'), false); assert.deepEqual(validateJuicePlans(nativeGroup()), plans);
  const changed = nativeGroup(); changed.sellingPlans.nodes[1].billingPolicy.minCycles = 4; assert.throws(() => validateJuicePlans(changed));
});
for (const field of ['discount', 'delivery', 'maximum', 'duplicate', 'billing-anchor']) test('native juice policy mismatch rejects ' + field, () => {
  const group = nativeGroup();
  if (field === 'discount') group.sellingPlans.nodes[0].pricingPolicies[0].adjustmentValue.percentage = 15;
  if (field === 'delivery') group.sellingPlans.nodes[1].deliveryPolicy.intervalCount = 4;
  if (field === 'maximum') group.sellingPlans.nodes[0].billingPolicy.maxCycles = 4;
  if (field === 'duplicate') group.sellingPlans.nodes.push(structuredClone(group.sellingPlans.nodes[0]));
  if (field === 'billing-anchor') group.sellingPlans.nodes[0].billingPolicy.anchors = [];
  assert.throws(() => validateJuicePlans(group));
});
for (const gate of Object.keys(gates)) test('juice billing stays off without acceptance gate: ' + gate, () => {
  const { store } = fixture(); try { assert.equal(new JuiceWorker(store, {}, { gates: { ...gates, [gate]: false }, now: () => initialNow, identityKey: key }).enabled(), false); } finally { store.close(); }
});
test('weekly juice cancellation is queued, funds exactly four weeks and cancels before payment five', async () => {
  const { store, id, contract } = fixture(); let now = initialNow; const billed = []; let cancelled = 0;
  const api = { contract: async () => contract, juiceCatalog: async () => catalog,
    attempt: async (_id, savedKey) => { billed.push(savedKey); return { id: 'attempt-' + billed.length, ready: true, order: { id: 'order-' + billed.length } }; },
    nextDate: async (_id, value) => { contract.nextBillingDate = value; }, cancel: async () => { cancelled++; contract.status = 'CANCELLED'; } };
  const worker = new JuiceWorker(store, api, { gates, now: () => now, identityKey: key });
  try {
    await worker.bind(contract.id, contract); let lease = store.claim(id);
    const requested = await worker.requestCancellation(id, lease); store.unlock(id, lease);
    assert.equal(requested.state, 'scheduled'); assert.equal(requested.afterPaidWeeks, 4); assert.equal(cancelled, 0); assert.equal(store.get(id).data.paidWeeks, 1);
    for (let payment = 0; payment < 3; payment++) {
      now = Date.parse(contract.nextBillingDate); store.setSetting('heartbeat', now); lease = store.claim(id);
      for (let step = 0; step < 3; step++) await worker.step(id, lease);
      store.unlock(id, lease);
    }
    assert.equal(billed.length, 3); assert.equal(new Set(billed).size, 3); assert.equal(cancelled, 1);
    assert.equal(store.get(id).data.paidWeeks, 4); assert.equal(store.get(id).state, 'stopped'); assert.equal(store.get(id).data.cancellationConfirmed, true);
    assert.equal(store.get(id).data.cancellationEffectiveDate.slice(0, 10), '2026-11-30');
  } finally { store.close(); }
});
test('prepaid cancellation prevents the next four-week renewal without touching paid fulfillment orders', async () => {
  const { store, id, contract } = fixture('prepaid'); const calls = [];
  const api = { cancel: async () => { calls.push('cancel-future-contract'); } };
  const worker = new JuiceWorker(store, api, { gates: {}, now: () => initialNow, identityKey: key });
  try {
    await worker.bind(contract.id, contract); assert.equal(store.get(id).data.paidWeeks, 4);
    const lease = store.claim(id); const result = await worker.requestCancellation(id, lease); store.unlock(id, lease);
    assert.equal(result.state, 'cancelled'); assert.deepEqual(calls, ['cancel-future-contract']); assert.equal(store.get(id).state, 'stopped');
  } finally { store.close(); }
});
test('juice payment failure never advances the four-week commitment or claims cancellation succeeded', async () => {
  const { store, id, contract } = fixture(); let now = initialNow;
  const api = { contract: async () => contract, juiceCatalog: async () => catalog, attempt: async () => ({ id: 'TEST-ONLY-failed', ready: true, errorCode: 'PAYMENT_FAILED' }) };
  const worker = new JuiceWorker(store, api, { gates, now: () => now, identityKey: key });
  try {
    await worker.bind(contract.id, contract); const lease = store.claim(id); await worker.requestCancellation(id, lease);
    now = Date.parse(contract.nextBillingDate); store.setSetting('heartbeat', now); await worker.step(id, lease); await worker.step(id, lease);
    assert.equal(store.get(id).state, 'review'); assert.equal(store.get(id).data.paidWeeks, 1); assert.equal(store.get(id).data.cancellationConfirmed, false);
    store.unlock(id, lease);
  } finally { store.close(); }
});
test('ambiguous juice billing and finalization retries retain one key and record paid weeks only once', async () => {
  const { store, id, contract } = fixture('prepaid'); let now = initialNow; let uncertain = true; let nextUncertain = true; const keys = [];
  const api = { contract: async () => contract, juiceCatalog: async () => catalog,
    attempt: async (_id, savedKey) => { keys.push(savedKey); if (uncertain) { uncertain = false; throw Error('TEST-ONLY-timeout'); } return { id: 'TEST-ONLY-attempt', ready: true, order: { id: 'TEST-ONLY-order' } }; },
    nextDate: async (_id, date) => { if (nextUncertain) { nextUncertain = false; throw Error('TEST-ONLY-next-date-timeout'); } contract.nextBillingDate = date; } };
  const worker = new JuiceWorker(store, api, { gates, now: () => now, identityKey: key });
  try {
    await worker.bind(contract.id, contract); const lease = store.claim(id); now = Date.parse(contract.nextBillingDate); store.setSetting('heartbeat', now);
    await worker.step(id, lease); await assert.rejects(worker.step(id, lease)); await worker.step(id, lease);
    await assert.rejects(worker.step(id, lease)); assert.equal(store.get(id).data.paidWeeks, 8);
    await worker.step(id, lease); assert.equal(store.get(id).data.paidWeeks, 8); assert.equal(store.get(id).state, 'active');
    assert.equal(keys.length, 2); assert.equal(new Set(keys).size, 1); assert.equal(store.get(id).data.billingCycle, 2); store.unlock(id, lease);
  } finally { store.close(); }
});
test('a new cancellation in the second weekly course targets week eight, not week five', () => {
  assert.equal(cancellationTarget({ paidWeeks: 5, firstServiceDate: firstService }).afterPaidWeeks, 8);
  assert.equal(cancellationTarget({ paidWeeks: 8, firstServiceDate: firstService }).ready, true);
});
test('an unexpected juice contract revision stops safely without requiring private payment-method reads', async () => {
  const { store, id, contract } = fixture(); let now = initialNow; let billed = 0;
  const api = { contract: async () => contract, attempt: async () => { billed++; } };
  const worker = new JuiceWorker(store, api, { gates, now: () => now, identityKey: key });
  try {
    await worker.bind(contract.id, contract); contract.revisionId = '2'; now = Date.parse(contract.nextBillingDate); store.setSetting('heartbeat', now);
    await worker.stepDue(); assert.equal(billed, 0); assert.equal(store.get(id).state, 'review');
    assert.equal(Object.hasOwn(store.get(id).data, 'approvedPaymentMethodId'), false);
  } finally { store.close(); }
});
test('coordinator routes signed juice events without meal rotation mutating juice lines', async () => {
  const { store, id, contract } = fixture(); store.enqueue('TEST-ONLY-event-1234567890', contract.id); let reads = 0;
  const worker = new Worker(store, { contract: async () => { reads++; return contract; } }, { gates: {}, now: () => initialNow, identityKey: key });
  try { await worker.tick(); assert.equal(reads, 1); assert.equal(store.get(id).contract_id, contract.id); assert.equal(store.db.prepare('SELECT state FROM events').get().state, 'processed'); }
  finally { store.close(); }
});

function juiceCart(input, row) {
  const mix = row.data.mix; const multiplier = mix.deliveriesPerPayment;
  return { id: 'gid://shopify/Cart/TEST-ONLY-juice-cart?key=TEST-ONLY-key', checkoutUrl: `https://${SHOP}/cart/c/TEST-ONLY-juice`, attributes: input.attributes, discountCodes: [],
    cost: { subtotalAmount: { amount: amount(mix.firstSubtotalCents), currencyCode: 'USD' } }, lines: { pageInfo: { hasNextPage: false }, nodes: input.lines.map(line => {
      const recurring = mix.lines.find(item => item.variantId === line.merchandiseId); const price = recurring ? recurring.priceCents * multiplier : 300;
      return { quantity: line.quantity, attributes: line.attributes, merchandise: { id: line.merchandiseId, availableForSale: true }, discountAllocations: [],
        sellingPlanAllocation: recurring ? { sellingPlan: { id: line.sellingPlanId }, priceAdjustments: [{ price: { amount: amount(price), currencyCode: 'USD' }, perDeliveryPrice: { amount: amount(recurring.priceCents), currencyCode: 'USD' } }] } : null,
        cost: { amountPerQuantity: { amount: amount(price), currencyCode: 'USD' }, totalAmount: { amount: amount(price * line.quantity), currencyCode: 'USD' } } };
    }) } };
}
for (const mode of ['weekly']) test(`isolated ${mode} juice cart has one recurring mix and only one one-time tea purchase`, () => {
  const { store, id } = fixture(mode);
  try { const row = store.get(id); const input = juiceCheckoutInput(row, plans[mode], { method: 'pickup', window: 'monday-after-9am' });
    const cart = juiceCart(input, row); assert.equal(input.lines[1].sellingPlanId, undefined);
    assert.equal(new URL(verifyJuiceCart(cart, row, plans[mode], input)).searchParams.get('channel'), 'online_store');
    cart.lines.nodes[1].sellingPlanAllocation = cart.lines.nodes[0].sellingPlanAllocation; assert.throws(() => verifyJuiceCart(cart, row, plans[mode], input));
  } finally { store.close(); }
});
test('a stale prepaid quote is rejected before any catalog, cart or checkout request', async () => {
  const { store, id } = fixture('prepaid'); const row = store.get(id);
  let calls = 0;
  const service = new SubscriptionCheckout(store, { juiceCatalog: async () => { calls++; return catalog; }, verifyJuicePlans: async () => { calls++; return plans; } }, { storefrontToken: 'TEST-ONLY-public', now: () => initialNow,
    fetchImpl: async () => { calls++; throw Error('A prepaid cart must not be created.'); } });
  try { assert.throws(() => juiceCheckoutInput(row, plans.prepaid, { method: 'pickup', window: 'monday-after-9am' }), /paid weekly/);
    await assert.rejects(service.startJuice(id, { method: 'pickup', window: 'monday-after-9am' }), /paid weekly/);
    assert.equal(calls, 0); assert.equal(store.getSetting(`secret_checkout_${id}`), null); }
  finally { store.close(); }
});
test('juice preview is read-only and enrollment remains closed while the extra juice gate is off', async () => {
  const { store } = fixture(); const config = { baseUrl: 'https://TEST-ONLY-app.example', clientSecret: 'TEST-ONLY-secret', encryptionKey: key, storefrontToken: 'TEST-ONLY-public', gates: { ...gates, juice: false } };
  const app = createApplication(config, { store, shopify: { juiceCatalog: async () => catalog, verifyJuicePlans: async () => plans }, clock: () => initialNow });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const before = store.db.prepare('SELECT COUNT(*) AS n FROM rotations').get().n;
    let response = await fetch(base + '/api/juice/preview', { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify(input('weekly')) }); assert.equal(response.status, 200);
    const value = await response.json(); assert.equal(value.enrollmentReady, false); assert.equal(value.mix.firstSubtotalCents, 12750); assert.equal(value.deliveryDates.length, 4);
    response = await fetch(base + '/api/juice/preview', { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify(input('prepaid')) }); assert.equal(response.status, 422);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rotations').get().n, before);
    response = await fetch(base + '/api/juice/quote', { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify(input('prepaid')) }); assert.equal(response.status, 503);
    response = await fetch(base + '/api/juice/preview', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: JSON.stringify(input('weekly')) }); assert.equal(response.status, 403);
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); store.close(); }
});

test('four committed weekly juice deliveries retain a separate $15 fee each week, never a $60 upfront fee', async () => {
  const { store, id, contract } = fixture(); let now = initialNow; const deliveryFees = [1500];
  contract.deliveryMethod = { __typename: 'SubscriptionDeliveryMethodLocalDelivery', address: { countryCodeV2: 'US', provinceCode: 'CA', address1: 'TEST-ONLY address', city: 'Mission Viejo', zip: '92691' } };
  contract.deliveryPrice = { amount: '15.00', currencyCode: 'USD' };
  store.update(id, { data: { ...store.get(id).data, checkoutFulfillment: { method: 'delivery', window: 'monday' } } });
  const api = { contract: async () => contract, juiceCatalog: async () => catalog,
    attempt: async () => { assert.equal(contract.billingPolicy.intervalCount, 1); assert.equal(contract.deliveryPrice.amount, '15.00'); deliveryFees.push(1500); return { id: 'attempt-' + deliveryFees.length, ready: true, order: { id: 'order-' + deliveryFees.length } }; },
    nextDate: async (_id, value) => { contract.nextBillingDate = value; }, cancel: async () => { contract.status = 'CANCELLED'; } };
  const worker = new JuiceWorker(store, api, { gates, now: () => now, identityKey: key });
  try {
    await worker.bind(contract.id, contract); let lease = store.claim(id); await worker.requestCancellation(id, lease); store.unlock(id, lease);
    for (let payment = 0; payment < 3; payment++) {
      now = Date.parse(contract.nextBillingDate); store.setSetting('heartbeat', now); lease = store.claim(id);
      for (let step = 0; step < 3; step++) await worker.step(id, lease);
      store.unlock(id, lease);
    }
    assert.deepEqual(deliveryFees, [1500, 1500, 1500, 1500]); assert.equal(store.get(id).data.paidWeeks, 4); assert.equal(store.get(id).state, 'stopped');
  } finally { store.close(); }
});
