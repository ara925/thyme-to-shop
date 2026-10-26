import { assert, assertLocal, assertReviewedFulfillment, fingerprint, matchLines, serviceCutoff, ReviewRequiredError } from './domain.mjs';
import { deliveryWeeksPerPayment, advanceService, advanceJuiceBilling, unchangedJuiceMix, cancellationTarget } from './juice-domain.mjs';

const LIVE = ['active', 'billing', 'finalizing', 'cancelling'];
export class JuiceWorker {
  constructor(store, api, { gates = {}, now = () => Date.now(), identityKey = '' } = {}) { this.store = store; this.api = api; this.gates = gates; this.now = now; this.key = identityKey; }
  enabled() {
    const plans = this.store.getSetting('juicePlanIds');
    return ['billing', 'checkout', 'fulfillment', 'storefront', 'launch', 'persistentStorage', 'juice'].every(gate => this.gates[gate] === true)
      && this.store.getSetting('heartbeat', 0) >= this.now() - 120000 && this.store.getSetting('verifiedAt', 0) > 0 && this.store.getSetting('juiceVerifiedAt', 0) > 0
      && ['weekly', 'prepaid'].every(mode => /^gid:\/\/shopify\/SellingPlan\/\d+$/.test(plans?.[mode] || ''))
      && plans.weekly !== plans.prepaid && this.store.getSetting('webhooks', []).length === 3 && Boolean(this.key);
  }
  verifyContract(contract, data) {
    const planId = this.store.getSetting('juicePlanIds')?.[data.mix.billingPreference];
    assertLocal(contract, { billingIntervalCount: deliveryWeeksPerPayment(data.mix.billingPreference) });
    assert(contract.currencyCode === 'USD' && !contract.discounts?.nodes?.length && !contract.lines?.pageInfo?.hasNextPage
      && matchLines(data.mix.lines, contract.lines?.nodes) && contract.lines.nodes.every(line => line.sellingPlanId === planId)
      && contract.revisionId !== undefined && contract.revisionId !== null, 'Juice contract prices, items, plan or revision differ from approval.');
  }
  async bind(contractId, contract) {
    const ids = [...new Set(contract.lines.nodes.flatMap(line => (line.customAttributes || []).filter(item => item.key === '_pit_juice_id').map(item => item.value)))];
    if (!ids.length) return false;
    assert(ids.length === 1 && /^[a-f0-9]{48}$/.test(ids[0]), 'Invalid juice enrollment identity.');
    const row = this.store.get(ids[0]); if (!row) return true;
    const lease = this.store.claim(row.id); assert(lease, 'Juice synchronization is busy.');
    try {
      const current = this.store.get(row.id); const data = current.data; assert(data.kind === 'juice', 'Wrong subscription kind.');
      if (current.contract_id) {
        assert(current.contract_id === contractId, 'Juice plan is already bound.');
        if (contract.status !== 'ACTIVE') this.store.update(row.id, { state: 'stopped', data: { ...data, ...(contract.status === 'CANCELLED' ? { cancellationConfirmed: true, cancellationPending: false } : {}) } }, lease);
        return true;
      }
      assert(current.state === 'quoted' && data.expiresAt > this.now(), 'Initial juice enrollment expired; review is required.');
      this.verifyContract(contract, data);
      assertReviewedFulfillment(contract, data.checkoutFulfillment);
      assert(contract.status === 'ACTIVE' && contract.originOrder?.displayFinancialStatus === 'PAID'
        && Date.parse(contract.nextBillingDate) > this.now() + 86400000, 'Initial juice payment or next billing date is unconfirmed.');
      const paidWeeks = deliveryWeeksPerPayment(data.mix.billingPreference);
      Object.assign(data, { paidWeeks, billingCycle: 1, firstServiceDate: data.firstServiceDate || data.serviceDate,
        nextServiceDate: advanceService(data.firstServiceDate || data.serviceDate, paidWeeks), nextBillingDate: contract.nextBillingDate,
        approvedDeliveryFingerprint: fingerprint(contract.deliveryMethod, this.key), approvedRevisionId: String(contract.revisionId),
        cancellationRequested: false, cancellationPending: false, cancellationConfirmed: false });
      this.store.update(row.id, { state: 'active', contract_id: contractId, data, due_at: Date.parse(contract.nextBillingDate) }, lease); return true;
    } finally { this.store.unlock(row.id, lease); }
  }
  async finishCancellation(id, lease) {
    const row = this.store.get(id); const data = row.data;
    assert(data.kind === 'juice' && data.cancellationRequested && data.paidWeeks >= data.cancelAfterPaidWeeks, 'The four-week cancellation boundary is not funded yet.');
    this.store.update(id, { state: 'cancelling', data: { ...data, cancellationPending: true } }, lease);
    await this.api.cancel(row.contract_id);
    this.store.update(id, { state: 'stopped', data: { ...data, cancellationPending: false, cancellationConfirmed: true } }, lease);
  }
  async requestCancellation(id, lease) {
    const row = this.store.get(id); assert(row?.data.kind === 'juice' && row.contract_id, 'This juice plan is not enrolled.');
    if (row.data.cancellationConfirmed) return { state: 'cancelled', effectiveDate: row.data.cancellationEffectiveDate };
    const target = cancellationTarget(row.data);
    const data = { ...row.data, cancellationRequested: true, cancelAfterPaidWeeks: row.data.cancelAfterPaidWeeks || target.afterPaidWeeks,
      cancellationEffectiveDate: row.data.cancellationEffectiveDate || target.effectiveDate, cancellationRequestedAt: row.data.cancellationRequestedAt || new Date(this.now()).toISOString() };
    this.store.update(id, { data }, lease);
    if (data.paidWeeks >= data.cancelAfterPaidWeeks) {
      await this.finishCancellation(id, lease); return { state: 'cancelled', effectiveDate: data.cancellationEffectiveDate };
    }
    return { state: 'scheduled', effectiveDate: data.cancellationEffectiveDate, afterPaidWeeks: data.cancelAfterPaidWeeks };
  }
  async stepDue() {
    const allowed = this.enabled() ? LIVE : ['cancelling'];
    const rows = this.store.db.prepare(`SELECT id FROM rotations WHERE json_extract(payload,'$.kind')='juice' AND state IN (${allowed.map(() => '?').join(',')}) AND due_at<=? ORDER BY due_at LIMIT 3`).all(...allowed, this.now());
    for (const { id } of rows) {
      const lease = this.store.claim(id); if (!lease) continue;
      try { await this.step(id, lease); }
      catch (error) {
        const row = this.store.get(id); const retryable = ['billing', 'finalizing', 'cancelling'].includes(row.state) && !(error instanceof ReviewRequiredError)
          && !['HTTP_400', 'HTTP_401', 'HTTP_403', 'HTTP_404', 'ACCESS_DENIED', 'MAX_COST_EXCEEDED', 'undefinedField', 'SHOPIFY_REQUEST_REJECTED'].includes(error?.code);
        this.store.update(id, { state: retryable ? row.state : 'review', due_at: this.now() + 900000, data: { ...row.data, lastError: 'Juice renewal requires review or a safe retry. The same billing key is retained.' } }, lease);
      } finally { this.store.unlock(id, lease); }
    }
  }
  async step(id, lease) {
    const row = this.store.get(id); if (!row || row.data.kind !== 'juice' || !LIVE.includes(row.state)) return;
    const data = row.data;
    if (row.state === 'cancelling') { await this.finishCancellation(id, lease); return; }
    if (!this.enabled()) return;
    const contract = await this.api.contract(row.contract_id);
    if (contract.status !== 'ACTIVE') { this.store.update(id, { state: 'stopped', data: { ...data, ...(contract.status === 'CANCELLED' ? { cancellationConfirmed: true, cancellationPending: false } : {}) } }, lease); return; }
    this.verifyContract(contract, data);
    assert(fingerprint(contract.deliveryMethod, this.key) === data.approvedDeliveryFingerprint, 'Juice delivery changed.');
    if (row.state !== 'finalizing') assert(data.approvedRevisionId && String(contract.revisionId) === data.approvedRevisionId, 'The juice contract was edited outside the app; review is required.');
    if (data.cancellationRequested && data.paidWeeks >= data.cancelAfterPaidWeeks) { await this.finishCancellation(id, lease); return; }
    if (row.state === 'active') {
      assert(this.now() < serviceCutoff(data.nextServiceDate), 'The Friday cutoff passed; no late juice charge was initiated.');
      unchangedJuiceMix(data.mix, await this.api.juiceCatalog());
      const due = Date.parse(contract.nextBillingDate); assert(Number.isFinite(due), 'Juice billing date is invalid.');
      if (due > this.now()) return;
      data.billingOrigin = new Date(due).toISOString(); data.idempotencyKey = `pit-juice-${id}-cycle-${data.billingCycle}`;
      this.store.update(id, { state: 'billing', data }, lease); return;
    }
    if (row.state === 'billing') {
      assert(this.now() < serviceCutoff(data.nextServiceDate) || data.attemptId, 'The Friday cutoff passed; no new late billing attempt was initiated.');
      const attempt = data.attemptId ? await this.api.pollAttempt(data.attemptId) : await this.api.attempt(row.contract_id, data.idempotencyKey, data.billingOrigin);
      assert(attempt?.id, 'Uncertain juice billing result.'); data.attemptId = attempt.id;
      if (attempt.nextActionUrl || attempt.errorCode) { this.store.update(id, { state: 'review', data }, lease); return; }
      if (!attempt.ready || !attempt.order?.id) { this.store.update(id, { due_at: this.now() + 60000, data }, lease); return; }
      data.paidOrderId = attempt.order.id; this.store.update(id, { state: 'finalizing', data }, lease); return;
    }
    if (row.state === 'finalizing') {
      if (data.lastPaidOrderId !== data.paidOrderId) {
        assert(data.paidOrderId, 'Confirmed juice order is missing.');
        data.lastPaidOrderId = data.paidOrderId; data.paidWeeks += deliveryWeeksPerPayment(data.mix.billingPreference); data.billingCycle++;
        data.nextBillingDate = advanceJuiceBilling(data.billingOrigin, data.mix.billingPreference);
        data.nextServiceDate = advanceService(data.nextServiceDate, deliveryWeeksPerPayment(data.mix.billingPreference));
        this.store.update(id, { data }, lease);
      }
      if (data.cancellationRequested && data.paidWeeks >= data.cancelAfterPaidWeeks) { await this.finishCancellation(id, lease); return; }
      const advanced = await this.api.nextDate(row.contract_id, data.nextBillingDate) || await this.api.contract(row.contract_id);
      assert(advanced.id === row.contract_id && Date.parse(advanced.nextBillingDate) === Date.parse(data.nextBillingDate) && advanced.revisionId !== undefined && advanced.revisionId !== null, 'The next juice billing date was not confirmed.');
      data.approvedRevisionId = String(advanced.revisionId);
      for (const field of ['attemptId', 'billingOrigin', 'idempotencyKey', 'paidOrderId']) delete data[field];
      this.store.update(id, { state: 'active', due_at: Date.parse(data.nextBillingDate), data }, lease);
    }
  }
}
