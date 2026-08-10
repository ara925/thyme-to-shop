# Place in Thyme pre-launch audit

Audit date: 2026-08-10
Branch: `agent/implement-pdf-plans`
Scope: Vite/React storefront, live Shopify Storefront API data, cart and checkout, meal/juice subscriptions, bundles, catalog integrity, resilience, accessibility, SEO, security, and performance.

## Release decision

**GO for preview and client review. NO-GO for accepting real customer payments.**

The storefront features are preserved and the supplied meal/juice flows are implemented as far as the current subscription system can truthfully support. Meal customers configure all three rotating weeks up front; juice customers configure one repeated mix; and each fixed juice bundle offers both one-time and weekly-subscription actions. The remaining payment no-go is caused by Shopify owner/Admin and subscription-contract configuration, not by deleted or hidden features.

The blocking owner items are:

1. Shopify is on Pause and Build and checkout reports that the store is not set up to receive orders.
2. No live subscription configuration automates the documented A -> B -> C meal rotation after all three weekly menus are selected.
3. The exact 10% juice adjustment is configured, but the live subscription system does not provide the documented weekly-versus-four-week-prepaid choice or four-cycle commitment enforcement.
4. Local pickup is offered by the storefront but is off in Shopify and lacks an approved pickup address/instructions.
5. Shipping, tax, payment, subscription, cancellation, refund, privacy, and other launch policies are not approved/configured end to end.

## Verification snapshot

| Check | Result |
| --- | --- |
| `npm run build` | Pass. Vite 7.3.6; 35 sitemap routes; route chunks emitted; main JS 334.00 kB / 108.26 kB gzip. Windows system CA trust was required for the local sitemap fetch. |
| `npx tsc --noEmit --pretty false` | Pass. |
| `npm test` | Pass: 13 files, 98/98 tests. |
| `npm run lint` | Pass: 0 errors, 13 Fast Refresh warnings. |
| `npm audit` | 2 moderate React Router findings; 0 high/critical. |
| `npm audit --omit=dev` | 2 moderate React Router findings; 0 high/critical. |
| `npm ci --dry-run --ignore-scripts` | Pass. |
| `git diff --check` | Pass. |
| Secret scan | No Shopify Admin token, private key, or matching credential pattern in the worktree or Git history. |
| Production console scan | No `console.log`, `console.warn`, or `console.error` calls in non-test `src` code. |
| Official Chrome visual/interaction QA | Pass at 1680 x 867 and 375 x 812 for the updated meal planner, juice plan, fixed bundles, and Pick n' Choose builder. Meal selections persisted at $132/$120/$126 across all three tabs; the qualified $136 juice mix showed the verified $122.40 estimate; all five fixed bundles exposed one-time and weekly actions. No horizontal overflow or page-console warnings/errors were observed. |
| Exact 375/768/1280/1920 matrix | 375 px passes for the updated flows. Exact 768/1280/1920 acceptance is still required before public launch. |
| Lighthouse | Still required on the final public deployment; no score is invented here. |

## 1. Commerce correctness

### RESOLVED IN CODE — Shopify-authoritative products, prices, cart, and totals

All catalog surfaces query Shopify. Home starting prices now come from available standalone Shopify variants rather than marketing constants (`src/components/home/Categories.tsx:8-46`). Cart creation, batch add, quantity update, removal, sync, and line totals use the cart returned by Shopify (`src/stores/cartStore.ts:361-466`). No `/cart/add`, checkout permalink, or `window.open` commerce path remains.

Cart mutation warnings are requested from all five mutations (`src/lib/shopify.ts:397-514`) and shown to the customer (`src/components/cart/CartDrawer.tsx:124-149`). Component-required variants are blocked centrally before any mutation (`src/stores/cartStore.ts:337-353`).

### RESOLVED IN CODE — fulfillment attributes survive to checkout

The cart writes `Fulfillment Method` plus the matching `Preferred Dropoff Window` or `Preferred Pickup Window`, reads Shopify's returned attributes, and verifies them again immediately before checkout (`src/stores/cartStore.ts:198-220`, `src/stores/cartStore.ts:517-548`). Checkout redirects must be HTTPS and match this store's exact permanent MyShopify hostname; `channel=online_store` is added only after validation (`src/lib/shopify.ts:651-668`).

### RESOLVED IN CODE — exact weekly selling plans, no silent fallback

Selling plans are resolved per product by exact normalized group name. A product fails closed unless exactly one matching plan bills and delivers every week (`src/hooks/useProducts.ts`). Fixed bundles additionally require a single plan group whose normalized name exactly matches the parent product title. Missing or malformed plan configuration never becomes an accidental subscription purchase.

The meal planner enforces the documented $120 minimum by parsing the expected selling-plan group label in code; planning and email-request readiness deliberately do not depend on a live selling plan because no current plan can perform the rotation (`src/lib/subscriptionMinimum.ts`, `src/pages/MealSubscription.tsx`). The juice planner loads exactly one live `Pick n' Choose Bundle` parent, derives its minimum and currency from that live product, and checks for an exact single 10% percentage adjustment on every selected weekly plan (`src/pages/JuiceSubscription.tsx`). The owner must still confirm that using the parent price as a retail-before-discount minimum is the intended rule because Shopify exposes no structured minimum on that plan.

### REQUIREMENT GAP — documented subscription schedules need app/backend support

The meal PDF and Cory correspondence require the customer to preselect different quantities for **Week 1, Week 2, and Week 3**, with each week reaching the $120 minimum. Those menus then rotate A -> B -> C, billing weekly, with cancellation allowed at any time. Collecting all three weekly selections is a required storefront step, but adding all three batches to the currently exposed weekly selling plan would incorrectly charge and fulfill every batch every week. A subscription app/backend must create or mutate the future contract lines so only the appropriate week is billed and fulfilled.

The juice PDF and correspondence define **one Pick n' Choose mix repeated weekly**, not a second three-menu rotation: $134.99 minimum per week, an exact 10% subscription discount, a choice to pay all four weeks up front or pay weekly, and a minimum four-week commitment with cancellation every four weeks. The exact 10% weekly adjustment is now configured and verified. The live plans still do not encode a prepaid-versus-weekly choice or a four-cycle commitment, so those terms cannot be enforced truthfully by cart attributes or frontend copy alone.

### RESOLVED IN ADMIN AND CODE — fixed bundles support one-time and weekly purchase

Fixed bundles keep their live parent SKU, image, description, price, availability, Details action, and separate one-time and weekly-subscription actions (`src/components/juices/JuiceBundleCards.tsx`). The weekly action passes only the verified Shopify selling-plan ID. The Intro Pack, Shot Bundle, and Juice Bundles #1, #2, and #3 parent products are each attached to a same-title weekly plan group; the resolver fails closed independently for any card whose exact plan disappears or becomes ambiguous.

The custom Pick n' Choose builder remains a safe one-time path using live products, availability, prices, and the live parent price as its minimum (`src/pages/PickAndChoose.tsx`). The separate juice-plan page requires an exact weekly plan, reports whether every selected plan has the exact 10% adjustment, and shows the discounted estimate only when that adjustment is verified. It can still prepare a complete enrollment request when the adjustment is missing so the team can resolve it, but it never adds a cancel-anytime subscription that cannot enforce Cory's required term (`src/pages/JuiceSubscription.tsx`).

The one-time Pick n' Choose builder's minimum metadata is revalidated from Shopify-returned line subtotals at checkout, so lowering its cart quantity below the minimum is blocked (`src/stores/cartStore.ts:118-174`, `src/stores/cartStore.ts:545`). Both subscription planners now prepare email requests and do not enter checkout. Official Chrome confirmed the $134.99 builder threshold, a $136.00 16-bottle add, and a clear `$7.49 more` block after reducing the cart to $127.50.

### BLOCKER — OWNER/ADMIN — real payment cannot complete

Shopify Admin shows Pause and Build. The Storefront cart and validated checkout URL work, but checkout states that the store is not set up to receive orders. Frontend code cannot activate the plan, payment provider, account verification, or a real refund flow.

### BLOCKER — OWNER/ADMIN — future subscription behavior is not configured

The verified live plans bill/deliver weekly; the Pick n' Choose component plans now carry an exact 10% adjustment, and each fixed-bundle parent has its verified weekly plan. A subscription app/backend must still implement and prove A -> B -> C meal contract rotation, four-week prepaid and weekly-billed juice choices, four-cycle enforcement, and the approved cancellation/renewal terms.

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

Official Chrome visual QA passed at 1680 x 867 and at 375 x 812 for the changed flows, with no horizontal overflow on tested routes. Exact 768, 1280, and 1920 screenshots; full keyboard-only purchase flow; screen-reader smoke testing; and measured WCAG AA contrast remain required on the final public deployment. No unsupported claim is made.

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

The supplied PDFs, their embedded menu artwork, and the live Shopify catalog conflict in the following places:

- The meal PDF's typed item pages agree with current Shopify prices, but the embedded three-menu artwork shows Carne Asada at $20 instead of the typed/live $22; Chicken Balsamic Salad at $16 instead of $16.50; Cajun Chicken at $17 instead of $17.50; Chicken Chickpea Pasta at $16 instead of $16.50; and Southwest Chicken Salad at $15 instead of $16. The artwork also calls the $15.50 Menu #1 item “High Protein Kale Salad,” while the typed page and live product call it “Chickpea Salad.” Confirm that the typed pages/live catalog are the approved source before revising marketing artwork.
- Shopify exposes a `Weekly Meal Package (Rotating 3-Menu Cycle)` at $95, while the approved meal-plan requirement is a $120 minimum for each configured week. Confirm whether that parent product should be retired, repriced, or used only by the subscription backend.
- The Juice Bundles PDF and live catalog both price the Intro Pack at $94.99 and label it “15% discount,” but the listed components total $120 at current standalone prices. The displayed price is about 20.84% below that total, not 15%; correct the price, contents, or claim in Shopify and the source document.
- The remaining fixed juice-bundle prices match the PDF ($89.99, $121.50, $183.50, and $199). Their same-title weekly parent plans repeat those already-discounted live bundle prices without an additional 10% adjustment. Confirm whether that is the intended fixed-bundle subscription price; the separate custom Pick n' Choose weekly plans do carry the exact 10% adjustment.

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
3. **Complete meal-plan scheduling:** the storefront now requires separate Week 1, Week 2, and Week 3 selections at a $120 minimum each; implement and prove the remaining A -> B -> C future-contract rotation without charging all three batches every week.
4. **Finish the documented juice contract:** confirm the $134.99 retail-before-discount minimum source, offer four-week prepaid and weekly-billed choices, enforce four successful cycles, and publish cancellation/renewal terms. The exact 10% adjustment is configured.
5. **Define pricing:** resolve the meal artwork/live-price conflicts and the $95 rotating-package role; approve standalone versus subscription pricing and selling-plan adjustments.
6. **Confirm bundle economics:** the fixed-bundle parent plans and one-time paths are configured; decide whether subscriptions should repeat the already-discounted parent price or receive an additional adjustment, fix the Intro Pack price/discount/content mismatch, supply Pick n' Choose count rules if intended, and confirm component/inventory behavior.
7. **Configure fulfillment:** approve shipping zones/rates, taxes, service area, Sunday windows, and cutoff wording; enable/configure local pickup or explicitly withdraw it; supply the pickup address/instructions.
8. **Approve catalog facts:** product types, week tags, publication, inventory, nutrition/heating, health/ingredient/preservative claims, and the rotating package product's role.
9. **Supply policies:** privacy, terms, shipping, refund, subscription cancellation/renewal, and any required dietary/allergen disclosures.
10. **Confirm identity:** contact details, Instagram, Operation Helping Hands statements, final domain/canonicals, social image, analytics/consent, and sender addresses.
11. **Final acceptance:** exact 768/1280/1920 visual QA (375 px has passed for the changed flows), keyboard/screen-reader smoke tests, measured contrast, Lighthouse, public console/network review, and real one-time/subscription checkout acceptance.

No missing product facts, reviews, discounts, plan terms, fulfillment details, or legal policies should be invented to close these items.
