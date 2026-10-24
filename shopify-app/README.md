# Independent Place in Thyme Shopify app

This replaces the retired WordPress rotation plugin. The Shopify app owns its server, private authorization, storage and minute worker. No marketing-site code, WordPress option, REST route or WP-Cron process is used. Shopify remains authoritative for products, orders, checkout, payment methods and app-owned subscription contracts.

Node.js 22.18+ is required. There are no third-party runtime dependencies. The backend uses the versioned [Node SQLite API](https://nodejs.org/docs/latest-v22.x/api/sqlite.html). It requires one verified persistent disk/database location with backups; an ephemeral or unverified host must never pass the storage gate. The data directory must not be served as static files or shared with the marketing site.

Run `npm test --prefix shopify-app` from the repository root. Fixtures create no live requests, orders or charges. Package the deployment using `./scripts/package-shopify-app.ps1`; its allow-list excludes credentials, environment files and databases.

Configure the private environment variables documented in `.env.example`, then run `npm start` in this directory. The process listens on the platform's `PORT` and schedules a minute worker independent of browser traffic. Restart/redeploy persistence, background uptime and multi-process locking still require host acceptance. A local database-reopen fixture does not establish the production host's guarantees.

For the isolated SiteGround project, do **not** use the default database beneath `public_html/.nodeapp/<build>/app_source`: uploads replace that directory. The approved live app uses `/home/customer/www/corys32.sg-host.com/private/meal-rotation/rotation.sqlite`, outside `public_html`. The private directory has mode 700 and the database is restricted to mode 600. A full manual-upload redeploy retained its OAuth/session state, owned plan, webhooks and worker heartbeat on October 24, 2026. This does not establish disaster recovery or long-term uptime by itself.

After verified connection, setup and the minute worker create at most one successful recovery snapshot per day using Node's SQLite online-backup API. An integrity-checked, self-contained snapshot is published atomically at `backups/rotation-latest.sqlite` beside the private database; a failed refresh preserves the last good copy. Credentials stay encrypted. Host backups must include this private directory and the app's private environment configuration; never depend on copying an active database/WAL separately. Recovery also needs the original encryption key, kept in the host's private settings, not Git or the frontend. The app reports its last completed snapshot and a review flag to authenticated admins. The storage acceptance flag must remain off until production backup coverage and recovery, uptime and locking checks pass.

Before any recovery, turn every billing/enrollment gate OFF. Restore and reconcile with Shopify's authoritative contract, billing-attempt and order state before considering reactivation; an old snapshot is not permission to replay charges. The October 24 private-values diagnostic exposure also requires user-completed Shopify client-secret rotation and replacement of the storage key/reconnection before activation. No credentials belong in audit documents, source, screenshots or chat.

## Reconnect the existing app — do not create another app

Use the existing client ID `7d9a72b3188adb3a745370a1768b751d` in the TLG Marketing Shopify developer organization. Set its app URL to the independent origin and its approved OAuth redirect to `/auth/callback`. Authorization follows Shopify's [standalone-app code-grant flow](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant), including cookie-bound single-use state, HMAC, exact-shop checks, encrypted offline credentials and locked token refresh.

The private Shopify secret and encryption key belong only in the app host's private settings. Do not copy WordPress salt material or token values into frontend configuration, logs, Git or chat. Reauthorize the same installed app with its existing three approved scopes; do not expand access.

Open the app from Shopify and choose **Verify Connection and Move App Webhooks**. It finds the already-created app-owned plan; it does not create products or attach the plan to products. It creates the three signed webhook endpoints on the app, then retires only this app's exact old WordPress webhook endpoints. Other apps, plans, products and contracts remain untouched.

Ownership follows Shopify's [app-scoped sellingPlanGroups query](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/sellingPlanGroups), not a comparison with the group identifier exposed to Liquid/product JSON. The final webhook routing is queried again after migration: exactly one new destination per approved topic, no legacy rotation destination, and matching deletion receipts are required. Authenticated setup errors return only safe stages and allow-listed machine codes, never remote error text or credentials.

After the deployment and connection pass acceptance, configure the storefront's public `VITE_SHOPIFY_ROTATION_API_URL` to `<independent-app-origin>/api`. There is deliberately no fallback to the main website. Management links use the storefront `/meal-plan/<opaque-id>#token=<private-token>` route; the fragment is consumed and stripped, and the token is used only as a bearer header. No Admin credential is sent to the browser.

## Not customer-live

Every billing/enrollment gate is OFF by default, including after upload, restart or OAuth. The six private acceptance flags, a fresh scheduler heartbeat, owned plan and signed hooks must all pass. There is no public or admin button that can switch those gates on.

The customer initial-checkout/quantity enforcement design, real native local fulfillment, merchant payment provider, paid A→B→C→A acceptance, and custom juice four-week/prepaid workflow remain required. The quote endpoint stays closed until those checks pass. A successful no-charge preview or simulated renewal is not launch approval. Do not silently buy Plus, install another paid app, change the catalog or repurpose fixed juice plans to bypass those constraints.

## Legacy recovery

The old plugin was removed from the main site on October 24, 2026, after its disabled enrollment/billing and unpublished plan were confirmed. Its deactivation hook unschedules its worker. Its source and safety fixtures are retained in the repository for migration reference, not for installation. Existing encrypted database records were not deleted or exposed. They are not used by this runtime. Reconnect authorization instead of attempting to import secrets encrypted with WordPress salts.
