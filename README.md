# Thyme & Time Shopify

I want to create a shopify store from  this site https://placeinthyme.com/

How do I connect you to do this?

This project was built with [Lovable](https://lovable.dev).

**Live storefront**: https://shop.placeinthyme.com

The public storefront hostname must not also be configured as the Shopify checkout hostname.
Use the permanent `*.myshopify.com` hostname or a separate Shopify-controlled checkout hostname
for `VITE_SHOPIFY_CHECKOUT_DOMAIN`.

Local fulfillment is fail-closed. Production must also provide
`VITE_DELIVERY_WINDOWS_JSON` as a JSON array of approved combined day/time windows;
delivery labels must begin with `Monday,` or `Tuesday,`.
Pickup additionally requires approved pickup windows, a configured Shopify pickup
location and instructions, and `VITE_ENABLE_PICKUP=true`. The storefront does not
assume schedule windows that the client has not approved.

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
