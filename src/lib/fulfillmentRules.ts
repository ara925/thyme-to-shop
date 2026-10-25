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
  'Online delivery and pickup are not available until the Shopify fulfillment setup is complete.';
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
