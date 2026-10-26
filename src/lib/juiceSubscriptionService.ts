import { z } from 'zod';
import { subscriptionRequest, parseSubscriptionResponse, RotationServiceError, validRotationAccess, type RotationAccess } from './rotationService';
import { enrollmentAccessSchema, secureCheckoutSchema, type SubscriptionFulfillment } from './subscriptionCheckout';

const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/);
const money = z.number().int().min(0).max(5000000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(value + 'T12:00:00Z'); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; });
const line = z.object({ variantId, title: z.string().min(1).max(500), quantity: z.number().int().min(1).max(50), retailPriceCents: money, priceCents: money })
  .refine(item => item.retailPriceCents > 0 && item.priceCents === Math.floor((item.retailPriceCents * 90 + 50) / 100));
const tea = z.object({ variantId, title: z.string().min(1).max(500), quantity: z.number().int().min(1).max(50), priceCents: z.literal(300), subtotalCents: money })
  .refine(item => item.subtotalCents === item.quantity * 300);
export const juiceMixSchema = z.object({ billingPreference: z.enum(['weekly', 'prepaid']), minimumCents: z.literal(13499), discountPercent: z.literal(10), commitmentWeeks: z.literal(4),
  deliveriesPerPayment: z.union([z.literal(1), z.literal(4)]), retailSubtotalCents: money, subtotalCents: money, fourWeekSubtotalCents: money,
  firstSubtotalCents: money, lines: z.array(line).min(1).max(50), oneTimeAddOn: tea.nullable(),
}).refine(mix => mix.retailSubtotalCents >= mix.minimumCents
  && mix.retailSubtotalCents === mix.lines.reduce((sum, item) => sum + item.retailPriceCents * item.quantity, 0)
  && mix.subtotalCents === mix.lines.reduce((sum, item) => sum + item.priceCents * item.quantity, 0)
  && mix.fourWeekSubtotalCents === mix.subtotalCents * 4 && mix.deliveriesPerPayment === (mix.billingPreference === 'prepaid' ? 4 : 1)
  && mix.firstSubtotalCents === mix.subtotalCents * mix.deliveriesPerPayment + (mix.oneTimeAddOn?.subtotalCents || 0)
  && new Set(mix.lines.map(item => item.variantId)).size === mix.lines.length && !mix.lines.some(item => item.variantId === mix.oneTimeAddOn?.variantId));
const previewObject = z.object({ mix: juiceMixSchema, firstServiceDate: date, deliveryDates: z.array(date).length(4), currencyCode: z.literal('USD'), pricingVerified: z.boolean(), enrollmentReady: z.boolean() });
const validPreview = (value: z.infer<typeof previewObject>) => (!value.enrollmentReady || value.pricingVerified)
  && new Date(value.firstServiceDate + 'T12:00:00Z').getUTCDay() === 1
  && value.deliveryDates.every((valueDate, index) => Date.parse(valueDate + 'T12:00:00Z') === Date.parse(value.firstServiceDate + 'T12:00:00Z') + index * 604800000);
const previewSchema = previewObject.refine(value => validPreview(value) && value.mix.billingPreference === 'weekly');
const quoteSchema = previewObject.merge(enrollmentAccessSchema).refine(value => validPreview(value) && value.mix.billingPreference === 'weekly');
const inputSchema = z.object({ selections: z.record(variantId, z.number().int().min(1).max(50)).refine(items => Object.keys(items).length > 0 && Object.keys(items).length <= 50),
  billingPreference: z.literal('weekly'), teaQuantity: z.number().int().min(0).max(50) }).strict();
export type JuiceSelections = z.infer<typeof inputSchema>;
export type JuicePreview = z.infer<typeof previewSchema>;
export type JuiceEnrollmentQuote = z.infer<typeof quoteSchema>;
const managedSchema = z.object({ state: z.enum(['quoted', 'active', 'billing', 'finalizing', 'cancelling', 'review', 'stopped']), mix: juiceMixSchema,
  firstServiceDate: z.string().datetime({ offset: true }), nextServiceDate: z.string().datetime({ offset: true }), nextBillingDate: z.string().datetime({ offset: true }).nullable(),
  paidWeeks: z.number().int().min(0).max(10000), cancellationRequested: z.boolean(), cancellationPending: z.boolean(), cancellationConfirmed: z.boolean(),
  cancellationEffectiveDate: z.string().datetime({ offset: true }).nullable(), cancelAfterPaidWeeks: z.number().int().min(4).max(10000).refine(count => count % 4 === 0).nullable(), canCancel: z.boolean(),
}).refine(plan => !(plan.cancellationPending && plan.cancellationConfirmed) && (!plan.cancellationConfirmed || !plan.canCancel));
export type ManagedJuicePlan = z.infer<typeof managedSchema>;

export async function previewJuicePlan(selections: JuiceSelections, signal?: AbortSignal): Promise<JuicePreview> {
  const input = parseSubscriptionResponse(inputSchema, selections);
  return parseSubscriptionResponse(previewSchema, await subscriptionRequest('/juice/preview', { method: 'POST', body: JSON.stringify(input), signal }));
}
export async function quoteJuiceEnrollment(selections: JuiceSelections, reviewed: JuicePreview, signal?: AbortSignal): Promise<JuiceEnrollmentQuote> {
  if (!reviewed.enrollmentReady) throw new RotationServiceError('Online juice enrollment is not open yet. Your mix is preserved.');
  const quote = parseSubscriptionResponse(quoteSchema, await subscriptionRequest('/juice/quote', { method: 'POST', body: JSON.stringify(parseSubscriptionResponse(inputSchema, selections)), signal }));
  if (!quote.enrollmentReady || quote.firstServiceDate !== reviewed.firstServiceDate || JSON.stringify(quote.mix) !== JSON.stringify(reviewed.mix) || Date.parse(quote.expiresAt) <= Date.now()) {
    throw new RotationServiceError('Juice prices, billing terms or service dates changed. Review your mix again before checkout.');
  }
  return quote;
}
export async function startJuiceEnrollmentCheckout(quote: JuiceEnrollmentQuote, fulfillment: SubscriptionFulfillment, signal?: AbortSignal): Promise<string> {
  if (quote.mix.billingPreference !== 'weekly') throw new RotationServiceError('New juice subscriptions are paid weekly. Review your mix again.');
  if (!validRotationAccess({ id: quote.id, token: quote.manageToken }) || Date.parse(quote.expiresAt) <= Date.now()) throw new RotationServiceError('This juice review expired. Check your mix again.');
  const schema = z.object({ checkoutUrl: secureCheckoutSchema, expiresAt: z.string().datetime({ offset: true }), billingPreference: z.literal('weekly'), firstServiceDate: date,
    firstSubtotalCents: money, fulfillment: z.object({ method: z.enum(['pickup', 'delivery']), window: z.enum(['monday-after-9am', 'monday', 'tuesday']) }) });
  const checkout = parseSubscriptionResponse(schema, await subscriptionRequest(`/juice/checkout/${quote.id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${quote.manageToken}` }, body: JSON.stringify({ fulfillment }), signal,
  }));
  if (checkout.billingPreference !== quote.mix.billingPreference || checkout.firstServiceDate !== quote.firstServiceDate || checkout.firstSubtotalCents !== quote.mix.firstSubtotalCents
    || JSON.stringify(checkout.fulfillment) !== JSON.stringify(fulfillment) || Date.parse(checkout.expiresAt) <= Date.now()) throw new RotationServiceError('Juice checkout differs from your review. Please review it again before paying.');
  return checkout.checkoutUrl;
}
export async function getManagedJuicePlan(access: RotationAccess, signal?: AbortSignal): Promise<ManagedJuicePlan> {
  if (!validRotationAccess(access)) throw new RotationServiceError('This private juice-plan link is invalid.');
  return parseSubscriptionResponse(managedSchema, await subscriptionRequest(`/juice/manage/${access.id}`, { headers: { Authorization: `Bearer ${access.token}` }, signal }));
}
const cancellationSchema = z.object({ state: z.enum(['scheduled', 'cancelled']), effectiveDate: z.string().datetime({ offset: true }), afterPaidWeeks: z.number().int().min(4).refine(count => count % 4 === 0).optional() });
export async function cancelManagedJuicePlan(access: RotationAccess): Promise<z.infer<typeof cancellationSchema>> {
  if (!validRotationAccess(access)) throw new RotationServiceError('This private juice-plan link is invalid.');
  return parseSubscriptionResponse(cancellationSchema, await subscriptionRequest(`/juice/manage/${access.id}`, { method: 'POST', headers: { Authorization: `Bearer ${access.token}` }, body: JSON.stringify({ action: 'cancel_at_period_end' }) }));
}
