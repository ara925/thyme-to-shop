import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { previewJuicePlan, quoteJuiceEnrollment, startJuiceEnrollmentCheckout, type JuicePreview, type JuiceSelections, type JuiceEnrollmentQuote } from '@/lib/juiceSubscriptionService';
import { rotationApiUrl, rotationDateLabel } from '@/lib/rotationService';
import { retainEnrollmentAccess, type SubscriptionFulfillment } from '@/lib/subscriptionCheckout';
import { formatPrice } from '@/lib/shopify';
import { SubscriptionCheckoutForm } from './SubscriptionCheckout';

const dollars = (cents: number) => formatPrice((cents / 100).toFixed(2), 'USD');
export function JuicePlanReviewResult({ preview }: { preview: JuicePreview }) {
  const mix = preview.mix;
  return <div role="status" className="mt-4 space-y-3 text-sm">
    <p className="font-semibold">{mix.billingPreference === 'prepaid' ? 'Four Weeks Prepaid' : 'Weekly Payment — Four-Week Minimum'}</p>
    <dl className="space-y-2"><div className="flex justify-between gap-4"><dt>Weekly mix before discount</dt><dd>{dollars(mix.retailSubtotalCents)}</dd></div><div className="flex justify-between gap-4"><dt>Weekly mix after 10%</dt><dd className="font-semibold">{dollars(mix.subtotalCents)}</dd></div><div className="flex justify-between gap-4"><dt>{mix.billingPreference === 'prepaid' ? 'Four weeks of juice' : 'Four-week juice cost (paid weekly)'}</dt><dd>{dollars(mix.fourWeekSubtotalCents)}</dd></div>{mix.oneTimeAddOn && <div className="flex justify-between gap-4"><dt>Hibiscus Tea — first order only</dt><dd>{dollars(mix.oneTimeAddOn.subtotalCents)}</dd></div>}<div className="flex justify-between gap-4 border-t pt-2"><dt className="font-semibold">First {mix.billingPreference === 'prepaid' ? 'four-week payment' : 'weekly payment'} subtotal</dt><dd className="font-semibold">{dollars(mix.firstSubtotalCents)}</dd></div></dl>
    <ol className="space-y-1">{preview.deliveryDates.map((date, index) => <li key={date}>Week {index + 1}: {rotationDateLabel(date)}</li>)}</ol>
    <p className="text-muted-foreground">The same juice mix repeats each week. You pay weekly, not four weeks upfront. Pickup is free on Monday after 9:00 AM; Orange County delivery is Monday–Tuesday and adds $15 for each weekly delivery. Tax is confirmed by Shopify.</p>
    <p className="font-medium">With local delivery: {dollars(mix.firstSubtotalCents + 1500)} for the first week{mix.oneTimeAddOn ? `, then ${dollars(mix.subtotalCents + 1500)} each week` : ' and each following week'}, before tax. Four weekly delivery fees total $60; they are not charged upfront.</p>
    <p>{mix.billingPreference === 'prepaid' ? 'One payment funds four weekly deliveries. Cancellation stops the next four-week renewal; already-paid deliveries are not automatically cancelled or refunded.' : 'Payments continue weekly through the current four-week commitment. Cancellation is scheduled for the end of that period, before another four-week period begins.'}</p>
    <p className="font-medium">{preview.enrollmentReady ? 'Continue to your separate Shopify checkout below. This review has not started billing.' : preview.pricingVerified ? 'The app-owned weekly-payment policy is verified. Online enrollment remains closed until checkout and billing acceptance pass; the manual request below is still available.' : 'Retail prices were checked. The app-owned weekly-payment policy still needs verification before online enrollment opens. This is a no-charge preview.'}</p>
  </div>;
}

export function JuicePlanReview({ selections, navigate = (url: string) => window.location.assign(url) }: { selections: JuiceSelections | null; navigate?: (url: string) => void }) {
  const key = JSON.stringify(selections); const [result, setResult] = useState<{ key: string; preview: JuicePreview } | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [managementLink, setManagementLink] = useState('');
  const active = useRef<AbortController>(); const quote = useRef<JuiceEnrollmentQuote | null>(null);
  useEffect(() => { active.current?.abort(); quote.current = null; setPending(false); setError(''); setManagementLink(''); return () => active.current?.abort(); }, [key]);
  const preview = result?.key === key ? result.preview : null;
  async function review() {
    if (!selections || pending) return;
    const controller = new AbortController(); active.current = controller; setPending(true); setError(''); setResult(null); quote.current = null;
    try { const preview = await previewJuicePlan(selections, controller.signal); if (!controller.signal.aborted) setResult({ key, preview }); }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }
  async function checkout(fulfillment: SubscriptionFulfillment) {
    if (!preview?.enrollmentReady || !selections || pending) return;
    const controller = new AbortController(); active.current = controller; setPending(true); setError('');
    try {
      const access = quote.current ?? await quoteJuiceEnrollment(selections, preview, controller.signal); if (controller.signal.aborted) return;
      quote.current = access; setManagementLink(retainEnrollmentAccess({ id: access.id, token: access.manageToken }, 'juice'));
      const destination = await startJuiceEnrollmentCheckout(access, fulfillment, controller.signal); if (!controller.signal.aborted) navigate(destination);
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Your juice checkout could not be prepared. Your draft is unchanged.'); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }
  return <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
    <h4 className="font-serif text-lg font-bold">Review Your Four-Week Juice Plan</h4>
    <p className="mt-2 text-sm text-muted-foreground">Check the live mix, first-payment subtotal, four delivery weeks and cancellation terms. No order or charge is created by a review.</p>
    <Button type="button" variant="outline" className="mt-4 h-auto min-h-11 w-full whitespace-normal py-3" disabled={!selections || pending || !rotationApiUrl()} onClick={review}>{pending ? 'Checking Your Juice Plan…' : 'Review Juice Plan — No Charge'}</Button>
    {!rotationApiUrl() && <p className="mt-3 text-sm text-muted-foreground">Live review opens when the independent subscription app is connected. Your saved mix and manual request remain available.</p>}
    {error && !preview?.enrollmentReady && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {preview && <JuicePlanReviewResult preview={preview} />}
    {preview?.enrollmentReady && <SubscriptionCheckoutForm busy={pending} error={error} managementLink={managementLink} billingSummary={preview.mix.billingPreference === 'prepaid' ? 'This checkout funds four weekly deliveries of your reviewed mix. Hibiscus Tea is added only once.' : 'This checkout pays for the first week. Your chosen mix repeats weekly for the current four-week commitment.'} onSubmit={checkout} />}
  </div>;
}
