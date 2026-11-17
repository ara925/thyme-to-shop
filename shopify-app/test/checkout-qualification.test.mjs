import test from 'node:test';
import { strict as assert } from 'node:assert';
import { serviceWeekForPacificDate, validateRestrictedCheckout } from '../checkout-validation/rules.mjs';
import { firstServiceDate, weekAt } from '../src/domain.mjs';

const plans = {
  meal: 'gid://shopify/SellingPlan/1',
  weeklyJuice: 'gid://shopify/SellingPlan/2',
  retiredPrepaid: 'gid://shopify/SellingPlan/3',
};
const fixedPlan = 'gid://shopify/SellingPlan/4';
const pacificDate = '2026-11-13';
const upcoming = serviceWeekForPacificDate(pacificDate);
const check = (lines, extras = {}, configuration = plans) => validateRestrictedCheckout({
  lines, pacificDate, firstServiceDate: upcoming.date, currency: 'USD', fulfillment: 'pickup', ...extras,
}, configuration);
const meal = cents => ({ planId: plans.meal, quantity: 1, paidUnitCents: cents, approvedMealWeeks: [upcoming.mealWeek] });
const juice = cents => ({
  planId: plans.weeklyJuice, quantity: 1, retailUnitCents: cents, paidUnitCents: Math.floor((cents * 90 + 50) / 100),
  isApprovedJuice: true, isTea: false,
});
const tea = { quantity: 1, paidUnitCents: 300, isTea: true };
const fixed = cents => ({ planId: fixedPlan, quantity: 1, paidUnitCents: cents });
const local = { fulfillment: 'local-delivery', countyProof: 'verified-orange-county' };

test('only the eligible week’s meal lines count at the exact $99 boundary', () => {
  assert.deepEqual(check([meal(9_900)]), []);
  assert.deepEqual(check([meal(9_899), fixed(5000), tea]), ['meal-minimum']);
  assert.deepEqual(check([meal(9_900), { ...meal(1000), approvedMealWeeks: ['other-week'] }]), ['invalid-meal-line']);
  assert.deepEqual(check([{ ...meal(4950), quantity: 2 }]), []);
});

test('weekly juice uses catalog cents before the 10% adjustment and ignores one-time tea', () => {
  assert.deepEqual(check([juice(13_499), tea]), []);
  assert.deepEqual(check([juice(13_498), tea]), ['juice-minimum']);
  assert.deepEqual(check([{ ...juice(13_499), paidUnitCents: 13_499 }]), ['invalid-juice-line', 'juice-minimum']);
  assert.deepEqual(check([juice(13_499), { ...tea, ...juice(300), isTea: true }]), ['invalid-juice-line']);
  assert.deepEqual(check([{ ...juice(13_499), planId: plans.retiredPrepaid }]), ['prepaid-not-offered']);
});

test('the recurring delivery minimum excludes one-time items and does not apply to pickup', () => {
  assert.deepEqual(check([fixed(9899), tea], local), ['recurring-delivery-minimum']);
  assert.deepEqual(check([fixed(9900), tea], local), []);
  assert.deepEqual(check([fixed(9499), tea]), []);
  assert.deepEqual(check([tea]), []);
  assert.deepEqual(check([fixed(9900)], { ...local, countyProof: 'review' }), ['delivery-address-review']);
  assert.deepEqual(check([fixed(9900)], { ...local, countyProof: 'outside-orange-county' }), ['delivery-address-review']);
  assert.deepEqual(check([fixed(9900)], { fulfillment: 'shipping' }), ['fulfillment-review']);
});

test('native calendar matches the subscription app on both Pacific offsets and rollover days', () => {
  for (const [instant, shopDate] of [
    ['2026-07-11T06:59:59.999Z', '2026-07-10'],
    ['2026-07-11T07:00:00.000Z', '2026-07-11'],
    ['2026-11-14T07:59:59.999Z', '2026-11-13'],
    ['2026-11-14T08:00:00.000Z', '2026-11-14'],
    ['2026-11-15T21:30:00.000Z', '2026-11-15'],
    ['2026-11-16T21:30:00.000Z', '2026-11-16'],
  ]) {
    const date = firstServiceDate(Date.parse(instant));
    assert.deepEqual(serviceWeekForPacificDate(shopDate), { date: date.slice(0, 10), mealWeek: weekAt(date) });
  }
  assert.deepEqual(check([meal(12_000)], { pacificDate: '2026-11-14' }).includes('service-week-changed'), true);
  assert.equal(serviceWeekForPacificDate('2026-02-30'), null);
});

test('malformed configuration cannot mistake unplanned merchandise for a custom plan', () => {
  assert.deepEqual(check([tea], {}, {}), ['plan-configuration-review']);
  assert.deepEqual(check([tea], {}, { ...plans, weeklyJuice: plans.meal }), ['plan-configuration-review']);
});
