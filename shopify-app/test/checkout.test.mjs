import test from 'node:test';
import { strict as assert } from 'node:assert';
import { Store } from '../src/store.mjs';
import { createApplication } from '../src/server.mjs';
import { ORIGIN, WEEKS, validateSelections, firstServiceDate, weekAt, amount } from '../src/domain.mjs';
import { SubscriptionCheckout, checkoutUrl, fulfillmentSelection, mealCheckoutInput, verifyMealCart } from '../src/checkout.mjs';

const key = Buffer.alloc(32, 9).toString('base64');
const catalog = Object.fromEntries(WEEKS.map((week, index) => [`gid://shopify/ProductVariant/${index + 1}`, {
  type: 'Meal', status: 'ACTIVE', currency: 'USD', available: true, requiresComponents: false,
  tags: [week], title: `TEST-ONLY menu ${index + 1}`, price: `${18 + index}.00`,
}]));
const selections = Object.fromEntries(WEEKS.map((week, index) => [week, { [`gid://shopify/ProductVariant/${index + 1}`]: 7 }]));
const weeks = validateSelections(selections, catalog);
const pickup = { method: 'pickup', window: 'monday-after-9am' };
const planId = 'gid://shopify/SellingPlan/123';
function fixture(now = Date.parse('2026-10-19T18:00:00Z')) {
  const store = new Store(':memory:', key); store.setSetting('planId', planId);
  const date = firstServiceDate(now); const token = 'a'.repeat(64);
  const id = store.create({ weeks, firstWeek: weekAt(date), serviceDate: date, expiresAt: now + 1800000 }, token);
  return { store, row: store.get(id), token, now };
}
function returnedCart(input, row) {
  const week = row.data.weeks[row.data.firstWeek];
  return { id: 'gid://shopify/Cart/TEST-ONLY-cart?key=TEST-ONLY-private-cart-key',
    checkoutUrl: 'https://checkout.placeinthyme.com/cart/c/TEST-ONLY-cart?key=TEST-ONLY-key',
    attributes: input.attributes, discountCodes: [], cost: { subtotalAmount: { amount: amount(week.subtotalCents), currencyCode: 'USD' } },
    lines: { pageInfo: { hasNextPage: false }, nodes: input.lines.map(line => {
      const wanted = week.lines.find(item => item.variantId === line.merchandiseId);
      return { id: 'TEST-ONLY-line', quantity: line.quantity, attributes: line.attributes,
        merchandise: { id: line.merchandiseId, availableForSale: true }, sellingPlanAllocation: { sellingPlan: { id: line.sellingPlanId } }, discountAllocations: [],
        cost: { amountPerQuantity: { amount: amount(wanted.priceCents), currencyCode: 'USD' }, totalAmount: { amount: amount(wanted.priceCents * wanted.quantity), currencyCode: 'USD' } } };
    }) } };
}
for (const date of ['2026-10-05T18:00:00Z', '2026-10-12T18:00:00Z', '2026-10-19T18:00:00Z']) test(`isolated checkout includes only the active menu for ${date}`, () => {
  const { store, row } = fixture(Date.parse(date));
  try {
    const input = mealCheckoutInput(row, planId, pickup); const expected = weeks[row.data.firstWeek].lines;
    assert.deepEqual(input.lines.map(line => line.merchandiseId), expected.map(line => line.variantId));
    assert.equal(input.lines.length, 1); assert.equal(input.lines[0].sellingPlanId, planId);
    assert.equal(verifyMealCart(returnedCart(input, row), row, planId, input).startsWith('https://checkout.placeinthyme.com/'), true);
  } finally { store.close(); }
});
for (const value of [null, {}, { method: 'shipping', window: 'monday' }, { method: 'delivery', window: 'wednesday' }, { method: 'pickup', window: 'anytime' }, { ...pickup, fee: 0 }]) test('invalid local fulfillment cannot enter subscription checkout: ' + JSON.stringify(value), () => assert.throws(() => fulfillmentSelection(value)));
for (const value of ['http://checkout.placeinthyme.com/cart/c/x', 'https://checkout.placeinthyme.com.evil.test/cart/c/x', 'https://evil.test/checkouts/x', 'https://user:pass@checkout.placeinthyme.com/cart/c/x', 'https://checkout.placeinthyme.com:444/cart/c/x', 'https://checkout.placeinthyme.com/cart/c/x#token=bad', 'https://checkout.placeinthyme.com/not-a-checkout']) test('reject unsafe checkout destination: ' + value, () => assert.throws(() => checkoutUrl(value)));

const mutations = {
  quantity: cart => { cart.lines.nodes[0].quantity++; },
  variant: cart => { cart.lines.nodes[0].merchandise.id = 'gid://shopify/ProductVariant/999'; },
  plan: cart => { cart.lines.nodes[0].sellingPlanAllocation = null; },
  price: cart => { cart.lines.nodes[0].cost.amountPerQuantity.amount = '1.00'; },
  lineTotal: cart => { cart.lines.nodes[0].cost.totalAmount.amount = '1.00'; },
  subtotal: cart => { cart.cost.subtotalAmount.amount = '1.00'; },
  currency: cart => { cart.cost.subtotalAmount.currencyCode = 'CAD'; },
  discount: cart => { cart.discountCodes = [{ applicable: true, code: 'TEST-ONLY' }]; },
  allocation: cart => { cart.lines.nodes[0].discountAllocations = [{}]; },
  unavailable: cart => { cart.lines.nodes[0].merchandise.availableForSale = false; },
  identity: cart => { cart.lines.nodes[0].attributes = []; },
  mixedBasket: cart => { cart.lines.nodes.push(structuredClone(cart.lines.nodes[0])); },
  unretainedFulfillment: cart => { cart.attributes = []; },
  pagination: cart => { cart.lines.pageInfo.hasNextPage = true; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`Shopify read-back rejects ${name} rather than returning a checkout link`, () => {
  const { store, row } = fixture();
  try { const input = mealCheckoutInput(row, planId, pickup); const cart = returnedCart(input, row); mutate(cart); assert.throws(() => verifyMealCart(cart, row, planId, input)); }
  finally { store.close(); }
});
test('checkout retry reuses its encrypted isolated cart and never alters the ordinary basket', async () => {
  const { store, row, now } = fixture(); const calls = []; let cart;
  const service = new SubscriptionCheckout(store, { catalog: async () => catalog }, { storefrontToken: 'TEST-ONLY-public-token', now: () => now,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body); calls.push(body.query);
      if (body.query.startsWith('mutation')) { cart = returnedCart(body.variables.input, row); return { ok: true, text: async () => JSON.stringify({ data: { cartCreate: { cart, userErrors: [], warnings: [] } } }) }; }
      return { ok: true, text: async () => JSON.stringify({ data: { cart } }) };
    } });
  try {
    const first = await service.startMeal(row.id, pickup); const second = await service.startMeal(row.id, pickup);
    assert.equal(first.checkoutUrl, second.checkoutUrl); assert.equal(calls.length, 2);
    assert.match(calls[0], /cartCreate/); assert.match(calls[1], /cart\(id:/); assert.doesNotMatch(calls.join(''), /cartLinesAdd|cartLinesUpdate|cartLinesRemove/);
    const publicData = JSON.stringify(store.get(row.id).data); assert.equal(publicData.includes('private-cart-key'), false);
    assert.equal(store.getSetting(`secret_checkout_${row.id}`).includes('private-cart-key'), false);
    assert.equal(store.get(row.id).state, 'quoted'); assert.equal(first.firstSubtotalCents, weeks[row.data.firstWeek].subtotalCents);
    await assert.rejects(service.startMeal(row.id, { method: 'delivery', window: 'monday' }));
  } finally { store.close(); }
});
test('expired quotes, changed prices and changed service cutoff never create carts', async () => {
  for (const condition of ['expired', 'price', 'cutoff']) {
    const { store, row, now } = fixture(); let calls = 0;
    const updatedCatalog = structuredClone(catalog); if (condition === 'price') updatedCatalog['gid://shopify/ProductVariant/1'].price = '19.00';
    const service = new SubscriptionCheckout(store, { catalog: async () => updatedCatalog }, { storefrontToken: 'TEST-ONLY-public-token', now: () => condition === 'expired' ? now + 1800001 : condition === 'cutoff' ? Date.parse('2026-10-24T07:00:00Z') : now, fetchImpl: async () => { calls++; throw Error('Must not call'); } });
    if (condition === 'cutoff') store.update(row.id, { data: { ...row.data, expiresAt: Date.parse('2026-10-24T08:00:00Z') } });
    try { await assert.rejects(service.startMeal(row.id, pickup)); assert.equal(calls, 0); }
    finally { store.close(); }
  }
});
test('simulated HTTP enrollment requires all gates and private plan access before isolated checkout', async () => {
  const { store, now } = fixture(Date.now());
  const config = { baseUrl: 'https://TEST-ONLY-app.example', clientSecret: 'TEST-ONLY-secret', encryptionKey: key, storefrontToken: 'TEST-ONLY-public-token',
    gates: Object.fromEntries(['billing', 'checkout', 'fulfillment', 'storefront', 'launch', 'persistentStorage'].map(gate => [gate, true])) };
  store.setSetting('verifiedAt', now); store.setSetting('heartbeat', now); store.setSetting('webhooks', ['a', 'b', 'c']);
  const app = createApplication(config, { store, shopify: { catalog: async () => catalog }, clock: () => now });
  app.checkout.fetch = async (_url, options) => {
    const { input } = JSON.parse(options.body).variables;
    const id = input.attributes.find(item => item.key === '_pit_rotation_id').value;
    return { ok: true, text: async () => JSON.stringify({ data: { cartCreate: { cart: returnedCart(input, store.get(id)), userErrors: [], warnings: [] } } }) };
  };
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const quote = await fetch(base + '/api/quote', { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify({ selections }) }); assert.equal(quote.status, 201);
    const access = await quote.json(); const path = '/api/checkout/' + access.id;
    let response = await fetch(base + path, { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify({ fulfillment: pickup }) }); assert.equal(response.status, 403);
    response = await fetch(base + path, { method: 'POST', headers: { Origin: 'https://evil.test', Authorization: `Bearer ${access.manageToken}` }, body: JSON.stringify({ fulfillment: pickup }) }); assert.equal(response.status, 403);
    response = await fetch(base + path, { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${access.manageToken}` }, body: JSON.stringify({ fulfillment: pickup, subtotal: 1 }) }); assert.equal(response.status, 200);
    assert.equal((await response.json()).firstSubtotalCents, weeks[access.firstWeek].subtotalCents);
    config.gates.checkout = false;
    response = await fetch(base + path, { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${access.manageToken}` }, body: JSON.stringify({ fulfillment: pickup }) }); assert.equal(response.status, 503);
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); store.close(); }
});
