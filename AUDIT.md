# Place in Thyme pre-launch audit

Audit date: 2026-10-25 independent checkout and custom-juice implementation
Current work: `codex/launch-recovery-verification`. Earlier dated findings below are historical unless updated here.
Scope: Vite/React storefront, live Shopify Storefront API data, cart and checkout, meal/juice subscriptions, bundles, catalog integrity, resilience, accessibility, SEO, security, and performance.

## Release decision

**GO for the published frontend and client review. NO-GO for accepting real customer payments.**

### 2026-10-25 policy publication and production recovery checks

The user authorized a general return/refund policy for Cory to review/edit and confirmed that Cory will grant Payments access. Native Shopify now shows both **Return and refund policy** and **Purchase options cancellation policy** as Published. The refund policy provides contact-based review of missing, damaged, incorrect and food-quality issues, appropriate replacement/refund resolution and original-method refunds, without invented reporting deadlines or blanket no-refund terms. Cancellation wording preserves the agreed meal cancel-anytime, fixed-bundle weekly, and custom-juice four-paid-week terms. No financial agreement, tax identity or store ownership details were changed. Terms of service remains unpublished and the automated privacy policy still uses the agency contact; these need merchant review.

Official Chrome verified that the new refund body is visible on the actual customer policies page. A direct native `/policies/subscription-policy` link instead redirected to the storefront homepage. The frontend fix now requests Shopify's native `subscriptionPolicy { title body url }` and renders it on the shop policies page, with accessible section jump links and direct-hash scrolling. This change is in PR **#21**; public publication/visual acceptance is recorded separately after release.

The independent app **0.4.1** was uploaded through SiteGround's normal account → Websites → Node.js Projects → existing Site Tools → Deployment Options → Upload manually flow. Live checking exposed an embedded App Bridge loader redirecting the standalone app into a blank Shopify admin screen. The corrected deployment removes that loader and keeps the existing signed-HMAC/HttpOnly-session authorization; no scope or credential change was made. The production app remains on its independent hostname after reload and retains its connection, owned meal/juice plans and three signed webhooks.

Authenticated production checks passed at **2026-10-25T20:32:46.001Z** (private snapshot integrity, two encrypted values decryptable, saved configuration matching) and **2026-10-25T20:32:52.072Z** (a separate Node process blocked while a lease was held and acquired it after release). The snapshot contained zero saved plans/events. Checks expose only safe counts/booleans, make no Shopify request, never replace the active database, and cannot enable billing. Evidence persisted after reload. This is **not** a completed host-backup restore, environment recovery or Shopify reconciliation. Every billing/enrollment/storage acceptance flag remains OFF.

Subsequent real host-restore receipt: the native **Restore the selected files to a folder** option explicitly restores under the private hosting home. Exactly one file, the consistent snapshot from the 08:27 PM manual backup, was selected; live database/WAL, website files and environment configuration were not selected or replaced. SiteGround Restore History confirmed the copy at `.RESTORES/1792960605` on October 25 at 09:36 PM. Native File Manager copied only that restored snapshot into the new private mode-700 `restore-probe` folder; its file mode remained 600. The app's authenticated **Verify Restored Private Copy** passed at **2026-10-25T20:40:32.099Z**: integrity OK, two encrypted values decryptable, matching saved plan/webhook configuration, zero saved plans/events. No snapshot contents were opened, no credentials were printed, no live database was replaced, and no billing was enabled. This establishes a **real host-restored copy check**, not full environment recovery, an active-database cutover, paid-contract reconciliation or long-term uptime acceptance. The private copies are retained.

PR #21 merged as `eef1cd3a7b2f005aaa96b161baed7f85d3f8cd52` at `2026-10-25T20:35:48Z`, with passing PR and merged-main CI. The existing Lovable publisher confirmed **Your website was updated**, retaining `shop.placeinthyme.com`. The actual public cancellation-policy body appeared at `https://shop.placeinthyme.com/policies#subscriptionPolicy`; direct-hash scrolling placed its heading below the sticky header (137px), and desktop content/viewport widths matched at 1665px. This is the merchant-published native Shopify policy, not hard-coded frontend terms. Visual review exposed cramped paragraph spacing: the renderer used `prose` classes although the typography plugin was not configured. The follow-up uses explicit spacing, heading and list utilities, with a regression test (268 storefront tests total). A fresh native Payments recheck still explicitly denied this collaborator access; no gateway activation was inferred.

Cory's review links: [refund policy](https://shop.placeinthyme.com/policies#refundPolicy), [cancellation policy](https://shop.placeinthyme.com/policies#subscriptionPolicy), and [edit policies in Shopify](https://admin.shopify.com/store/thyme-time-store-brreo/settings/legal). These general policies require merchant review; publication is not legal-compliance approval.

Verification: **267 storefront tests and 137 independent-app tests pass**, including standalone signed-session persistence, policy display/query, read-only recovery, wrong-key/configuration refusal and two-process locking. Typecheck and production build pass; lint has 0 errors and the same 15 existing warnings. PR #21's CI passed, including retained legacy PHP safety fixtures. Fresh production screenshots are in `launch-readiness-2026-10-25`.

### 2026-10-25 implemented checkout and juice workflows

The independent app is now deployed as **0.4.0**, using SiteGround's account → Websites → Node.js Projects → existing project Site Tools → Deployment Options → Actions → Upload manually workflow in the official ChatGPT Chrome extension. No direct SiteGround internal navigation was used for these deployments. The marketing website, domains, prices and existing fixed-bundle plans were not changed. Redeploy preserved the app connection and private storage. Live setup re-read 17 meals, the owned meal plan, three signed app webhooks, zero legacy WordPress endpoints and no existing app-owned contracts. A fresh checked private snapshot completed at `2026-10-25T19:21:03.687Z` before native juice preparation; preparation forces a fresh snapshot as well. All charge/enrollment/storage acceptance flags remain OFF.

New implementation: isolated active-week-only meal checkout; private quote authorization and encrypted cached cart identity; native Storefront price/quantity/subtotal/plan read-back before returning a checkout URL; separate weekly/prepaid custom-juice checkout with tea once and undiscounted; a durable same-mix juice worker; four-paid-week cancellation boundaries and truthful pending-confirmation handling; and customer review/management screens. The ordinary basket is never reused for subscription enrollment. Contract revisions fence unexpected edits without reading private customer payment instruments or adding scopes. Billing retries retain one idempotency key; ambiguous finalization cannot count a payment twice.

Live native plan creation initially failed because billing and delivery weekday anchors must match. The corrected input and regression tests require matching Monday anchors. Creation and final native read-back then succeeded for app-owned weekly plan `gid://shopify/SellingPlan/11247386922` and prepaid plan `gid://shopify/SellingPlan/11247419690`, in merchant-code group `pit-custom-juice-four-week-v1`. Weekly billing requires four cycles; four-week prepayment requires one four-week cycle, not sixteen weeks. Both apply the exact 10% adjustment and weekly delivery. **No product associations changed, no old plan was deleted, and no customer charge or order was created.**

Official Chrome live-catalog preview used 16 Green Cleanse juices at $8.50: $136 retail, $122.40 after 10%, $489.60 for four weeks, plus two $3 one-time teas = $495.60 first prepaid subtotal, excluding tax and delivery. The four Monday dates were November 2/9/16/23. Both Hibiscus records are excluded from the recurring mix/minimum. Native plans verified; enrollment remained false. This is a real catalog/no-charge preview, **not** native paid checkout, fulfillment or renewal acceptance.

Current verification: **264 storefront and 130 independent-app tests pass**, typecheck and production build pass, lint has 0 errors and 15 existing warnings. All 68 retained legacy PHP safety tests also pass in CI. Official Chrome interacted with explicitly marked dev-only fixture screens at desktop and 390×844 mobile: prepaid totals, separate checkout acknowledgment/fulfillment choice, two-step cancellation, scheduled boundary and pending confirmation states. Those fixtures created no real order and are separate from the public checks below. Screenshots are retained in `subscription-acceptance-2026-10-25`.

Release receipt: PR **#18** passed CI and merged as `f0418c860fab92cc2220240e7cef207d7597254f` at `2026-10-25T19:30:34Z`; merged-main CI also passed. The existing native publisher then confirmed **Your website was updated**, retaining `shop.placeinthyme.com`. Official Chrome verified the actual public juice review with the same $136/$122.40/$489.60/$6/$495.60 totals and four Monday dates, not only local fixtures. Its selected quantities, tea and prepaid choice survived a refresh. The public meal review returned A/B/C/A at **$132/$140/$126/$132**, starting November 2. The payment controls were absent while the server gate was false, and the original six-meal basket stayed at **$108**. Desktop and 390×844 mobile review checks had no horizontal overflow (375px content and viewport). No first-party errors were returned by the shop-domain log filter; unrelated Chrome-extension errors were present and were not misreported as store defects. Temporary test drafts were restored to their initially empty state, and the viewport was reset.

Host backup receipt: SiteGround created **Shopify app v0.4 and native juice plans - 2026-10-25**, listed as a manual backup on October 25 at 08:27 PM. Its native restore-file browser included the isolated private `meal-rotation/rotation.sqlite` and, importantly, the consistent `meal-rotation/backups/rotation-latest.sqlite`. No file contents were opened, no credentials were read, and the restore dialog was cancelled with zero files selected. The app's post-plan-setup snapshot completed at `2026-10-25T19:25:26.376Z` with no backup review error. Full recovery, environment-setting coverage, reconciliation and continuous worker uptime are still unaccepted; this inventory check does not turn the storage gate on.

The user completed fresh Shopify SMS verification after an expired first challenge; the optional passkey offer was skipped, with no authentication-setting changes. Native **Payments still explicitly denies this collaborator account access**. The admin homepage's generic “set up to take payments” message is not provider-specific activation or payout proof. No financial agreement was accepted and no payment status was inferred.

Post-authentication native recheck: email-required/full-name-required checkout fields remain saved. Checkout lists **Mageworx Bundle App Validation** and its cart-transform function as Active; the validation's **Block checkout if app experiences a problem** option is unchecked. These labels do not establish the required minimum/cutoff protection. The installed MW Bundle Builder panel remained blank before and after one reload, so its offer enforcement could not be newly verified or configured. No rule was removed, disabled or changed, and no replacement app was installed or purchased. Local delivery and pickup remain On at 26021 Acero. The two saved delivery zones currently show 90 and 3 postal codes respectively, both **$15 / $99 minimum**; exact county boundaries and native scheduled fulfillment still require acceptance. Native Policies still shows **no return/refund policy, no terms of service, and no required purchase-options cancellation policy**. These require approved merchant terms rather than invented legal language.

Remaining implementation/acceptance blockers: authoritative Basic-compatible pre-payment enforcement after a native cart can be edited; exact Orange County address eligibility and cutoff enforcement; native prepaid fulfillment/delivery-fee acceptance; merchant payment-provider confirmation; paid meal A→B→C→A and juice renewal/cancellation acceptance; host backup/restore and continuous scheduler acceptance; and client-approved policies/taxes. The earlier credential-exposure follow-up also remains open, but is not the only blocker. The store is **not launch-ready**, and billing gates must not be enabled based solely on passing fixtures or no-charge previews.

### 2026-10-24 main-site separation and implementation

The user explicitly required rotation to stay in the Shopify app, with the marketing site removed from the architecture. The **Place in Thyme Meal Rotation 0.1.2 WordPress plugin was deactivated and deleted** through its native plugin controls. WordPress displayed its successful-deletion receipt. Its deactivation hook clears the plugin's scheduled worker; existing saved data was preserved. A source recovery archive was retained locally. The Shopify app itself, its unpublished selling plan, products, other apps, and subscription features were not deleted.

After removal, official Chrome visually confirmed the main website still renders, its prominent Shop link still opens `https://shop.placeinthyme.com/`, and the original six-item basket remains intact. No store domain changed. The extra once-per-minute SiteGround entry running `php /home/customer/www/placeinthyme.com/public_html/wp-cron.php` was removed through its exact native row; the final Cron Jobs screen confirms none remain. The original WordPress cron behavior was not changed. The command and plugin source remain recoverable.

The replacement `shopify-app/` is an independent Node server with its own encrypted authorization, database, OAuth/session authentication, signed and deduplicated webhook queue, per-record leases, and traffic-independent minute worker. It reuses the same Shopify app and approved scopes, discovers the existing app-owned plan, and never creates customer-priced products or changes the catalog. It has no WordPress runtime dependency. Every billing/enrollment acceptance gate remains off. A distinct SiteGround Node 22 Custom project at `corys32.sg-host.com` has been deployed. The user approved saving the existing app secret and a new encryption key only in this isolated host's private settings. The active Shopify version `independent-shopify-app-2026-10-24` (1179956510721) now uses that app URL and `/auth/callback`, with the existing permissions unchanged and the WordPress callback removed. Normal DNS and certificate-verified HTTPS now work in official Chrome.

Live OAuth succeeded. Setup found 17 meals, the existing single app-owned meal plan and no existing rotation contracts. The initial ownership check incorrectly compared identifiers; it now uses Shopify's documented app-scoped `sellingPlanGroups` query. Final API read-back confirmed exactly three signed webhook destinations at `https://corys32.sg-host.com/api/webhook` and zero legacy rotation endpoints on the main website. The no-charge live preview rejected empty selections and returned A/B/C/A actual totals of $132/$140/$126/$132, with the next eligible service date November 2, 2026. It created no order, subscription or charge. This is not paid-renewal acceptance.

The first upload exposed a real storage defect: the default database lived beneath a replaceable `.nodeapp/<build>/app_source` directory and disappeared on redeploy. `PIT_DATABASE_PATH` now points outside `public_html` at the isolated site's private `meal-rotation/rotation.sqlite`. Native File Manager confirmed private mode-700 directories. A full subsequent archive upload retained the OAuth/session state, plan, hooks and traffic-independent worker heartbeat without another login. The final build restricts database files and a consistent recovery snapshot to mode 600, creates a checked SQLite online-backup snapshot once per day, and preserves the last good snapshot on failure. A live snapshot completed at 2026-10-24T10:36:17Z with no backup review error. SiteGround shows five included manual-backup slots, but manual host backup creation, private-directory/environment backup coverage, full host restore and long-term worker uptime are not yet accepted; the storage gate stays OFF.

Security follow-up: a diagnostic capture accidentally included the hosting page's unmasked private environment values during an incomplete navigation. No values were written into source or proof screenshots. Further host-page captures were stopped. The Shopify client secret and storage-encryption key must be replaced, followed by fresh authorization and snapshot verification. Shopify credential rotation is a user handoff; it must not be performed silently by the agent. No billing or enrollment may be enabled while this follow-up is pending.

The storefront candidate adds a live-price/no-charge three-menu review, private menu-management/cancellation UI, session-only bearer access with fragment removal, expired-quote handling, and safe cancellation retries. An uncertain remote cancellation durably stops local renewals, remains retryable, and cannot display confirmed success without a matching cancelled Shopify contract. The API endpoint must be the independent app's configured HTTPS `/api` origin; the main-site and checkout origins are rejected and there is no WordPress fallback. Manual planners and saved selections remain intact.

Verification so far: **229 storefront tests and 57 independent-app tests pass**; type checks, production build and lint pass (0 errors, 15 existing warnings). The retained legacy PHP safety suite has 68 passing fixtures. The standalone tests exercise a real temporary SQLite database/reopen, encrypted snapshot recovery and failed-backup preservation, locks and unique webhook events, HTTP authentication/origin rules, durable cancellation failure/retry, malformed data rejection, Pacific/DST boundaries, safe diagnostics, final webhook routing, rendered admin JavaScript, and four simulated rotation cycles. These do not constitute real Shopify payment, renewal or long-term uptime acceptance. Official Chrome checked the live isolated-app connection, no-charge four-week preview and redeploy persistence; successful customer management/cancellation states were additionally inspected with clearly marked local fixtures, not passed off as live contracts.

Native Shopify checkout contact fields were corrected and saved: email is required for receipts/notices, full first/last name is required, and delivery phone is optional. No marketing opt-ins were enabled. The installed MW Bundle Builder still contains only a disabled invalid old test with a missing product and item-count limits; it was not enabled or repurposed as proof of the required $120 spend enforcement.

Still required on our implementation side: isolated initial-week checkout and authoritative pre-payment enforcement on Basic, real A→B→C→A acceptance, and the separate custom-juice four-cycle/prepaid workflow. Merchant-payment status, approved policies/taxes and native fulfillment acceptance remain launch gates. Do not label these as merely missing owner settings or describe subscriptions as launch-ready.

### 2026-10-08 live recheck

Official Chrome inspection confirmed the client's card is saved for **Shopify bills**. After the user authorized the plan purchase, **Basic monthly was activated at $39/month plus applicable tax**. The native review showed **$18 due today after a $21 plan-change credit**, with $39/month renewal beginning October 26, 2026; Shopify then displayed **You're now on Basic plan** and the saved Plan page confirmed the monthly price. This is not customer-payment activation, and no customer order or charge was made.

**Shopify Payments remains unsubmitted.** Its existing onboarding is at **Step 6 of 6** and shows the business, owners, and account representative as **Ready to submit**. No saved identity, tax, or banking details were altered. The final **Submit for verification** button explicitly both agrees to the terms and applies for a **Shopify Balance account and spend card**, so this financial-account application was left for the client to review and submit themselves. The single official-Chrome tab is open at that final review. Ready to submit is not approved, active, or payout-verified. Evidence screenshots: `basic-monthly-activated-2026-10-08.png` and `shopify-payments-final-review-2026-10-08.png` in the session's meal-rotation visual-proof directory.

The prior missing-location/fulfillment findings are superseded. The active default location is **26021 Acero, Mission Viejo, CA 92691**. Local delivery and pickup are on; the two named Orange County ZIP zones show **$15 delivery / $99 minimum**. Delivery instructions state Monday–Tuesday with a Friday 11:59 PM Pacific cutoff. Pickup is free and the saved ready-for-pickup message states Mondays after 9:00 AM. Native pickup's generic processing-time display remains 2–4 days, not an exact Monday-date rule. The general profile has **no domestic or international shipping options**. No saved fulfillment configuration was overwritten during this recheck. Exact county-boundary eligibility and all these rules still require native checkout acceptance.

The public cart's live quantity change **6 → 7 → 6** returned **$108 → $126 → $108** for Korean Beef Bowl and preserved the original basket. Checkout correctly remains closed. Its old message incorrectly implies saved Shopify fulfillment is missing; the release correction now says checkout is awaiting launch approval without removing the gate. The separate menu-rotation calendar correction uses Pacific time, with DST-boundary regression coverage.

The public page initially flattened privacy links even though the editor preview had the repair. Release PR #17 passed CI and was merged at 2026-10-08 17:44 UTC; its native publisher update completed, and a fresh public visit confirmed formatted policy headings and clickable privacy links. The public cart shows the corrected launch-approval wording, still has the original six meals / $108 subtotal, and its checkout button remains disabled. No domain was changed. Shopify publishes privacy and local-delivery policies, but **refund and terms policies are absent**, and the privacy contact still lists the agency email; client review is required. No policy text was invented or changed. The native checkout-host opt-out destination still needs acceptance after merchant activation; an anchor's presence is not proof that the destination works.

Release verification: **195 tests**, type checks, production build, PR CI and merged-main CI pass; lint has 0 errors and 15 existing Fast Refresh warnings. Certificate verification stayed enabled. On the public domain, a one-meal draft survived reload; a juice selection and separate one-time tea add-on also survived reload, with the below-minimum request disabled. Test selections were restored and the original basket preserved. At a 390×844 browser override, the meal/juice planner samples and mobile navigation had no horizontal overflow (375px usable content and scroll widths); the viewport was then reset. This is a focused release recheck, not a replacement for the outstanding paid-checkout, renewal, assistive-technology, and full launch acceptance tests.

The private meal backend is installed separately on WordPress and remains gated off. Its app-owned selling plan is unpublished to products. **Our implementation still needs customer enrollment/initial checkout enforcement, management/cancellation integration, real meal-renewal acceptance, and the custom juice four-cycle/prepayment workflow.** These are not merely owner configuration. Do not describe the storefront or subscriptions as launch-ready while those requirements remain.

The storefront features are preserved. The remaining no-go includes customer-facing subscription implementation, merchant payment activation, approved policies/taxes, and real native checkout/renewal acceptance—not deleted features.

### Client-confirmed business rules

Cory confirmed the complete proposed structure and pricing interpretation on 2026-08-18:

- **Meal subscription:** customers configure separate quantities for Menu/Week 1, 2, and 3. Each week's actual selected item total is charged, with a $120 minimum per week; it is not a flat $120 charge. The menus rotate Week 1 -> Week 2 -> Week 3 -> repeat, billing weekly, and customers may cancel at any time.
- **Five fixed juice bundles:** Intro Pack Bundle, Shot Bundle, Juice Bundle #1, Juice Bundle #2, and Juice Bundle #3 are each available one time or as a weekly subscription. A subscribed fixed bundle repeats weekly at its listed bundle price. It does not receive the separate Pick n' Choose 10% adjustment or four-week/prepaid terms.
- **Pick n' Choose juice subscription:** the customer chooses one custom mix that repeats weekly. The mix must reach $134.99 before the exact 10% subscription discount. It has a four-week minimum commitment, offers weekly billing or all four weeks prepaid, and permits cancellation after each four-week period.
- **Hibiscus Tea:** the $3 item is an optional add-on, not a separate subscription plan.

These business decisions are closed. The remaining subscription gaps below are technical implementation and acceptance work, not unresolved questions about the intended offer.

On 2026-10-01 Cory also confirmed the operating rules for launch:

- **Shopify plan:** Basic, billed monthly. Activated on October 8, 2026 after the user approved the $39/month purchase; merchant-payment onboarding remains a separate client action.
- **Delivery:** anywhere in Orange County on Monday or Tuesday, $15 fee, $99 delivery minimum, with no shipping.
- **Cutoff:** “Friday at midnight PCT,” implemented unambiguously as the end of Friday (Friday 11:59 PM Pacific Time / Saturday 12:00 AM `America/Los_Angeles`).
- **Pickup:** free at 26021 Acero, Mission Viejo, CA 92691, on Monday after 9:00 AM.

The blocking owner items are:

1. Authenticated Shopify Admin inspection confirmed the store is on **Pause and Build ($9/month)**, Shopify Payments still shows **Complete setup**, and the primary location has no address. Basic monthly is now selected in principle but has not been purchased; the supplied pickup address has not yet been saved in Shopify.
2. No live subscription configuration automates the documented A -> B -> C meal rotation after all three weekly menus are selected.
3. The exact 10% juice adjustment is configured, but the live subscription system does not provide the documented weekly-versus-four-week-prepaid choice or four-cycle commitment enforcement.
4. The storefront implementation now contains the approved delivery/pickup schedule, fee, minimum, address, and cutoff, but Shopify Admin still needs the location address, Orange County postal-code zone, $15/$99 settings, pickup instructions, and removal of every standard shipping rate.
5. Shopify cannot model a county boundary exactly with native local delivery. The prepared 89-standard-ZIP approximation covers Orange County, but ZIP 90631 also reaches part of Los Angeles County; exact boundary enforcement requires manual review or an address-validation/delivery app.
6. Shipping, tax, payment, subscription, cancellation, refund, privacy, and other launch policies are not approved/configured end to end.

## Verification snapshot

| Check | Result |
| --- | --- |
| `npm run build` | Pass on the 2026-10-01 fulfillment update: Vite 7.3.6; 33 published sitemap routes; main JS 353.24 kB / 114.44 kB gzip. |
| `npm run typecheck` | Pass on the combined release tree. |
| `npm test` | Pass: 22 files, 175/175 tests. |
| `npm run lint` | Pass: 0 errors, 15 Fast Refresh warnings. |
| `npm audit` | Pass: 0 vulnerabilities after the Nano ID and React Router upgrades. |
| `npm audit --omit=dev` | Pass: 0 vulnerabilities. |
| `npm ci --dry-run --ignore-scripts` | Pass. |
| `git diff --check` | Pass. |
| Secret scan | No Shopify Admin token, private key, or matching credential pattern in the worktree or Git history. |
| Production console scan | No `console.log`, `console.warn`, or `console.error` calls in non-test `src` code. |
| Official Chrome visual/interaction QA | The published 2026-08-21 release was checked across the full route matrix. The 2026-10-01 local preview was additionally checked in the official Chrome plugin at desktop and 390×844 mobile: the updated banner, Orange County/$15/$99 copy, Monday/Tuesday selector, Monday-after-9 pickup, exact delivery shortfall, pickup-below-minimum path, and responsive layout all passed with no browser console errors or horizontal overflow. No order was submitted. |
| Exact 375/768/1280/1920 matrix | Pass across all eight representative routes above, with zero horizontal-overflow failures at every width. The 768px header breakpoint defect found during QA was fixed and rechecked. Redirect-only meal/Hibiscus product URLs also landed on their approved planner/category routes. |
| Authenticated Shopify Admin acceptance | Pass for the approved catalog cleanup: the `$95` product remains Active but unpublished; its Storefront handle is absent. Pick n' Choose has exactly four products at 10% off; each fixed plan contains only its matching parent; Hibiscus has zero plans; Meal 1/2/3 each contain six products. The 26 actual customer fulfillment products are now physical/requiring shipping. The hidden component-only Hibiscus bundle derives `requiresShipping: true` from its components, while the non-fulfillment Pick n' Choose anchor remains false. |
| Public deployment | `https://shop.placeinthyme.com` serves the published headless storefront and its launch routes. Raw HTML canonical/Open Graph tags, the robots sitemap pointer, and all 33 sitemap locations were rechecked after publishing and use the custom hostname; no old hosting hostname remains in those production outputs. |
| Lighthouse | Still required. Google PageSpeed Insights was attempted against the public release but returned HTTP 429 `RESOURCE_EXHAUSTED` with a project quota of 0 requests/day; no score is invented here. |

## 1. Commerce correctness

### RESOLVED IN CODE — Shopify-authoritative products, prices, cart, and totals

All catalog surfaces query Shopify. Home starting prices now come from available, customer-facing standalone Shopify variants rather than marketing constants or hidden Hibiscus records (`src/components/home/Categories.tsx`). Cart creation, batch add, quantity update, removal, sync, and line totals use the cart returned by Shopify (`src/stores/cartStore.ts`). No `/cart/add`, checkout permalink, or `window.open` commerce path remains.

Cart mutation warnings are requested from all five mutations (`src/lib/shopify.ts:397-514`) and shown to the customer (`src/components/cart/CartDrawer.tsx:124-149`). Component-required variants are blocked centrally before any mutation (`src/stores/cartStore.ts:337-353`).

### RESOLVED IN STOREFRONT CODE — approved fulfillment rules and attributes survive to checkout

The storefront contains the confirmed Monday/Tuesday Orange County delivery choices and Monday-after-9 pickup without inventing delivery hours. It displays the $15 delivery fee, enforces the $99 delivery-only minimum with an exact shortfall, leaves pickup eligible below $99, and blocks the storefront's checkout handoff after the end-of-Friday Pacific cutoff until the next cycle (`src/lib/fulfillmentConfig.ts`, `src/lib/orderCutoff.ts`, `src/components/cart/CartDrawer.tsx`, `src/components/cart/DeliveryTimeSelect.tsx`). It remains fail-closed until `VITE_SHOPIFY_LOCAL_FULFILLMENT_READY=true` is set after matching Shopify Admin acceptance. A present malformed or empty deployment-window override also fails closed. The cart writes `Fulfillment Method` plus the matching `Preferred Dropoff Window` or `Preferred Pickup Window`, reads Shopify's returned attributes, and revalidates the Shopify-returned subtotal, cutoff, and fulfillment rules immediately before checkout (`src/stores/cartStore.ts`, `src/lib/fulfillmentRules.ts`). Checkout redirects must be HTTPS and match either this store's exact permanent MyShopify hostname or the exact configured Shopify-connected checkout hostname; credentials, ports, subdomains, and lookalikes are rejected. `channel=online_store` is added only after validation (`src/lib/shopify.ts`).

The cutoff is **not** authoritative at Shopify order placement. A customer who opens a valid Shopify checkout before the deadline may still complete it afterward, and a direct Storefront API client can bypass browser-only timing logic. Until a Shopify-compatible scheduling/validation app or server-side checkout validation is installed, late orders require manual review. The native $99 local-delivery minimum can be authoritative after the matching Shopify Admin zone/rate is configured; the weekly cutoff cannot be guaranteed by this frontend alone.

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

The Storefront cart and validated checkout URL work, but checkout states that the store is not set up to receive orders. Authenticated official-Chrome inspection confirmed **Pause and Build ($9/month)** and an incomplete Shopify Payments setup that still requires business/address/financial information. The client chose Basic monthly and supplied the pickup address, but neither has been committed in Shopify. The store location still has no saved address, the storefront remains password protected, and local delivery/pickup are off. Frontend code cannot purchase the plan, supply identity or banking information, approve Shopify settings, or prove a real refund flow.

### RESOLVED IN ADMIN — customer fulfillment products require shipping

The live Storefront API returns 28 published products. Official Chrome bulk editing changed exactly the 26 actual customer fulfillment products—16 meals, five ordinary/add-on juice products, and five fixed-bundle parents—to physical products. A fresh Storefront query confirms they require shipping. The Pick n' Choose anchor remains non-shipping because it is not a fulfillment line. Shopify derives `requiresShipping: true` for the hidden component-only Hibiscus bundle and disables manual editing of that field; it remains blocked from standalone storefront purchase. Local-only zones, rates, origin, and windows are still owner inputs.

### BLOCKER — OWNER/ADMIN — future subscription behavior is not configured

The verified live plans bill/deliver weekly; the Pick n' Choose component plans now carry an uncapped exact 10% adjustment, and each fixed-bundle parent has its verified weekly plan at the listed bundle price without an additional adjustment. A subscription app/backend must still implement and prove A -> B -> C meal contract rotation, four-week prepaid and weekly-billed juice choices, four-cycle enforcement, and the confirmed cancellation/renewal behavior.

## 2. Catalog and data integrity

### RESOLVED IN CODE — strict product-type queries and current-week filtering

Meals query `product_type:Meal`; individual juices query `product_type:Juice AND NOT product_type:"Juice Bundle"`; bundles query `product_type:"Juice Bundle"` (`src/pages/WeeklyMeals.tsx:10-16`, `src/pages/Juices.tsx:13-25`, `src/components/juices/JuiceBundleCards.tsx:66-86`). Home featured meals use the same current-week tag before selecting four (`src/components/home/FeaturedProducts.tsx:10-18`).

The three-week cycle is currently anchored to 2026-03-16 and changes at Monday midnight in `America/New_York`, including dates before the anchor (`src/lib/weekRotation.ts`; `src/test/weekRotation.test.ts`). That separate menu-rotation anchor/timezone still requires client confirmation. The storefront checkout handoff is now customer-facing and closes at the confirmed end-of-Friday boundary in `America/Los_Angeles`; authoritative Shopify order-placement enforcement still needs the control described above (`src/lib/orderCutoff.ts`, `src/components/cart/CutoffBanner.tsx`, `src/components/cart/CartDrawer.tsx`).

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

The final integrated tree passes build, types, all 175 tests, and lint with zero errors. API boundaries and Shopify response types are explicit (`src/lib/shopify.ts`). Routes are lazy-loaded (`src/App.tsx:11-20`). Product-card actions are no longer interactive buttons nested inside links (`src/components/products/ProductCard.tsx:61-161`). No deleted-file or route scan found removed storefront functionality.

### NICE-TO-HAVE — Fast Refresh warnings and token cleanup

ESLint reports 15 non-production Fast Refresh warnings from files that export components plus helpers. These do not affect the production build but can be removed by moving shared helpers/constants into dedicated modules.

Some intentional contrast layers still use literal `text-white`, translucent white, and Radix `bg-black/80` utilities (for example `src/components/home/Hero.tsx`, `src/components/layout/Footer.tsx`, and `src/components/ui/sheet.tsx`). A future design-system pass should decide which become semantic tokens; a mechanical replacement risks reducing contrast.

## 5. Responsive behavior and accessibility

### RESOLVED IN CODE — purchase controls and modal behavior

Buttons, icon controls, inputs, selects, options, and planner tabs now meet the 44 px target through shared primitives (`src/components/ui/button.tsx:20-24`, `src/components/ui/input.tsx:10`, `src/components/ui/select.tsx:20-108`, `src/components/ui/tabs.tsx:14-35`). Icon-only controls have accessible names. Product images use live alt text with product-title fallbacks.

The cart uses Radix Sheet focus containment and Escape behavior; its close target is 44 px (`src/components/ui/sheet.tsx`). Official Chrome acceptance confirmed that Tab stayed inside the live drawer, Escape closed it after the exit animation, and focus returned to the cart trigger. The closed mobile navigation is removed from both the accessibility tree and tab order, re-enters them only while open, returns focus to its trigger on Escape, and now scrolls instead of clipping its last link on short/narrow viewports (`src/components/layout/Header.tsx`). A first-focus skip link targets the programmatically focusable main landmark (`src/components/layout/Layout.tsx`). Product variant controls expose their pressed state and missing products receive `noindex,follow` rather than being indexed as product pages (`src/pages/ProductDetail.tsx`). The lowest borderline light-theme text tokens and small footer copyright text were darkened to measured AA-safe pairs (`src/index.css`, `src/components/layout/Footer.tsx`). Badge forwards refs. Global reduced-motion handling is present.

### PARTIAL — viewport and public smoke acceptance complete; assistive-tech checks remain

The prior official-Chrome visual QA passed at 375, 768, 1280, and 1920 CSS pixels for all four meal/juice flows. The code sweep subsequently fixed narrow-phone wrapping in the home pricing rows, short-screen mobile navigation overflow, the visually inconsistent 404 route, and juice-detail back navigation. These latest changes and the intentionally fail-closed missing-window state require a fresh official-Chrome pass after an approved window configuration is supplied and deployed. Remaining end-to-end keyboard navigation, screen-reader smoke testing, full-page contrast measurement, and Lighthouse are still required.

## 6. SEO and metadata

### RESOLVED IN CODE — route/product metadata and structured data

All routes receive real titles, descriptions, robots directives, canonical URLs, Open Graph, and Twitter metadata (`src/components/seo/RouteSeo.tsx`). Home emits Organization JSON-LD. Product pages emit Product JSON-LD and use the live primary image for Open Graph/Twitter; valid-looking handles that Shopify does not resolve are explicitly marked `noindex,follow` (`src/pages/ProductDetail.tsx`).

`robots.txt` points at the sitemap. The deployment-time generator queries published products, excludes component-required-only and redirect-only product handles, and produced 33 routes (`scripts/generate-sitemap.mjs`, `public/sitemap.xml`).

### RESOLVED IN CODE — canonical public identity

`https://shop.placeinthyme.com` is the canonical public storefront. The production build default, runtime route metadata, raw HTML canonical/Open Graph placeholders, Organization JSON-LD, robots pointer, and every sitemap location use that origin. The old hosting hostname is no longer advertised. The release was published and verified on the custom domain on 2026-08-21.

`checkout.placeinthyme.com` is now Shopify's primary connected domain. Its authoritative DNS, Google DNS, and Cloudflare DNS all resolve to Shopify at `23.227.38.65`; Shopify has provisioned a valid hostname-specific TLS certificate. Fresh `cartCreate` calls return that exact HTTPS host with zero user errors or warnings, and official Chrome remains on the branded hostname through Shopify checkout. The permanent MyShopify hostname remains an accepted fallback; the headless storefront hostname and unsafe lookalikes remain rejected.

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

The local service area, fee, minimum, day choices, cutoff, pickup location/window, and no-shipping rule are now confirmed and implemented. Still confirm the public phone, ingredient/preservative claims, nutrition/health claims, statements about Operation Helping Hands, and any remaining identity details (`src/components/layout/Footer.tsx`, `src/pages/HowItWorks.tsx`, `src/pages/About.tsx`). The current storefront and the separate public business site expose different contact details.

No dedicated privacy, terms, shipping, refund, cancellation, or subscription-policy routes exist in the current route table (`src/App.tsx:52-61`). These require owner-approved content; frontend code must not draft legal terms as facts.

## 8. Security and configuration

### RESOLVED IN CODE — client-safe configuration and redirect hardening

Only the public Shopify Storefront token is client-side. `.env`, `.env.*`, and TypeScript build-info artifacts are ignored while `.env.example` is allowed (`.gitignore:14-17`). Checkout accepts only the exact HTTPS permanent MyShopify hostname or an exact separately configured Shopify checkout hostname. It explicitly rejects the headless storefront hostname, plus unsafe schemes, credentials, ports, subdomains, and lookalikes (`src/lib/shopify.ts`, `src/test/shopifyApi.test.ts`). No Admin credential/private-key pattern was found in source or Git history.

### RESOLVED IN CODE — dependency advisories and automated release checks

The vulnerable transitive Nano ID release and the affected React Router 6 releases were upgraded without forced dependency resolution. `npm audit` and the production-only audit report zero vulnerabilities; all 175 tests, typechecking, the production build, and lint pass on the fulfillment update. `.github/workflows/ci.yml` repeats install, tests, typechecking, build, and lint on every pull request and push to `main`.

### NEEDS OWNER ACTION — app ownership and access review

Authenticated Admin inspection found Shopify Subscriptions, MW Bundle Builder, Shopify Bundles, Flow, Messaging, and Upcart installed. Shopify Subscriptions is only **1 of 7** setup steps complete and its Contracts page is empty. The approved membership cleanup is complete; the obsolete misspelled zero-discount juice plan and separate weekly Hibiscus plan remain only as clearly disabled, productless records. The menu plans still cannot implement rotation. MW Bundle Builder costs $14.99 every 30 days and contains one disabled, invalid “Week 1 Menu test” offer with a missing offer product, zero impressions, zero orders, and zero sales. Shopify Bundles contains only the component-required Hibiscus add-on record. Choose one subscription source of truth, document required permissions, and approve any future app removal or billing change; no live contracts were found to migrate.

## 9. Performance

### RESOLVED IN CODE — splitting, responsive images, and fonts

Routes are split per page (`src/App.tsx:11-20`). Shopify CDN helpers add safe width parameters and `srcset` candidates (`src/lib/images.ts:1-20`). The hero supplies 960/1920 candidates (`src/components/home/Hero.tsx:11-18`). Below-the-fold images are lazy/async; the main product image is prioritized. Fonts use preconnect plus `display=swap` instead of a CSS `@import` (`index.html:12-18`).

### SHOULD-FIX — measured Lighthouse acceptance

Run Lighthouse on the public home, juices/category, and product-detail pages after owner configuration. The PageSpeed Insights attempt on 2026-08-20 returned HTTP 429 `RESOURCE_EXHAUSTED` because the available project has a 0-request daily quota. Record mobile and desktop Performance, Accessibility, Best Practices, and SEO scores when a runnable Lighthouse environment is available; no score is claimed in this audit.

# NEEDS OWNER ACTION

1. **Activate commerce:** Basic monthly and the location/fulfillment settings are saved (October 8 recheck above supersedes older findings). The client must review and submit the existing Shopify Payments application, which also applies for a Shopify Balance account and spend card; then verify provider approval/payout setup and complete authorized order, refund, and failure-path acceptance. Do not open the frontend checkout gate before acceptance.
2. **Choose the subscription source of truth:** Shopify Subscriptions currently owns the cleaned plan records but is only 1/7 configured. Decide whether it or another backend owns future contracts and finish that setup; no existing contracts were found.
3. **Complete meal-plan scheduling:** the storefront now requires separate Week 1, Week 2, and Week 3 selections and calculates each week's actual selected-item total against its $120 minimum; implement and prove the remaining A -> B -> C future-contract rotation without charging all three batches every week.
4. **Finish the confirmed juice contract:** retain the $134.99 retail-before-discount minimum and exact 10% adjustment, add four-week prepaid and weekly-billed choices, enforce four successful cycles, and publish the confirmed cancellation/renewal behavior.
5. **Resolve remaining catalog pricing conflicts:** the incompatible `$95` package is now preserved as an Active, unpublished internal record and removed from every menu plan. Reconcile the remaining meal artwork with the typed/live prices. The meal-plan billing rule itself is confirmed: actual selected total with a $120 weekly minimum.
6. **Resolve remaining bundle-data issues:** preserve the confirmed fixed-bundle behavior (listed price repeated weekly with no extra 10%), fix the Intro Pack price/discount/content mismatch, supply Pick n' Choose count rules if intended, and confirm component/inventory behavior.
7. **Configure Shopify fulfillment:** the storefront-side rules are complete. In Shopify, save 26021 Acero, Mission Viejo, CA 92691 as the location, add the prepared Orange County standard-ZIP zone with a $99 minimum and $15 price, enable free pickup with Monday-after-9 instructions, and delete every standard shipping rate while retaining the underlying zones needed for pickup. Native ZIP eligibility is an approximation at county edges; manually review 90631 or add an address-validation/delivery app for exact county-only enforcement.
8. **Approve catalog facts:** product types, week tags, publication, inventory, nutrition/heating, health/ingredient/preservative claims, and the rotating package product's role.
9. **Supply policies:** privacy, terms, shipping, refund, subscription cancellation/renewal, and any required dietary/allergen disclosures.
10. **Confirm identity:** contact details, Instagram, Operation Helping Hands statements, social image, analytics/consent, and sender addresses.
11. **Final acceptance:** complete the remaining end-to-end keyboard and screen-reader smoke tests, measured contrast, Lighthouse, public network review, and real one-time/subscription checkout acceptance after Shopify is activated. The frontend viewport matrix, live cart add/update/remove flow, and cart focus/Escape smoke already pass.

No missing product facts, reviews, discounts, plan terms, fulfillment details, or legal policies should be invented to close these items.
