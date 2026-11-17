// Provider-neutral rule core for native checkout qualification. No callers in
// production. A checkout adapter must supply platform prices and method, and a
// trusted proof for the actual selected address; none can come from cart notes.
const dayMs = 86_400_000;
const weekAnchor = Date.parse('2026-03-16T00:00:00Z');
const mealWeeks = ['week-a', 'week-b', 'week-c'];
export const MEAL_MINIMUM_CENTS = 9_900;

function dateAtMidnight(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const value = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day ? value : NaN;
}

// Shopify shop.localTime.date is the authoritative Pacific calendar date.
// Last eligible moment is Friday 23:59:59.999; a weekend order skips one Monday.
export function serviceWeekForPacificDate(day) {
  const value = dateAtMidnight(day);
  if (!Number.isFinite(value)) return null;
  const weekday = new Date(value).getUTCDay();
  const ahead = (8 - weekday) % 7 || 7;
  const monday = value + (ahead + (weekday === 0 || weekday === 6 ? 7 : 0)) * dayMs;
  const index = (monday - weekAnchor) / (7 * dayMs);
  return { date: new Date(monday).toISOString().slice(0, 10), mealWeek: mealWeeks[((index % 3) + 3) % 3] };
}

const centsAreValid = value => Number.isSafeInteger(value) && value > 0 && value <= 999_999_999;
const lineAmount = (unit, quantity) => centsAreValid(unit) && Number.isSafeInteger(quantity) && quantity > 0
  && Number.isSafeInteger(unit * quantity) ? unit * quantity : null;
const addAmount = (sum, amount) => amount !== null && Number.isSafeInteger(sum + amount) ? sum + amount : null;
const tenPercentOff = unit => Math.floor((unit * 90 + 50) / 100);

function ordinaryOrderingOpen(pacificDate) {
  const midnight = dateAtMidnight(pacificDate);
  if (!Number.isFinite(midnight)) return false;
  const day = new Date(midnight).getUTCDay();
  return day >= 1 && day <= 5;
}

export function validateRestrictedCheckout(input, plans) {
  const ids = [plans?.meal, plans?.weeklyJuice, plans?.retiredPrepaid];
  if (ids.some(id => typeof id !== 'string' || !/^gid:\/\/shopify\/SellingPlan\/\d+$/.test(id)) || new Set(ids).size !== ids.length) {
    return ['plan-configuration-review'];
  }
  const { lines, pacificDate, firstServiceDate, fulfillment, countyProof, currency } = input;
  const errors = new Set();
  const scoped = lines.filter(line => line.planId === plans.meal || line.planId === plans.weeklyJuice || line.planId === plans.retiredPrepaid);
  const meals = scoped.filter(line => line.planId === plans.meal);
  const juice = scoped.filter(line => line.planId === plans.weeklyJuice);
  if (scoped.some(line => line.planId === plans.retiredPrepaid)) errors.add('prepaid-not-offered');
  if (meals.length && juice.length) errors.add('mixed-custom-plans');
  if (scoped.length && currency !== 'USD') errors.add('currency-review');

  const upcoming = serviceWeekForPacificDate(pacificDate);
  if (scoped.length && (!upcoming || firstServiceDate !== upcoming.date)) errors.add('service-week-changed');
  // Use Shopify's date at final submission. Ordinary and fixed-bundle carts
  // follow the storefront weekend closure, without using a shopper cart note.
  if (!scoped.length && !ordinaryOrderingOpen(pacificDate)) errors.add('ordinary-cutoff-closed');
  let mealTotal = 0;
  for (const line of meals) {
    const amount = lineAmount(line.paidUnitCents, line.quantity);
    const sum = addAmount(mealTotal, amount);
    if (!upcoming || !Array.isArray(line.approvedMealWeeks) || !line.approvedMealWeeks.includes(upcoming.mealWeek)
      || amount === null || sum === null) errors.add('invalid-meal-line');
    else mealTotal = sum;
  }
  if (meals.length && mealTotal < MEAL_MINIMUM_CENTS) errors.add('meal-minimum');
  let juiceRetail = 0;
  for (const line of juice) {
    const amount = lineAmount(line.retailUnitCents, line.quantity);
    const sum = addAmount(juiceRetail, amount);
    if (line.isApprovedJuice !== true || line.isTea !== false || amount === null || sum === null
      || line.paidUnitCents !== tenPercentOff(line.retailUnitCents)) errors.add('invalid-juice-line');
    else juiceRetail = sum;
  }
  if (juice.length && juiceRetail < 13_499) errors.add('juice-minimum');

  const recurring = lines.filter(line => Boolean(line.planId));
  if (fulfillment === 'local-delivery') {
    if (countyProof !== 'verified-orange-county') errors.add('delivery-address-review');
    if (recurring.length) {
      let subtotal = 0;
      for (const line of recurring) {
        const amount = addAmount(subtotal, lineAmount(line.paidUnitCents, line.quantity));
        if (amount === null) errors.add('recurring-price-review');
        else subtotal = amount;
      }
      if (currency !== 'USD' || subtotal < 9_900) errors.add('recurring-delivery-minimum');
    }
  } else if (fulfillment !== 'pickup') {
    errors.add('fulfillment-review');
  }
  return [...errors];
}
