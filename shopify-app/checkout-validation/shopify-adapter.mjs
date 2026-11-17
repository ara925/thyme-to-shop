import { MEAL_MINIMUM_CENTS, validateRestrictedCheckout } from './rules.mjs';

const messages = {
  'plan-configuration-review': 'Checkout needs a store configuration check. Please contact Place in Thyme.',
  'prepaid-not-offered': 'Custom juice plans are paid weekly. Return to the shop to choose the weekly option.',
  'mixed-custom-plans': 'Please check out with your meal and custom juice plans separately.',
  'currency-review': 'This plan can only be ordered in US dollars.',
  'service-week-changed': 'The service week has changed. Return to the shop to choose the next available week.',
  'service-week-unverified': 'This subscription needs a fresh service-week review. Return to the shop to review your selection.',
  'ordinary-cutoff-closed': 'Ordering for this week closes Friday at 11:59 PM Pacific and reopens Monday. Please return to the shop for the next order window.',
  'invalid-meal-line': 'One of these meals is not on the menu for this service week. Please review your selection.',
  'meal-minimum': `The selected meals must total at least $${MEAL_MINIMUM_CENTS / 100} for this week.`,
  'invalid-juice-line': 'A juice or its price does not match the weekly plan. Please review your selection.',
  'juice-minimum': 'The weekly juices must total $134.99 before the 10% discount. One-time tea does not count.',
  'delivery-address-review': 'Please verify this exact Orange County delivery address in the shop, or choose free pickup.',
  'recurring-price-review': 'A recurring price could not be verified. Please return to the shop and review your plan.',
  'recurring-delivery-minimum': 'Weekly delivery requires at least $99 in recurring products. One-time items do not count.',
  'fulfillment-review': 'Choose free pickup or eligible Orange County local delivery. Shipping is not offered.',
};

function cents(money) {
  if (money?.currencyCode !== 'USD' || typeof money.amount !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(money.amount)) return null;
  const [whole, fraction = ''] = money.amount.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function operations(codes) {
  return { operations: codes.length ? [{ validationAdd: { errors: codes.map(code => ({ message: messages[code], target: '$.cart' })) } }] : [] };
}

// Implements the documented cart.validations.generate.run input/output shape.
// Not deployed. The host must supply deterministic verifiers for the signed
// address and service claims. Neither claim is trusted from a cart attribute.
export function shopifyCheckoutResult(input, verifyAddress = () => false, verifyService = () => false) {
  if (input?.buyerJourney?.step !== 'CHECKOUT_COMPLETION') return operations([]);
  const { cart, shop, validation } = input;
  const config = validation?.metafield?.jsonValue;
  if (!Array.isArray(cart?.lines) || !cart.lines.length || !Array.isArray(cart.deliveryGroups)
    || !config?.plans || !config?.catalog || typeof config.catalog !== 'object' || Array.isArray(config.catalog)) {
    return operations(['plan-configuration-review']);
  }
  const groups = cart.deliveryGroups;
  if (!groups.length || groups.some(g => !g?.id || !['LOCAL', 'PICK_UP'].includes(g.selectedDeliveryOption?.deliveryMethodType))) {
    return operations(['fulfillment-review']);
  }
  const methods = new Set(groups.map(g => g.selectedDeliveryOption.deliveryMethodType));
  if (methods.size !== 1) return operations(['fulfillment-review']);
  const method = methods.has('LOCAL') ? 'local-delivery' : 'pickup';
  const groupIds = new Set(groups.map(g => g.id));
  if (groupIds.size !== groups.length || cart.lines.some(line => !Array.isArray(line?.deliveryGroups) || !line.deliveryGroups.length
    || line.deliveryGroups.some(group => !groupIds.has(group?.id)))) return operations(['fulfillment-review']);

  const pacificDate = shop?.localTime?.date;
  const countyVerified = method === 'local-delivery' && groups.every(group => {
    try {
      return verifyAddress(cart.countyApproval?.value, { address: group.deliveryAddress, pacificDate }, config.addressVerificationKey) === true;
    } catch {
      return false;
    }
  });
  const lines = cart.lines.map(line => {
    const id = line.merchandise?.id;
    const product = typeof id === 'string' && Object.hasOwn(config.catalog, id) ? config.catalog[id] : null;
    const planId = line.sellingPlanAllocation?.sellingPlan?.id;
    const unit = cents(line.cost?.amountPerQuantity);
    const total = cents(line.cost?.totalAmount);
    const verifyPrice = planId && (method === 'local-delivery' || planId === config.plans.meal || planId === config.plans.weeklyJuice);
    return {
      planId,
      variantId: id,
      quoteId: planId === config.plans.meal ? line.mealReference?.value : line.juiceReference?.value,
      quantity: line.quantity,
      // Total excludes order-level discounts. An allocation on a protected
      // line needs separate promotion qualification; do not count nominal price.
      paidUnitCents: !verifyPrice || (unit !== null && total === unit * line.quantity
        && Array.isArray(line.cost.discountAllocations) && !line.cost.discountAllocations.length) ? unit : null,
      approvedMealWeeks: product?.mealWeeks,
      isApprovedJuice: product?.type === 'juice',
      retailUnitCents: product?.retailUnitCents,
      isTea: product?.type === 'tea',
    };
  });
  const errors = validateRestrictedCheckout({
    lines,
    pacificDate,
    firstServiceDate: cart.serviceWeek?.value,
    fulfillment: method,
    countyProof: countyVerified ? 'verified-orange-county' : 'review',
    currency: cart.lines.every(line => line.cost?.amountPerQuantity?.currencyCode === 'USD') ? 'USD' : null,
  }, config.plans);
  const custom = lines.filter(line => line.planId === config.plans.meal || line.planId === config.plans.weeklyJuice);
  if (custom.length && !errors.includes('plan-configuration-review') && !errors.includes('service-week-changed')) {
    let approved = false;
    try {
      approved = verifyService(cart.serviceApproval?.value,
        { firstServiceDate: cart.serviceWeek?.value, pacificDate, lines: custom }, config.serviceVerificationKey) === true;
    } catch {
      // A checkout with no matching proof must not accept payment.
    }
    if (!approved) errors.push('service-week-unverified');
  }
  return operations(errors);
}
