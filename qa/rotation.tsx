// Local Vite-only visual fixture. This is not a production build entry or a service mock.
// It renders the real presentation components without credentials, network calls, or billing.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MealRotationDetails } from '../src/pages/ManageMealRotation';
import { MealRotationReviewResult } from '../src/components/subscriptions/MealRotationReview';
import type { ManagedRotation } from '../src/lib/rotationService';
import '../src/index.css';

const weeks = {
  'week-a': { subtotalCents: 13200, lines: [{ variantId: 'gid://shopify/ProductVariant/1', title: 'Fixture Carne Asada', priceCents: 2200, quantity: 6 }] },
  'week-b': { subtotalCents: 14000, lines: [{ variantId: 'gid://shopify/ProductVariant/2', title: 'Fixture Chimichurri Steak', priceCents: 2000, quantity: 7 }] },
  'week-c': { subtotalCents: 12600, lines: [{ variantId: 'gid://shopify/ProductVariant/3', title: 'Fixture Korean Beef Bowl', priceCents: 1800, quantity: 7 }] },
};
export function VisualFixture() {
  const [scenario, setScenario] = useState<'active' | 'pending' | 'review' | 'cancelled'>('active');
  const [confirm, setConfirm] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const plan: ManagedRotation = {
    state: scenario === 'pending' || scenario === 'cancelled' ? 'stopped' : scenario,
    nextWeek: 'week-a', serviceDate: '2026-11-02T09:00:00-08:00', nextBillingDate: '2026-10-30T09:00:00-07:00',
    canCancel: scenario !== 'cancelled', cancellationPending: scenario === 'pending', cancellationConfirmed: scenario === 'cancelled', weeks,
  };
  return <main className="container max-w-3xl py-8">
    <p role="note" className="mb-8 rounded-xl bg-amber-100 p-4 font-semibold text-amber-950">LOCAL VISUAL TEST — Fixture data only. No orders, contracts, or charges.</p>
    <h1 className="font-serif text-3xl font-bold">Rotation Review</h1>
    <div className="mt-5 rounded-xl border bg-card p-5"><MealRotationReviewResult preview={{ firstWeek: 'week-a', firstServiceDate: '2026-11-02', weeks, currencyCode: 'USD', enrollmentReady: false }} /></div>
    <h1 className="mt-12 font-serif text-3xl font-bold">Your Meal Rotation</h1>
    <label className="mt-6 block">Visual test state <select className="ml-3 rounded border p-3" value={scenario} onChange={event => { setScenario(event.target.value as typeof scenario); setConfirm(false); setCancelled(false); }}>
      <option value="active">Active</option><option value="pending">Cancellation pending</option><option value="review">Needs review</option><option value="cancelled">Cancelled</option>
    </select></label>
    <MealRotationDetails plan={plan} cancelled={cancelled} busy={false} confirm={confirm} onAsk={() => setConfirm(true)} onKeep={() => setConfirm(false)} onCancel={() => { setCancelled(true); setConfirm(false); }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><VisualFixture /></React.StrictMode>);
