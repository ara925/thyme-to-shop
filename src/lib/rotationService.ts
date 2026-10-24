import { z } from 'zod';

export function rotationApiUrl(): string | null {
  try {
    const value = import.meta.env.VITE_SHOPIFY_ROTATION_API_URL?.trim();
    if (!value) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port
      || url.pathname.replace(/\/$/, '') !== '/api'
      || ['placeinthyme.com', 'www.placeinthyme.com', 'shop.placeinthyme.com', 'checkout.placeinthyme.com'].includes(url.hostname)) return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}
export const ROTATION_WEEKS = ['week-a', 'week-b', 'week-c'] as const;
export type RotationWeek = typeof ROTATION_WEEKS[number];
export type RotationSelections = Record<RotationWeek, Record<string, number>>;
const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/);
const lineSchema = z.object({
  variantId, title: z.string().min(1).max(500), quantity: z.number().int().min(1).max(50),
  priceCents: z.number().int().min(0).max(1000000),
});
const weekSchema = z.object({
  subtotalCents: z.number().int().min(12000).max(1000000),
  lines: z.array(lineSchema).min(1).max(50),
}).refine(week => week.lines.reduce((sum, line) => sum + line.quantity * line.priceCents, 0) === week.subtotalCents
  && new Set(week.lines.map(line => line.variantId)).size === week.lines.length);
const weeksSchema = z.object({ 'week-a': weekSchema, 'week-b': weekSchema, 'week-c': weekSchema });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const previewSchema = z.object({
  firstWeek: z.enum(ROTATION_WEEKS), firstServiceDate: dateSchema, weeks: weeksSchema,
  currencyCode: z.literal('USD'), enrollmentReady: z.boolean(),
});
const planSchema = z.object({
  state: z.enum(['quoted', 'active', 'calculating', 'committing', 'billing', 'finalizing', 'review', 'stopped']),
  weeks: weeksSchema, nextWeek: z.enum(ROTATION_WEEKS), serviceDate: z.string().datetime({ offset: true }),
  canCancel: z.boolean(), cancellationPending: z.boolean(), cancellationConfirmed: z.boolean(),
  nextBillingDate: z.string().datetime({ offset: true }).nullable(),
});
export type RotationPreview = z.infer<typeof previewSchema>;
export type ManagedRotation = z.infer<typeof planSchema>;
export interface RotationAccess { id: string; token: string }

export function validRotationAccess(access: RotationAccess): boolean {
  return /^[a-f0-9]{48}$/.test(access.id) && /^[a-f0-9]{64}$/.test(access.token);
}

export class RotationServiceError extends Error {
  constructor(message: string, readonly cancellationPending = false) { super(message); }
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const api = rotationApiUrl();
  if (!api) throw new RotationServiceError('Online meal-plan management is not available yet. Your selections are preserved; contact us for setup.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${api}${path}`, {
      ...options, signal: controller.signal, credentials: 'omit', cache: 'no-store',
      redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const body = await response.json();
    if (!response.ok) {
      if (body?.code === 'pit_cancel_pending') throw new RotationServiceError(
        'Renewals are stopped locally. Shopify cancellation still needs confirmation. Retry below or contact us.', true,
      );
      if (response.status === 403 || response.status === 410) throw new RotationServiceError('This private plan link is invalid or has expired. Contact us for help.');
      if (response.status === 429) throw new RotationServiceError('Please wait a minute before trying again.');
      if (response.status === 409) throw new RotationServiceError('A renewal is being processed. Please retry shortly or contact us.');
      if (response.status === 422) throw new RotationServiceError('Your selections could not be verified. Check each week’s minimum, prices, and availability, then try again.');
      throw new RotationServiceError('The meal-plan service is temporarily unavailable. Your selections are preserved. Please try again or contact us.');
    }
    return body;
  } catch (error) {
    if (error instanceof RotationServiceError) throw error;
    throw new RotationServiceError('We could not reach the meal-plan service. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new RotationServiceError('The meal-plan service returned an incomplete result. Please try again or contact us.');
  return parsed.data;
}

export async function previewMealRotation(selections: RotationSelections, signal?: AbortSignal): Promise<RotationPreview> {
  const parsed = z.object({
    'week-a': z.record(variantId, z.number().int().min(1).max(50)),
    'week-b': z.record(variantId, z.number().int().min(1).max(50)),
    'week-c': z.record(variantId, z.number().int().min(1).max(50)),
  }).safeParse(selections);
  if (!parsed.success) throw new RotationServiceError('Check the selected meals and quantities before reviewing your plan.');
  return parse(previewSchema, await request('/preview', { method: 'POST', body: JSON.stringify({ selections: parsed.data }), signal }));
}

export async function getManagedRotation(access: RotationAccess, signal?: AbortSignal): Promise<ManagedRotation> {
  if (!validRotationAccess(access)) throw new RotationServiceError('This private plan link is invalid.');
  return parse(planSchema, await request(`/manage/${access.id}`, { headers: { Authorization: `Bearer ${access.token}` }, signal }));
}

export async function cancelManagedRotation(access: RotationAccess): Promise<void> {
  if (!validRotationAccess(access)) throw new RotationServiceError('This private plan link is invalid.');
  parse(z.object({ state: z.literal('cancelled') }), await request(`/manage/${access.id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${access.token}` }, body: JSON.stringify({ action: 'cancel' }),
  }));
}

// Tokens belong in a fragment (never a query string) and are stripped before rendering.
// Session storage permits reloads without leaving long-lived credentials in localStorage.
export function consumeRotationAccess(id: string, location: Location, history: History, storage?: Storage): RotationAccess | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const supplied = params.get('token');
  if (location.hash) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  if (!/^[a-f0-9]{48}$/.test(id)) return null;
  try {
    const session = storage ?? window.sessionStorage;
    const token = supplied ?? session.getItem(`pit-rotation-access-${id}`) ?? '';
    const access = { id, token };
    if (!validRotationAccess(access)) return null;
    session.setItem(`pit-rotation-access-${id}`, token);
    return access;
  } catch {
    const access = { id, token: supplied ?? '' };
    return validRotationAccess(access) ? access : null;
  }
}

export const rotationWeekLabel = (week: RotationWeek) => `Week ${ROTATION_WEEKS.indexOf(week) + 1}`;
export const rotationDateLabel = (value: string) => new Date(
  value.length === 10 ? `${value}T12:00:00-08:00` : value,
).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
