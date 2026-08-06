# Place in Thyme pre-launch audit

Audit date: 2026-08-06  
Branch: `agent/complete-store-features`  
Scope: Vite/React storefront, live Shopify Storefront API data, cart and checkout, meal/juice subscriptions, bundles, catalog integrity, resilience, accessibility, SEO, security, and performance.

## Release decision

**GO for preview and client review. NO-GO for accepting real customer payments.**

The storefront features are preserved and substantially completed: all three meal/juice menu tabs, fixed juice bundles, the Pick n' Choose builder, delivery, pickup, and the cart remain present. The payment no-go is caused by Shopify owner/Admin configuration, not by deleted or hidden features.

The blocking owner items are:

1. Shopify is on Pause and Build and checkout reports that the store is not set up to receive orders.
2. No live subscription configuration automates A -> B -> C meal rotation or enforces four successful juice billing cycles.
3. Local pickup is offered by the storefront but is off in Shopify and lacks an approved pickup address/instructions.
4. Shipping, tax, payment, subscription, cancellation, refund, privacy, and other launch policies are not approved/configured end to end.

## Verification snapshot

| Check | Result |
| --- | --- |
| `npm run build` | Pass. Vite 7.3.6; 35 sitemap routes; route chunks emitted; main JS 334.01 kB / 108.26 kB gzip. |
| `npx tsc --noEmit --pretty false` | Pass. |
| `npm test -- --run` | Pass: 12 files, 80/80 tests. |
| `npm run lint` | Pass: 0 errors, 13 Fast Refresh warnings. |
| `npm audit` | 2 moderate React Router findings; 0 high/critical. |
| `npm audit --omit=dev` | 2 moderate React Router findings; 0 high/critical. |
| `npm ci --dry-run --ignore-scripts` | Pass. |
| `git diff --check` | Pass. |
| Secret scan | No Shopify Admin token, private key, or matching credential pattern in the worktree or Git history. |
| Production console scan | No `console.log`, `console.warn`, or `console.error` calls in non-test `src` code. |
| Official Chrome visual/interaction QA | Pass at the available 1680 x 867 Chrome viewport for home, juices, product detail, both planners, Pick n' Choose, cart, fulfillment, and checkout handoff. No horizontal overflow or page-console errors observed. |
| Exact 375/768/1280/1920 matrix | Still required; exact viewport emulation was not available in the required official Chrome control surface. |
| Lighthouse | Still required on the final public deployment; no score is invented here. |

## 1. Commerce correctness

### RESOLVED IN CODE — Shopify-authoritative products, prices, cart, and totals

All catalog surfaces query Shopify. Home starting prices now come from available standalone Shopify variants rather than marketing constants (`src/components/home/Categories.tsx:8-46`). Cart creation, batch add, quantity update, removal, sync, and line totals use the cart returned by Shopify (`src/stores/cartStore.ts:361-466`). No `/cart/add`, checkout permalink, or `window.open` commerce path remains.

Cart mutation warnings are requested from all five mutations (`src/lib/shopify.ts:397-514`) and shown to the customer (`src/components/cart/CartDrawer.tsx:124-149`). Component-required variants are blocked centrally before any mutation (`src/stores/cartStore.ts:337-353`).

### RESOLVED IN CODE — fulfillment attributes survive to checkout

The cart writes `Fulfillment Method` plus the matching `Preferred Dropoff Window` or `Preferred Pickup Window`, reads Shopify's returned attributes, and verifies them again immediately before checkout (`src/stores/cartStore.ts:198-220`, `src/stores/cartStore.ts:517-548`). Checkout redirects must be HTTPS and match this store's exact permanent MyShopify hostname; `channel=online_store` is added only after validation (`src/lib/shopify.ts:651-668`).

### RESOLVED IN CODE — exact weekly selling plans, no silent fallback

Selling plans are resolved per product by exact normalized group name. A product fails closed unless exactly one matching plan bills and delivers every week (`src/hooks/useProducts.ts:29-90`). Missing or malformed plan configuration never becomes an accidental one-time purchase.

Meal minimum data is validated from the exact observed group label rather than duplicated as a numeric price (`src/lib/subscriptionMinimum.ts:1-18`, `src/pages/MealSubscription.tsx:16-19`). The juice planner loads exactly one live `Pick n' Choose Bundle` parent and derives its minimum and currency from that live product (`src/pages/JuiceSubscription.tsx:20-74`). The owner must confirm that using the Pick n' Choose parent price is the intended weekly juice-plan rule because the exposed juice selling plan contains no structured minimum.

### RESOLVED IN CODE — planner recurrence is safe and explicit

Both planners retain all three menu tabs but require selections in exactly one tab. Only that selected menu is added as a weekly recurring batch (`src/pages/MealSubscription.tsx:120-181`, `src/pages/JuiceSubscription.tsx:162-238`). The UI clearly states that the selected menu repeats weekly, A/B/C rotation is not configured, and a four-cycle juice commitment is not enforced (`src/pages/MealSubscription.tsx:218-253`, `src/pages/JuiceSubscription.tsx:261-296`).

This avoids the dangerous prior behavior where selections from multiple tabs could all recur every week. It does not pretend to implement future subscription-contract mutation.

### RESOLVED IN CODE — fixed and custom juice bundles remain usable

Fixed bundles keep their live parent SKU, image, description, price, availability, Add action, and Details link (`src/components/juices/JuiceBundleCards.tsx:166-249`). Pick n' Choose uses strict product-type queries, available non-component variants, exact per-product plans, live prices, and the live parent price as a minimum (`src/pages/PickAndChoose.tsx:32-105`, `src/pages/PickAndChoose.tsx:174-263`).

Planner and builder minimum metadata is revalidated from Shopify-returned line subtotals at checkout, so lowering a cart quantity below the minimum is blocked (`src/stores/cartStore.ts:118-174`, `src/stores/cartStore.ts:545`). Official Chrome confirmed the $134.99 builder threshold, a $136.00 16-bottle add, and a clear `$7.49 more` block after reducing the cart to $127.50.

### BLOCKER — OWNER/ADMIN — real payment cannot complete

Shopify Admin shows Pause and Build. The Storefront cart and validated checkout URL work, but checkout states that the store is not set up to receive orders. Frontend code cannot activate the plan, payment provider, account verification, or a real refund flow.

### BLOCKER — OWNER/ADMIN — future subscription behavior is not configured

The available plan groups all bill/deliver weekly and have no price adjustments. A subscription app/backend must implement and prove A -> B -> C contract rotation, four-cycle enforcement, cancellation/renewal terms, and any two-tier standalone-versus-plan pricing.

## 2. Catalog and data integrity

### RESOLVED IN CODE — strict product-type queries and current-week filtering

Meals query `product_type:Meal`; individual juices query `product_type:Juice AND NOT product_type:"Juice Bundle"`; bundles query `product_type:"Juice Bundle"` (`src/pages/WeeklyMeals.tsx:10-16`, `src/pages/Juices.tsx:13-25`, `src/components/juices/JuiceBundleCards.tsx:66-86`). Home featured meals use the same current-week tag before selecting four (`src/components/home/FeaturedProducts.tsx:10-18`).

The three-week cycle is anchored to 2026-03-16 and changes at Monday midnight in `America/New_York`, including dates before the anchor (`src/lib/weekRotation.ts:6-42`; `src/test/weekRotation.test.ts:4-19`). Thursday 6 PM ET cutoff logic is DST-aware (`src/lib/orderCutoff.ts:9-164`; `src/test/orderCutoff.test.ts:18-68`).

### RESOLVED IN CODE — broken/missing catalog data has visible states

Product grids distinguish loading skeletons, fetch errors, and empty catalogs (`src/components/products/ProductGrid.tsx:7-74`). Product detail has separate skeleton, retryable error, and not-found states (`src/pages/ProductDetail.tsx:108-187`). Missing images and descriptions render neutral Shopify-data-unavailable states rather than blank cards (`src/components/products/ProductCard.tsx:67-122`, `src/pages/ProductDetail.tsx:238-282`).

The published `hibiscus-tea-add-on` variant requires components. Its direct page now explains that it cannot be bought alone, disables quantity/Add, omits the standalone JSON-LD offer, sets `noindex,follow`, and is omitted from the generated sitemap (`src/pages/ProductDetail.tsx:64-100`, `src/pages/ProductDetail.tsx:195-208`, `scripts/generate-sitemap.mjs:51-60`). The Pick builder and cart also reject component-required variants.

### VERIFY IN ADMIN — publication, types, tags, inventory, and component roles

The Storefront API exposes only products published to the active sales channel; no draft item was observed. The owner still needs to review channel publication, product types, week tags, inventory, bundle-component roles, and the purpose of the live `Weekly Meal Package (Rotating 3-Menu Cycle)` product.

### NEEDS OWNER DATA — nutrition and heating instructions

Nutrition/heating content is local by handle (`src/lib/mealData.ts:9-98`) and has not been validated against an owner-approved source. Shopify metafields are queried, but approved data and mapping are still needed before replacing the local content. Do not infer medical or nutrition facts.

## 3. Error handling and resilience

### RESOLVED IN CODE — typed, finite failure states

Storefront requests have a 15-second timeout and distinguish network, abort, HTTP, Shopify 402, GraphQL, invalid JSON, and missing-data failures (`src/lib/shopify.ts:576-642`). Cart mutations reject Shopify user errors and cannot show false success. Tests cover request errors, warning lifecycle, expired-cart recreation, serialization, fulfillment confirmation, minimum checks, exact host validation, sold-out products, and component-required products (`src/test/shopifyApi.test.ts`, `src/test/cartStore.test.ts`).

All primary asynchronous commerce surfaces now use accessible, layout-preserving loading skeletons (`src/App.tsx:30-50`, `src/components/products/ProductGrid.tsx:7-36`, `src/components/juices/JuiceBundleCards.tsx:31-57`, `src/components/subscriptions/SubscriptionProductSkeletons.tsx`, `src/pages/ProductDetail.tsx:108-139`, `src/pages/PickAndChoose.tsx:118-166`).

## 4. Frontend quality

### RESOLVED IN CODE — build, types, tests, and lint

All required commands pass. API boundaries and Shopify response types are explicit (`src/lib/shopify.ts:13-165`). Routes are lazy-loaded (`src/App.tsx:11-20`). Product-card actions are no longer interactive buttons nested inside links (`src/components/products/ProductCard.tsx:61-161`). No deleted-file or route scan found removed storefront functionality.

### NICE-TO-HAVE — Fast Refresh warnings and token cleanup

ESLint reports 13 non-production Fast Refresh warnings from files that export components plus helpers. These do not affect the production build but can be removed by moving shared helpers/constants into dedicated modules.

Some intentional contrast layers still use literal `text-white`, translucent white, and Radix `bg-black/80` utilities (for example `src/components/home/Hero.tsx`, `src/components/layout/Footer.tsx`, and `src/components/ui/sheet.tsx`). A future design-system pass should decide which become semantic tokens; a mechanical replacement risks reducing contrast.

## 5. Responsive behavior and accessibility

### RESOLVED IN CODE — purchase controls and modal behavior

Buttons, icon controls, inputs, selects, options, and planner tabs now meet the 44 px target through shared primitives (`src/components/ui/button.tsx:20-24`, `src/components/ui/input.tsx:10`, `src/components/ui/select.tsx:20-108`, `src/components/ui/tabs.tsx:14-35`). Icon-only controls have accessible names. Product images use live alt text with product-title fallbacks.

The cart uses Radix Sheet focus containment and Escape behavior; its close target is 44 px (`src/components/ui/sheet.tsx:54-65`). The mobile navigation supports Escape and exposes expanded/current-page state (`src/components/layout/Header.tsx:30-45`, `src/components/layout/Header.tsx:63-124`). Badge forwards refs (`src/components/ui/badge.tsx:23-31`). Global reduced-motion handling is present (`src/index.css:165-173`).

### SHOULD-FIX — exact viewport, contrast, and assistive-tech acceptance

Official Chrome visual QA passed at the available 1680 x 867 viewport with no horizontal overflow on tested routes. Exact 375, 768, 1280, and 1920 screenshots; full keyboard-only purchase flow; screen-reader smoke testing; and measured WCAG AA contrast remain required on the final public deployment. No unsupported claim is made.

## 6. SEO and metadata

### RESOLVED IN CODE — route/product metadata and structured data

All routes receive real titles, descriptions, robots directives, canonical URLs, Open Graph, and Twitter metadata (`src/components/seo/RouteSeo.tsx:13-112`). Home emits Organization JSON-LD. Product pages emit Product JSON-LD and use the live primary image for Open Graph/Twitter (`src/pages/ProductDetail.tsx:46-102`).

`robots.txt` points at the sitemap. The deployment-time generator queries published products, excludes component-required-only products and the redirected Pick product duplicate, and produced 35 routes (`scripts/generate-sitemap.mjs:20-76`, `public/sitemap.xml`).

### NEEDS OWNER ACTION — final domain and public identity

Canonical, social, and sitemap URLs currently target `https://thyme-to-shop.lovable.app`. Set `VITE_SITE_URL` and regenerate if a different production domain is chosen. Confirm the social-sharing image and organization identity.

## 7. Content and trust

### RESOLVED IN CODE — no fake social proof

No fake reviews, testimonials, star ratings, review counts, lorem ipsum, or visible TODO copy was found. No product fact, discount, policy, or review was invented to close a missing-data gap.

The former placeholder Instagram action now points to the published `place.in.thyme` profile and has an accessible 44 px target (`src/components/layout/Footer.tsx:29-44`).

### NEEDS OWNER ACTION — contradictory/missing business facts

The live Intro Pack is $94.99 and says “15% discount,” while its listed components total $120 at current live prices; $94.99 is about 20.84% below $120. Correct the live price, contents, or wording in Shopify.

No structured bottle-count rule exists for Pick n' Choose, so code safely enforces the live $134.99 spend threshold and does not invent a count. Supply a min/max count if one is intended.

Confirm the public email, phone, service area, Sunday windows, pickup location/instructions, ingredient/preservative claims, nutrition/health claims, and statements about Operation Helping Hands (`src/components/layout/Footer.tsx:22-87`, `src/pages/HowItWorks.tsx:27`, `src/pages/About.tsx:16-82`). The current storefront and the separate public business site expose different contact details.

No dedicated privacy, terms, shipping, refund, cancellation, or subscription-policy routes exist in the current route table (`src/App.tsx:52-61`). These require owner-approved content; frontend code must not draft legal terms as facts.

## 8. Security and configuration

### RESOLVED IN CODE — client-safe configuration and redirect hardening

Only the public Shopify Storefront token is client-side. `.env`, `.env.*`, and TypeScript build-info artifacts are ignored while `.env.example` is allowed (`.gitignore:14-17`). Checkout accepts only this exact store's HTTPS MyShopify hostname (`src/lib/shopify.ts:3-9`, `src/lib/shopify.ts:651-668`). No Admin credential/private-key pattern was found in source or Git history.

### SHOULD-FIX WHEN UPSTREAM IS CLEAN — 2 moderate React Router advisories

`npm audit` and production-only audit both report two moderate nodes (`react-router`, `react-router-dom`) and zero high/critical findings. The advisories concern crafted backslash navigation/open redirect and SSR hydration deserialization. Practical exposure is reduced because this is a BrowserRouter SPA without SSR/RSC hydration; application destinations are fixed, while product handles are encoded and validated (`src/pages/ProductDetail.tsx:17-20`). Retest and upgrade when a release resolves the relevant advisories without introducing a higher-severity advisory.

### NEEDS OWNER ACTION — app ownership and access review

Shopify has multiple purchase-option/bundle apps, while Shopify Subscriptions itself is only partially configured. Choose one source of truth, document required app permissions, remove conflicts only after checking for live contracts, and limit staff/admin access before launch.

## 9. Performance

### RESOLVED IN CODE — splitting, responsive images, and fonts

Routes are split per page (`src/App.tsx:11-20`). Shopify CDN helpers add safe width parameters and `srcset` candidates (`src/lib/images.ts:1-20`). The hero supplies 960/1920 candidates (`src/components/home/Hero.tsx:11-18`). Below-the-fold images are lazy/async; the main product image is prioritized. Fonts use preconnect plus `display=swap` instead of a CSS `@import` (`index.html:12-18`).

### SHOULD-FIX — measured Lighthouse acceptance

Run Lighthouse on the final public home, juices/category, and product-detail pages after deployment and owner configuration. Record mobile and desktop Performance, Accessibility, Best Practices, and SEO scores. No score is claimed in this audit.

# NEEDS OWNER ACTION

1. **Activate commerce:** choose an active Shopify plan, configure/verify the payment provider and financial account, then complete a real order, refund, and failure-path test.
2. **Choose the subscription source of truth:** decide which installed app owns plans/contracts and finish its setup without breaking existing contracts.
3. **Automate meal rotation:** implement and prove actual A -> B -> C future-contract line rotation.
4. **Enforce juice terms:** confirm the $134.99 weekly minimum source, enforce four successful billing cycles, and publish cancellation/renewal terms.
5. **Define pricing:** approve standalone versus meal-plan prices/discounts and configure live selling-plan adjustments.
6. **Resolve bundles:** fix the Intro Pack price/discount/content mismatch; supply Pick n' Choose count rules if intended; decide whether fixed bundles stay one-time or recur; confirm component/inventory behavior.
7. **Configure fulfillment:** approve shipping zones/rates, taxes, service area, Sunday windows, and cutoff wording; enable/configure local pickup or explicitly withdraw it; supply the pickup address/instructions.
8. **Approve catalog facts:** product types, week tags, publication, inventory, nutrition/heating, health/ingredient/preservative claims, and the rotating package product's role.
9. **Supply policies:** privacy, terms, shipping, refund, subscription cancellation/renewal, and any required dietary/allergen disclosures.
10. **Confirm identity:** contact details, Instagram, Operation Helping Hands statements, final domain/canonicals, social image, analytics/consent, and sender addresses.
11. **Final acceptance:** exact 375/768/1280/1920 visual QA, keyboard/screen-reader smoke tests, measured contrast, Lighthouse, public console/network review, and real one-time/subscription checkout acceptance.

No missing product facts, reviews, discounts, plan terms, fulfillment details, or legal policies should be invented to close these items.
