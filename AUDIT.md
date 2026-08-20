# Place in Thyme pre-launch audit

Audit date: 2026-08-20
Branch: `main` (through merge commit `85c6625`)
Scope: Vite/React storefront, live Shopify Storefront API data, cart and checkout, meal/juice subscriptions, bundles, catalog integrity, resilience, accessibility, SEO, security, and performance.

## Release decision

**GO for the published frontend and client review. NO-GO for accepting real customer payments.**

The storefront features are preserved and the supplied meal/juice flows are implemented as far as the current subscription system can truthfully support. Meal customers configure all three rotating weeks up front; juice customers configure one repeated mix; and each fixed juice bundle offers both one-time and weekly-subscription actions. The remaining payment no-go is caused by Shopify owner/Admin and subscription-contract configuration, not by deleted or hidden features.

### Client-confirmed business rules

Cory confirmed the complete proposed structure and pricing interpretation on 2026-08-18:

- **Meal subscription:** customers configure separate quantities for Menu/Week 1, 2, and 3. Each week's actual selected item total is charged, with a $120 minimum per week; it is not a flat $120 charge. The menus rotate Week 1 -> Week 2 -> Week 3 -> repeat, billing weekly, and customers may cancel at any time.
- **Five fixed juice bundles:** Intro Pack Bundle, Shot Bundle, Juice Bundle #1, Juice Bundle #2, and Juice Bundle #3 are each available one time or as a weekly subscription. A subscribed fixed bundle repeats weekly at its listed bundle price. It does not receive the separate Pick n' Choose 10% adjustment or four-week/prepaid terms.
- **Pick n' Choose juice subscription:** the customer chooses one custom mix that repeats weekly. The mix must reach $134.99 before the exact 10% subscription discount. It has a four-week minimum commitment, offers weekly billing or all four weeks prepaid, and permits cancellation after each four-week period.
- **Hibiscus Tea:** the $3 item is an optional add-on, not a separate subscription plan.

These business decisions are closed. The remaining subscription gaps below are technical implementation and acceptance work, not unresolved questions about the intended offer.

The blocking owner items are:

1. Authenticated Shopify Admin inspection confirmed the store is on **Pause and Build ($9/month)**, Shopify Payments still shows **Complete setup**, the primary location has no address, and the password cannot be removed until the address/plan prerequisites are resolved.
2. No live subscription configuration automates the documented A -> B -> C meal rotation after all three weekly menus are selected.
3. The exact 10% juice adjustment is configured, but the live subscription system does not provide the documented weekly-versus-four-week-prepaid choice or four-cycle commitment enforcement.
4. Local pickup is offered by the storefront but is off in Shopify and lacks an approved pickup address/instructions.
5. Every published customer meal/juice variant except the incompatible legacy $95 package is currently marked **not requiring shipping**. Checkout therefore cannot be trusted to collect a delivery address for the real products until their physical-product configuration and the approved service area/rates are fixed together.
6. Shipping, tax, payment, subscription, cancellation, refund, privacy, and other launch policies are not approved/configured end to end.

## Verification snapshot

| Check | Result |
| --- | --- |
| `npm run build` | Pass on the combined release tree: Vite 7.3.6; 33 published sitemap routes; main JS 353.08 kB / 114.51 kB gzip. |
| `npm run typecheck` | Pass on the combined release tree. |
| `npm test` | Pass: 16 files, 149/149 tests. |
| `npm run lint` | Pass: 0 errors, 15 Fast Refresh warnings. |
| `npm audit` | Pass: 0 vulnerabilities after the Nano ID and React Router upgrades. |
| `npm audit --omit=dev` | Pass: 0 vulnerabilities. |
| `npm ci --dry-run --ignore-scripts` | Pass. |
| `git diff --check` | Pass. |
| Secret scan | No Shopify Admin token, private key, or matching credential pattern in the worktree or Git history. |
| Production console scan | No `console.log`, `console.warn`, or `console.error` calls in non-test `src` code. |
| Official Chrome visual/interaction QA | Pass in the official ChatGPT Chrome extension against the final published release. Meal, juice-subscription, fixed-bundle, and Pick n' Choose pages all showed the approved structures with no horizontal overflow or Lovable badge. A real Shopify cart smoke test added Chimichurri Steak, updated quantity and subtotal from $20 to $40 and back, and removed it to an empty cart. The exact Shopify custom-domain checkout URL was accepted; no checkout or order was submitted. Earlier planner acceptance also verified preserved three-week meal selections and the exact juice minimum/discount/prepaid calculations. |
| Exact 375/768/1280/1920 matrix | Pass for `/subscribe/meals`, `/subscribe/juices`, `/juices`, and `/juices/pick-and-choose`, with no horizontal overflow. The 768px header breakpoint defect found during QA was fixed and rechecked. Redirect-only meal/Hibiscus product URLs also landed on their approved planner/category routes. |
| Authenticated Shopify Admin acceptance | Pass for the approved catalog cleanup: the `$95` product remains Active but is unpublished from all five sales channels and Agentic; its Storefront handle is absent. Pick n' Choose has exactly four products at 10% off; each fixed plan contains only its matching parent; Hibiscus has zero plans; Meal 1/2/3 each contain six products; the two obsolete juice plans are preserved, renamed `DISABLED`, and have no products. |
| Public deployment | Pass at `https://thyme-to-shop.lovable.app`: all five launch routes, `robots.txt`, and `sitemap.xml` return 200 on one deployment; the new release chunks and metadata are present. `shop.placeinthyme.com` is connected only to Shopify and remains password-protected. |
| Lighthouse | Still required; no score is invented here. |

## 1. Commerce correctness

### RESOLVED IN CODE — Shopify-authoritative products, prices, cart, and totals

All catalog surfaces query Shopify. Home starting prices now come from available, customer-facing standalone Shopify variants rather than marketing constants or hidden Hibiscus records (`src/components/home/Categories.tsx`). Cart creation, batch add, quantity update, removal, sync, and line totals use the cart returned by Shopify (`src/stores/cartStore.ts`). No `/cart/add`, checkout permalink, or `window.open` commerce path remains.

Cart mutation warnings are requested from all five mutations (`src/lib/shopify.ts:397-514`) and shown to the customer (`src/components/cart/CartDrawer.tsx:124-149`). Component-required variants are blocked centrally before any mutation (`src/stores/cartStore.ts:337-353`).

### RESOLVED IN CODE — fulfillment attributes survive to checkout

The cart writes `Fulfillment Method` plus the matching `Preferred Dropoff Window` or `Preferred Pickup Window`, reads Shopify's returned attributes, and verifies them again immediately before checkout (`src/stores/cartStore.ts:198-220`, `src/stores/cartStore.ts:517-548`). Checkout redirects must be HTTPS and match either this store's exact permanent MyShopify hostname or the exact configured Shopify-connected checkout hostname; credentials, ports, subdomains, and lookalikes are rejected. `channel=online_store` is added only after validation (`src/lib/shopify.ts`).

### RESOLVED IN CODE — exact weekly selling plans, no silent fallback

Selling plans are resolved per product by exact normalized group name. A product fails closed unless exactly one matching plan bills and delivers every week (`src/hooks/useProducts.ts`). Fixed bundles additionally require a single plan group whose normalized name exactly matches the parent product title. Missing or malformed plan configuration never becomes an accidental subscription purchase.

The meal planner enforces the confirmed $120 minimum by parsing the expected selling-plan group label in code; each configured week's actual selected-item total is the intended weekly charge. Planning and email-request readiness deliberately do not depend on a live selling plan because no current plan can perform the rotation (`src/lib/subscriptionMinimum.ts`, `src/pages/MealSubscription.tsx`). The juice planner requires exactly one approved live `Pick n' Choose Bundle` parent, uses its $134.99 price as the confirmed retail-before-discount minimum, derives its currency from that live product, and verifies one exact ongoing 10% percentage adjustment (`orderCount: null`) on every selected weekly plan (`src/lib/juiceBundleCatalog.ts`, `src/pages/JuiceSubscription.tsx`).

### REQUIREMENT GAP — documented subscription schedules need app/backend support

The confirmed meal rules require the customer to preselect different quantities for **Week 1, Week 2, and Week 3**, with each week's actual selected-item total reaching at least $120. Those menus then rotate A -> B -> C, billing the appropriate selected total weekly, with cancellation allowed at any time. Collecting all three weekly selections is a required storefront step, but adding all three batches to the currently exposed weekly selling plan would incorrectly charge and fulfill every batch every week. A subscription app/backend must create or mutate the future contract lines so only the appropriate week is billed and fulfilled.

The confirmed juice rules define **one Pick n' Choose mix repeated weekly**, not a second three-menu rotation: a $134.99 retail-before-discount minimum per week, an exact 10% subscription discount, a choice to pay all four weeks up front or pay weekly, and a minimum four-week commitment with cancellation after each four-week period. The exact 10% weekly adjustment is now configured and verified. The live plans still do not encode a prepaid-versus-weekly choice or a four-cycle commitment, so those confirmed terms cannot be enforced truthfully by cart attributes or frontend copy alone.

### RESOLVED IN ADMIN AND CODE — fixed bundles support one-time and weekly purchase

Fixed bundles keep their live parent SKU, image, description, price, availability, Details action, and separate one-time and weekly-subscription actions (`src/components/juices/JuiceBundleCards.tsx`). The weekly action passes only the verified Shopify selling-plan ID. A shared catalog contract requires exactly the approved custom parent plus Intro Pack, Shot Bundle, and Juice Bundles #1, #2, and #3; missing, duplicate, or unexpected bundle records fail visibly and disable purchase instead of becoming a sixth plan (`src/lib/juiceBundleCatalog.ts`). Each fixed parent must also have its exact same-title weekly plan.

The custom Pick n' Choose builder remains a safe one-time path using live products, availability, prices, and the live parent price as its minimum (`src/pages/PickAndChoose.tsx`). The separate juice-plan page requires an exact weekly plan, reports whether every selected plan has the exact 10% adjustment, and shows the discounted estimate only when that adjustment is verified. It can still prepare a complete enrollment request when the adjustment is missing so the team can resolve it, but it never adds a cancel-anytime subscription that cannot enforce Cory's required term (`src/pages/JuiceSubscription.tsx`).

The one-time Pick n' Choose builder's minimum metadata is revalidated from Shopify-returned line subtotals at checkout, so lowering its cart quantity below the minimum is blocked. Hibiscus add-ons carry explicit dependency metadata; checkout rejects orphaned/malformed add-ons and revalidates Shopify's returned unit price, USD currency, and quantity-aware $3 subtotal before redirecting (`src/stores/cartStore.ts`). Both subscription planners prepare email requests and do not enter checkout. The meal handoff includes each actual selected weekly total. The juice handoff records the customer's weekly-versus-prepaid preference and shows a four-week prepaid estimate only when the ongoing exact 10% adjustment is verified. The final local official-Chrome acceptance is recorded above.

### BLOCKER — OWNER/ADMIN — real payment cannot complete

The Storefront cart and validated checkout URL work, but checkout states that the store is not set up to receive orders. Authenticated official-Chrome inspection confirmed **Pause and Build ($9/month)** and an incomplete Shopify Payments setup that still requires business/address/financial information. The store location has no address, the storefront remains password protected, local delivery and pickup are both off, and Shopify will not permit password removal until its address/plan prerequisites are met. Frontend code cannot activate the plan, supply identity or banking information, approve rates, or prove a real refund flow.

### BLOCKER — OWNER/ADMIN — products do not require shipping

The live Storefront API returned 29 published products. All 28 real customer meal/juice variants report `requiresShipping: false`; only the incompatible legacy `$95` package reports `true`. Official Chrome confirmed the same **Not a physical product** setting on representative individual meals/juices and all six juice-bundle parent products. Enabling physical-product behavior without first approving the service area and rates could expose the current nationwide flat-rate profile, so the product and fulfillment settings must be corrected as one owner-approved launch change.

### BLOCKER — OWNER/ADMIN — future subscription behavior is not configured

The verified live plans bill/deliver weekly; the Pick n' Choose component plans now carry an uncapped exact 10% adjustment, and each fixed-bundle parent has its verified weekly plan at the listed bundle price without an additional adjustment. A subscription app/backend must still implement and prove A -> B -> C meal contract rotation, four-week prepaid and weekly-billed juice choices, four-cycle enforcement, and the confirmed cancellation/renewal behavior.

## 2. Catalog and data integrity

### RESOLVED IN CODE — strict product-type queries and current-week filtering

Meals query `product_type:Meal`; individual juices query `product_type:Juice AND NOT product_type:"Juice Bundle"`; bundles query `product_type:"Juice Bundle"` (`src/pages/WeeklyMeals.tsx:10-16`, `src/pages/Juices.tsx:13-25`, `src/components/juices/JuiceBundleCards.tsx:66-86`). Home featured meals use the same current-week tag before selecting four (`src/components/home/FeaturedProducts.tsx:10-18`).

The three-week cycle is anchored to 2026-03-16 and changes at Monday midnight in `America/New_York`, including dates before the anchor (`src/lib/weekRotation.ts:6-42`; `src/test/weekRotation.test.ts:4-19`). Thursday 6 PM ET cutoff logic is DST-aware (`src/lib/orderCutoff.ts:9-164`; `src/test/orderCutoff.test.ts:18-68`).

### RESOLVED IN CODE — broken/missing catalog data has visible states

Product grids distinguish loading skeletons, fetch errors, and empty catalogs (`src/components/products/ProductGrid.tsx:7-74`). Product detail has separate skeleton, retryable error, and not-found states (`src/pages/ProductDetail.tsx:108-187`). Missing images and descriptions render neutral Shopify-data-unavailable states rather than blank cards (`src/components/products/ProductCard.tsx:67-122`, `src/pages/ProductDetail.tsx:238-282`).

The customer-facing grids exclude the incompatible `$95` rotating-meal package and both Hibiscus records as standalone products. Direct visits to `weekly-meal-package-rotating-3-menu-cycle` redirect to the meal planner; direct visits to `hibiscus-tea-sweetened` or `hibiscus-tea-add-on` redirect to the approved juice surface without fetching or rendering a purchasable product page (`src/lib/productVisibility.ts`, `src/pages/ProductDetail.tsx`). The sitemap generator excludes the same redirect-only handles, and the cart continues to reject variants Shopify marks as requiring components (`scripts/generate-sitemap.mjs`, `src/stores/cartStore.ts:337-353`).

### RESOLVED IN ADMIN — conflicting customer plan and publication records

The `Weekly Meal Package (Rotating 3-Menu Cycle)` remains **Active** as a preserved internal record but is unpublished from every sales channel and Agentic, has no recent sales, and has been removed from Meal 1/2/3. Independent fresh Storefront API queries return 28 products and no result for its handle. `Hibiscus Tea (Sweetened)` remains the public $3 one-time add-on but now has zero selling-plan groups. Pick n' Choose contains only Ginger Shot, Turmeric Shot, Green Cleanse, and Hearty Red with the exact ongoing 10% plan. Each fixed plan contains only its matching bundle parent. Meal 1/2/3 each contain exactly six menu products. The two obsolete juice plan records were preserved, renamed `DISABLED`, and emptied rather than deleted. Inventory remains untracked throughout the inspected catalog; the physical-product and fulfillment blocker below still applies.

### NEEDS OWNER DATA — nutrition and heating instructions

Nutrition/heating content is local by handle (`src/lib/mealData.ts:9-98`) and has not been validated against an owner-approved source. Shopify metafields are queried, but approved data and mapping are still needed before replacing the local content. Do not infer medical or nutrition facts.

## 3. Error handling and resilience

### RESOLVED IN CODE — typed, finite failure states

Storefront requests have a 15-second timeout and distinguish network, abort, HTTP, Shopify 402, GraphQL, invalid JSON, and missing-data failures (`src/lib/shopify.ts:576-642`). Cart mutations reject Shopify user errors and cannot show false success. Tests cover request errors, warning lifecycle, expired-cart recreation, serialization, fulfillment confirmation, minimum checks, exact host validation, sold-out products, and component-required products (`src/test/shopifyApi.test.ts`, `src/test/cartStore.test.ts`).

All primary asynchronous commerce surfaces now use accessible, layout-preserving loading skeletons (`src/App.tsx:30-50`, `src/components/products/ProductGrid.tsx:7-36`, `src/components/juices/JuiceBundleCards.tsx:31-57`, `src/components/subscriptions/SubscriptionProductSkeletons.tsx`, `src/pages/ProductDetail.tsx:108-139`, `src/pages/PickAndChoose.tsx:118-166`).

## 4. Frontend quality

### RESOLVED IN CODE — build, types, tests, and lint

The final integrated tree passes build, types, all 149 tests, and lint with zero errors. API boundaries and Shopify response types are explicit (`src/lib/shopify.ts`). Routes are lazy-loaded (`src/App.tsx:11-20`). Product-card actions are no longer interactive buttons nested inside links (`src/components/products/ProductCard.tsx:61-161`). No deleted-file or route scan found removed storefront functionality.

### NICE-TO-HAVE — Fast Refresh warnings and token cleanup

ESLint reports 15 non-production Fast Refresh warnings from files that export components plus helpers. These do not affect the production build but can be removed by moving shared helpers/constants into dedicated modules.

Some intentional contrast layers still use literal `text-white`, translucent white, and Radix `bg-black/80` utilities (for example `src/components/home/Hero.tsx`, `src/components/layout/Footer.tsx`, and `src/components/ui/sheet.tsx`). A future design-system pass should decide which become semantic tokens; a mechanical replacement risks reducing contrast.

## 5. Responsive behavior and accessibility

### RESOLVED IN CODE — purchase controls and modal behavior

Buttons, icon controls, inputs, selects, options, and planner tabs now meet the 44 px target through shared primitives (`src/components/ui/button.tsx:20-24`, `src/components/ui/input.tsx:10`, `src/components/ui/select.tsx:20-108`, `src/components/ui/tabs.tsx:14-35`). Icon-only controls have accessible names. Product images use live alt text with product-title fallbacks.

The cart uses Radix Sheet focus containment and Escape behavior; its close target is 44 px (`src/components/ui/sheet.tsx:54-65`). The mobile navigation supports Escape and exposes expanded/current-page state (`src/components/layout/Header.tsx:30-45`, `src/components/layout/Header.tsx:63-124`). Badge forwards refs (`src/components/ui/badge.tsx:23-31`). Global reduced-motion handling is present (`src/index.css:165-173`).

### PARTIAL — viewport and public smoke acceptance complete; assistive-tech checks remain

Official Chrome visual QA passes at 375, 768, 1280, and 1920 CSS pixels for all four changed meal/juice flows, with no horizontal overflow or visible configuration alerts. The published homepage and all four live meal/juice routes were then visually rechecked, the badge was absent, and the real add/update/remove cart flow passed. Full keyboard-only purchase flow, screen-reader smoke testing, and measured WCAG AA contrast remain required.

## 6. SEO and metadata

### RESOLVED IN CODE — route/product metadata and structured data

All routes receive real titles, descriptions, robots directives, canonical URLs, Open Graph, and Twitter metadata (`src/components/seo/RouteSeo.tsx:13-112`). Home emits Organization JSON-LD. Product pages emit Product JSON-LD and use the live primary image for Open Graph/Twitter (`src/pages/ProductDetail.tsx:46-102`).

`robots.txt` points at the sitemap. The deployment-time generator queries published products, excludes component-required-only and redirect-only product handles, and produced 33 routes (`scripts/generate-sitemap.mjs`, `public/sitemap.xml`).

### PARTIAL — Shopify domain connected; final public identity still needs owner acceptance

Per the chosen architecture, `shop.placeinthyme.com` is the **Primary / Connected** Shopify domain and was removed from Lovable's custom-domain configuration. Anonymous traffic currently stays on that hostname and lands on Shopify's password page. The headless frontend remains published at `https://thyme-to-shop.lovable.app`, so its canonical, social, robots, and sitemap URLs correctly use the Lovable hostname. Confirm whether this split identity is final before changing `VITE_SITE_URL`; do not point the Shopify-owned hostname at Lovable without a new architecture decision. Confirm the social-sharing image and organization identity.

## 7. Content and trust

### RESOLVED IN CODE — no fake social proof

No fake reviews, testimonials, star ratings, review counts, lorem ipsum, or visible TODO copy was found. No product fact, discount, policy, or review was invented to close a missing-data gap.

The former placeholder Instagram action now points to the published `place.in.thyme` profile and has an accessible 44 px target (`src/components/layout/Footer.tsx:29-44`).

### NEEDS OWNER ACTION — contradictory/missing business facts

The supplied PDFs, their embedded menu artwork, and the live Shopify catalog conflict in the following places:

- The meal PDF's typed item pages agree with current Shopify prices, but the embedded three-menu artwork shows Carne Asada at $20 instead of the typed/live $22; Chicken Balsamic Salad at $16 instead of $16.50; Cajun Chicken at $17 instead of $17.50; Chicken Chickpea Pasta at $16 instead of $16.50; and Southwest Chicken Salad at $15 instead of $16. The artwork also calls the $15.50 Menu #1 item “High Protein Kale Salad,” while the typed page and live product call it “Chickpea Salad.” Confirm that the typed pages/live catalog are the approved source before revising marketing artwork.
- Shopify retains a `Weekly Meal Package (Rotating 3-Menu Cycle)` at $95, which cannot represent the confirmed customer-facing rule of charging each week's actual selected-item total with a $120 minimum. It is now Active but unpublished everywhere, absent from Storefront API results, removed from the three menu plans, filtered from grids, redirected to the approved planner, and omitted from the sitemap. The record is preserved for a possible internal backend role and is not a customer purchase path.
- The Juice Bundles PDF and live catalog both price the Intro Pack at $94.99 and label it “15% discount,” but the listed components total $120 at current standalone prices. The displayed price is about 20.84% below that total, not 15%; correct the price, contents, or claim in Shopify and the source document.
- The remaining fixed juice-bundle prices match the PDF ($89.99, $121.50, $183.50, and $199). Their same-title weekly parent plans correctly repeat those listed bundle prices without an additional 10% adjustment. The separate custom Pick n' Choose weekly plans carry the exact 10% adjustment, as confirmed.

No structured bottle-count rule exists for Pick n' Choose, so code safely enforces the live $134.99 spend threshold and does not invent a count. Supply a min/max count if one is intended.

Confirm the public email, phone, service area, Sunday windows, pickup location/instructions, ingredient/preservative claims, nutrition/health claims, and statements about Operation Helping Hands (`src/components/layout/Footer.tsx:22-87`, `src/pages/HowItWorks.tsx:27`, `src/pages/About.tsx:16-82`). The current storefront and the separate public business site expose different contact details.

No dedicated privacy, terms, shipping, refund, cancellation, or subscription-policy routes exist in the current route table (`src/App.tsx:52-61`). These require owner-approved content; frontend code must not draft legal terms as facts.

## 8. Security and configuration

### RESOLVED IN CODE — client-safe configuration and redirect hardening

Only the public Shopify Storefront token is client-side. `.env`, `.env.*`, and TypeScript build-info artifacts are ignored while `.env.example` is allowed (`.gitignore:14-17`). Checkout accepts only the exact HTTPS permanent MyShopify hostname and exact configured Shopify checkout hostname, currently `shop.placeinthyme.com`; unsafe schemes, credentials, ports, subdomains, and lookalikes are rejected (`src/lib/shopify.ts`, `src/test/shopifyApi.test.ts`). No Admin credential/private-key pattern was found in source or Git history.

### RESOLVED IN CODE — dependency advisories and automated release checks

The vulnerable transitive Nano ID release and the affected React Router 6 releases were upgraded without forced dependency resolution. `npm audit` and the production-only audit now report zero vulnerabilities; all 149 tests, typechecking, the production build, and lint still pass. `.github/workflows/ci.yml` repeats install, tests, typechecking, build, and lint on every pull request and push to `main`; PR #5 passed that gate before merge.

### NEEDS OWNER ACTION — app ownership and access review

Authenticated Admin inspection found Shopify Subscriptions, MW Bundle Builder, Shopify Bundles, Flow, Messaging, and Upcart installed. Shopify Subscriptions is only **1 of 7** setup steps complete and its Contracts page is empty. The approved membership cleanup is complete; the obsolete misspelled zero-discount juice plan and separate weekly Hibiscus plan remain only as clearly disabled, productless records. The menu plans still cannot implement rotation. MW Bundle Builder costs $14.99 every 30 days and contains one disabled, invalid “Week 1 Menu test” offer with a missing offer product, zero impressions, zero orders, and zero sales. Shopify Bundles contains only the component-required Hibiscus add-on record. Choose one subscription source of truth, document required permissions, and approve any future app removal or billing change; no live contracts were found to migrate.

## 9. Performance

### RESOLVED IN CODE — splitting, responsive images, and fonts

Routes are split per page (`src/App.tsx:11-20`). Shopify CDN helpers add safe width parameters and `srcset` candidates (`src/lib/images.ts:1-20`). The hero supplies 960/1920 candidates (`src/components/home/Hero.tsx:11-18`). Below-the-fold images are lazy/async; the main product image is prioritized. Fonts use preconnect plus `display=swap` instead of a CSS `@import` (`index.html:12-18`).

### SHOULD-FIX — measured Lighthouse acceptance

Run Lighthouse on the public home, juices/category, and product-detail pages after owner configuration. Record mobile and desktop Performance, Accessibility, Best Practices, and SEO scores. No score is claimed in this audit.

# NEEDS OWNER ACTION

1. **Activate commerce:** replace Pause and Build with an approved selling plan, add the business/location address, configure/verify the payment provider and financial account, then complete a real order, refund, and failure-path test.
2. **Choose the subscription source of truth:** Shopify Subscriptions currently owns the cleaned plan records but is only 1/7 configured. Decide whether it or another backend owns future contracts and finish that setup; no existing contracts were found.
3. **Complete meal-plan scheduling:** the storefront now requires separate Week 1, Week 2, and Week 3 selections and calculates each week's actual selected-item total against its $120 minimum; implement and prove the remaining A -> B -> C future-contract rotation without charging all three batches every week.
4. **Finish the confirmed juice contract:** retain the $134.99 retail-before-discount minimum and exact 10% adjustment, add four-week prepaid and weekly-billed choices, enforce four successful cycles, and publish the confirmed cancellation/renewal behavior.
5. **Resolve remaining catalog pricing conflicts:** the incompatible `$95` package is now preserved as an Active, unpublished internal record and removed from every menu plan. Reconcile the remaining meal artwork with the typed/live prices. The meal-plan billing rule itself is confirmed: actual selected total with a $120 weekly minimum.
6. **Resolve remaining bundle-data issues:** preserve the confirmed fixed-bundle behavior (listed price repeated weekly with no extra 10%), fix the Intro Pack price/discount/content mismatch, supply Pick n' Choose count rules if intended, and confirm component/inventory behavior.
7. **Configure fulfillment:** all 28 real customer product variants currently do not require shipping. Approve the service area, shipping zones/rates, taxes, Sunday windows, cutoff wording, and pickup/delivery address/instructions; then mark the approved physical products as requiring shipping and enable/configure local delivery or pickup as applicable.
8. **Approve catalog facts:** product types, week tags, publication, inventory, nutrition/heating, health/ingredient/preservative claims, and the rotating package product's role.
9. **Supply policies:** privacy, terms, shipping, refund, subscription cancellation/renewal, and any required dietary/allergen disclosures.
10. **Confirm identity:** contact details, Instagram, Operation Helping Hands statements, final domain/canonicals, social image, analytics/consent, and sender addresses.
11. **Final acceptance:** complete keyboard/screen-reader smoke tests, measured contrast, Lighthouse, public network review, and real one-time/subscription checkout acceptance after Shopify is activated. The frontend viewport matrix and live cart add/update/remove smoke already pass.

No missing product facts, reviews, discounts, plan terms, fulfillment details, or legal policies should be invented to close these items.
