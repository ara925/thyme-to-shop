import { z } from 'zod';
import { subscriptionRequest, parseSubscriptionResponse, rotationPreviewSchema, validRotationAccess, RotationServiceError, type RotationSelections, type RotationPreview, type RotationAccess } from './rotationService';
import { SHOPIFY_STORE_PERMANENT_DOMAIN, SHOPIFY_CHECKOUT_DOMAIN } from './shopify';

export type SubscriptionFulfillment = { method: 'pickup'; window: 'monday-after-9am' } | { method: 'delivery'; window: 'monday' | 'tuesday' };
export const enrollmentAccessSchema = z.object({ id: z.string().regex(/^[a-f0-9]{48}$/), manageToken: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.string().datetime({ offset: true }) });
const quoteSchema = rotationPreviewSchema.merge(enrollmentAccessSchema).extend({ sellingPlanId: z.string().regex(/^gid:\/\/shopify\/SellingPlan\/\d+$/) });
const fulfillmentSchema = z.union([
  z.object({ method: z.literal('pickup'), window: z.literal('monday-after-9am') }).strict(),
  z.object({ method: z.literal('delivery'), window: z.enum(['monday', 'tuesday']) }).strict(),
]);
export const secureCheckoutSchema = z.string().url().refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
    && [SHOPIFY_STORE_PERMANENT_DOMAIN, SHOPIFY_CHECKOUT_DOMAIN].includes(url.hostname) && /^\/(?:checkouts\/|cart\/c\/)/.test(url.pathname); }
  catch { return false; }
});
const checkoutSchema = z.object({ checkoutUrl: secureCheckoutSchema, expiresAt: z.string().datetime({ offset: true }),
  firstWeek: z.enum(['week-a', 'week-b', 'week-c']), firstServiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  firstSubtotalCents: z.number().int().min(12000).max(1000000), fulfillment: fulfillmentSchema });
export type MealEnrollmentQuote = z.infer<typeof quoteSchema>;

export async function quoteMealEnrollment(selections: RotationSelections, reviewed: RotationPreview, signal?: AbortSignal): Promise<MealEnrollmentQuote> {
  if (!reviewed.enrollmentReady) throw new RotationServiceError('Online enrollment is not open yet. Your selections are preserved.');
  const quote = parseSubscriptionResponse(quoteSchema, await subscriptionRequest('/quote', { method: 'POST', body: JSON.stringify({ selections }), signal }));
  if (!quote.enrollmentReady || quote.firstWeek !== reviewed.firstWeek || quote.firstServiceDate !== reviewed.firstServiceDate || JSON.stringify(quote.weeks) !== JSON.stringify(reviewed.weeks)) {
    throw new RotationServiceError('Prices or the first service week changed. Review your rotation again before checkout.');
  }
  if (Date.parse(quote.expiresAt) <= Date.now()) throw new RotationServiceError('This review expired. Check your rotation again.');
  return quote;
}

export function retainEnrollmentAccess(access: RotationAccess, kind: 'meal' | 'juice' = 'meal', storage?: Storage): string {
  if (!validRotationAccess(access)) throw new RotationServiceError('Private plan access could not be saved. Please try again.');
  try { (storage ?? window.sessionStorage).setItem(`pit-${kind === 'meal' ? 'rotation' : 'juice'}-access-${access.id}`, access.token); }
  catch { throw new RotationServiceError('This browser cannot save your private management link. Enable session storage or contact us before checkout.'); }
  return `/${kind}-plan/${access.id}#token=${access.token}`;
}

export async function startMealEnrollmentCheckout(quote: MealEnrollmentQuote, fulfillment: SubscriptionFulfillment, signal?: AbortSignal): Promise<string> {
  const access = { id: quote.id, token: quote.manageToken };
  if (!validRotationAccess(access) || Date.parse(quote.expiresAt) <= Date.now()) throw new RotationServiceError('This review expired. Check your rotation again.');
  const choice = parseSubscriptionResponse(fulfillmentSchema, fulfillment);
  const checkout = parseSubscriptionResponse(checkoutSchema, await subscriptionRequest(`/checkout/${quote.id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${quote.manageToken}` }, body: JSON.stringify({ fulfillment: choice }), signal,
  }));
  if (checkout.firstWeek !== quote.firstWeek || checkout.firstServiceDate !== quote.firstServiceDate
    || checkout.firstSubtotalCents !== quote.weeks[quote.firstWeek].subtotalCents || JSON.stringify(checkout.fulfillment) !== JSON.stringify(choice)
    || Date.parse(checkout.expiresAt) <= Date.now()) throw new RotationServiceError('Checkout no longer matches your reviewed rotation. Review it again before paying.');
  return checkout.checkoutUrl;
}
