import test from 'node:test';
import { strict as assert } from 'node:assert';
import { PICKUP_LOCATION_ID, WEEKS, amount, firstServiceDate, weekAt, validateSelections } from '../src/domain.mjs';
import { validateJuiceSelection } from '../src/juice-domain.mjs';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { JuiceWorker } from '../src/juice-worker.mjs';
import { initialOrderWindowReview } from '../src/domain.mjs';

const now = Date.parse('2026-10-26T16:00:00Z');
const key = Buffer.alloc(32, 13).toString('base64');
const pickup = { method: 'pickup', window: 'monday-after-9am' };
const delivery = { method: 'delivery', window: 'monday' };
const pickupMethod = () => ({ __typename: 'SubscriptionDeliveryMethodPickup', pickupOption: { code: 'TEST-ONLY-pickup', location: { id: PICKUP_LOCATION_ID } } });
const deliveryMethod = () => ({ __typename: 'SubscriptionDeliveryMethodLocalDelivery', address: {
  countryCodeV2: 'US', provinceCode: 'CA', address1: 'TEST-ONLY address', city: 'Mission Viejo', zip: '92691',
} });

function fixture(kind, choice) {
  const store = new Store(':memory:', key);
  const serviceDate = firstServiceDate(now);
  const planId = kind === 'meal' ? 'gid://shopify/SellingPlan/1' : 'gid://shopify/SellingPlan/2';
  const firstWeek = weekAt(serviceDate);
  const catalog = Object.fromEntries(WEEKS.map((week, index) => [`gid://shopify/ProductVariant/${index + 1}`, {
    title: 'TEST-ONLY meal', type: 'Meal', status: 'ACTIVE', currency: 'USD', available: true, requiresComponents: false, tags: [week], price: '20.00',
  }]));
  const selections = Object.fromEntries(WEEKS.map((week, index) => [week, { [`gid://shopify/ProductVariant/${index + 1}`]: 6 }]));
  const weeks = validateSelections(selections, catalog);
  const juiceId = 'gid://shopify/ProductVariant/100';
  const mix = validateJuiceSelection({ selections: { [juiceId]: 9 }, billingPreference: 'weekly', teaQuantity: 0 }, {
    minimumCents: 13499, items: { [juiceId]: { id: juiceId, title: 'TEST-ONLY juice', type: 'Juice', status: 'ACTIVE', currency: 'USD', available: true, requiresComponents: false, price: '15.00' } },
  });
  const data = kind === 'meal' ? { weeks, firstWeek, serviceDate } : { kind: 'juice', mix, firstServiceDate: serviceDate, paidWeeks: 0 };
  const id = store.create({ ...data, checkoutPreparedAt: now, expiresAt: now + 1800000, checkoutFulfillment: choice }, 'a'.repeat(64));
  const selected = kind === 'meal' ? weeks[firstWeek].lines : mix.lines;
  store.setSetting('planId', 'gid://shopify/SellingPlan/1');
  store.setSetting('juicePlanIds', { weekly: 'gid://shopify/SellingPlan/2', prepaid: 'gid://shopify/SellingPlan/3' });
  const contract = { id: 'gid://shopify/SubscriptionContract/100', status: 'ACTIVE', currencyCode: 'USD', revisionId: '1',
    nextBillingDate: '2026-11-02T17:00:00Z', billingPolicy: { interval: 'WEEK', intervalCount: 1 }, deliveryPolicy: { interval: 'WEEK', intervalCount: 1 },
    deliveryMethod: choice?.method === 'delivery' ? deliveryMethod() : pickupMethod(),
    deliveryPrice: { amount: choice?.method === 'delivery' ? '15.00' : '0.00', currencyCode: 'USD' },
    discounts: { nodes: [] }, originOrder: { id: 'gid://shopify/Order/1', createdAt: new Date(now).toISOString(), displayFinancialStatus: 'PAID', test: false },
    lines: { pageInfo: { hasNextPage: false }, nodes: selected.map(line => ({ ...line, sellingPlanId: planId,
      currentPrice: { amount: amount(line.priceCents), currencyCode: 'USD' },
      customAttributes: [{ key: kind === 'meal' ? '_pit_rotation_id' : '_pit_juice_id', value: id }],
    })) },
  };
  let billingCalls = 0;
  const api = { attempt: async () => { billingCalls++; throw Error('No billing allowed in a binding check.'); } };
  const Constructor = kind === 'meal' ? Worker : JuiceWorker;
  const worker = new Constructor(store, api, { now: () => now, identityKey: key });
  return { store, id, contract, worker, billingCalls: () => billingCalls };
}

for (const [season, midnight] of [['PDT', '2026-07-11T07:00:00Z'], ['PST', '2026-11-14T08:00:00Z']]) {
  test(`the initial order uses the Shopify completion timestamp across Friday midnight (${season})`, () => {
    const cutoff = Date.parse(midnight);
    const input = { checkoutPreparedAt: cutoff - 10 * 60000, expiresAt: cutoff + 20 * 60000, serviceDate: firstServiceDate(cutoff - 1) };
    assert.equal(initialOrderWindowReview({ ...input, createdAt: new Date(cutoff - 1).toISOString() }), null);
    assert.equal(initialOrderWindowReview({ ...input, createdAt: midnight }), 'service-week-changed');
    assert.equal(initialOrderWindowReview({ ...input, expiresAt: cutoff - 5000, createdAt: new Date(cutoff - 5000).toISOString() }), 'checkout-expired');
    assert.equal(initialOrderWindowReview({ ...input, createdAt: undefined }), 'service-week-unverified');
    assert.equal(initialOrderWindowReview({ ...input, createdAt: new Date(cutoff - 11 * 60000).toISOString() }), 'service-week-unverified');
  });
}

for (const kind of ['meal', 'juice']) test(`a paid ${kind} checkout for a past service week is queued, not enrolled`, async () => {
  const { store, id, contract } = fixture(kind, pickup);
  try {
    const fridayMidnight = Date.parse('2026-11-14T08:00:00Z');
    const quotedWeek = firstServiceDate(fridayMidnight - 1);
    const current = store.get(id);
    store.update(id, { data: { ...current.data, checkoutPreparedAt: fridayMidnight - 300000, expiresAt: fridayMidnight + 1500000,
      ...(kind === 'meal' ? { serviceDate: quotedWeek } : { firstServiceDate: quotedWeek }) } });
    contract.originOrder.createdAt = new Date(fridayMidnight).toISOString();
    const api = { contract: async () => contract, juiceCatalog: async () => ({ items: Object.fromEntries((current.data.mix?.lines || [])
      .map(line => [line.variantId, { price: amount(line.retailPriceCents) }])) }), attempt: async () => { assert.fail('no charge'); } };
    const worker = new Worker(store, api, { now: () => fridayMidnight + 60000, identityKey: key });
    store.enqueue('synthetic-cutoff-event', contract.id);
    await worker.tick();
    assert.equal(store.get(id).contract_id, null);
    assert.equal(store.minimumReviewSummary().recent[0].reason, 'service-week-changed');
    assert.equal(store.db.prepare('SELECT state FROM events').get().state, 'processed');
  } finally { store.close(); }
});

for (const kind of ['meal', 'juice']) {
  for (const mode of [true, undefined]) test(`${kind} binding refuses a test order or unknown order mode: ${mode}`, async () => {
    const { store, id, contract, worker, billingCalls } = fixture(kind, pickup);
    try {
      contract.originOrder.test = mode;
      await assert.rejects(worker.bind(contract.id, contract), /confirmed non-test/);
      assert.equal(store.get(id).contract_id, null);
      assert.equal(store.get(id).state, 'quoted');
      assert.equal(billingCalls(), 0);
    } finally { store.close(); }
  });
  test(`${kind} test-order webhook cannot enroll a live contract`, async () => {
    const { store, id, contract } = fixture(kind, pickup);
    try {
      contract.originOrder.test = true;
      const worker = new Worker(store, { contract: async () => contract,
        juiceCatalog: async () => assert.fail('Test order must not reach enrollment validation'),
        attempt: async () => assert.fail('Test order must not bill'),
      }, { now: () => now, identityKey: key });
      store.enqueue('synthetic-test-order-event', contract.id);
      await worker.tick();
      assert.equal(store.get(id).contract_id, null);
      assert.equal(store.db.prepare('SELECT state FROM events').get().state, 'processed');
    } finally { store.close(); }
  });
  for (const choice of [pickup, delivery, { ...delivery, window: 'tuesday' }]) test(`${kind} binding accepts the reviewed ${choice.method}/${choice.window} without enabling billing`, async () => {
    const { store, id, contract, worker, billingCalls } = fixture(kind, choice);
    try {
      await worker.bind(contract.id, contract);
      assert.equal(store.get(id).state, 'active');
      assert.equal(store.get(id).contract_id, contract.id);
      assert.equal(worker.enabled(), false);
      assert.equal(billingCalls(), 0);
    } finally { store.close(); }
  });

  for (const change of ['missing-review', 'invalid-window', 'delivery-instead-of-pickup', 'pickup-instead-of-delivery', 'another-pickup-location']) test(`${kind} binding refuses ${change} and leaves enrollment unbound`, async () => {
    const choice = change === 'pickup-instead-of-delivery' ? delivery : pickup;
    const { store, id, contract, worker, billingCalls } = fixture(kind, choice);
    try {
      if (change === 'missing-review') store.update(id, { data: { ...store.get(id).data, checkoutFulfillment: null } });
      if (change === 'invalid-window') store.update(id, { data: { ...store.get(id).data, checkoutFulfillment: { method: 'pickup', window: 'anytime' } } });
      if (change === 'delivery-instead-of-pickup') { contract.deliveryMethod = deliveryMethod(); contract.deliveryPrice.amount = '15.00'; }
      if (change === 'pickup-instead-of-delivery') { contract.deliveryMethod = pickupMethod(); contract.deliveryPrice.amount = '0.00'; }
      if (change === 'another-pickup-location') contract.deliveryMethod.pickupOption.location.id = 'gid://shopify/Location/999';
      await assert.rejects(worker.bind(contract.id, contract));
      assert.equal(store.get(id).state, 'quoted');
      assert.equal(store.get(id).contract_id, null);
      assert.equal(store.get(id).data.paidWeeks || 0, 0);
      assert.equal(billingCalls(), 0);
    } finally { store.close(); }
  });
}

for (const { kind, below, exact, paid } of [
  { kind: 'meal', below: 9899, exact: 9900, paid: cents => cents },
  { kind: 'juice', below: 13498, exact: 13499, paid: cents => Math.floor((cents * 90 + 50) / 100) },
]) {
  test(`${kind} checkout below the minimum is queued once for manual review and never binds for renewal`, async () => {
    const { store, id, contract, billingCalls } = fixture(kind, pickup);
    try {
      // Simulate checkout edits, including removal of the app's cart marker.
      const [line] = contract.lines.nodes;
      line.currentPrice.amount = amount(paid(below));
      line.quantity = 1;
      line.customAttributes = [];
      contract.lines.nodes.push({ ...line, sellingPlanId: 'gid://shopify/SellingPlan/999', currentPrice: { amount: '300.00', currencyCode: 'USD' } });
      const api = { contract: async () => contract, juiceCatalog: async () => ({ items: { [line.variantId]: { price: amount(below) } } }) };
      const worker = new Worker(store, api, { now: () => now, identityKey: key });
      store.enqueue('synthetic-event-one', contract.id);
      store.enqueue('synthetic-event-two', contract.id);
      await worker.tick();
      assert.deepEqual(store.minimumReviewSummary(), { count: 1, recent: [{ contractId: contract.id, orderId: contract.originOrder.id, kind, reason: 'below-minimum' }] });
      assert.equal(store.get(id).state, 'quoted');
      assert.equal(store.get(id).contract_id, null);
      assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE state='processed'").get().count, 2);
      assert.equal(billingCalls(), 0);
      line.currentPrice.amount = amount(paid(exact));
      assert.equal(await worker.flagInitialMinimumReview(contract.id, contract), true, 'manual review is not silently cleared');
      const newId = 'gid://shopify/SubscriptionContract/101';
      api.juiceCatalog = async () => ({ items: { [line.variantId]: { price: amount(exact) } } });
      assert.equal(await worker.flagInitialMinimumReview(newId, contract), false);
    } finally { store.close(); }
  });
}
