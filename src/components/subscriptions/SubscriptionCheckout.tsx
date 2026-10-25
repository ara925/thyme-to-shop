import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { quoteMealEnrollment, retainEnrollmentAccess, startMealEnrollmentCheckout, type MealEnrollmentQuote, type SubscriptionFulfillment } from '@/lib/subscriptionCheckout';
import type { RotationPreview, RotationSelections } from '@/lib/rotationService';

export function SubscriptionCheckoutForm({ busy, error, managementLink, billingSummary, onSubmit }: {
  busy: boolean; error: string; managementLink?: string; billingSummary: string;
  onSubmit: (choice: SubscriptionFulfillment) => void;
}) {
  const id = useId();
  const [method, setMethod] = useState<'pickup' | 'delivery' | ''>('');
  const [window, setWindow] = useState<'monday' | 'tuesday'>('monday');
  const [acknowledged, setAcknowledged] = useState(false);
  return <form className="mt-5 space-y-4 rounded-xl border bg-background p-4" onSubmit={event => {
    event.preventDefault();
    if (!method || !acknowledged || busy) return;
    onSubmit(method === 'pickup' ? { method, window: 'monday-after-9am' } : { method, window });
  }}>
    <h4 className="font-serif text-lg font-bold">Continue to Secure Checkout</h4>
    <p className="text-sm text-muted-foreground">{billingSummary} Your regular shopping basket stays unchanged. Payment details are entered only on Shopify.</p>
    <fieldset disabled={busy} className="space-y-3">
      <legend className="mb-2 text-sm font-semibold">Choose pickup or Orange County delivery</legend>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-1" type="radio" name={`${id}-method`} value="pickup" checked={method === 'pickup'} onChange={() => setMethod('pickup')} /><span>Free pickup — Monday after 9:00 AM<br /><span className="text-muted-foreground">26021 Acero, Mission Viejo, CA 92691</span></span></label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-1" type="radio" name={`${id}-method`} value="delivery" checked={method === 'delivery'} onChange={() => setMethod('delivery')} /><span>Orange County delivery — $15 per delivery<br /><span className="text-muted-foreground">Final address eligibility and delivery fee are confirmed by Shopify.</span></span></label>
      {method === 'delivery' && <label className="block text-sm font-medium" htmlFor={`${id}-window`}>Preferred delivery day<select id={`${id}-window`} className="mt-2 block min-h-11 w-full rounded-md border bg-background px-3" value={window} onChange={event => setWindow(event.target.value as typeof window)}><option value="monday">Monday</option><option value="tuesday">Tuesday</option></select></label>}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I have reviewed the recurring billing amount, service schedule and cancellation terms above. Tax and any local-delivery fee are confirmed at checkout.</span></label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {managementLink && <p className="break-words text-sm"><a className="underline underline-offset-4" href={managementLink}>Your private plan-management link</a>. Keep this link private; it is also saved for this browser session.</p>}
    <Button type="submit" disabled={!method || !acknowledged || busy} className="h-auto min-h-11 w-full whitespace-normal py-3">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{busy ? 'Checking Your Separate Checkout…' : 'Continue to Shopify Checkout'}</Button>
    <p className="text-xs text-muted-foreground">This step prepares checkout. No order or charge is made until you complete payment on Shopify.</p>
  </form>;
}

export function MealEnrollmentCheckout({ selections, preview, navigate = (url: string) => window.location.assign(url) }: {
  selections: RotationSelections; preview: RotationPreview; navigate?: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [managementLink, setManagementLink] = useState('');
  const active = useRef<AbortController>(); const savedQuote = useRef<MealEnrollmentQuote | null>(null);
  const key = JSON.stringify({ selections, preview });
  useEffect(() => { active.current?.abort(); savedQuote.current = null; setBusy(false); setError(''); setManagementLink(''); return () => active.current?.abort(); }, [key]);
  async function start(fulfillment: SubscriptionFulfillment) {
    if (!preview.enrollmentReady || busy) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const quote = savedQuote.current ?? await quoteMealEnrollment(selections, preview, controller.signal);
      if (controller.signal.aborted) return;
      savedQuote.current = quote;
      const link = retainEnrollmentAccess({ id: quote.id, token: quote.manageToken }); setManagementLink(link);
      const destination = await startMealEnrollmentCheckout(quote, fulfillment, controller.signal);
      if (!controller.signal.aborted) navigate(destination);
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Checkout could not be prepared. Your menus and ordinary basket are unchanged.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  if (!preview.enrollmentReady) return null;
  return <SubscriptionCheckoutForm busy={busy} error={error} managementLink={managementLink} billingSummary="Only the active week's reviewed meals enter this checkout. Future weeks rotate through your saved menus and are charged at their own selected totals." onSubmit={start} />;
}
