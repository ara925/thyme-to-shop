import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PRODUCTS_QUERY, storefrontApiRequest, formatPrice, type ShopifyProduct } from '@/lib/shopify';
import { allowLocalInspection, createDeliveryInspection } from './checkoutDeliveryProbe';
import { getDeliveryMinimumStatus } from '@/lib/fulfillmentRules';
import '@/index.css';

export function CheckoutDeliveryAudit() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [selected, setSelected] = useState(''); const [quantity, setQuantity] = useState(6);
  const [method, setMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [acknowledged, setAcknowledged] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof createDeliveryInspection>> | null>(null);
  const [sampleAmount, setSampleAmount] = useState('99.00');
  const [sampleResult, setSampleResult] = useState<string | null>(null);
  const product = products.find(item => item.node.id === selected);
  const variant = product?.node.variants.edges.find(({ node }) => node.availableForSale && !node.requiresComponents)?.node;
  async function load() {
    setBusy(true); setError(''); setPrepared(null);
    try {
      const result = await storefrontApiRequest<{ products: { edges: ShopifyProduct[] } }>(PRODUCTS_QUERY, { first: 50, query: 'product_type:Meal' });
      const items = result.data.products.edges.filter(item => item.node.variants.edges.some(({ node }) => node.availableForSale && !node.requiresComponents));
      setProducts(items); setSelected(items[0]?.node.id || '');
    } catch { setError('The live catalog could not be loaded.'); } finally { setBusy(false); }
  }
  async function prepare() {
    if (!acknowledged || !product || !variant) return;
    setBusy(true); setError(''); setPrepared(null);
    try { setPrepared(await createDeliveryInspection(product, variant, quantity, method)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Inspection cart could not be created.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-2xl font-bold">LOCAL ONLY — Shopify delivery inspection</h1>
    <section className="space-y-3 rounded-lg border border-amber-600 bg-amber-50 p-5 text-amber-950">
      <p>This tool creates a real, isolated one-time Shopify cart. It does not create an order, charge a card, enroll a subscription, change the public checkout gate, or touch the customer basket.</p>
      <p>Inspect the native delivery/pickup choices, then stop. Do not enter payment information or submit an order. This local tool is not included in the published storefront.</p>
    </section>
    <section className="space-y-3 rounded-lg border p-5">
      <h2 className="font-bold">Synthetic minimum-message check — no Shopify request</h2>
      <p>Exercises the same money/minimum validator used by the customer cart. It does not open ordering or prove native checkout enforcement.</p>
      <label className="block">Synthetic USD subtotal<input className="ml-3 w-40 rounded border p-3" value={sampleAmount} onChange={event => setSampleAmount(event.target.value)} /></label>
      <button className="rounded border px-4 py-3" onClick={() => { const result = getDeliveryMinimumStatus({ amount: sampleAmount, currencyCode: 'USD' }, 'delivery'); setSampleResult(result.isMet ? 'The $99 delivery minimum is met. Public checkout remains gated.' : result.message); }}>Check displayed minimum message</button>
      {sampleResult && <p role="status">{sampleResult}</p>}
    </section>
    <button className="rounded bg-primary px-4 py-3 text-primary-foreground" disabled={busy} onClick={load}>Load live meal catalog</button>
    {products.length > 0 && <section className="space-y-5 rounded-lg border p-5">
      <label className="block">Product<select className="mt-2 w-full rounded border p-3" value={selected} onChange={event => { setSelected(event.target.value); setPrepared(null); }}>
        {products.map(item => <option key={item.node.id} value={item.node.id}>{item.node.title}</option>)}
      </select></label>
      <p>Live unit price: {variant ? formatPrice(variant.price.amount, variant.price.currencyCode) : 'Unavailable'}</p>
      <label className="block">Quantity<input className="ml-3 w-24 rounded border p-3" type="number" min={1} max={50} step={1} value={quantity} onChange={event => { setQuantity(Number(event.target.value)); setPrepared(null); }} /></label>
      <label className="block">Intended fulfillment<select className="ml-3 rounded border p-3" value={method} onChange={event => { setMethod(event.target.value as 'delivery' | 'pickup'); setPrepared(null); }}><option value="delivery">Monday local delivery</option><option value="pickup">Monday pickup after 9 AM</option></select></label>
      <label className="flex gap-3"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I will inspect only and will not submit an order or payment.</label>
      <button className="rounded bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50" disabled={busy || !acknowledged || !variant} onClick={prepare}>Create isolated no-charge checkout</button>
    </section>}
    {error && <p role="alert">{error}</p>}
    {prepared && <section className="space-y-3 rounded-lg border p-5" role="status"><p>{prepared.quantity} × {prepared.title}</p><p>Native subtotal: {formatPrice((prepared.subtotalCents / 100).toFixed(2))}. Intended method: {prepared.method}.</p><p>Shipping, pickup eligibility and fees still need to be read from Shopify. This is not a successful payment test.</p><button className="rounded bg-primary px-4 py-3 text-primary-foreground" onClick={() => window.location.assign(prepared.checkoutUrl)}>Open Shopify checkout for inspection — do not pay</button></section>}
  </main>;
}

if (allowLocalInspection(import.meta.env.DEV, window.location.hostname)) {
  createRoot(document.getElementById('root')!).render(<CheckoutDeliveryAudit />);
} else {
  document.getElementById('root')!.textContent = 'Not available outside the local development server.';
}
