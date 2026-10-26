import { assert } from './domain.mjs';

/** Existing prepaid records remain readable/cancellable; new enrollment is weekly only. */
export function assertWeeklyJuiceEnrollment(value) {
  assert(value?.billingPreference === 'weekly', 'New juice subscriptions are paid weekly, not four weeks upfront. Review your mix again.');
}
