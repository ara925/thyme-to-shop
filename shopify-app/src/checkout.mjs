import { SHOP, assert, cents, ORIGIN, validateUnchanged, firstServiceDate } from './domain.mjs';
import { validateJuiceSelection, deliveryWeeksPerPayment } from './juice-domain.mjs';
import { assertWeeklyJuiceEnrollment } from './enrollment-policy.mjs';

const CHECKOUT_HOSTS = [SHOP, 'checkout.placeinthyme.com'];
export function checkoutUrl(value) {
  const url = new URL(value);
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
    && CHECKOUT_HOSTS.includes(url.hostname) && /^\/(?:checkouts\/|cart\/c\/)/.test(url.pathname), 'Unrecognized Shopify checkout destination.');
  url.searchParams.set('channel', 'online_store');
  return url.toString();
}

export function fulfillmentSelection(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2, 'Select local delivery or pickup.');
  assert((value.method === 'pickup' && value.window === 'monday-after-9am')
    || (value.method === 'delivery' && ['monday', 'tuesday'].includes(value.window)), 'Choose an approved fulfillment window.');
  return { method: value.method, window: value.window };
}

export function mealCheckoutInput(row, planId, fulfillment) {
  assert(row?.state === 'quoted' && row.data.kind !== 'juice' && /^gid:\/\/shopify\/SellingPlan\/\d+$/.test(planId || ''), 'This meal plan cannot enter checkout.');
  const week = row.data.weeks[row.data.firstWeek]; assert(week?.subtotalCents >= 12000, 'The active menu must reach $120.');
  const choice = fulfillmentSelection(fulfillment);
  return {
    lines: week.lines.map(line => ({ merchandiseId: line.variantId, quantity: line.quantity, sellingPlanId: planId,
      attributes: [{ key: '_pit_rotation_id', value: row.id }] })),
    attributes: [
      { key: '_pit_rotation_id', value: row.id },
      { key: '_pit_first_service', value: row.data.serviceDate.slice(0, 10) },
      { key: 'Fulfillment Method', value: choice.method === 'pickup' ? 'Pickup' : 'Local Delivery' },
      { key: choice.method === 'pickup' ? 'Preferred Pickup Window' : 'Preferred Dropoff Window', value: choice.method === 'pickup' ? 'Monday after 9:00 AM' : choice.window === 'monday' ? 'Monday' : 'Tuesday' },
    ],
  };
}

const CART_FIELDS = `id checkoutUrl attributes { key value } discountCodes { applicable code }
  cost { subtotalAmount { amount currencyCode } }
  lines(first:100) { nodes { id quantity attributes { key value }
    merchandise { ... on ProductVariant { id availableForSale } }
    sellingPlanAllocation { sellingPlan { id } priceAdjustments { price { amount currencyCode } perDeliveryPrice { amount currencyCode } } }
    discountAllocations { discountedAmount { amount currencyCode } }
    cost { amountPerQuantity { amount currencyCode } totalAmount { amount currencyCode } }
  } pageInfo { hasNextPage } }`;

export function verifyMealCart(cart, row, planId, input) {
  assert(/^gid:\/\/shopify\/Cart\//.test(cart?.id || ''), 'Shopify cart identity missing.');
  const destination = checkoutUrl(cart.checkoutUrl);
  const week = row.data.weeks[row.data.firstWeek]; const lines = cart.lines?.nodes;
  assert(!cart.lines?.pageInfo?.hasNextPage && Array.isArray(lines) && lines.length === week.lines.length
    && new Set(lines.map(line => line.merchandise?.id)).size === lines.length && !cart.discountCodes?.length, 'Checkout contains unexpected items or discounts.');
  for (const expected of week.lines) {
    const actual = lines.find(line => line.merchandise?.id === expected.variantId);
    assert(actual?.quantity === expected.quantity && actual.merchandise.availableForSale
      && actual.sellingPlanAllocation?.sellingPlan?.id === planId && !actual.discountAllocations?.length
      && actual.attributes?.filter(item => item.key === '_pit_rotation_id').length === 1
      && actual.attributes.find(item => item.key === '_pit_rotation_id')?.value === row.id
      && actual.cost?.amountPerQuantity?.currencyCode === 'USD' && cents(actual.cost.amountPerQuantity.amount) === expected.priceCents
      && actual.cost?.totalAmount?.currencyCode === 'USD' && cents(actual.cost.totalAmount.amount) === expected.priceCents * expected.quantity,
    'Shopify changed the active menu, selling plan, quantity or price.');
  }
  assert(cart.cost?.subtotalAmount?.currencyCode === 'USD' && cents(cart.cost.subtotalAmount.amount) === week.subtotalCents, 'Shopify subtotal differs from the approved active week.');
  assert(input.attributes.every(wanted => cart.attributes?.filter(item => item.key === wanted.key && item.value === wanted.value).length === 1), 'Shopify did not retain the approved fulfillment details.');
  return destination;
}

export function juiceCheckoutInput(row, planId, fulfillment) {
  assert(row?.state === 'quoted' && row.data.kind === 'juice' && /^gid:\/\/shopify\/SellingPlan\/\d+$/.test(planId || ''), 'This juice plan cannot enter checkout.');
  const choice = fulfillmentSelection(fulfillment); const mix = row.data.mix;
  assertWeeklyJuiceEnrollment(mix);
  const lines = mix.lines.map(line => ({ merchandiseId: line.variantId, quantity: line.quantity, sellingPlanId: planId, attributes: [{ key: '_pit_juice_id', value: row.id }] }));
  if (mix.oneTimeAddOn) lines.push({ merchandiseId: mix.oneTimeAddOn.variantId, quantity: mix.oneTimeAddOn.quantity, attributes: [{ key: '_pit_juice_tea', value: 'one-time' }] });
  return { lines, attributes: [
    { key: '_pit_juice_id', value: row.id }, { key: '_pit_first_service', value: row.data.firstServiceDate.slice(0, 10) },
    { key: 'Billing Choice', value: mix.billingPreference === 'prepaid' ? 'Four weeks prepaid' : 'Pay weekly, four-week minimum' },
    { key: 'Fulfillment Method', value: choice.method === 'pickup' ? 'Pickup' : 'Local Delivery' },
    { key: choice.method === 'pickup' ? 'Preferred Pickup Window' : 'Preferred Dropoff Window', value: choice.method === 'pickup' ? 'Monday after 9:00 AM' : choice.window === 'monday' ? 'Monday' : 'Tuesday' },
  ] };
}

export function verifyJuiceCart(cart, row, planId, input) {
  const mix = row.data.mix; const multiplier = deliveryWeeksPerPayment(mix.billingPreference); const lines = cart.lines?.nodes;
  assert(/^gid:\/\/shopify\/Cart\//.test(cart?.id || '') && !cart.lines?.pageInfo?.hasNextPage && Array.isArray(lines)
    && lines.length === mix.lines.length + (mix.oneTimeAddOn ? 1 : 0) && new Set(lines.map(line => line.merchandise?.id)).size === lines.length && !cart.discountCodes?.length, 'The juice checkout contains unexpected items or discounts.');
  for (const expected of mix.lines) {
    const actual = lines.find(line => line.merchandise?.id === expected.variantId); const allocation = actual?.sellingPlanAllocation; const price = allocation?.priceAdjustments;
    assert(actual?.quantity === expected.quantity && actual.merchandise.availableForSale && allocation?.sellingPlan?.id === planId && !actual.discountAllocations?.length
      && actual.attributes?.filter(item => item.key === '_pit_juice_id' && item.value === row.id).length === 1
      && price?.length === 1 && price[0].perDeliveryPrice.currencyCode === 'USD' && cents(price[0].perDeliveryPrice.amount) === expected.priceCents
      && price[0].price.currencyCode === 'USD' && cents(price[0].price.amount) === expected.priceCents * multiplier
      && actual.cost?.amountPerQuantity?.currencyCode === 'USD' && cents(actual.cost.amountPerQuantity.amount) === expected.priceCents * multiplier
      && actual.cost?.totalAmount?.currencyCode === 'USD' && cents(actual.cost.totalAmount.amount) === expected.priceCents * multiplier * expected.quantity,
    'Shopify juice billing, discount, quantity or plan differs from the reviewed mix.');
  }
  if (mix.oneTimeAddOn) {
    const tea = mix.oneTimeAddOn; const actual = lines.find(line => line.merchandise?.id === tea.variantId);
    assert(actual?.quantity === tea.quantity && actual.merchandise.availableForSale && !actual.sellingPlanAllocation && !actual.discountAllocations?.length
      && actual.cost?.amountPerQuantity?.currencyCode === 'USD' && cents(actual.cost.amountPerQuantity.amount) === 300
      && actual.cost?.totalAmount?.currencyCode === 'USD' && cents(actual.cost.totalAmount.amount) === tea.subtotalCents
      && actual.attributes?.filter(item => item.key === '_pit_juice_tea' && item.value === 'one-time').length === 1,
    'The $3 Hibiscus add-on must be one-time, undiscounted and excluded from the recurring mix.');
  }
  assert(cart.cost?.subtotalAmount?.currencyCode === 'USD' && cents(cart.cost.subtotalAmount.amount) === mix.firstSubtotalCents
    && input.attributes.every(wanted => cart.attributes?.filter(item => item.key === wanted.key && item.value === wanted.value).length === 1), 'Shopify juice subtotal or fulfillment details differ from approval.');
  return checkoutUrl(cart.checkoutUrl);
}

export class SubscriptionCheckout {
  constructor(store, api, { storefrontToken = '', fetchImpl = fetch, now = () => Date.now() } = {}) {
    this.store = store; this.api = api; this.token = storefrontToken; this.fetch = fetchImpl; this.now = now;
  }
  async request(query, variables) {
    assert(this.token, 'Configure the existing public Storefront connection.');
    const response = await this.fetch(`https://${SHOP}/api/2026-10/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': this.token },
      body: JSON.stringify({ query, variables }), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    assert(response.ok, 'Shopify checkout is temporarily unavailable.');
    const text = await response.text(); assert(Buffer.byteLength(text) < 2000000, 'Shopify cart response is too large.');
    const body = JSON.parse(text); assert(body.data && !body.errors?.length, 'Shopify could not verify checkout.');
    return body.data;
  }
  async cartFor(row, input, choice) {
    const saved = this.store.secret(`checkout_${row.id}`);
    if (saved) {
      assert(JSON.stringify(row.data.checkoutFulfillment) === JSON.stringify(choice), 'A checkout already exists with another fulfillment choice. Review a fresh plan to change it.');
      return (await this.request(`query Checkout($id:ID!){cart(id:$id){${CART_FIELDS}}}`, { id: JSON.parse(saved).id })).cart;
    }
    const result = (await this.request(`mutation Checkout($input:CartInput!){cartCreate(input:$input){cart{${CART_FIELDS}} userErrors{field message} warnings{code message}}}`, { input })).cartCreate;
    assert(result && !result.userErrors?.length && !result.warnings?.length, 'Shopify could not prepare the exact approved checkout.');
    return result.cart;
  }
  async startMeal(id, fulfillment) {
    const lease = this.store.claim(id); assert(lease, 'Checkout preparation is already running.');
    try {
      const row = this.store.get(id); const choice = fulfillmentSelection(fulfillment);
      assert(row?.state === 'quoted' && row.data.expiresAt > this.now(), 'The unenrolled plan expired or is already enrolled.');
      assert(row.data.serviceDate.slice(0, 10) === firstServiceDate(this.now()).slice(0, 10), 'The service cutoff changed. Review your rotation again.');
      await validateUnchanged(row.data.weeks, await this.api.catalog());
      const planId = this.store.getSetting('planId'); const input = mealCheckoutInput(row, planId, choice);
      // This creates a separate cart. It never reads, clears, replaces or appends to the customer's ordinary basket.
      const cart = await this.cartFor(row, input, choice);
      const destination = verifyMealCart(cart, row, planId, input);
      // Cart IDs contain private access keys. Keep them encrypted, never in public plan data or logs.
      this.store.saveSecret(`checkout_${id}`, JSON.stringify({ id: cart.id }));
      this.store.update(id, { data: { ...row.data, checkoutFulfillment: choice, checkoutPreparedAt: this.now() } }, lease);
      return { checkoutUrl: destination, expiresAt: new Date(row.data.expiresAt).toISOString(), firstWeek: row.data.firstWeek,
        firstServiceDate: row.data.serviceDate.slice(0, 10), firstSubtotalCents: row.data.weeks[row.data.firstWeek].subtotalCents,
        fulfillment: choice, managementPath: `${ORIGIN}/meal-plan/${id}` };
    } finally { this.store.unlock(id, lease); }
  }
  async startJuice(id, fulfillment) {
    const lease = this.store.claim(id); assert(lease, 'Juice checkout preparation is already running.');
    try {
      const row = this.store.get(id); const choice = fulfillmentSelection(fulfillment);
      assert(row?.state === 'quoted' && row.data.kind === 'juice' && row.data.expiresAt > this.now(), 'The unenrolled juice plan expired or is already enrolled.');
      assertWeeklyJuiceEnrollment(row.data.mix);
      assert(row.data.firstServiceDate.slice(0, 10) === firstServiceDate(this.now()).slice(0, 10), 'The service cutoff changed. Review your juice mix again.');
      const mix = validateJuiceSelection({ selections: Object.fromEntries(row.data.mix.lines.map(line => [line.variantId, line.quantity])), billingPreference: row.data.mix.billingPreference, teaQuantity: row.data.mix.oneTimeAddOn?.quantity || 0 }, await this.api.juiceCatalog());
      assert(JSON.stringify(mix) === JSON.stringify(row.data.mix), 'Juice prices changed; review is required before checkout.');
      const plans = await this.api.verifyJuicePlans({ required: true }); const planId = plans[mix.billingPreference];
      const input = juiceCheckoutInput(row, planId, choice); const cart = await this.cartFor(row, input, choice);
      const destination = verifyJuiceCart(cart, row, planId, input);
      this.store.saveSecret(`checkout_${id}`, JSON.stringify({ id: cart.id }));
      this.store.update(id, { data: { ...row.data, checkoutFulfillment: choice, checkoutPreparedAt: this.now() } }, lease);
      return { checkoutUrl: destination, expiresAt: new Date(row.data.expiresAt).toISOString(), billingPreference: mix.billingPreference,
        firstServiceDate: row.data.firstServiceDate.slice(0, 10), firstSubtotalCents: mix.firstSubtotalCents, fulfillment: choice, managementPath: `${ORIGIN}/juice-plan/${id}` };
    } finally { this.store.unlock(id, lease); }
  }
}
