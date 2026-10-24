import { createServer } from 'node:http';
import { randomBytes, createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SHOP, CLIENT_ID, ORIGIN, SCOPES, ZONE, assert, equalSecret, validOauth, validSessionToken, validWebhook, validateSelections, firstServiceDate, pacificTime, weekAt } from './domain.mjs';
import { Store } from './store.mjs';
import { Shopify, ShopifyRequestError } from './shopify.mjs';
import { Worker } from './worker.mjs';

export function configuration(env = process.env) {
  const baseUrl = (env.PIT_APP_URL || '').replace(/\/$/, '');
  if (baseUrl) {
    const url = new URL(baseUrl);
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && !['placeinthyme.com', 'www.placeinthyme.com', 'shop.placeinthyme.com', 'checkout.placeinthyme.com'].includes(url.hostname), 'Use an independent HTTPS app hostname, not either website or checkout.');
  }
  return { baseUrl, clientSecret: env.SHOPIFY_API_SECRET || '', encryptionKey: env.PIT_ENCRYPTION_KEY || '',
    databasePath: env.PIT_DATABASE_PATH || resolve('data/rotation.sqlite'),
    gates: Object.fromEntries(['billing', 'checkout', 'fulfillment', 'storefront', 'launch', 'persistentStorage'].map(key => [key, env[`PIT_${key.replace(/[A-Z]/g, char => `_${char}`).toUpperCase()}_VERIFIED`] === 'true'])),
  };
}
const cookie = (name, value, seconds) => `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`;
const cookies = request => Object.fromEntries((request.headers.cookie || '').split(';').map(item => item.trim().split('=')).filter(item => item.length === 2));
const errorResponse = (response, status, code, message) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ code, message })); };
const json = (response, body, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
async function readBody(request, maximum = 30000) {
  assert(Number(request.headers['content-length'] || 0) <= maximum, 'Request too large.');
  let length = 0; const chunks = [];
  for await (const chunk of request) { length += chunk.length; assert(length <= maximum, 'Request too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function adminPage(nonce) {
  return String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="shopify-api-key" content="${CLIENT_ID}"><title>Place in Thyme Meal Rotation</title><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script><style>body{font:16px/1.6 system-ui;background:#f6f8f5;color:#1e352a;margin:0}main{max-width:820px;margin:auto;padding:32px 20px}section{background:white;border:1px solid #d8e0d9;border-radius:12px;padding:24px;margin:24px 0}button,a.button{display:inline-block;background:#295f48;color:white;padding:12px 18px;border:0;border-radius:7px;font:inherit;margin:8px 8px 8px 0;text-decoration:none;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#295f48}label{display:block;margin:8px 0}input{width:80px;padding:10px;font:inherit}strong{font-weight:650}.warning{background:#fff5df;border-color:#dbc891}h1{font-size:30px;line-height:1.3}h2{font-size:22px}</style></head><body><main><h1>Place in Thyme Meal Rotation</h1><p>Shopify products, checkout, payments, and app-owned contracts. Independent app runtime; no WordPress connection.</p><section class="warning"><strong>Enrollment and billing remain disabled until launch acceptance.</strong><p>Previews create no checkout, order, contract, or charge. The main website is not used as a scheduler or API.</p></section><section><h2>Shopify connection</h2><p>Open this app from the store’s Shopify admin. Reconnecting uses only the three previously approved app scopes.</p><a class="button" href="/auth/start">Connect Existing Shopify App</a><button id="verify">Verify Connection and Move App Webhooks</button><pre id="status" role="status">Checking app configuration…</pre></section><section><h2>Three-week preview</h2><p>Choose independent quantities. Each menu needs at least $120. Only the active week’s actual selected total applies.</p><form id="preview"><div id="menus">Verify the Shopify connection to load the live menus.</div><button id="review" disabled>Preview Four Weeks — No Charge</button></form><pre id="result" role="status"></pre></section><section><h2>Launch acceptance still required</h2><p>Initial checkout enforcement, native Orange County fulfillment, a subscription-capable payment gateway, real renewal/cancellation acceptance, durable-storage and scheduler acceptance, and the separate juice four-week commitment/prepayment workflow must pass before activation.</p></section></main><script nonce="${nonce}">
const status=document.getElementById('status'), result=document.getElementById('result'), menus=document.getElementById('menus');
async function api(path,body){const headers={'Content-Type':'application/json'};try{if(window.shopify?.idToken)headers.Authorization='Bearer '+await window.shopify.idToken()}catch{}const response=await fetch(path,{method:body?'POST':'GET',headers,credentials:'same-origin',body:body?JSON.stringify(body):undefined,redirect:'error'});const data=await response.json();if(!response.ok)throw new Error(data.message||'The app request could not be completed.');return data;}
async function refresh(){try{const state=await api('/admin/status');status.textContent=JSON.stringify(state,null,2)}catch(error){status.textContent=error.message}}refresh();
document.getElementById('verify').onclick=async()=>{const button=document.getElementById('verify');button.disabled=true;try{status.textContent='Verifying existing app access…';const data=await api('/admin/setup',{});status.textContent=JSON.stringify(data.status,null,2);menus.textContent='';for(const week of ['week-a','week-b','week-c']){const section=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=week;section.append(legend);for(const [id,meal] of Object.entries(data.catalog)){if(!meal.tags.includes(week))continue;const label=document.createElement('label'),input=document.createElement('input');input.type='number';input.min='0';input.max='50';input.step='1';input.value='0';input.dataset.week=week;input.dataset.id=id;label.append(input,document.createTextNode(' '+meal.title+' — $'+meal.price));section.append(label)}menus.append(section)}document.getElementById('review').disabled=false}catch(error){status.textContent=error.message}finally{button.disabled=false}};
document.getElementById('preview').onsubmit=async event=>{event.preventDefault();result.textContent='';const button=document.getElementById('review');button.disabled=true;try{const selections={'week-a':{},'week-b':{},'week-c':{}};for(const input of menus.querySelectorAll('input'))if(Number(input.value)>0)selections[input.dataset.week][input.dataset.id]=Number(input.value);const data=await api('/admin/preview',{selections});const keys=['week-a','week-b','week-c'],start=keys.indexOf(data.firstWeek);result.textContent='No-charge preview. First eligible service week: '+data.firstServiceDate+'\n'+Array.from({length:4},(_,i)=>{const key=keys[(start+i)%3];return 'Cycle '+(i+1)+': '+key+' — $'+(data.weeks[key].subtotalCents/100).toFixed(2)}).join('\n')+'\nNo subscription or billing has started.'}catch(error){result.textContent=error.message}finally{button.disabled=false}};
</script></body></html>`;
}

export function createApplication(config, { store = new Store(config.databasePath, config.encryptionKey), shopify, clock } = {}) {
  const api = shopify || new Shopify(store, config);
  const worker = new Worker(store, api, { gates: config.gates, now: clock, identityKey: config.encryptionKey });
  const configured = () => Boolean(config.baseUrl && config.clientSecret && store.key);
  const adminAuthorized = request => validSessionToken((request.headers.authorization || '').replace(/^Bearer /, ''), config.clientSecret)
    || store.hasTicket(cookies(request).pit_app_session, 'admin');
  const managed = row => ({ state: row.state, weeks: row.data.weeks, nextWeek: row.data.nextWeek || row.data.firstWeek,
    serviceDate: row.data.serviceDate, nextBillingDate: row.data.nextBillingDate || null,
    cancellationPending: Boolean(row.data.cancellationPending), cancellationConfirmed: Boolean(row.data.cancellationConfirmed),
    canCancel: Boolean(row.contract_id && !row.data.cancellationConfirmed) });
  const status = () => ({ app: 'Place in Thyme Meal Rotation', version: '0.3.0', runtime: 'independent-node-app', mainWebsiteDependency: false,
    configured: configured(), connected: Boolean(store.getSetting('verifiedAt')), enrollmentReady: worker.enabled(), billingEnabled: worker.enabled(),
    ownedPlanConfigured: Boolean(store.getSetting('planId')), signedWebhooks: store.getSetting('webhooks', []).length,
    webhookRouting: store.getSetting('webhookRouting'),
    schedulerHeartbeat: store.getSetting('heartbeat', 0) ? new Date(store.getSetting('heartbeat')).toISOString() : null,
    storageAcceptance: config.gates.persistentStorage === true, storageLocation: config.databasePath || null,
    backupLastCompleted: store.getSetting('backupLastCompleted', 0) ? new Date(store.getSetting('backupLastCompleted')).toISOString() : null,
    backupReviewNeeded: store.getSetting('backupReviewNeeded', false),
    eventReviewNeeded: store.getSetting('eventReviewNeeded', false) });
  const preview = async selections => {
    assert(configured() && store.getSetting('verifiedAt'), 'Connect and verify the existing Shopify app first.');
    const weeks = validateSelections(selections, await api.catalog()); const date = firstServiceDate();
    return { weeks, firstWeek: weekAt(date), firstServiceDate: date.slice(0, 10), currencyCode: 'USD', enrollmentReady: worker.enabled() };
  };
  const server = createServer(async (request, response) => {
    const nonce = randomBytes(16).toString('base64');
    response.setHeader('Cache-Control', 'no-store, private'); response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' https://cdn.shopify.com 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-ancestors https://admin.shopify.com https://${SHOP}; base-uri 'none'; form-action 'self'; object-src 'none'`);
    if (request.headers.origin === ORIGIN) {
      response.setHeader('Access-Control-Allow-Origin', ORIGIN); response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    try {
      const url = new URL(request.url, 'https://app.invalid'); const path = url.pathname;
      if (path.startsWith('/api/') && request.method === 'OPTIONS') { response.writeHead(request.headers.origin === ORIGIN ? 204 : 403); response.end(); return; }
      if (path === '/health' || path === '/api/health') { json(response, { version: '0.3.0', mainWebsiteDependency: false, configured: configured(), previewReady: Boolean(store.getSetting('verifiedAt')), enrollmentReady: worker.enabled(), billingEnabled: worker.enabled(), minimumCents: 12000, currencyCode: 'USD', timeZone: ZONE }); return; }
      if (path === '/' && request.method === 'GET') {
        if (validOauth(url.searchParams, config.clientSecret)) response.setHeader('Set-Cookie', cookie('pit_app_session', store.ticket('admin', 1800), 1800));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(adminPage(nonce)); return;
      }
      const rateKey = createHmac('sha256', config.encryptionKey || 'unconfigured-app').update(request.socket.remoteAddress || '').digest('hex');
      if (!store.rate(rateKey, path === '/api/webhook' ? 300 : 60)) { errorResponse(response, 429, 'pit_rate', 'Please wait a minute and try again.'); return; }
      if (path === '/auth/start' && request.method === 'GET') {
        if (!configured()) { errorResponse(response, 503, 'pit_not_configured', 'Configure the independent app URL, private secret, and encryption key before connecting.'); return; }
        const state = store.ticket('oauth', 300);
        response.setHeader('Set-Cookie', cookie('pit_oauth_state', state, 300));
        response.writeHead(303, { Location: `https://${SHOP}/admin/oauth/authorize?${new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES.join(','), redirect_uri: `${config.baseUrl}/auth/callback`, state })}` }); response.end(); return;
      }
      if (path === '/auth/callback' && request.method === 'GET') {
        const state = url.searchParams.get('state');
        if (!configured() || !validOauth(url.searchParams, config.clientSecret) || !equalSecret(state, cookies(request).pit_oauth_state)
          || !url.searchParams.get('code') || !store.hasTicket(state, 'oauth', true)) { errorResponse(response, 403, 'pit_oauth', 'Shopify authorization could not be verified. Start the connection again.'); return; }
        await api.exchange({ code: url.searchParams.get('code'), expiring: 1 });
        response.setHeader('Set-Cookie', [cookie('pit_oauth_state', '', 0), cookie('pit_app_session', store.ticket('admin', 1800), 1800)]);
        response.writeHead(303, { Location: '/' }); response.end(); return;
      }
      if (path.startsWith('/admin/')) {
        if (!adminAuthorized(request) || (request.method !== 'GET' && request.headers.origin !== config.baseUrl)) { errorResponse(response, 403, 'pit_admin', 'Open this app from the approved Shopify store or reconnect it.'); return; }
        if (path === '/admin/status' && request.method === 'GET') { json(response, status()); return; }
        if (path === '/admin/setup' && request.method === 'POST') {
          await readBody(request); let stage = 'connection and owned-plan verification';
          try {
            const verification = await api.verify();
            stage = 'webhook migration'; await api.migrateWebhooks();
            stage = 'live meal catalog'; const catalog = await api.catalog();
            stage = 'private recovery snapshot'; await store.backupIfDue();
            json(response, { status: { ...status(), ...verification }, catalog });
          } catch (error) {
            const diagnostic = error instanceof ShopifyRequestError ? error.code : 'CHECK_FAILED';
            errorResponse(response, 422, 'pit_setup_failed', `Shopify setup stopped during ${stage} (${diagnostic}). Billing remains disabled.`);
          }
          return;
        }
        if (path === '/admin/preview' && request.method === 'POST') { json(response, await preview(JSON.parse((await readBody(request)).toString()).selections)); return; }
      }
      if (path === '/api/webhook' && request.method === 'POST') {
        const raw = await readBody(request, 1000000);
        if (!validWebhook(raw, request.headers['x-shopify-hmac-sha256'], request.headers['x-shopify-shop-domain'], config.clientSecret)) { errorResponse(response, 401, 'pit_signature', 'Invalid webhook signature.'); return; }
        const topic = request.headers['x-shopify-topic'];
        if (topic === 'app/uninstalled') {
          store.saveSecret('access_token', ''); store.saveSecret('refresh_token', ''); store.setSetting('verifiedAt', 0); store.setSetting('planId', '');
          json(response, { received: true }); return;
        }
        const body = JSON.parse(raw.toString()); const contractId = body.admin_graphql_api_id || `gid://shopify/SubscriptionContract/${body.id || ''}`;
        const eventId = request.headers['x-shopify-webhook-id'];
        assert(['subscription_contracts/create', 'subscription_contracts/update'].includes(topic) && /^gid:\/\/shopify\/SubscriptionContract\/[0-9]+$/.test(contractId) && /^[a-zA-Z0-9-]{16,64}$/.test(eventId || ''), 'Invalid webhook event.');
        store.enqueue(eventId, contractId); json(response, { received: true }); return;
      }
      if (path.startsWith('/api/')) {
        if (request.headers.origin !== ORIGIN) { errorResponse(response, 403, 'pit_origin', 'Use the Place in Thyme shop.'); return; }
        if (path === '/api/preview' && request.method === 'POST') { json(response, await preview(JSON.parse((await readBody(request)).toString()).selections)); return; }
        if (path === '/api/quote' && request.method === 'POST') {
          if (!worker.enabled()) { errorResponse(response, 503, 'pit_not_ready', 'Automatic enrollment is not live yet. Your selections are preserved.'); return; }
          const value = await preview(JSON.parse((await readBody(request)).toString()).selections);
          const token = randomBytes(32).toString('hex'); const expiresAt = Date.now() + 1800000;
          const serviceDate = pacificTime(value.firstServiceDate);
          const id = store.create({ weeks: value.weeks, firstWeek: value.firstWeek, serviceDate, expiresAt }, token);
          json(response, { ...value, id, manageToken: token, expiresAt: new Date(expiresAt).toISOString(), sellingPlanId: store.getSetting('planId') }, 201); return;
        }
        const match = path.match(/^\/api\/manage\/([a-f0-9]{48})$/);
        if (match) {
          const id = match[1]; const row = store.authorized(id, (request.headers.authorization || '').replace(/^Bearer /, ''));
          if (!row) { errorResponse(response, 403, 'pit_manage_denied', 'Invalid private meal-plan link.'); return; }
          if (row.state === 'quoted' && row.data.expiresAt <= Date.now()) { errorResponse(response, 410, 'pit_manage_expired', 'This unenrolled plan has expired.'); return; }
          if (request.method === 'GET') { json(response, managed(row)); return; }
          if (request.method === 'POST') {
            const body = JSON.parse((await readBody(request)).toString());
            if (body.action !== 'cancel') { errorResponse(response, 400, 'pit_action', 'Explicit cancellation action required.'); return; }
            if (!row.contract_id) { errorResponse(response, 409, 'pit_not_enrolled', 'This plan has not been enrolled.'); return; }
            const lease = store.claim(id); if (!lease) { errorResponse(response, 409, 'pit_busy', 'A renewal is in progress. Retry shortly or contact us.'); return; }
            try {
              const current = store.get(id); const data = current.data;
              if (!data.cancellationConfirmed) {
                data.cancellationPending = true; data.cancellationRequestedAt ||= new Date().toISOString();
                store.update(id, { state: 'stopped', data }, lease);
                await api.cancel(current.contract_id);
                data.cancellationPending = false; data.cancellationConfirmed = true; store.update(id, { state: 'stopped', data }, lease);
              }
              json(response, { state: 'cancelled' });
            } catch { errorResponse(response, 503, 'pit_cancel_pending', 'Renewals are stopped locally. Shopify cancellation confirmation is pending; retry or contact us.'); }
            finally { store.unlock(id, lease); }
            return;
          }
        }
      }
      errorResponse(response, 404, 'pit_not_found', 'This app route was not found.');
    } catch { errorResponse(response, 422, 'pit_request_failed', 'The app request could not be safely completed. Check selections or reconnect the app. Billing remains gated.'); }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  return { server, store, worker, status };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const application = createApplication(configuration());
  const port = Number(process.env.PORT || 3000);
  application.server.listen(port, '0.0.0.0', () => { console.info(`Place in Thyme app listening on port ${port}. Billing defaults OFF.`); });
  let currentTick = null;
  const tick = () => {
    if (currentTick) return currentTick;
    currentTick = (async () => {
      await application.worker.tick().catch(() => application.store.setSetting('workerReviewNeeded', true));
      await application.store.backupIfDue().catch(() => application.store.setSetting('backupReviewNeeded', true));
    })().finally(() => { currentTick = null; });
    return currentTick;
  };
  tick(); const timer = setInterval(tick, 60000); timer.unref();
  const stop = () => { clearInterval(timer); application.server.close(async () => { await currentTick; application.store.close(); process.exit(0); }); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
