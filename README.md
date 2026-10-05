# Thyme & Time Shopify

I want to create a shopify store from  this site https://placeinthyme.com/

How do I connect you to do this?

This project was built with [Lovable](https://lovable.dev).

**Live storefront**: https://shop.placeinthyme.com

The public storefront hostname must not also be configured as the Shopify checkout hostname.
Use the permanent `*.myshopify.com` hostname or a separate Shopify-controlled checkout hostname
for `VITE_SHOPIFY_CHECKOUT_DOMAIN`. The prepared branded target is
`checkout.placeinthyme.com`; Shopify's permanent hostname remains accepted as a safe fallback.

The storefront ships with the client-approved local fulfillment rules: Orange County
delivery on Monday or Tuesday for $15 with a $99 delivery minimum, plus free pickup at
26021 Acero, Mission Viejo, CA 92691 on Monday after 9:00 AM. The weekly order cutoff
is the end of Friday in `America/Los_Angeles`, displayed to customers as Friday at
11:59 PM PT. Shipping is not offered.

`VITE_DELIVERY_WINDOWS_JSON`, `VITE_PICKUP_WINDOWS_JSON`, and
`VITE_ENABLE_PICKUP` remain available as deployment overrides. Missing overrides use
the approved rules above; a present invalid/empty window override still fails closed.
Keep Shopify's location, local-delivery ZIP zone, $99 minimum, $15 rate, pickup
instructions, and zero standard-shipping rates synchronized with the storefront. Set
`VITE_SHOPIFY_LOCAL_FULFILLMENT_READY=true` only after that matching Shopify Admin
configuration passes acceptance; otherwise cart checkout remains fail-closed.

The Friday cutoff is enforced in this storefront before it hands a customer to
Shopify checkout. It is not a Shopify platform-level order rule: an already-open
checkout URL or a direct Storefront API client can bypass frontend timing logic.
Strict order-placement enforcement therefore needs a Shopify-compatible delivery
scheduling/validation app or a server-side checkout validation, plus manual order
review until that control is in place.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ca08a804-f7df-4f4c-960d-094c218a7d56).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
