import {
  DELIVERY_CURRENCY,
  DELIVERY_MINIMUM_CENTS,
  LOCAL_FULFILLMENT_READY,
} from '@/lib/fulfillmentConfig';
import {
  ORDER_CUTOFF_CLOSED_MESSAGE,
  type FulfillmentMethod,
  isBeforeCutoff,
} from '@/lib/orderCutoff';
import { formatPrice, type MoneyV2 } from '@/lib/shopify';
import { parseMoneyCents } from '@/lib/moneyCents';

export const FULFILLMENT_NOT_READY_MESSAGE =
  'Online delivery and pickup checkout are awaiting final launch approval.';
export const UNVERIFIED_TOTAL_MESSAGE =
  'Your order total could not be verified. Refresh the cart before checkout.';

export interface DeliveryMinimumStatus {
  isMet: boolean;
  shortfallCents: number;
  message: string;
}

export function getDeliveryMinimumStatus(
  subtotal: MoneyV2 | null,
  method: FulfillmentMethod,
): DeliveryMinimumStatus {
  if (method === 'pickup') {
    return { isMet: true, shortfallCents: 0, message: '' };
  }

  const parsedCents = parseMoneyCents(subtotal?.amount);
  if (parsedCents === null || subtotal?.currencyCode !== DELIVERY_CURRENCY) {
    return { isMet: false, shortfallCents: 0, message: UNVERIFIED_TOTAL_MESSAGE };
  }
  const subtotalCents = parsedCents ?? 0;
  const shortfallCents = Math.max(0, DELIVERY_MINIMUM_CENTS - subtotalCents);
  const isMet = parsedCents !== null && subtotal?.currencyCode === DELIVERY_CURRENCY && shortfallCents === 0;

  return {
    isMet,
    shortfallCents,
    message: isMet
      ? ''
      : `Orange County delivery requires a $99 minimum. Add ${formatPrice(
        (shortfallCents / 100).toFixed(2),
        DELIVERY_CURRENCY,
      )} more or choose free pickup.`,
  };
}

/** One-time extras cannot make later weekly deliveries meet the delivery minimum. */
export function getRecurringDeliveryMinimumStatus(
  items: ReadonlyArray<{ sellingPlanId?: string; lineSubtotal: MoneyV2 }>,
  method: FulfillmentMethod,
): DeliveryMinimumStatus {
  const recurring = items.filter(item => Boolean(item.sellingPlanId));
  if (method === 'pickup' || recurring.length === 0) {
    return { isMet: true, shortfallCents: 0, message: '' };
  }
  let recurringCents = 0;
  for (const item of recurring) {
    const cents = parseMoneyCents(item.lineSubtotal.amount);
    if (cents === null || item.lineSubtotal.currencyCode !== DELIVERY_CURRENCY
      || !Number.isSafeInteger(recurringCents + cents)) {
      return { isMet: false, shortfallCents: 0, message: UNVERIFIED_TOTAL_MESSAGE };
    }
    recurringCents += cents;
  }
  const shortfallCents = Math.max(0, DELIVERY_MINIMUM_CENTS - recurringCents);
  return {
    isMet: shortfallCents === 0,
    shortfallCents,
    message: shortfallCents === 0 ? ''
      : `Weekly delivery requires at least $99 in recurring products. Add ${formatPrice(
        (shortfallCents / 100).toFixed(2), DELIVERY_CURRENCY,
      )} in weekly items or choose free pickup. One-time extras only count toward the first order.`,
  };
}

/** Revalidates launch readiness, cutoff, and the Shopify-returned subtotal. */
export function validateFulfillmentForCheckout(
  subtotal: MoneyV2 | null,
  method: FulfillmentMethod,
  now: Date = new Date(),
): void {
  if (!LOCAL_FULFILLMENT_READY) throw new Error(FULFILLMENT_NOT_READY_MESSAGE);
  if (!['delivery', 'pickup'].includes(method)) throw new Error('Choose local delivery or pickup. Shipping is not offered.');
  if (!isBeforeCutoff(now)) throw new Error(ORDER_CUTOFF_CLOSED_MESSAGE);
  if (subtotal?.currencyCode !== DELIVERY_CURRENCY || parseMoneyCents(subtotal?.amount) === null) {
    throw new Error(UNVERIFIED_TOTAL_MESSAGE);
  }

  const minimum = getDeliveryMinimumStatus(subtotal, method);
  if (!minimum.isMet) throw new Error(minimum.message);
}
