import { SHOP, CLIENT_ID, SCOPES, ZONE, assert, amount } from './domain.mjs';

export const API_VERSION = '2026-10';
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
    assert(response.ok, `Shopify request failed (${response.status}).`);
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
    assert(response.data && !response.errors?.length, 'Shopify rejected the app request.'); return response.data;
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
      assert(result.shop.currencyCode === 'USD' && result.shop.ianaTimezone === ZONE, 'Store currency or timezone changed.');
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
    const result = await this.request(`query { currentAppInstallation { app { id } } subscriptionContracts(first:1) { nodes { id } pageInfo { hasNextPage } }
      sellingPlanGroups(first:100) { nodes { id appId merchantCode name sellingPlans(first:10) { nodes { id name } } } pageInfo { hasNextPage } } }`);
    assert(!result.sellingPlanGroups.pageInfo.hasNextPage, 'Selling-plan pagination needs review.');
    const appId = result.currentAppInstallation.app.id.split('/').pop();
    const groups = result.sellingPlanGroups.nodes.filter(group => group.merchantCode === 'pit-three-week-rotation-v1');
    assert(groups.length === 1 && String(groups[0].appId).split('/').pop() === appId && groups[0].sellingPlans.nodes.length === 1, 'Existing owned rotation plan needs review. No catalog was changed.');
    const planId = groups[0].sellingPlans.nodes[0].id;
    assert(/^gid:\/\/shopify\/SellingPlan\/\d+$/.test(planId), 'Owned plan ID missing.');
    this.store.setSetting('planId', planId); this.store.setSetting('verifiedAt', Date.now());
    return { mealCount: Object.keys(catalog).length, hasExistingContracts: result.subscriptionContracts.nodes.length > 0, plan: groups[0].name };
  }
  async migrateWebhooks() {
    const existing = (await this.request('query { webhookSubscriptions(first:100) { nodes { id topic uri } pageInfo { hasNextPage } } }')).webhookSubscriptions;
    assert(!existing.pageInfo.hasNextPage, 'Webhook pagination needs review.');
    const uri = `${this.baseUrl}/api/webhook`; const ids = [];
    for (const topic of ['SUBSCRIPTION_CONTRACTS_CREATE', 'SUBSCRIPTION_CONTRACTS_UPDATE', 'APP_UNINSTALLED']) {
      let hook = existing.nodes.find(item => item.topic === topic && item.uri === uri);
      if (!hook) hook = (await this.mutation(`mutation Hook($topic:WebhookSubscriptionTopic!,$input:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$input){webhookSubscription{id} userErrors{field message}}}`, { topic, input: { uri, format: 'JSON' } }, 'webhookSubscriptionCreate')).webhookSubscription;
      assert(hook?.id, 'Webhook was not confirmed.'); ids.push(hook.id);
    }
    this.store.setSetting('webhooks', ids);
    // The only retired endpoints are the exact three legacy routes owned by this same app.
    for (const hook of existing.nodes.filter(item => item.uri === 'https://placeinthyme.com/wp-json/pit-rotation/v1/webhook')) {
      await this.mutation('mutation Retire($id:ID!){webhookSubscriptionDelete(id:$id){deletedWebhookSubscriptionId userErrors{field message}}}', { id: hook.id }, 'webhookSubscriptionDelete');
    }
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
