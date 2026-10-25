import { CART_CREATE_MUTATION, formatCheckoutUrl, storefrontApiRequest, type CartCreateData, type ShopifyProduct, type ShopifyVariant } from '@/lib/shopify';
import { parseMoneyCents } from '@/lib/moneyCents';

export function allowLocalInspection(dev: boolean, hostname: string): boolean {
  return dev && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

/** A real disposable cart only. No order submission, payment, subscription or customer basket access. */
export async function createDeliveryInspection(product: ShopifyProduct, variant: ShopifyVariant, quantity: number, method: 'pickup' | 'delivery') {
  if (!allowLocalInspection(import.meta.env.DEV, window.location.hostname)) throw new Error('This inspection runs only on the local development server.');
  const unit = parseMoneyCents(variant.price.amount);
  if (unit === null || unit <= 0 || variant.price.currencyCode !== 'USD' || !variant.availableForSale || variant.requiresComponents
    || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 || !['pickup', 'delivery'].includes(method)) throw new Error('Choose an available product and a whole quantity from 1 to 50.');
  const result = await storefrontApiRequest<CartCreateData>(CART_CREATE_MUTATION, { input: {
    lines: [{ merchandiseId: variant.id, quantity }],
    attributes: [{ key: '_pit_acceptance', value: 'NO-CHARGE delivery inspection; do not fulfill' },
      { key: 'Fulfillment Method', value: method === 'pickup' ? 'Pickup' : 'Local Delivery' },
      { key: method === 'pickup' ? 'Preferred Pickup Window' : 'Preferred Dropoff Window', value: method === 'pickup' ? 'Monday after 9:00 AM' : 'Monday' }],
  } });
  const payload = result.data.cartCreate; const cart = payload.cart; const lines = cart?.lines.edges;
  if (payload.userErrors.length || payload.warnings.length || !cart || lines?.length !== 1 || lines[0].node.quantity !== quantity
    || lines[0].node.merchandise.id !== variant.id || lines[0].node.sellingPlanAllocation
    || cart.cost.subtotalAmount.currencyCode !== 'USD' || parseMoneyCents(cart.cost.subtotalAmount.amount) !== unit * quantity) {
    throw new Error('Shopify did not return the exact one-time inspection cart. No order was submitted.');
  }
  return { checkoutUrl: formatCheckoutUrl(cart.checkoutUrl), title: product.node.title, quantity, subtotalCents: unit * quantity, method };
}
