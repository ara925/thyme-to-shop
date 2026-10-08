<?php
declare(strict_types=1);

namespace PlaceInThyme\Rotation;

use DateTimeImmutable;
use DateTimeZone;
use RuntimeException;
use Throwable;

/** Durable state machine. Every consequential request is preceded by a database checkpoint. */
final class Worker
{
    public static function enabled(): bool
    {
        // Never enabled by a plugin update, public request, or OAuth installation.
        return defined('PIT_ROTATION_BILLING_ENABLED') && PIT_ROTATION_BILLING_ENABLED === true
            && get_option('pit_rotation_launch_verified', false) === true
            && get_option('pit_rotation_checkout_verified', false) === true
            && get_option('pit_rotation_fulfillment_verified', false) === true
            && get_option('pit_rotation_storefront_verified', false) === true
            && (int) get_option('pit_rotation_cli_heartbeat', 0) >= time() - 600
            && preg_match('~^gid://shopify/SellingPlan/[0-9]+$~D', get_option('pit_rotation_plan', [])['sellingPlans']['nodes'][0]['id'] ?? '') === 1
            && count(get_option('pit_rotation_webhooks', [])) === 3;
    }

    public static function tick(): void
    {
        update_option('pit_rotation_heartbeat', time(), false);
        if (PHP_SAPI === 'cli') update_option('pit_rotation_cli_heartbeat', time(), false);
        $lock = Store::lease('worker', 120);
        if (!$lock) return;
        try {
            self::events();
            if (self::enabled()) self::renewals();
        } catch (Throwable $error) {
            update_option('pit_rotation_worker_error', $error->getMessage(), false);
        } finally { Store::release('worker', $lock); }
    }

    private static function events(): void
    {
        global $wpdb;
        $events = $wpdb->get_results('SELECT * FROM ' . $wpdb->prefix . "pit_rotation_events WHERE state='pending' ORDER BY created_at LIMIT 5", ARRAY_A);
        foreach ($events as $event) {
            self::bind($event['resource_id']);
            $wpdb->update($wpdb->prefix . 'pit_rotation_events', ['state' => 'processed'], ['id' => $event['id']]);
        }
    }

    public static function bind(string $contractId): void
    {
        $contract = Shopify::contract($contractId);
        $ids = [];
        foreach ($contract['lines']['nodes'] as $line) {
            foreach ($line['customAttributes'] as $attribute) {
                if ($attribute['key'] === '_pit_rotation_id') $ids[] = $attribute['value'];
            }
        }
        $ids = array_values(array_unique($ids));
        if (!$ids) return; // Another owned contract, not a rotation. Never edit it.
        if (count($ids) !== 1) throw new RuntimeException('A contract contains multiple meal rotation IDs.');
        $id = $ids[0];
        $lease = Store::claim($id);
        if (!$lease) throw new RuntimeException('Contract synchronization is busy; retry later.');
        try {
            $row = Store::get($id);
            if (!$row) return;
            if ($row['contract_id']) {
                if ($row['contract_id'] !== $contractId) throw new RuntimeException('Meal rotation is already bound to another contract.');
                if ($contract['status'] !== 'ACTIVE') Store::update($id, ['state' => 'stopped'], $lease);
                return;
            }
            $data = $row['data'];
            if ($row['state'] !== 'quoted') throw new RuntimeException('This saved meal plan is not open for enrollment.');
            if (time() - (int) $row['created_at'] > 86400) throw new RuntimeException('This saved checkout plan expired and requires manual reconciliation.');
            $planId = get_option('pit_rotation_plan', [])['sellingPlans']['nodes'][0]['id'] ?? '';
            foreach ($contract['lines']['nodes'] as $line) {
                if (!$planId || ($line['sellingPlanId'] ?? '') !== $planId) throw new RuntimeException('Contract selling-plan ownership does not match.');
            }
            Domain::assertLocal($contract);
            $week = $data['firstWeek'];
            if ($contract['status'] !== 'ACTIVE' || $contract['currencyCode'] !== 'USD'
                || !empty($contract['discounts']['nodes']) || $contract['lines']['pageInfo']['hasNextPage']
                || !Domain::matchLines($data['weeks'][$week]['lines'], $contract['lines']['nodes'])) {
                throw new RuntimeException('Checkout meals, totals, or status do not match the saved three-week plan.');
            }
            if (($contract['originOrder']['displayFinancialStatus'] ?? '') !== 'PAID') {
                throw new RuntimeException('Initial checkout payment is not confirmed. No renewal is scheduled.');
            }
            $due = strtotime($contract['nextBillingDate'] ?? '');
            if (!$due || $due < time() + 86400) throw new RuntimeException('The first renewal date needs review.');
            $data['cycle'] = 1;
            $data['approvedDeliveryFingerprint'] = Domain::deliveryFingerprint($contract['deliveryMethod'], wp_salt('nonce'));
            $data['approvedPaymentMethodId'] = $contract['customerPaymentMethod']['id'] ?? '';
            $data['nextWeek'] = Domain::WEEKS[(array_search($week, Domain::WEEKS, true) + 1) % 3];
            $data['serviceDate'] = Domain::nextServiceDate(new DateTimeImmutable($data['serviceDate']))->format(DATE_ATOM);
            Store::update($id, ['contract_id' => $contractId, 'state' => 'active', 'due_at' => $due, 'data' => $data], $lease);
        } finally { Store::unlock($id, $lease); }
    }

    private static function renewals(): void
    {
        global $wpdb;
        $ids = $wpdb->get_col($wpdb->prepare('SELECT id FROM ' . $wpdb->prefix . "pit_rotations
            WHERE state IN ('active','calculating','committing','billing','finalizing') AND due_at<=%d ORDER BY due_at LIMIT 3", time()));
        foreach ($ids as $id) {
            $lease = Store::claim($id);
            if (!$lease) continue;
            try { self::step($id, $lease); }
            catch (Throwable $error) {
                $row = Store::get($id);
                $data = $row['data'];
                $data['lastError'] = $error->getMessage();
                // Billing/commit ambiguity is retried with the SAME persisted ID/key, never a new charge.
                $retryable = in_array($row['state'], ['billing', 'committing', 'finalizing'], true);
                Store::update($id, ['state' => $retryable ? $row['state'] : 'review',
                    'due_at' => time() + 900, 'data' => $data], $lease);
            } finally { Store::unlock($id, $lease); }
        }
    }

    public static function step(string $id, string $lease): void
    {
        if (!self::enabled()) return;
        $row = Store::get($id);
        if (!$row || !in_array($row['state'], ['active', 'calculating', 'committing', 'billing', 'finalizing'], true)) return;
        $data = $row['data'];
        $contract = Shopify::contract($row['contract_id']);
        if ($contract['status'] !== 'ACTIVE') {
            Store::update($id, ['state' => 'stopped'], $lease);
            return;
        }
        Domain::assertLocal($contract);
        if (!$contract['customerPaymentMethod'] || !empty($contract['discounts']['nodes'])) throw new RuntimeException('Payment method or discounts need review.');
        if (Domain::deliveryFingerprint($contract['deliveryMethod'], wp_salt('nonce')) !== ($data['approvedDeliveryFingerprint'] ?? '')
            || ($contract['customerPaymentMethod']['id'] ?? '') !== ($data['approvedPaymentMethodId'] ?? '')) {
            throw new RuntimeException('Delivery or payment settings changed. Customer review is required before renewal.');
        }
        $cutoff = Domain::serviceCutoff(new DateTimeImmutable($data['serviceDate']))->getTimestamp();
        if (time() >= $cutoff && !in_array($row['state'], ['finalizing'], true)
            && !($row['state'] === 'billing' && !empty($data['attemptId']))) {
            Store::update($id, ['state' => 'review'], $lease);
            throw new RuntimeException('Friday midnight cutoff passed. No late charge was initiated.');
        }
        $week = $data['weeks'][$data['nextWeek']];
        if ($row['state'] === 'active') {
            Domain::validateUnchanged($data['weeks'], Shopify::catalog());
            $now = new DateTimeImmutable('now', new DateTimeZone(Domain::TIME_ZONE));
            $service = (new DateTimeImmutable($data['serviceDate']))->setTimezone(new DateTimeZone(Domain::TIME_ZONE));
            if ($now >= Domain::serviceCutoff($service)) throw new RuntimeException('Renewal missed the Friday midnight cutoff. Customer review is required; no catch-up charge.');
            if ($data['nextWeek'] !== Domain::week($service)) throw new RuntimeException('Service date and menu calendar disagree.');
            $priorWeek = Domain::WEEKS[(array_search($data['nextWeek'], Domain::WEEKS, true) + 2) % 3];
            if (!Domain::matchLines($data['weeks'][$priorWeek]['lines'], $contract['lines']['nodes']) || $contract['lines']['pageInfo']['hasNextPage']) {
                throw new RuntimeException('Contract was edited outside the saved rotation. No lines were replaced.');
            }
            $data['billingOrigin'] = (new DateTimeImmutable($contract['nextBillingDate']))->format(DATE_ATOM);
            if (strtotime($data['billingOrigin']) > time()) return;
            $data['calculationId'] = Shopify::calculate($row['contract_id'], $week, $id);
            $data['calculationRevision'] = $contract['revisionId'];
            Store::update($id, ['state' => 'calculating', 'due_at' => time() + 5, 'data' => $data], $lease);
            return;
        }
        if ($row['state'] === 'calculating') {
            Domain::validateUnchanged($data['weeks'], Shopify::catalog());
            $calculation = Shopify::calculation($data['calculationId']);
            if (($calculation['__typename'] ?? '') === 'SubscriptionContractCalculationPending') {
                Store::update($id, ['due_at' => time() + 60], $lease);
                return;
            }
            Domain::assertCalculation($calculation, $week, $contract);
            $data['approvedRevision'] = $contract['revisionId'];
            Store::update($id, ['state' => 'committing', 'data' => $data], $lease);
            return;
        }
        if ($row['state'] === 'committing') {
            // Shopify rejects stale revisions, and retrying the same calculation commit is idempotent.
            Shopify::commit($data['calculationId']);
            $data['idempotencyKey'] = 'pit-' . $id . '-cycle-' . $data['cycle'];
            Store::update($id, ['state' => 'billing', 'data' => $data], $lease);
            return;
        }
        if ($row['state'] === 'billing') {
            if (!Domain::matchLines($week['lines'], $contract['lines']['nodes']) || $contract['lines']['pageInfo']['hasNextPage']) {
                Store::update($id, ['state' => 'review'], $lease);
                throw new RuntimeException('Committed contract no longer matches the approved week. Billing is stopped.');
            }
            $attempt = !empty($data['attemptId']) ? Shopify::pollAttempt($data['attemptId'])
                : Shopify::attempt($row['contract_id'], $data['idempotencyKey'], $data['billingOrigin']);
            if (!$attempt || empty($attempt['id'])) throw new RuntimeException('Billing result is uncertain. The same idempotency key will be reused.');
            $data['attemptId'] = $attempt['id'];
            if (!empty($attempt['nextActionUrl']) || !empty($attempt['errorCode'])) {
                $data['lastError'] = !empty($attempt['nextActionUrl']) ? 'Customer payment authentication is required.' : 'Payment failed; no menu advancement.';
                Store::update($id, ['state' => 'review', 'data' => $data], $lease);
                return;
            }
            if (empty($attempt['ready']) || empty($attempt['order']['id'])) {
                Store::update($id, ['due_at' => time() + 60, 'data' => $data], $lease);
                return;
            }
            $data['paidOrderId'] = $attempt['order']['id'];
            $data['nextBillingDate'] = (new DateTimeImmutable($data['billingOrigin']))
                ->setTimezone(new DateTimeZone(Domain::TIME_ZONE))->modify('+1 week')->format(DATE_ATOM);
            Store::update($id, ['state' => 'finalizing', 'data' => $data], $lease);
            return;
        }
        if ($row['state'] === 'finalizing') {
            Shopify::nextDate($row['contract_id'], $data['nextBillingDate']);
            $data['lastPaidWeek'] = $data['nextWeek'];
            $data['nextWeek'] = Domain::WEEKS[(array_search($data['nextWeek'], Domain::WEEKS, true) + 1) % 3];
            $data['serviceDate'] = Domain::nextServiceDate(new DateTimeImmutable($data['serviceDate']))->format(DATE_ATOM);
            $data['cycle']++;
            foreach (['calculationId', 'attemptId', 'billingOrigin', 'idempotencyKey'] as $key) unset($data[$key]);
            Store::update($id, ['state' => 'active', 'due_at' => strtotime($data['nextBillingDate']), 'data' => $data], $lease);
        }
    }
}
