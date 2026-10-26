import { WEEKS, assert, assertLocal, assertReviewedFulfillment, assertCalculation, fingerprint, matchLines, validateUnchanged, nextServiceDate, nextBillingDate, serviceCutoff, weekAt, ReviewRequiredError } from './domain.mjs';
import { JuiceWorker } from './juice-worker.mjs';

const LIVE_STATES = ['active', 'calculating', 'committing', 'billing', 'finalizing'];
export class Worker {
  constructor(store, shopify, { gates = {}, now = () => Date.now(), identityKey = '' } = {}) { this.store = store; this.api = shopify; this.gates = gates; this.now = now; this.key = identityKey; this.juices = new JuiceWorker(store, shopify, { gates, now, identityKey }); }
  enabled() {
    return ['billing', 'checkout', 'fulfillment', 'storefront', 'launch', 'persistentStorage'].every(key => this.gates[key] === true)
      && this.store.getSetting('heartbeat', 0) >= this.now() - 120000 && this.store.getSetting('verifiedAt', 0) > 0
      && /^gid:\/\/shopify\/SellingPlan\/\d+$/.test(this.store.getSetting('planId', ''))
      && this.store.getSetting('webhooks', []).length === 3 && Boolean(this.key);
  }
  async tick() {
    this.store.setSetting('heartbeat', this.now());
    const lock = this.store.lease('worker', 120); if (!lock) return;
    try {
      const events = this.store.db.prepare("SELECT * FROM events WHERE state='pending' AND due_at<=? ORDER BY due_at LIMIT 5").all(this.now());
      for (const event of events) {
        try {
          const contract = await this.api.contract(event.resource_id);
          const attributes = contract.lines.nodes.flatMap(line => line.customAttributes || []);
          assert(!(attributes.some(item => item.key === '_pit_rotation_id') && attributes.some(item => item.key === '_pit_juice_id')), 'Mixed subscription identities require review.');
          await this.bind(event.resource_id, contract);
          await this.juices.bind(event.resource_id, contract);
          this.store.db.prepare("UPDATE events SET state='processed' WHERE id=?").run(event.id);
        } catch {
          this.store.db.prepare('UPDATE events SET attempts=attempts+1,due_at=?,state=? WHERE id=?').run(this.now() + 60000 * Math.min(60, 2 ** event.attempts), event.attempts >= 9 ? 'review' : 'pending', event.id);
          this.store.setSetting('eventReviewNeeded', true);
        }
      }
      await this.juices.stepDue();
      if (!this.enabled()) return;
      const rows = this.store.db.prepare("SELECT id FROM rotations WHERE COALESCE(json_extract(payload,'$.kind'),'meal')='meal' AND state IN ('active','calculating','committing','billing','finalizing') AND due_at<=? ORDER BY due_at LIMIT 3").all(this.now());
      for (const { id } of rows) {
        const lease = this.store.claim(id); if (!lease) continue;
        try { await this.step(id, lease); }
        catch (error) {
          const row = this.store.get(id);
          const retryable = ['billing', 'committing', 'finalizing'].includes(row.state) && !(error instanceof ReviewRequiredError)
            && !['HTTP_400', 'HTTP_401', 'HTTP_403', 'HTTP_404', 'ACCESS_DENIED', 'MAX_COST_EXCEEDED', 'undefinedField', 'SHOPIFY_REQUEST_REJECTED'].includes(error?.code);
          this.store.update(id, { state: retryable ? row.state : 'review', due_at: this.now() + 900000, data: { ...row.data, lastError: 'Renewal requires review or safe retry. No new billing key was generated.' } }, lease);
        } finally { this.store.unlock(id, lease); }
      }
    } finally { this.store.release('worker', lock); }
  }
  async bind(contractId, suppliedContract) {
    const contract = suppliedContract || await this.api.contract(contractId);
    const ids = [...new Set(contract.lines.nodes.flatMap(line => (line.customAttributes || []).filter(attribute => attribute.key === '_pit_rotation_id').map(attribute => attribute.value)))];
    if (!ids.length) return;
    assert(ids.length === 1 && /^[a-f0-9]{48}$/.test(ids[0]), 'Invalid rotation identity.');
    const id = ids[0]; const row = this.store.get(id); if (!row) return;
    const lease = this.store.claim(id); assert(lease, 'Contract synchronization busy.');
    try {
      const current = this.store.get(id); const data = current.data;
      assert(data.kind !== 'juice', 'Wrong subscription kind.');
      if (current.contract_id) {
        assert(current.contract_id === contractId, 'Rotation is already bound.');
        if (contract.status !== 'ACTIVE') this.store.update(id, { state: 'stopped', data: { ...data, ...(contract.status === 'CANCELLED' ? { cancellationPending: false, cancellationConfirmed: true } : {}) } }, lease);
        return;
      }
      assert(current.state === 'quoted' && data.expiresAt > this.now(), 'Enrollment expired; manual reconciliation required.');
      const planId = this.store.getSetting('planId');
      assert(planId && contract.lines.nodes.every(line => line.sellingPlanId === planId), 'Selling plan does not match.');
      assertLocal(contract);
      assertReviewedFulfillment(contract, data.checkoutFulfillment);
      assert(contract.status === 'ACTIVE' && contract.currencyCode === 'USD' && !contract.discounts?.nodes?.length && !contract.lines.pageInfo.hasNextPage
        && matchLines(data.weeks[data.firstWeek].lines, contract.lines.nodes), 'Initial checkout differs from saved selections.');
      assert(contract.originOrder?.displayFinancialStatus === 'PAID', 'Initial payment is not confirmed.');
      const due = Date.parse(contract.nextBillingDate); assert(due > this.now() + 86400000, 'Renewal date needs review.');
      assert(contract.revisionId !== null && contract.revisionId !== undefined && String(contract.revisionId), 'Contract revision is missing.');
      Object.assign(data, { cycle: 1, approvedDeliveryFingerprint: fingerprint(contract.deliveryMethod, this.key), approvedRevisionId: String(contract.revisionId),
        nextWeek: WEEKS[(WEEKS.indexOf(data.firstWeek) + 1) % 3], serviceDate: nextServiceDate(data.serviceDate), nextBillingDate: contract.nextBillingDate });
      this.store.update(id, { state: 'active', contract_id: contractId, due_at: due, data }, lease);
    } finally { this.store.unlock(id, lease); }
  }
  async step(id, lease) {
    if (!this.enabled()) return;
    const row = this.store.get(id); if (!row || row.data.kind === 'juice' || !LIVE_STATES.includes(row.state)) return;
    const data = row.data; const contract = await this.api.contract(row.contract_id);
    if (contract.status !== 'ACTIVE') { this.store.update(id, { state: 'stopped' }, lease); return; }
    assertLocal(contract);
    assert(!contract.discounts?.nodes?.length && fingerprint(contract.deliveryMethod, this.key) === data.approvedDeliveryFingerprint, 'Contract discounts or delivery changed; review required.');
    if (['active', 'billing'].includes(row.state)) assert(data.approvedRevisionId && String(contract.revisionId) === data.approvedRevisionId, 'The contract was edited outside the app; review is required.');
    if (['calculating', 'committing'].includes(row.state)) assert(data.calculationRevision && String(contract.revisionId) === String(data.calculationRevision), 'The contract changed while its rotation calculation was pending.');
    if (this.now() >= serviceCutoff(data.serviceDate) && row.state !== 'finalizing' && !(row.state === 'billing' && data.attemptId)) {
      this.store.update(id, { state: 'review' }, lease); throw new Error('Friday cutoff passed. No late charge was initiated.');
    }
    const week = data.weeks[data.nextWeek];
    if (row.state === 'active') {
      validateUnchanged(data.weeks, await this.api.catalog());
      assert(data.nextWeek === weekAt(data.serviceDate), 'Service calendar and saved menu disagree.');
      const priorWeek = WEEKS[(WEEKS.indexOf(data.nextWeek) + 2) % 3];
      assert(!contract.lines.pageInfo.hasNextPage && matchLines(data.weeks[priorWeek].lines, contract.lines.nodes), 'Contract was edited outside saved rotation.');
      data.billingOrigin = new Date(contract.nextBillingDate).toISOString();
      if (Date.parse(data.billingOrigin) > this.now()) return;
      data.calculationId = await this.api.calculate(row.contract_id, week, id);
      data.calculationRevision = contract.revisionId;
      this.store.update(id, { state: 'calculating', due_at: this.now() + 5000, data }, lease); return;
    }
    if (row.state === 'calculating') {
      validateUnchanged(data.weeks, await this.api.catalog());
      const calculation = await this.api.calculation(data.calculationId);
      if (calculation?.__typename === 'SubscriptionContractCalculationPending') { this.store.update(id, { due_at: this.now() + 60000 }, lease); return; }
      assertCalculation(calculation, week, contract);
      this.store.update(id, { state: 'committing', data }, lease); return;
    }
    if (row.state === 'committing') {
      const committed = await this.api.commit(data.calculationId) || await this.api.contract(row.contract_id);
      assert(committed.id === row.contract_id && committed.status === 'ACTIVE' && committed.revisionId !== null && committed.revisionId !== undefined
        && matchLines(week.lines, committed.lines?.nodes) && fingerprint(committed.deliveryMethod, this.key) === data.approvedDeliveryFingerprint, 'The committed contract could not be verified.');
      data.approvedRevisionId = String(committed.revisionId);
      data.idempotencyKey = `pit-${id}-cycle-${data.cycle}`;
      this.store.update(id, { state: 'billing', data }, lease); return;
    }
    if (row.state === 'billing') {
      if (contract.lines.pageInfo.hasNextPage || !matchLines(week.lines, contract.lines.nodes)) {
        this.store.update(id, { state: 'review' }, lease); throw new Error('Committed meals changed; billing stopped.');
      }
      const attempt = data.attemptId ? await this.api.pollAttempt(data.attemptId) : await this.api.attempt(row.contract_id, data.idempotencyKey, data.billingOrigin);
      assert(attempt?.id, 'Uncertain billing result; reuse saved key.'); data.attemptId = attempt.id;
      if (attempt.nextActionUrl || attempt.errorCode) { this.store.update(id, { state: 'review', data }, lease); return; }
      if (!attempt.ready || !attempt.order?.id) { this.store.update(id, { due_at: this.now() + 60000, data }, lease); return; }
      data.paidOrderId = attempt.order.id; data.nextBillingDate = nextBillingDate(data.billingOrigin);
      this.store.update(id, { state: 'finalizing', data }, lease); return;
    }
    if (row.state === 'finalizing') {
      const advanced = await this.api.nextDate(row.contract_id, data.nextBillingDate) || await this.api.contract(row.contract_id);
      assert(advanced.id === row.contract_id && Date.parse(advanced.nextBillingDate) === Date.parse(data.nextBillingDate) && advanced.revisionId !== null && advanced.revisionId !== undefined, 'The next billing date was not confirmed.');
      data.approvedRevisionId = String(advanced.revisionId);
      data.lastPaidWeek = data.nextWeek; data.nextWeek = WEEKS[(WEEKS.indexOf(data.nextWeek) + 1) % 3];
      data.serviceDate = nextServiceDate(data.serviceDate); data.cycle++;
      for (const key of ['calculationId', 'attemptId', 'billingOrigin', 'idempotencyKey']) delete data[key];
      this.store.update(id, { state: 'active', due_at: Date.parse(data.nextBillingDate), data }, lease);
    }
  }
}
