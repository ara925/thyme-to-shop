import test from 'node:test';
import { strict as assert } from 'node:assert';
import { PICKUP_LOCATION_ID, WEEKS, amount, firstServiceDate, weekAt, validateSelections } from '../src/domain.mjs';
import { validateJuiceSelection } from '../src/juice-domain.mjs';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { JuiceWorker } from '../src/juice-worker.mjs';

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
  const planId = 'gid://shopify/SellingPlan/1';
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
  const id = store.create({ ...data, expiresAt: now + 1800000, checkoutFulfillment: choice }, 'a'.repeat(64));
  const selected = kind === 'meal' ? weeks[firstWeek].lines : mix.lines;
  store.setSetting('planId', planId);
  store.setSetting('juicePlanIds', { weekly: planId, prepaid: 'gid://shopify/SellingPlan/2' });
  const contract = { id: 'gid://shopify/SubscriptionContract/100', status: 'ACTIVE', currencyCode: 'USD', revisionId: '1',
    nextBillingDate: '2026-11-02T17:00:00Z', billingPolicy: { interval: 'WEEK', intervalCount: 1 }, deliveryPolicy: { interval: 'WEEK', intervalCount: 1 },
    deliveryMethod: choice?.method === 'delivery' ? deliveryMethod() : pickupMethod(),
    deliveryPrice: { amount: choice?.method === 'delivery' ? '15.00' : '0.00', currencyCode: 'USD' },
    discounts: { nodes: [] }, originOrder: { id: 'gid://shopify/Order/1', displayFinancialStatus: 'PAID' },
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

for (const kind of ['meal', 'juice']) {
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
