import { SHOP, CLIENT_ID, SCOPES, ZONE, assert, amount } from './domain.mjs';

export const API_VERSION = '2026-10';
export class ShopifyRequestError extends Error {
  constructor(code = 'SHOPIFY_REQUEST_REJECTED') {
    super('Shopify rejected the app request.');
    this.code = code;
  }
}
const DELIVERY = `__typename ... on SubscriptionDeliveryMethodLocalDelivery { address { address1 address2 city zip countryCodeV2 provinceCode } localDeliveryOption { code } }
  ... on SubscriptionDeliveryMethodPickup { pickupOption { code location { id } } }`;
export const SNAPSHOT = `currencyCode billingPolicy { interval intervalCount } deliveryPolicy { interval intervalCount }
  deliveryMethod { ${DELIVERY} } deliveryPrice { amount currencyCode } customerPaymentMethod { id }
  lines(first:100) { nodes { id variantId quantity sellingPlanId currentPrice { amount currencyCode } customAttributes { key value } } pageInfo { hasNextPage } }
  discounts(first:1) { nodes { id } }`;
export const CONTRACT = `id status nextBillingDate revisionId ${SNAPSHOT} originOrder { id displayFinancialStatus }`;

export class Shopify {
  constructor(store, { clientSecret, baseUrl, fetchImpl = fetch }) { this.store = store; this.secret = clientSecret; this.baseUrl = baseUrl; this.fetch = fetchImpl; }
  async http(path, body, token) {
    const response = await this.fetch(`https://${SHOP}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { 'X-Shopify-Access-Token': token } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) throw new ShopifyRequestError([400, 401, 403, 404, 429, 500, 502, 503].includes(response.status) ? `HTTP_${response.status}` : 'SHOPIFY_HTTP_ERROR');
    const text = await response.text(); assert(Buffer.byteLength(text) <= 2000000, 'Shopify response is too large.');
    return JSON.parse(text);
  }
  async exchange(input) {
    assert(this.secret && this.store.key, 'Configure private app credentials first.');
    const result = await this.http('/admin/oauth/access_token', { client_id: CLIENT_ID, client_secret: this.secret, ...input });
    const scopes = (result.scope || '').split(',');
    assert(typeof result.access_token === 'string' && SCOPES.every(scope => scopes.includes(scope)), 'Shopify did not grant the approved app scopes.');
    // Persist rotated access/refresh credentials atomically; partial saves must not strand authorization.
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      this.store.saveSecret('access_token', result.access_token);
      if (result.refresh_token) this.store.saveSecret('refresh_token', result.refresh_token);
      this.store.setSetting('tokenExpires', Number(result.expires_in) > 0 ? Date.now() + Number(result.expires_in) * 1000 : 0);
      this.store.setSetting('scopes', scopes); this.store.db.exec('COMMIT');
    } catch (error) { this.store.db.exec('ROLLBACK'); throw error; }
  }
  async token() {
    const token = this.store.secret('access_token'); assert(token, 'Reconnect the approved Shopify app.');
    const expiry = this.store.getSetting('tokenExpires', 0);
    if (expiry && expiry < Date.now() + 120000) {
      const lock = this.store.lease('token-refresh', 60); assert(lock, 'Authorization is refreshing; retry shortly.');
      try {
        if (this.store.getSetting('tokenExpires', 0) < Date.now() + 120000) {
          const refresh = this.store.secret('refresh_token'); assert(refresh, 'Reconnect the approved Shopify app.');
          await this.exchange({ grant_type: 'refresh_token', refresh_token: refresh });
        }
      } finally { this.store.release('token-refresh', lock); }
      return this.store.secret('access_token');
    }
    return token;
  }
  async request(query, variables = {}) {
    const response = await this.http(`/admin/api/${API_VERSION}/graphql.json`, { query, variables }, await this.token());
    if (!response.data || response.errors?.length) {
      // Only known machine codes leave the API boundary, never remote error text or request data.
      const known = ['MAX_COST_EXCEEDED', 'THROTTLED', 'ACCESS_DENIED', 'undefinedField', 'argumentNotAccepted', 'selectionMismatch'];
      const code = response.errors?.map(error => error.extensions?.code).find(value => known.includes(value));
      throw new ShopifyRequestError(code);
    }
    return response.data;
  }
  async mutation(query, variables, key) {
    const result = (await this.request(query, variables))[key];
    assert(result && !result.userErrors?.length, `Shopify could not apply ${key}.`); return result;
  }
  async catalog() {
    const catalog = {}; let after = null;
    for (let page = 0; page < 10; page++) {
      const result = await this.request(`query Meals($after:String) { shop { currencyCode ianaTimezone }
        products(first:50, after:$after, query:"product_type:Meal AND status:active") { nodes { id title productType status tags
        variants(first:100) { nodes { id price availableForSale requiresComponents } pageInfo { hasNextPage } } } pageInfo { hasNextPage endCursor } } }`, { after });
      if (result.shop.currencyCode !== 'USD' || result.shop.ianaTimezone !== ZONE) throw new ShopifyRequestError('STORE_LOCALE_CHANGED');
      for (const product of result.products.nodes) {
        assert(!product.variants.pageInfo.hasNextPage, 'Meal variant pagination needs review.');
        for (const variant of product.variants.nodes) catalog[variant.id] = { type: product.productType, status: product.status, currency: 'USD', tags: product.tags, title: product.title, price: variant.price, available: variant.availableForSale, requiresComponents: variant.requiresComponents };
      }
      if (!result.products.pageInfo.hasNextPage) return catalog;
      after = result.products.pageInfo.endCursor;
    }
    throw new Error('Meal catalog pagination needs review.');
  }
  async verify() {
    const catalog = await this.catalog();
    const result = await this.request(`query { subscriptionContracts(first:1) { nodes { id } pageInfo { hasNextPage } }
      sellingPlanGroups(first:100) { nodes { id appId merchantCode name sellingPlans(first:10) { nodes { id name } } } pageInfo { hasNextPage } } }`);
    assert(!result.sellingPlanGroups.pageInfo.hasNextPage, 'Selling-plan pagination needs review.');
    const groups = result.sellingPlanGroups.nodes.filter(group => group.merchantCode === 'pit-three-week-rotation-v1');
    // Shopify's sellingPlanGroups query returns only groups belonging to the calling app.
    // appId is documented for Liquid/product JSON; the app-scoped query establishes ownership.
    if (groups.length !== 1 || groups[0].sellingPlans.nodes.length !== 1) throw new ShopifyRequestError('OWNED_PLAN_NEEDS_REVIEW');
    const planId = groups[0].sellingPlans.nodes[0].id;
    assert(/^gid:\/\/shopify\/SellingPlan\/\d+$/.test(planId), 'Owned plan ID missing.');
    this.store.setSetting('planId', planId); this.store.setSetting('verifiedAt', Date.now());
    return { mealCount: Object.keys(catalog).length, hasExistingContracts: result.subscriptionContracts.nodes.length > 0, plan: groups[0].name };
  }
  async migrateWebhooks() {
    const query = 'query { webhookSubscriptions(first:100) { nodes { id topic uri } pageInfo { hasNextPage } } }';
    const topics = ['SUBSCRIPTION_CONTRACTS_CREATE', 'SUBSCRIPTION_CONTRACTS_UPDATE', 'APP_UNINSTALLED'];
    const legacyUri = 'https://placeinthyme.com/wp-json/pit-rotation/v1/webhook';
    const existing = (await this.request(query)).webhookSubscriptions;
    assert(!existing.pageInfo.hasNextPage, 'Webhook pagination needs review.');
    const uri = `${this.baseUrl}/api/webhook`; const ids = [];
    for (const topic of topics) {
      let hook = existing.nodes.find(item => item.topic === topic && item.uri === uri);
      if (!hook) hook = (await this.mutation(`mutation Hook($topic:WebhookSubscriptionTopic!,$input:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$input){webhookSubscription{id} userErrors{field message}}}`, { topic, input: { uri, format: 'JSON' } }, 'webhookSubscriptionCreate')).webhookSubscription;
      assert(hook?.id, 'Webhook was not confirmed.'); ids.push(hook.id);
    }
    // The only retired endpoints are the exact three legacy routes owned by this same app.
    for (const hook of existing.nodes.filter(item => item.uri === legacyUri && topics.includes(item.topic))) {
      const result = await this.mutation('mutation Retire($id:ID!){webhookSubscriptionDelete(id:$id){deletedWebhookSubscriptionId userErrors{field message}}}', { id: hook.id }, 'webhookSubscriptionDelete');
      assert(result.deletedWebhookSubscriptionId === hook.id, 'Retired webhook deletion was not confirmed.');
    }
    const confirmed = (await this.request(query)).webhookSubscriptions;
    if (confirmed.pageInfo.hasNextPage || topics.some(topic => confirmed.nodes.filter(item => item.topic === topic && item.uri === uri).length !== 1)
      || confirmed.nodes.some(item => item.uri === legacyUri && topics.includes(item.topic))) throw new ShopifyRequestError('WEBHOOK_ROUTING_NEEDS_REVIEW');
    this.store.setSetting('webhooks', ids);
    this.store.setSetting('webhookRouting', { destination: uri, legacyRotationEndpoints: 0, verifiedAt: Date.now() });
  }
  async contract(id) { const value = (await this.request(`query Contract($id:ID!){subscriptionContract(id:$id){${CONTRACT}}}`, { id })).subscriptionContract; assert(value?.id === id, 'Owned contract unavailable.'); return value; }
  async calculate(id, week, intentId) {
    const lines = week.lines.map(line => ({ productVariantLine: { productVariantId: line.variantId, quantity: line.quantity,
      priceOverride: { amount: amount(line.priceCents), currencyCode: 'USD' }, originSellingPlanId: this.store.getSetting('planId'),
      customAttributes: [{ key: '_pit_rotation_id', value: intentId }], discounts: [] } }));
    const result = await this.mutation(`mutation Calculate($id:ID!,$input:SubscriptionContractCalculationContractUpdateInput!){subscriptionContractUpdateCalculate(contractId:$id,contractUpdateInput:$input){subscriptionContractCalculation{... on SubscriptionContractCalculationPending{id} ... on SubscriptionContractCalculationSuccess{id} ... on SubscriptionContractCalculationFailure{id}} userErrors{field message code}}}`, { id, input: { withMerchandiseCustomizations: false, lines } }, 'subscriptionContractUpdateCalculate');
    assert(result.subscriptionContractCalculation?.id, 'Calculation ID missing.'); return result.subscriptionContractCalculation.id;
  }
  async calculation(id) { return (await this.request(`query Calculation($id:ID!){subscriptionContractCalculation(id:$id){__typename ... on SubscriptionContractCalculationPending{id} ... on SubscriptionContractCalculationFailure{id} ... on SubscriptionContractCalculationSuccess{id warnings{code message} calculatedContract{${SNAPSHOT}} projectedOrderTotals{subtotal{amount currencyCode} totalDelivery{amount currencyCode} totalMerchandiseDiscounts{amount currencyCode}}}}}`, { id })).subscriptionContractCalculation; }
  async commit(id) { await this.mutation('mutation Commit($id:ID!){subscriptionContractCalculationCommit(id:$id){contract{... on SubscriptionContract{id status}} userErrors{field message code}}}', { id }, 'subscriptionContractCalculationCommit'); }
  async attempt(id, key, origin) { return (await this.mutation('mutation Bill($id:ID!,$input:SubscriptionBillingAttemptInput!){subscriptionBillingAttemptCreate(subscriptionContractId:$id,subscriptionBillingAttemptInput:$input){subscriptionBillingAttempt{id ready errorCode nextActionUrl order{id}} userErrors{field message code}}}', { id, input: { idempotencyKey: key, originTime: origin, paymentProcessingPolicy: 'FAIL_UNLESS_VALID_PAYMENT_METHOD' } }, 'subscriptionBillingAttemptCreate')).subscriptionBillingAttempt; }
  async pollAttempt(id) { return (await this.request('query Attempt($id:ID!){subscriptionBillingAttempt(id:$id){id ready errorCode nextActionUrl order{id}}}', { id })).subscriptionBillingAttempt; }
  async nextDate(id, date) { await this.mutation('mutation Next($id:ID!,$date:DateTime!){subscriptionContractSetNextBillingDate(contractId:$id,date:$date){contract{id nextBillingDate} userErrors{field message}}}', { id, date }, 'subscriptionContractSetNextBillingDate'); }
  async cancel(id) {
    if ((await this.contract(id)).status === 'CANCELLED') return;
    const result = await this.mutation('mutation Cancel($id:ID!){subscriptionContractCancel(subscriptionContractId:$id,actor:CUSTOMER){contract{id status} userErrors{field message code}}}', { id }, 'subscriptionContractCancel');
    assert(result.contract?.id === id && result.contract.status === 'CANCELLED', 'Cancellation not confirmed; local renewals remain stopped.');
  }
}
