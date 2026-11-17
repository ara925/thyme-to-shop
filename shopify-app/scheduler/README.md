# Place in Thyme subscription scheduler

This is a separate scheduled Worker for the SiteGround Shopify app. It has no public URL or DNS route and does not use WordPress, Shopify credentials, customer data or a storefront visit. It posts once a minute to the fixed SiteGround app endpoint. Local tests use a synthetic credential and never call that endpoint.

## Controlled rollout

1. Confirm the authorized Cloudflare account, Free Workers capacity, and approval to store the scheduler-only secret there. **0.4.6 is already deployed** in the existing isolated SiteGround project, with a pre-deploy backup; verify the version, connection, private storage path and closed enrollment/billing in the normal dashboards. Do not upload the same ZIP again just to configure the scheduler.
2. Have the account holder configure a fresh, dedicated 32-byte lowercase hex `PIT_WORKER_SECRET` privately in both services. Do not put it into `wrangler.jsonc`, chat, shell history, a screenshot or an upload archive. No Shopify or encryption key goes to Cloudflare.
3. Set the SiteGround app to `PIT_WORKER_MODE=external` and activate only this one cron trigger after the secret is installed and the app has restarted. Leave all seven launch flags off. Confirm the deployed version and scheduler mode in the signed Shopify app.
4. Close the app tab. Match at least two distinct successful scheduled requests in the Cloudflare and SiteGround logs while no one is visiting the app, then verify the completed timestamp in the Shopify app. Repeat after host idle/restart. An `already-completed` reply is not a separate cycle; a busy, paused, failed, redirected or non-JSON response is not a pass. No test order or charge should be created in this pilot.
5. If the pilot fails, remove only this cron trigger, keep the launch flags off, and return the app to its prior scheduler setting or verified 0.4.5 code if needed. Leave the live database and private backup intact. Record proof before treating the worker as ready.

From the repository root, a build-only check is `wrangler deploy --dry-run --config shopify-app/scheduler/wrangler.jsonc`. The actual deploy requires the approved account and is separate from the SiteGround ZIP. In external mode, only a completed cycle within two minutes qualifies for enrollment/billing readiness; a public visit or failed tick cannot satisfy it. A first successful tick after an interruption re-establishes scheduler readiness without treating an old heartbeat as proof.
