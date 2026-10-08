# Private meal-rotation backend

This is a custom WordPress plugin for the existing SiteGround-hosted marketing site. Shopify remains the product, checkout, payment, and subscription-contract system. The marketing site only stores private authorization and schedules app-owned meal-contract updates.

## Current status

Version 0.1.2 is installed at `placeinthyme.com`. The approved Shopify app has authorized `write_products`, `write_purchase_options`, and `write_own_subscription_contracts` (write scopes include their read equivalents). No other app's contracts or selling plans are modified. The product catalog is unchanged.

The owned weekly plan and three signed webhook subscriptions have been created. The plan is intentionally **not attached to products**. Customer enrollment and automatic billing are **off**. The existing storefront's three-menu planner and manual-request fallback remain intact.

Live-price admin testing verified $132 → $140 → $126 → $132 for four preview cycles. This is a **no-charge preview, not a paid checkout or real renewal acceptance test**. Rejecting a below-minimum menu keeps all draft quantities and removes the stale success preview.

## Build and tests

Package from the repository root:

```powershell
./scripts/package-rotation-plugin.ps1
```

Upload `dist/place-in-thyme-meal-rotation.zip` through WordPress's native plugin installer. Replacing plugin files preserves saved settings, encrypted credentials, and contract records. Deactivation only unschedules this plugin's worker; it does not uninstall the Shopify app or delete customer contracts.

PHP 8.1+ with OpenSSL AES-256-GCM is required. Run the dependency-free safety suite:

```text
php wordpress/tests/run.php
```

The suite makes no live requests or charges. It tests independent menu minimums, integer-cent prices, Pacific/DST dates, webhook/OAuth authentication, encrypted storage, delivery identity, disabled launch gates, durable renewal checkpoints, ambiguous-request idempotency, failed-payment behavior, cancellation, edited/mixed lines, and four full simulated renewal cycles. CI also checks PHP syntax.

## Private configuration and security

- Save the installed app's secret only in WordPress's administrator-only **Meal Rotation** screen. It is encrypted using WordPress authentication salts and never displayed again.
- Use the native OAuth connection flow. Access and refresh tokens are encrypted private options, not frontend variables, repository files, or browser-storage Admin credentials.
- OAuth state is short-lived and cookie-bound. Callbacks and webhooks verify HMAC and the exact approved shop. Invalid webhook requests never enqueue work.
- Only variant IDs, selected quantities/prices, opaque IDs, payment-method IDs, and keyed delivery-identity digests are persisted for rotations. Raw webhook bodies and plaintext delivery addresses are not saved.
- The public quote and bearer-token management endpoints accept only the shop origin, are rate-limited, and return non-cacheable responses. Origin restrictions do not substitute for authentication; management also requires the private token hash.
- Renewals fail closed if live prices/availability, approved delivery/payment identity, native delivery fee, weekly cadence, calculated totals, or contract lines disagree. They never convert nationwide shipping into local delivery.
- Request/commit/payment checkpoints and stable cycle-specific idempotency keys precede consequential retries. Failed or challenged payments do not advance menus; missed cutoffs do not initiate catch-up charges.
- Changing WordPress authentication salts invalidates encrypted authorization. Reconnect the app rather than deleting customer records. Back up the database and salts securely; neither belongs in Git.

## Scheduler

A native SiteGround job has been saved for once-per-minute execution:

```text
php /home/customer/www/placeinthyme.com/public_html/wp-cron.php
```

The admin screen distinguishes the general worker heartbeat from a CLI/server-process heartbeat. A server-process heartbeat at 2026-10-08 16:22:03 UTC was observed after leaving WordPress idle, confirming that this job executes. A saved job alone would not have been proof. Extended reliability/downtime acceptance remains necessary. Existing WordPress cron behavior is preserved. The worker uses global and per-contract leases to prevent overlapping execution.

## Release gate: not customer-live

No public request, OAuth callback, plugin activation, or update can turn billing on. Enabling it requires the server constant `PIT_ROTATION_BILLING_ENABLED === true`, explicit private acceptance flags for launch, checkout, native fulfillment, and storefront integration, a current server heartbeat, the owned plan, and all signed webhooks. These remain unaccepted in production.

Before any activation:

1. Complete the customer-facing quote → isolated first-week Shopify checkout and private management/cancellation UI. Do **not** add all three menus to a customer's cart or mix the rotation with an existing basket.
2. Enforce the approved initial checkout quantities/minimum before payment. A post-payment contract mismatch is a reconciliation stop, not an acceptable substitute for checkout validation. Evaluate native checkout validation eligibility before choosing an implementation; do not assume a custom Shopify Function is available on Basic.
3. Attach the owned plan only after the storefront and native purchase conditions are accepted. Keep other apps' juice plans and existing contracts untouched.
4. Verify Orange County eligibility, free pickup at the approved location, $15 local delivery, no standard shipping, the $99 delivery minimum, Pacific Friday-midnight cutoff, and Monday/Tuesday service windows in real native checkout. California address checks are not county-boundary validation. Native ZIP zones may overlap county edges.
5. The owner must enable an eligible paid Shopify plan and subscription-capable payment gateway. Staying on Pause and Build does not permit a real customer-payment acceptance test. Do not purchase a plan or process a payment automatically.
6. Accept initial paid checkout plus A → B → C → A renewals with actual Shopify orders, correct fulfillment/tax/totals, cancellation, failed-payment/challenge handling, webhook replay, authorization refresh, scheduler downtime, and concurrent execution. Fixture tests do not replace these tests.
7. Finish owner-approved policy/tax settings and the remaining juice commitment/prepayment implementation separately. This plugin does not claim to complete those features.

Until those checks pass, preserve the existing planner/fallback and leave the unpublished rotation plan and billing gates off.
