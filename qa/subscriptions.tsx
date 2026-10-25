// Vite-development-only visual fixture. No network, credentials, real contracts, orders or charges.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SubscriptionCheckoutForm } from '../src/components/subscriptions/SubscriptionCheckout';
import { JuicePlanReviewResult } from '../src/components/subscriptions/JuicePlanReview';
import { JuicePlanDetails } from '../src/pages/ManageJuicePlan';
import type { JuicePreview, ManagedJuicePlan } from '../src/lib/juiceSubscriptionService';
import '../src/index.css';

const prepaidMix: JuicePreview['mix'] = { billingPreference: 'prepaid', minimumCents: 13499, discountPercent: 10, commitmentWeeks: 4, deliveriesPerPayment: 4,
  retailSubtotalCents: 13500, subtotalCents: 12150, fourWeekSubtotalCents: 48600, firstSubtotalCents: 49200,
  lines: [{ variantId: 'gid://shopify/ProductVariant/100', title: 'Fixture Green Juice — 12 oz', quantity: 9, retailPriceCents: 1500, priceCents: 1350 }],
  oneTimeAddOn: { variantId: 'gid://shopify/ProductVariant/200', title: 'Hibiscus Tea (Sweetened)', quantity: 2, priceCents: 300, subtotalCents: 600 } };
export function Fixture() {
  const [scenario, setScenario] = useState('prepaid'); const [submitted, setSubmitted] = useState(false); const [confirm, setConfirm] = useState(false); const [cancelled, setCancelled] = useState(false);
  const weekly = scenario !== 'prepaid';
  const mix: JuicePreview['mix'] = weekly ? { ...prepaidMix, billingPreference: 'weekly', deliveriesPerPayment: 1, firstSubtotalCents: 12750 } : prepaidMix;
  const preview: JuicePreview = { mix, firstServiceDate: '2026-11-02', deliveryDates: ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'], currencyCode: 'USD', pricingVerified: true, enrollmentReady: true };
  const pending = scenario === 'pending'; const scheduled = scenario === 'scheduled' || cancelled;
  const plan: ManagedJuicePlan = { mix, state: pending ? 'cancelling' : scenario === 'review' ? 'review' : 'active', firstServiceDate: '2026-11-02T09:00:00-08:00', nextServiceDate: '2026-11-09T09:00:00-08:00', nextBillingDate: '2026-11-02T09:00:00-08:00', paidWeeks: pending ? 4 : 1,
    cancellationRequested: scheduled || pending, cancellationPending: pending, cancellationConfirmed: false, cancellationEffectiveDate: scheduled || pending ? '2026-11-30T09:00:00-08:00' : null, cancelAfterPaidWeeks: scheduled || pending ? 4 : null, canCancel: true };
  return <main className="container max-w-3xl py-6 md:py-10">
    <p role="note" className="mb-6 rounded-xl bg-amber-100 p-4 text-sm font-semibold text-amber-950">LOCAL VISUAL TEST — Fixture data only. No real order, payment, contract or customer data.</p>
    <label className="mb-6 block text-sm font-semibold">Visual test scenario<select className="mt-2 block min-h-11 w-full rounded-lg border bg-background px-3" value={scenario} onChange={event => { setScenario(event.target.value); setConfirm(false); setCancelled(false); setSubmitted(false); }}><option value="prepaid">Four-week prepaid review</option><option value="weekly">Weekly review and separate checkout</option><option value="active">Active juice plan</option><option value="scheduled">Cancellation scheduled</option><option value="pending">Cancellation pending</option><option value="review">Payment needs review</option></select></label>
    {['prepaid', 'weekly'].includes(scenario) ? <><h1 className="font-serif text-3xl font-bold">Your Four-Week Juice Review</h1><section className="mt-6 rounded-xl border bg-card p-5"><JuicePlanReviewResult preview={preview} /></section><SubscriptionCheckoutForm busy={false} error="" billingSummary={weekly ? 'Only the first weekly mix and the one-time tea enter this separate checkout.' : 'One payment funds four weekly juice deliveries. The tea is added only once.'} onSubmit={() => setSubmitted(true)} />{submitted && <p role="status" className="mt-4 rounded-lg border p-4">Fixture checkout preparation verified. No navigation, order or charge occurred.</p>}</> : <><h1 className="font-serif text-3xl font-bold">Your Four-Week Juice Plan</h1><JuicePlanDetails plan={plan} busy={false} confirm={confirm} onAsk={() => setConfirm(true)} onKeep={() => setConfirm(false)} onCancel={() => { setCancelled(true); setConfirm(false); }} /></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
