import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { cancelManagedRotation, consumeRotationAccess, getManagedRotation, RotationServiceError, ROTATION_WEEKS, rotationDateLabel, rotationWeekLabel, type ManagedRotation, type RotationAccess } from '@/lib/rotationService';
import { formatPrice } from '@/lib/shopify';

export default function ManageMealRotation() {
  const { id = '' } = useParams();
  const [access, setAccess] = useState<RotationAccess | null>(null);
  const [plan, setPlan] = useState<ManagedRotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const privateAccess = consumeRotationAccess(id, window.location, window.history);
    setAccess(privateAccess);
    setPlan(null);
    setLoading(true);
    setError('');
    setCancelled(false);
    setConfirm(false);
    if (!privateAccess) {
      setError('Open the complete private meal-plan link provided when your rotation was set up. If you need a new link, contact us.');
      setLoading(false);
      return;
    }
    getManagedRotation(privateAccess, controller.signal).then(value => {
      if (!controller.signal.aborted) setPlan(value);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Please try again.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  async function cancel() {
    if (!access) return;
    setBusy(true);
    setError('');
    try {
      await cancelManagedRotation(access);
      setCancelled(true);
      setConfirm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Cancellation could not be confirmed. Please retry or contact us.');
      if (error instanceof RotationServiceError && error.cancellationPending && plan) {
        setPlan({ ...plan, state: 'stopped', cancellationPending: true });
        setConfirm(false);
      }
    } finally { setBusy(false); }
  }

  return <Layout><section className="container max-w-3xl py-12 md:py-20">
    <h1 className="font-serif text-3xl font-bold md:text-4xl">Your Meal Rotation</h1>
    <p className="mt-3 text-muted-foreground">Your private three-week menu and renewal settings. Keep this link private.</p>
    {loading && <p role="status" className="mt-8">Loading your meal plan…</p>}
    {error && <p role="alert" className="mt-6 rounded-xl border border-destructive/30 p-4 text-destructive">{error}</p>}
    {plan && <MealRotationDetails plan={plan} cancelled={cancelled} busy={busy} confirm={confirm} onAsk={() => setConfirm(true)} onKeep={() => setConfirm(false)} onCancel={cancel} />}
    <p className="mt-8 text-sm text-muted-foreground">Need help or want to change your saved menus? <a className="underline underline-offset-4" href="mailto:info@placeinthyme.com">Email info@placeinthyme.com</a>. Do not send payment-card details.</p>
  </section></Layout>;
}

export function MealRotationDetails({ plan, cancelled, busy, confirm, onAsk, onKeep, onCancel }: {
  plan: ManagedRotation; cancelled: boolean; busy: boolean; confirm: boolean;
  onAsk: () => void; onKeep: () => void; onCancel: () => void;
}) {
  const stopped = cancelled || plan.cancellationConfirmed;
  const pending = !stopped && plan.cancellationPending;
  const renewalActive = ['active', 'calculating', 'committing', 'billing', 'finalizing'].includes(plan.state) && !pending && !stopped;
  return <>
      <div role="status" className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <h2 className="font-serif text-xl font-bold">{stopped ? 'Cancellation Confirmed' : pending ? 'Cancellation Awaiting Shopify Confirmation' : plan.state === 'quoted' ? 'Plan Not Enrolled' : renewalActive ? 'Rotation Active' : 'Renewals Stopped — Review Needed'}</h2>
        <p className="mt-2 text-sm">{stopped ? 'No future meal-rotation renewals will be initiated. Cancellation does not refund an order already paid or cancel a delivery already being prepared.'
          : pending ? 'Renewals are stopped locally. Retry the Shopify confirmation below or contact us.'
            : plan.state === 'quoted' ? 'These are saved selections only. No subscription or recurring payment has started.'
              : renewalActive ? `Next service week: ${rotationDateLabel(plan.serviceDate)} (${rotationWeekLabel(plan.nextWeek)}).`
                : 'No new automatic renewal will be initiated while this plan needs review. Contact us about any order or payment already in progress.'}</p>
        {renewalActive && plan.nextBillingDate && <p className="mt-2 text-sm">Next scheduled billing: {rotationDateLabel(plan.nextBillingDate)}. The active menu’s selected subtotal applies, plus tax and any local-delivery fee.</p>}
      </div>
      <div className="mt-8 space-y-4">
        {ROTATION_WEEKS.map(week => <section key={week} className="rounded-xl border p-5" aria-label={`${rotationWeekLabel(week)} saved selections`}>
          <h2 className="flex justify-between gap-4 font-serif text-lg font-bold"><span>{rotationWeekLabel(week)}</span><span>{formatPrice((plan.weeks[week].subtotalCents / 100).toFixed(2), 'USD')}</span></h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{plan.weeks[week].lines.map(line => <li key={line.variantId}>{line.quantity} × {line.title}</li>)}</ul>
        </section>)}
      </div>
      {!stopped && plan.canCancel && <div className="mt-8 rounded-xl border p-5">
        <h2 className="font-serif text-xl font-bold">Cancel Anytime</h2>
        <p className="mt-2 text-sm text-muted-foreground">Stop future renewals. An order already paid or being prepared is not automatically refunded or cancelled.</p>
        {confirm ? <div className="mt-4">
          <p className="text-sm font-semibold">Cancel future meal-rotation renewals?</p>
          <div className="mt-3 flex flex-wrap gap-3"><Button variant="destructive" disabled={busy} onClick={onCancel}>{busy ? 'Confirming cancellation…' : 'Yes, Cancel Future Renewals'}</Button><Button variant="outline" disabled={busy} onClick={onKeep}>Keep My Rotation</Button></div>
        </div> : <Button className="mt-4 h-auto min-h-11 whitespace-normal" variant="outline" disabled={busy} onClick={pending ? onCancel : onAsk}>{busy ? 'Confirming cancellation…' : pending ? 'Retry Shopify Cancellation Confirmation' : 'Cancel Meal Rotation'}</Button>}
      </div>}
    </>;
}
