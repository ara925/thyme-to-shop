# Place in Thyme Pre-launch Readiness Audit

**Audit date:** 2026-08-06

**Scope:** Vite/React storefront, live Shopify Storefront API, production build, dependency tree, git history, and responsive browser behavior

**Launch decision:** **NO-GO until the Blocker items in `NEEDS OWNER ACTION` are completed and re-tested.**

The code now fails closed for the unsafe subscription and configurable-bundle paths, and the one-time delivery cart flow is materially hardened. It is not appropriate to call the whole store launch-ready while the business rules, Shopify configuration, legal pages, and a test transaction remain unverified.

Severity means:

- **Blocker:** can mischarge, mis-fulfill, misrepresent an offer, prevent ordering, or create a legal/security launch risk.
- **Should-fix:** important correctness, accessibility, SEO, resilience, or maintainability work expected before handoff.
- **Nice-to-have:** useful follow-up that does not block the safely limited storefront.

## Executive summary

| Area | Result |
| --- | --- |
| One-time cart and delivery flow | Code-fixed and live-tested through the point immediately before checkout |
| Subscriptions and two-tier pricing | Safely disabled; Shopify/business configuration is incomplete |
| Pick n' Choose bundle | Safely disabled; component/count rules do not exist in the available catalog data |
| Live catalog | 29 published products inspected; all had image, description, price, available variant, and image alt text |
| Rotation/cutoff | Code-fixed and covered across ET, DST, timezone, exact-cutoff, and stale-cart cases |
| Build quality | Typecheck, lint, 25 tests, production build, and static SEO generation pass |
| Responsive/accessibility | Visually and structurally checked at 375, 768, 1280, and 1920 px with no overflow or broken images |
| SEO | Route/product metadata, raw static HTML, JSON-LD, robots, and a 34-URL production sitemap generated |
| Security | No private/Admin secrets found; one currently unpatchable, non-reachable React Router RSC advisory remains |
| Launch status | Blocked on the owner actions at the end of this report |

## 1. Commerce correctness

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Blocker | The original cart could report success from local state without a successful Shopify mutation, and quantity/removal identity was variant-based instead of Shopify line-based. `src/stores/cartStore.ts:282`, `src/components/cart/CartDrawer.tsx:154` | **Fixed.** Cart operations are serialized, reject failures, rebuild from Shopify's returned cart, retain `lineId`/selling-plan identity, and render Shopify line subtotals and totals. Regression coverage: `src/test/cartStore.test.ts:160-321`. |
| Blocker | Required fulfillment attributes could be missing or stale at checkout. `src/stores/cartStore.ts:104-128`, `src/stores/cartStore.ts:397-424` | **Fixed.** `Preferred Dropoff Window` and `Fulfillment Method` are written immediately before checkout and must be echoed by Shopify before a validated checkout URL is returned. Checkout stays disabled until confirmation. Coverage: `src/test/cartStore.test.ts:323-372`. |
| Blocker | Subscription products/selling plans did not reliably map each rotation week to the right product, did not enforce the stated four-week juice commitment, and displayed discounts not present in live selling-plan adjustments. `src/pages/MealSubscription.tsx:22-38`, `src/pages/JuiceSubscription.tsx:22-38` | **Safely disabled in code.** Enrollment controls and subscription nav promotion were removed; both routes explain that enrollment is paused and are `noindex`. Owner configuration is still required. |
| Blocker | Two-tier juice pricing and bundle savings could not be derived consistently from the live catalog. The Intro Pack's marketing percentage also did not reconcile with the component-price snapshot. | **Not invented.** False savings/discount copy and hardcoded prices were removed. Owner must define authoritative standalone, meal-plan, and fixed-bundle pricing in Shopify. |
| Blocker | The `pick-n-choose-bundle` product was a normal SKU with no Storefront component/count rules, so the UI could not validate its contents. `src/components/products/ProductCard.tsx:25-31`, `src/pages/ProductDetail.tsx:138-146` | **Safely disabled in code.** It shows “Builder unavailable” and cannot be added. Owner must configure the bundle model and item-count rules. |
| Blocker | A cart opened before Thursday 6 PM ET could otherwise retain now-closed weekly items after the menu advanced. `src/hooks/useOrderCycle.ts:21-55`, `src/stores/cartStore.ts:130-137`, `src/stores/cartStore.ts:411-416` | **Fixed.** Open catalogs refresh on the exact minute/focus, and checkout rejects Meal/Juice lines that do not match the currently orderable week. Coverage: `src/test/cartStore.test.ts:374-407`. |
| Should-fix | Checkout URLs needed to remain same-tab Shopify checkouts, never arbitrary URLs, product links, permalinks, or popups. `src/lib/shopify.ts:417-425`, `src/components/cart/CartDrawer.tsx:57-64` | **Fixed.** Only HTTPS `*.myshopify.com` checkout URLs are accepted, `channel=online_store` is applied, and navigation uses `window.location.assign`. No `/cart/add`, checkout permalink, Shopify product redirect, or `window.open` remains. |
| Blocker | A real payment/thank-you-page transaction was outside this audit and was intentionally not submitted. | **Owner action.** Run a Shopify test-mode order and verify line items, attributes, rates, tax, payment, confirmation email, fulfillment view, and cancellation/refund behavior. |

## 2. Catalog and data integrity

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Should-fix | Category selection must be query-based, not inferred from title/handle. `src/pages/WeeklyMeals.tsx:10`, `src/pages/Juices.tsx:10`, `src/components/home/FeaturedProducts.tsx:9` | **Fixed.** Queries use exact Shopify `product_type:Meal`, `product_type:Juice`, and `product_type:"Juice Bundle"`; title/handle matching is used only to fail closed for the known unconfigured builder SKU. |
| Should-fix | A first-page-only request could silently omit larger catalogs. `src/hooks/useProducts.ts:19-44`, `src/lib/shopify.ts:237-241` | **Fixed.** Catalog requests paginate until `hasNextPage=false` and treat a missing cursor as an invalid response. |
| Should-fix | The live 2026-08-06 Storefront snapshot returned **29 published products**: 17 Meal, 6 Juice, and 6 Juice Bundle. All 29 had a non-empty description, image, positive price, available variant, and image alt text. | **Verified.** Loading, error/retry, and empty states prevent blank cards. `src/components/products/ProductGrid.tsx:16-80`. |
| Blocker | `Hibiscus Tea Add-On` (Juice) and `Weekly Meal Package (Rotating 3-Menu Cycle)` (Meal) had no week tag, so their intended rotation/availability is ambiguous. | **Excluded/fail-closed.** Weekly category queries will not render them and checkout rejects untagged rotating Meal/Juice lines. Owner must assign correct tags or product types. |
| Blocker | The removed `src/lib/mealData.ts` contained unverifiable local nutrition/heating values and did not safely cover the live catalog. `src/lib/shopify.ts:185-217`, `src/components/products/NutritionLabel.tsx:1-22`, `src/components/products/HeatingInstructions.tsx:1-20` | **Fixed without inventing data.** Product detail uses only Shopify metafields and hides absent sections. The audited live products had no nutrition/heating metafield values; owner must populate verified values. |
| Should-fix | Three-week rotation anchored to 2026-03-16 and Thursday 6 PM ET needed calendar-zone/DST correctness. `src/lib/weekRotation.ts:53-82`, `src/lib/orderCutoff.ts:135-166` | **Fixed.** New York calendar math, positive modulo, exact-cutoff behavior, current Week C result, and both DST transitions are covered in `src/test/weekRotation.test.ts:4-40` and `src/test/orderCutoff.test.ts:10-80`. |
| Blocker | The Storefront API exposes products published to the sales channel; it cannot enumerate Shopify Admin drafts for comparison. | **Owner action.** Review product status and Online Store/Headless publication in Shopify Admin so draft or pre-release products are not published. |

## 3. Error handling and resilience

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Blocker | Network errors, 402 billing, HTTP errors, GraphQL `errors`, invalid/empty responses, and a stalled response body could leave unsafe or blank behavior. `src/lib/shopify.ts:340-399` | **Fixed.** Typed errors, shopper-safe messages, and a 15-second timeout covering both headers and body parsing are implemented. Coverage: `src/test/shopifyApi.test.ts:22-112`. |
| Should-fix | Every async catalog/detail surface needed visible loading, failure, retry, empty, and not-found states. `src/components/products/ProductGrid.tsx:16-80`, `src/pages/ProductDetail.tsx:61-128` | **Fixed.** Skeletons and explicit states replace blank pages/infinite spinners. |
| Blocker | Sold-out variants must not be addable. `src/stores/cartStore.ts:241-248`, `src/components/products/ProductCard.tsx:25-34`, `src/pages/ProductDetail.tsx:145-151` | **Fixed.** Both UI and store boundary verify `availableForSale`; Shopify mutation errors also reject rather than trigger success UI. |
| Should-fix | Badge passed through refs incorrectly. `src/components/ui/badge.tsx:25-32` | **Fixed** with `React.forwardRef`. |
| Should-fix | Browser console errors/rejections must not remain. | **Verified** on the final production preview: no warning/error entries for the audited 5175 origin on home, category, product, cart, and subscription routes. |
| Nice-to-have | A render-time exception unrelated to API state would still rely on React's default failure behavior. `src/App.tsx:43-69` | Add a branded top-level error boundary in a later hardening pass. |

## 4. Frontend quality

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Blocker | Build, lint, typecheck, and tests had to be a single reproducible gate. `package.json:10-15` | **Fixed.** `npm run check` passes TypeScript, ESLint, 25 Vitest tests, Vite production build, live static product-page generation, and sitemap generation. |
| Should-fix | Storefront responses used weak boundaries and incomplete cart/product shapes. `src/lib/shopify.ts:8-153`, `src/stores/cartStore.ts:31-76` | **Fixed.** API, connection, product, variant, cart, mutation, error, attributes, costs, and selling-plan allocation shapes are explicit; strict/no-unused TypeScript is enabled. |
| Should-fix | Large dead local product libraries, duplicate locks, unused shadcn modules, obsolete hooks/components, and unused dependencies increased handoff risk. | **Fixed.** 47+ MiB of dead meal/juice assets and unreachable UI code were removed; the lockfile/dependency set was reduced to reachable production code. AST reachability found no unreachable production TypeScript modules. |
| Should-fix | Hardcoded `text-white`/`bg-white`/`border-white` utility colors bypassed semantic theming. `src/index.css:7-79`, `tailwind.config.ts:34-93` | **Fixed.** Active UI uses semantic foreground/surface/overlay/shadow tokens; a final scan found no hardcoded white/black/hex Tailwind color utility in `src`. |
| Should-fix | Duplicate product queries and stale catalog cache behavior needed control. `src/hooks/useProducts.ts:19-65` | **Fixed.** Stable React Query keys deduplicate identical requests, share results, abort obsolete requests, retry only appropriate transient failures, and use a two-minute stale period. |
| Nice-to-have | Product/catalog integration tests are boundary-focused rather than component-render tests. | Add a small rendered-component suite if future UI iteration becomes frequent. |

## 5. Responsive behavior and accessibility

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Should-fix | Required viewport matrix: 375×812, 768×1024, 1280×900, and 1920×1080. | **Verified visually in the official ChatGPT Chrome plugin.** No horizontal overflow, broken image, duplicate/missing H1, unnamed control, or visible target below 44×44 was found in the final preview. Mobile navigation remains active through 768 px; desktop navigation starts at 1280 px. |
| Blocker | Cart and navigation needed keyboard handling, focus containment, Escape, and restoration. `src/components/layout/Header.tsx:28-48`, `src/components/ui/sheet.tsx:16-95` | **Verified.** Mobile nav closes on Escape and restores focus. Radix Sheet traps drawer focus; Escape closes it and returns focus to the cart trigger. |
| Should-fix | Checkout select trigger/options and icon controls were below 44 px. `src/components/ui/button.tsx:8-12`, `src/components/ui/select.tsx:20`, `src/components/ui/select.tsx:108` | **Fixed.** The live checkout select measured 44 px; all audited visible controls met the target. |
| Should-fix | Heading levels, route focus, skip navigation, labels, and icon names were incomplete. `src/components/seo/RouteAccessibility.tsx:4-31`, `src/components/products/ProductGrid.tsx:16-80`, `src/components/cart/DeliveryTimeSelect.tsx:35-65` | **Fixed.** Each audited route has one H1, sections have H2 structure (including screen-reader headings), controls are named, and the fulfillment label is associated. |
| Should-fix | Motion needed an opt-out. `src/index.css:155-169` | **Fixed.** `prefers-reduced-motion` collapses transitions/animations and disables smooth scrolling. |
| Nice-to-have | This audit did not replace testing with VoiceOver/NVDA or a full automated accessibility crawler. | Run one assistive-technology smoke test with a real checkout before launch. |

## 6. SEO and metadata

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Should-fix | A client-only SPA would return home title/canonical/OG metadata on deep-link HTML before JavaScript. `scripts/generate-static-pages.mjs:72-126`, `route-metadata.json:1-34` | **Fixed.** Production build emits route-specific raw HTML for seven app routes and 29 live Shopify product routes, plus `404.html`. |
| Should-fix | Product metadata could exceed the requested `<60` title and `<160` description limits. `src/pages/ProductDetail.tsx:23-27`, `src/pages/ProductDetail.tsx:140-169`, `scripts/generate-static-pages.mjs:168-211` | **Fixed.** Both runtime and build-time product metadata are bounded. Generated validation: max title 59, max description 159, zero failures across 36 HTML pages. |
| Should-fix | Canonical, OG/Twitter, Product JSON-LD, Organization JSON-LD, and unknown-route indexing were incomplete. `src/components/seo/Seo.tsx:29-117`, `src/components/seo/RouteSeo.tsx:14-51` | **Fixed.** Product and home structured data are present once in final DOM; unknown and paused subscription routes are `noindex`. |
| Should-fix | Static sitemap omitted products. `scripts/generate-static-pages.mjs:216-229`, `public/robots.txt:16` | **Fixed in the production build.** The generated sitemap had 34 unique indexable URLs (5 static + 29 live products); robots points to the canonical sitemap. |
| Blocker | Hosting behavior and the canonical production origin cannot be proven from this repository alone. `src/components/seo/siteConfig.ts:1-17`, `vite.config.ts:6-20` | **Owner action.** Set/verify `VITE_SITE_URL`, deploy only through `npm run build`, confirm the host serves generated route `index.html` files and `404.html`, then inspect public-source HTML and social previews. |
| Nice-to-have | The favicon is the only verified social-image asset. | Supply an owner-approved 1200×630 OG image and update the social fallback; do not fabricate one from unapproved brand content. |

## 7. Content and trust

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Blocker | Legal/privacy/refund/shipping/terms pages do not exist, and owner-approved policy text was not available. `src/App.tsx:50-67`, `src/components/layout/Footer.tsx:49-88` | **Not invented.** Owner/legal must provide and approve the policies, then link them in the footer and checkout configuration. |
| Blocker | Claims about “fresh,” “chef-prepared,” “cold-pressed,” nutrition, local sourcing/farmers, Operation Helping Hands, charitable impact, and Southern California need substantiation. `src/pages/About.tsx:14-84`, `src/components/layout/Footer.tsx:35-37` | **Owner action.** Validate or replace with approved copy. No new testimonials, ratings, reviews, or product claims were invented. |
| Should-fix | Pickup was offered without a verified pickup address/instructions, contradicting the trust requirement. `src/components/cart/DeliveryTimeSelect.tsx:35-65` | **Fixed safely.** Online checkout is delivery-only until the owner supplies and verifies pickup operations. |
| Should-fix | Placeholder reviews/TODO/lorem or fabricated social proof must not ship. | **Verified.** No fake reviews, star ratings, review counts, testimonials, user-visible TODO, or lorem ipsum were found. |
| Should-fix | Contact/delivery copy needed one source of truth. `src/components/layout/Footer.tsx:69-90`, `src/pages/HowItWorks.tsx:18-31` | **Aligned** to Thursday 6 PM ET, Sunday delivery, delivery-window selection, generic Southern California service, and `info@placeinthyme.com`; owner must verify those facts. |

## 8. Security and configuration

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Blocker | Private/Admin tokens, keys, or credential files must not be in the current tree or history. `src/lib/shopify.ts:1-6`, `.gitignore:15-17` | **Verified across the current tree and 110 commits.** Only intended public Storefront tokens were found; no Shopify Admin token, private key, or known GitHub/AWS/Google/Stripe/Slack/JWT secret pattern was found. `.env` and `.env.*` are ignored. A `VITE_` Storefront token is public by design. |
| Should-fix | Checkout navigation and Storefront requests needed bounded destinations and current API behavior. `src/lib/shopify.ts:1-6`, `src/lib/shopify.ts:340-425` | **Fixed.** API version is `2026-07`, requests time out, errors are typed, and checkout URLs are HTTPS Shopify-hosted only. |
| Should-fix | Development server listened on all interfaces. `vite.config.ts:7-10` | **Fixed** to `127.0.0.1`; production output is static. |
| Should-fix | Production logs must not leak shopper/cart data. | **Verified.** No `console.log` remains in the browser bundle; the only log is the non-sensitive build-time static-page count in `scripts/generate-static-pages.mjs:239`. |
| Blocker | `npm audit --omit=dev` currently reports two HIGH package nodes from one advisory, `GHSA-qwww-vcr4-c8h2`, against React Router RSC/server-action request handling. `package.json:27` | **Accepted temporary exception; owner must monitor.** This BrowserRouter-only SPA has no RSC, actions, loaders, server rendering, `RouterProvider`, or server endpoint, so the vulnerable path is not reachable. The installed `7.18.2` is the current npm release. npm's forced `7.11.0` suggestion was tested separately and exposes many older high/moderate advisories; it is not a safer fix. Upgrade promptly when a stable patched release exists. |

## 9. Performance

| Severity | Finding and evidence | Resolution |
| --- | --- | --- |
| Should-fix | The original entry was approximately 469.4 kB JS / 142.2 kB gzip and 74.5 kB CSS / 12.9 kB gzip, with a 563.2 kB JPEG hero and no route splitting. `src/App.tsx:9-17`, `src/components/home/Hero.tsx:14-30` | **Improved.** Routes are lazy-loaded. Final CSS is 39.46 kB / 7.50 kB gzip. Approximate home first-load JS is 412 kB raw / 134.5 kB gzip across shared + home chunks. |
| Should-fix | Hero and product images needed responsive delivery and dimensions. `src/components/home/Hero.tsx:14-30`, `src/lib/shopify.ts:405-415`, `src/components/products/ProductCard.tsx:52-62` | **Fixed.** Hero AVIFs are 80.17 kB (768), 224.10 kB (1280), and 415.38 kB (1920), with a 563.18 kB JPEG fallback, explicit dimensions, eager/high-priority LCP loading, and responsive selection. Shopify images request bounded CDN widths and lazy-load in grids. |
| Should-fix | Font loading could block text. `index.html:12-18` | **Fixed.** Google Fonts uses preconnect plus `display=swap`; system fallbacks remain available. |
| Should-fix | Lighthouse scores were requested. | **Not measured and not fabricated.** The mandated official ChatGPT Chrome plugin exposes viewport/page-asset controls but no Lighthouse/performance-audit capability; using a second browser runner would have violated the browser constraint. Add Lighthouse mobile/desktop runs for home, category, and product to CI or run them in approved Chrome DevTools against the deployed origin before launch. |

## Verification record

### Automated

- `npm run check`: pass
  - TypeScript project build: pass
  - ESLint: pass, zero warnings/errors
  - Vitest: 4 files, **25/25 tests passed**
  - Vite production build: pass
  - Static generation: 7 route pages, 29 product pages, `404.html`, and sitemap
- `git diff --check`: pass
- Generated SEO validation: 36 HTML pages, title max 59, description max 159, 34 unique sitemap URLs
- Dependency reachability: no unused production dependency or unreachable production TypeScript module found; `autoprefixer`/`postcss` depcheck reports are config-driven false positives

### Official ChatGPT Chrome plugin

- Final production preview at 375×812, 768×1024, 1280×900, and 1920×1080
- Home, weekly meals, juices, product detail, paused subscription routes, about, how-it-works, and unknown route
- No horizontal overflow, broken images after load, duplicate/missing H1, visible sub-44 px target, or final-preview console warning/error
- Mobile nav open/Escape/focus restoration
- Product metadata/canonical/one Product JSON-LD; home one Organization JSON-LD
- Live one-time cart: add current Week C meal, line/subtotal `$18.00`, 44 px labeled delivery select, checkout disabled before selection, Shopify-confirmed `9:00 AM – 11:00 AM`, checkout enabled afterward, removal, empty-cart state
- Checkout was **not clicked** and no order/payment was submitted

# NEEDS OWNER ACTION

1. **Subscriptions — Blocker:** configure and verify the correct selling plan for every rotating meal/juice product, authoritative price adjustments, billing cadence, four-week minimum, cancellation/refund terms, and post-purchase fulfillment. Re-enable UI only after end-to-end tests.
2. **Bundles/two-tier pricing — Blocker:** define fixed bundle contents, standalone versus meal-plan pricing, Pick n' Choose eligible products/count validation, and reconcile the Intro Pack savings claim with authoritative Shopify prices.
3. **Catalog Admin review — Blocker:** correct the two untagged products, verify product types/tags/SKUs/inventory, confirm draft products are not published to the Storefront channel, and populate verified nutrition/heating metafields where required.
4. **Checkout operations — Blocker:** configure shipping/delivery zones and rates, taxes, payment provider/test mode, confirmation email, fulfillment workflow, refunds, and—if desired later—a real pickup address/instructions.
5. **Legal pages — Blocker:** provide owner/legal-approved privacy, terms, refund/cancellation, shipping/delivery, and subscription policies; add routes/footer links and configure Shopify policy settings.
6. **Claims/contact — Blocker:** substantiate or replace fresh/chef-prepared/cold-pressed/nutrition/local-farmer/charity/Operation Helping Hands/SoCal claims; verify email, delivery day, cutoff, windows, and service area.
7. **Deployment/SEO/performance — Should-fix:** verify `VITE_SITE_URL`, generated deep-link HTML/404 behavior, sitemap and robots on the public host, supply an approved OG image, then record Lighthouse mobile/desktop scores for home/category/product.
8. **Security exception — Should-fix:** record acceptance of the non-reachable React Router RSC advisory and monitor for a stable patched release; upgrade and rerun the full gate as soon as one exists.
9. **Launch transaction — Blocker:** complete a Shopify test-mode order through confirmation and Admin fulfillment, verifying exact line totals, fulfillment attributes, shipping, tax, payment, email, cancellation, and refund behavior.

Only after the Blocker actions pass should the launch decision be changed from NO-GO.
