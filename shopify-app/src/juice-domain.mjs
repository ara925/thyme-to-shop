import { assert, cents, addDays, localDay, pacificTime, nextBillingDate } from './domain.mjs';

export const JUICE_MINIMUM_CENTS = 13499;
export const JUICE_TERM_WEEKS = 4;
export const JUICE_MERCHANT_CODE = 'pit-custom-juice-four-week-v1';
export const JUICE_MODES = ['weekly', 'prepaid'];
export const JUICE_TEA_TITLE = 'Hibiscus Tea (Sweetened)';
export const normalizeTitle = value => String(value).normalize('NFKC').replace(/[’‘]/g, "'").trim().toLowerCase();
export const isJuiceTea = title => [JUICE_TEA_TITLE, 'Hibiscus Tea Add-On'].some(value => normalizeTitle(value) === normalizeTitle(title));
export const deliveryWeeksPerPayment = mode => { assert(JUICE_MODES.includes(mode), 'Choose weekly billing or four-week prepayment.'); return mode === 'prepaid' ? 4 : 1; };
export const advanceService = (value, count) => pacificTime(addDays(localDay(value), count * 7));
export function advanceJuiceBilling(value, mode) { let date = value; for (let count = 0; count < deliveryWeeksPerPayment(mode); count++) date = nextBillingDate(date); return date; }

export function validateJuiceSelection(input, catalog) {
  assert(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 3
    && ['selections', 'billingPreference', 'teaQuantity'].every(key => Object.hasOwn(input, key)), 'Choose a juice mix and billing preference.');
  const multiplier = deliveryWeeksPerPayment(input.billingPreference);
  assert(catalog.minimumCents === JUICE_MINIMUM_CENTS, 'The approved juice minimum changed; review is required.');
  assert(Number.isInteger(input.teaQuantity) && input.teaQuantity >= 0 && input.teaQuantity <= 50, 'Invalid one-time tea quantity.');
  assert(input.selections && typeof input.selections === 'object' && !Array.isArray(input.selections), 'Choose your weekly juices.');
  const entries = Object.entries(input.selections); assert(entries.length > 0 && entries.length <= 50, 'Choose your weekly juices.');
  let retailSubtotalCents = 0; let subtotalCents = 0;
  const lines = entries.map(([variantId, quantity]) => {
    assert(/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId) && Number.isInteger(quantity) && quantity >= 1 && quantity <= 50, 'Invalid juice quantity.');
    const item = catalog.items[variantId];
    assert(item && item.type === 'Juice' && item.status === 'ACTIVE' && item.currency === 'USD' && item.available && !item.requiresComponents
      && !isJuiceTea(item.title), 'Juice is unavailable or is a one-time add-on.');
    const retailPriceCents = cents(item.price); assert(retailPriceCents > 0, 'Invalid juice retail price.');
    // USD unit rounding is explicit. Native selling-plan allocation and checkout read-back must agree before a link is returned.
    const priceCents = Math.floor((retailPriceCents * 90 + 50) / 100);
    retailSubtotalCents += retailPriceCents * quantity; subtotalCents += priceCents * quantity;
    return { variantId, title: item.title, quantity, retailPriceCents, priceCents };
  });
  assert(retailSubtotalCents >= JUICE_MINIMUM_CENTS && retailSubtotalCents <= 1000000, 'The weekly juice mix must reach $134.99 before the 10% adjustment.');
  let oneTimeAddOn = null;
  if (input.teaQuantity) {
    const tea = catalog.tea;
    assert(tea && tea.type === 'Juice' && tea.status === 'ACTIVE' && tea.currency === 'USD' && tea.available && !tea.requiresComponents
      && normalizeTitle(tea.title) === normalizeTitle(JUICE_TEA_TITLE) && cents(tea.price) === 300, 'The exact $3 one-time Hibiscus add-on is unavailable.');
    oneTimeAddOn = { variantId: tea.id, title: tea.title, quantity: input.teaQuantity, priceCents: 300, subtotalCents: input.teaQuantity * 300 };
  }
  return { billingPreference: input.billingPreference, minimumCents: JUICE_MINIMUM_CENTS, discountPercent: 10, commitmentWeeks: JUICE_TERM_WEEKS,
    deliveriesPerPayment: multiplier, retailSubtotalCents, subtotalCents, fourWeekSubtotalCents: subtotalCents * 4,
    firstSubtotalCents: subtotalCents * multiplier + (oneTimeAddOn?.subtotalCents || 0), lines, oneTimeAddOn };
}

export function unchangedJuiceMix(mix, catalog) {
  const verified = validateJuiceSelection({ selections: Object.fromEntries(mix.lines.map(line => [line.variantId, line.quantity])), billingPreference: mix.billingPreference, teaQuantity: 0 }, catalog);
  assert(verified.retailSubtotalCents === mix.retailSubtotalCents && verified.subtotalCents === mix.subtotalCents
    && verified.lines.every((line, index) => line.retailPriceCents === mix.lines[index].retailPriceCents && line.priceCents === mix.lines[index].priceCents), 'Juice prices changed; customer approval is required.');
}

export function juicePlanInput() {
  return { name: "Pick n' Choose — Four-Week Juice Plan", merchantCode: JUICE_MERCHANT_CODE, options: ['Billing choice'],
    sellingPlansToCreate: JUICE_MODES.map((mode, index) => ({ name: mode === 'weekly' ? 'Weekly payment, four-week minimum' : 'Four weeks prepaid, weekly delivery',
      options: [mode === 'weekly' ? 'Pay weekly' : 'Prepay four weeks'], position: index + 1, category: 'SUBSCRIPTION',
      billingPolicy: { recurring: { interval: 'WEEK', intervalCount: deliveryWeeksPerPayment(mode), minCycles: mode === 'weekly' ? 4 : 1, anchors: [{ type: 'WEEKDAY', day: 1 }] } },
      deliveryPolicy: { recurring: { interval: 'WEEK', intervalCount: 1, anchors: [{ type: 'WEEKDAY', day: 1 }], preAnchorBehavior: 'NEXT', cutoff: 2, intent: 'FULFILLMENT_BEGIN' } },
      pricingPolicies: [{ fixed: { adjustmentType: 'PERCENTAGE', adjustmentValue: { percentage: 10 } } }] })),
  };
}

export function validateJuicePlans(group) {
  assert(group?.merchantCode === JUICE_MERCHANT_CODE && group.sellingPlans?.nodes?.length === 2 && !group.sellingPlans.pageInfo?.hasNextPage, 'The app-owned juice plans need review.');
  return Object.fromEntries(JUICE_MODES.map(mode => {
    const candidates = group.sellingPlans.nodes.filter(plan => plan.category === 'SUBSCRIPTION' && plan.billingPolicy?.__typename === 'SellingPlanRecurringBillingPolicy'
      && plan.billingPolicy.interval === 'WEEK' && plan.billingPolicy.intervalCount === deliveryWeeksPerPayment(mode)
      && plan.billingPolicy.minCycles === (mode === 'weekly' ? 4 : 1) && plan.billingPolicy.maxCycles === null
      && plan.billingPolicy.anchors?.length === 1 && plan.billingPolicy.anchors[0].type === 'WEEKDAY' && plan.billingPolicy.anchors[0].day === 1
      && plan.deliveryPolicy?.__typename === 'SellingPlanRecurringDeliveryPolicy' && plan.deliveryPolicy.interval === 'WEEK' && plan.deliveryPolicy.intervalCount === 1
      && plan.deliveryPolicy.cutoff === 2 && plan.deliveryPolicy.preAnchorBehavior === 'NEXT' && plan.deliveryPolicy.intent === 'FULFILLMENT_BEGIN'
      && plan.deliveryPolicy.anchors?.length === 1 && plan.deliveryPolicy.anchors[0].type === 'WEEKDAY' && plan.deliveryPolicy.anchors[0].day === 1
      && plan.pricingPolicies?.length === 1 && plan.pricingPolicies[0].__typename === 'SellingPlanFixedPricingPolicy'
      && plan.pricingPolicies[0].adjustmentType === 'PERCENTAGE' && plan.pricingPolicies[0].adjustmentValue?.percentage === 10);
    assert(candidates.length === 1 && /^gid:\/\/shopify\/SellingPlan\/\d+$/.test(candidates[0].id), 'Weekly or prepaid juice policy does not match the approved four-week terms.');
    return [mode, candidates[0].id];
  }));
}

export function cancellationTarget(data) {
  assert(Number.isInteger(data.paidWeeks) && data.paidWeeks >= 1, 'The juice plan has no confirmed payment.');
  const afterPaidWeeks = Math.ceil(data.paidWeeks / JUICE_TERM_WEEKS) * JUICE_TERM_WEEKS;
  return { afterPaidWeeks, effectiveDate: advanceService(data.firstServiceDate, afterPaidWeeks), ready: data.paidWeeks >= afterPaidWeeks };
}
