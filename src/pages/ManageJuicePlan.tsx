import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { consumeRotationAccess, rotationDateLabel, type RotationAccess } from '@/lib/rotationService';
import { getManagedJuicePlan, cancelManagedJuicePlan, type ManagedJuicePlan } from '@/lib/juiceSubscriptionService';
import { formatPrice } from '@/lib/shopify';

const dollars = (cents: number) => formatPrice((cents / 100).toFixed(2), 'USD');
export function JuicePlanDetails({ plan, busy, confirm, onAsk, onKeep, onCancel }: { plan: ManagedJuicePlan; busy: boolean; confirm: boolean; onAsk: () => void; onKeep: () => void; onCancel: () => void }) {
  const confirmed = plan.cancellationConfirmed; const pending = plan.cancellationPending || plan.state === 'cancelling';
  const needsReview = ['review', 'stopped'].includes(plan.state) && !confirmed && !pending;
  return <>
    <div role="status" className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-5">
      <h2 className="font-serif text-xl font-bold">{confirmed ? 'Future Juice Renewals Cancelled' : pending ? 'Cancellation Awaiting Shopify Confirmation' : plan.state === 'quoted' ? 'Juice Plan Not Enrolled' : needsReview ? 'Juice Plan Needs Review' : plan.cancellationRequested ? 'Cancellation Scheduled' : 'Juice Plan Active'}</h2>
      <p className="mt-2 text-sm">{confirmed ? 'No new juice renewal will be initiated. Already-paid orders and scheduled prepaid deliveries are not automatically cancelled or refunded.' : pending ? 'A cancellation request is saved, but Shopify confirmation is still pending. Retry below or contact us; do not assume the cancellation is complete.' : plan.state === 'quoted' ? 'This is an unenrolled draft. No subscription or recurring payment has started.' : needsReview ? 'No new automatic juice payment will be initiated while the plan needs review. Contact us about a payment or order already in progress.' : plan.mix.billingPreference === 'prepaid' ? 'Each confirmed payment funds four weekly deliveries of the same mix.' : 'The same mix repeats weekly through your current four-week commitment.'}</p>
      {plan.state !== 'quoted' && <p className="mt-3 text-sm">Weeks funded by confirmed payments: <strong>{plan.paidWeeks}</strong>. This is a payment count, not a claim that every delivery has already been fulfilled.</p>}
      {plan.cancellationRequested && plan.cancellationEffectiveDate && <p className="mt-3 text-sm">Current period ends: <strong>{rotationDateLabel(plan.cancellationEffectiveDate)}</strong>.{!confirmed && !pending && plan.cancelAfterPaidWeeks && <> The saved cancellation applies after {plan.cancelAfterPaidWeeks} paid weeks; it does not start another four-week period.</>}</p>}
      {!confirmed && !pending && !needsReview && plan.nextBillingDate && <p className="mt-3 text-sm">Next scheduled payment: {rotationDateLabel(plan.nextBillingDate)}. A payment already in progress may need separate review.</p>}
    </div>
    <section className="mt-6 rounded-xl border p-5" aria-label="Saved weekly juice mix"><h2 className="font-serif text-xl font-bold">Your Saved Weekly Mix</h2>
      <ul className="mt-3 space-y-2 text-sm">{plan.mix.lines.map(line => <li className="flex justify-between gap-4" key={line.variantId}><span>{line.quantity} × {line.title}</span><span>{dollars(line.priceCents * line.quantity)}</span></li>)}</ul>
      <p className="mt-4 border-t pt-3 text-sm font-semibold">Weekly juice subtotal after 10%: {dollars(plan.mix.subtotalCents)}</p><p className="mt-2 text-sm text-muted-foreground">{plan.mix.billingPreference === 'prepaid' ? `Four-week juice prepayment: ${dollars(plan.mix.fourWeekSubtotalCents)}.` : 'Paid weekly with a four-week minimum, renewing in four-week periods.'} Tax and any delivery charge are separate.</p>
      {plan.mix.oneTimeAddOn && <p className="mt-3 text-sm text-muted-foreground">Original first-order Hibiscus Tea add-on: {dollars(plan.mix.oneTimeAddOn.subtotalCents)}. It is not part of recurring renewals.</p>}
    </section>
    {!confirmed && plan.canCancel && (!plan.cancellationRequested || pending) && <section className="mt-6 rounded-xl border p-5"><h2 className="font-serif text-xl font-bold">Stop Future Renewal</h2><p className="mt-2 text-sm text-muted-foreground">Weekly payments continue through the current four-paid-week commitment. Prepaid deliveries already funded remain scheduled. Orders or payments already in progress are not automatically reversed.</p>
      {confirm ? <div className="mt-4"><p className="text-sm font-semibold">Stop renewing after the current four-week period?</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="destructive" className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={onCancel}>{busy ? 'Saving Cancellation…' : 'Yes, Stop the Next Period'}</Button><Button variant="outline" disabled={busy} onClick={onKeep}>Keep My Juice Plan</Button></div></div> : <Button className="mt-4 h-auto min-h-11 whitespace-normal" variant="outline" disabled={busy} onClick={pending ? onCancel : onAsk}>{busy ? 'Checking Cancellation…' : pending ? 'Retry Shopify Cancellation Confirmation' : 'Cancel at the Four-Week Boundary'}</Button>}
    </section>}
  </>;
}

export default function ManageJuicePlan() {
  const { id = '' } = useParams(); const [access, setAccess] = useState<RotationAccess | null>(null); const [plan, setPlan] = useState<ManagedJuicePlan | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); const privateAccess = consumeRotationAccess(id, window.location, window.history, undefined, 'juice');
    setAccess(privateAccess); setPlan(null); setLoading(true); setConfirm(false); setError('');
    if (!privateAccess) { setError('Open the complete private juice-plan link from your enrollment. Contact us if you need help.'); setLoading(false); return; }
    getManagedJuicePlan(privateAccess, controller.signal).then(value => { if (!controller.signal.aborted) setPlan(value); }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Your plan could not be loaded.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  async function cancel() {
    if (!access || !plan) return;
    setBusy(true); setError('');
    try {
      const result = await cancelManagedJuicePlan(access);
      setPlan({ ...plan, cancellationRequested: true, cancellationEffectiveDate: result.effectiveDate, cancelAfterPaidWeeks: result.afterPaidWeeks ?? plan.cancelAfterPaidWeeks,
        cancellationConfirmed: result.state === 'cancelled', cancellationPending: false, canCancel: result.state !== 'cancelled', state: result.state === 'cancelled' ? 'stopped' : plan.state }); setConfirm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Cancellation could not be confirmed. Retry or contact us.');
      try { setPlan(await getManagedJuicePlan(access)); } catch { /* Never claim a cancellation without a verified response. */ }
      setConfirm(false);
    } finally { setBusy(false); }
  }
  return <Layout><section className="container max-w-3xl py-12 md:py-20"><h1 className="font-serif text-3xl font-bold md:text-4xl">Your Four-Week Juice Plan</h1><p className="mt-3 text-muted-foreground">Your saved mix, payment period and cancellation settings. Keep this management link private.</p>
    {loading && <p className="mt-8" role="status">Loading your juice plan…</p>}{error && <p role="alert" className="mt-6 rounded-xl border border-destructive/30 p-4 text-destructive">{error}</p>}
    {plan && <JuicePlanDetails plan={plan} busy={busy} confirm={confirm} onAsk={() => setConfirm(true)} onKeep={() => setConfirm(false)} onCancel={cancel} />}
    <p className="mt-8 text-sm text-muted-foreground">For changes to your saved mix or help with an existing order, <a className="underline underline-offset-4" href="mailto:info@placeinthyme.com">email info@placeinthyme.com</a>. Do not send card details.</p>
  </section></Layout>;
}
