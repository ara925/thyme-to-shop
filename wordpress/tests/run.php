<?php
declare(strict_types=1);

// Dependency-free executable tests; no network access, real credentials, or payments.
use PlaceInThyme\Rotation\Domain;
use PlaceInThyme\Rotation\Shopify;
use PlaceInThyme\Rotation\Store;
use PlaceInThyme\Rotation\Worker;
use PlaceInThyme\Rotation\Plugin;

define('ARRAY_A', 'ARRAY_A');
define('PIT_ROTATION_BILLING_ENABLED', true); // Fixture-only. Production defaults OFF.
$options = [];
$responses = [];
$calls = [];
function wp_salt($scheme) { return 'TEST-ONLY-not-a-live-secret-' . $scheme; }
function update_option($key, $value, $autoload = false) { global $options; $options[$key] = $value; return true; }
function get_option($key, $default = false) { global $options; return $options[$key] ?? $default; }
function add_option($key, $value, $unused = '', $autoload = false) { global $options; if (isset($options[$key])) return false; $options[$key] = $value; return true; }
function wp_json_encode($value) { return json_encode($value, JSON_THROW_ON_ERROR); }
function is_wp_error($value) { return $value instanceof WP_Error; }
function get_transient($key) { global $transients; return $transients[$key] ?? false; }
function set_transient($key, $value, $ttl) { global $transients; $transients[$key] = $value; return true; }
function wp_remote_retrieve_response_code($response) { return 200; }
function wp_remote_retrieve_body($response) { return json_encode($response); }
function wp_remote_post($url, $input) {
    global $responses, $calls;
    $body = json_decode($input['body'], true);
    $calls[] = $body;
    if (!$responses) throw new RuntimeException('Unexpected HTTP request in a no-network test.');
    $next = array_shift($responses);
    if ($next instanceof Throwable) throw $next;
    return ['data' => $next];
}
function rest_url($route) { return 'https://example.test/wp-json/' . $route; }

class WP_Error {
    public function __construct(public string $code, public string $message, public array $data = []) {}
}
class WP_REST_Response {
    public function __construct(public $data, public int $status = 200, public array $headers = []) {}
}
class WP_REST_Request implements ArrayAccess {
    public function __construct(public array $params = [], public array $json = [], public array $headers = [], public ?string $body = null) {}
    public function get_header($name) { return $this->headers[$name] ?? ''; }
    public function get_json_params() { return $this->json; }
    public function get_body() { return $this->body ?? json_encode($this->json); }
    public function offsetExists(mixed $key): bool { return isset($this->params[$key]); }
    public function offsetGet(mixed $key): mixed { return $this->params[$key] ?? null; }
    public function offsetSet(mixed $key, mixed $value): void { $this->params[$key] = $value; }
    public function offsetUnset(mixed $key): void { unset($this->params[$key]); }
}

class FixtureDatabase {
    public string $prefix = 'test_';
    public array $rows = [];
    public function prepare($query, ...$values) { return ['query' => $query, 'values' => $values]; }
    public function get_row($query, $mode) { return $this->rows[$query['values'][0]] ?? null; }
    public function insert($table, $row) { $this->rows[$row['id']] = $row + ['contract_id' => null, 'due_at' => 0, 'lease' => '', 'locked_until' => 0]; return 1; }
    public function query($prepared) {
        $values = $prepared['values'];
        if (str_contains($prepared['query'], 'SET lease=')) {
            [$lease, $until, $id, $now] = $values;
            if (!isset($this->rows[$id]) || ($this->rows[$id]['locked_until'] ?? 0) >= $now) return 0;
            $this->rows[$id]['lease'] = $lease; $this->rows[$id]['locked_until'] = $until; return 1;
        }
        throw new RuntimeException('Unexpected fixture database query.');
    }
    public function update($table, $values, $where) {
        $row = $this->rows[$where['id']] ?? null;
        if (!$row || (isset($where['lease']) && $row['lease'] !== $where['lease'])) return 0;
        $this->rows[$where['id']] = array_replace($row, $values); return 1;
    }
}
$wpdb = new FixtureDatabase();
foreach (['Domain', 'Store', 'Shopify', 'Worker', 'Plugin'] as $class) require __DIR__ . '/../place-in-thyme-meal-rotation/includes/' . $class . '.php';
$passed = 0;
function test(string $name, callable $test): void {
    global $passed;
    try { $test(); $passed++; echo "PASS $name\n"; }
    catch (Throwable $error) { fwrite(STDERR, "FAIL $name: {$error->getMessage()}\n"); exit(1); }
}
function equal($actual, $expected): void { if ($actual !== $expected) throw new RuntimeException('Unexpected result: ' . json_encode($actual)); }
function rejects(callable $call): void {
    try { $call(); } catch (RuntimeException $error) { return; }
    throw new RuntimeException('Unsafe input was accepted.');
}
function variant(int $id): string { return 'gid://shopify/ProductVariant/' . $id; }
$catalog = [];
$selections = [];
foreach (Domain::WEEKS as $index => $week) {
    $id = variant($index + 1);
    $catalog[$id] = ['type' => 'Meal', 'status' => 'ACTIVE', 'currency' => 'USD', 'available' => true,
        'requiresComponents' => false, 'tags' => [$week], 'price' => (string) (18 + $index) . '.00', 'title' => 'Fixture menu ' . ($index + 1)];
    $selections[$week] = [$id => 7];
}
$approved = Domain::validateSelections($selections, $catalog);

test('independent active-week totals, not $120 flat or three menus combined', function () use ($approved) {
    equal(array_column($approved, 'subtotalCents'), [12600, 13300, 14000]);
});
foreach (['-1.00', '1e3', 'NaN', '01.00', '1.001', '99999999.00', ' 18.00', ''] as $invalid) {
    test('reject invalid money ' . json_encode($invalid), fn() => rejects(fn() => Domain::cents($invalid)));
}
test('money uses integer cents', function () { equal(Domain::cents('19.5'), 1950); equal(Domain::amount(12001), '120.01'); });
test('Pacific Monday rollover during daylight saving', function () {
    equal(Domain::week(new DateTimeImmutable('2026-04-06T06:59:59Z')), 'week-c');
    equal(Domain::week(new DateTimeImmutable('2026-04-06T07:00:00Z')), 'week-a');
});
test('Pacific Monday rollover after daylight saving', function () {
    equal(Domain::week(new DateTimeImmutable('2026-11-02T07:59:59Z')), 'week-c');
    equal(Domain::week(new DateTimeImmutable('2026-11-02T08:00:00Z')), 'week-a');
});
test('calendar handles dates before anchor', fn() => equal(Domain::week(new DateTimeImmutable('2026-03-09T12:00:00Z')), 'week-c'));
test('Friday midnight cutoff does not slip across timezones', function () {
    equal(Domain::firstServiceDate(new DateTimeImmutable('2026-10-10T06:59:59Z'))->format('Y-m-d'), '2026-10-12');
    equal(Domain::firstServiceDate(new DateTimeImmutable('2026-10-10T07:00:00Z'))->format('Y-m-d'), '2026-10-19');
});
test('stored service timestamps preserve Pacific wall time across autumn DST', function () {
    $next = Domain::nextServiceDate(new DateTimeImmutable('2026-10-26T09:00:00-07:00'));
    equal($next->format(DATE_ATOM), '2026-11-02T09:00:00-08:00');
    equal(Domain::serviceCutoff(new DateTimeImmutable('2026-11-09T09:00:00-08:00'))->format(DATE_ATOM), '2026-11-07T00:00:00-08:00');
});
test('stored service timestamps preserve Pacific wall time across spring DST', function () {
    equal(Domain::nextServiceDate(new DateTimeImmutable('2027-03-08T09:00:00-08:00'))->format(DATE_ATOM), '2027-03-15T09:00:00-07:00');
});
test('reject one week below minimum', function () use ($catalog, $selections) {
    $selections['week-b'][variant(2)] = 6;
    rejects(fn() => Domain::validateSelections($selections, $catalog));
});
foreach (['available' => false, 'requiresComponents' => true, 'type' => 'Juice', 'status' => 'DRAFT', 'currency' => 'CAD', 'tags' => ['week-b']] as $field => $bad) {
    test('reject invalid catalog ' . $field, function () use ($catalog, $selections, $field, $bad) {
        $catalog[variant(1)][$field] = $bad; rejects(fn() => Domain::validateSelections($selections, $catalog));
    });
}
foreach ([0, -1, 1.5, '7', 51, PHP_INT_MAX] as $qty) {
    test('reject invalid quantity ' . json_encode($qty), function () use ($catalog, $selections, $qty) {
        $selections['week-a'][variant(1)] = $qty; rejects(fn() => Domain::validateSelections($selections, $catalog));
    });
}
test('price change requires approval', function () use ($approved, $catalog) {
    $catalog[variant(2)]['price'] = '20.00'; rejects(fn() => Domain::validateUnchanged($approved, $catalog));
});
test('unchanged live prices pass', fn() => Domain::validateUnchanged($approved, $catalog));
test('webhooks authenticate raw body, shop, and signature', function () {
    $body = '{"id":123}'; $secret = 'fixture'; $mac = base64_encode(hash_hmac('sha256', $body, $secret, true));
    equal(Domain::validWebhook($body, $mac, Domain::SHOP, $secret), true);
    equal(Domain::validWebhook($body . ' ', $mac, Domain::SHOP, $secret), false);
    equal(Domain::validWebhook($body, $mac, Domain::SHOP . '.evil.test', $secret), false);
    equal(Domain::validWebhook($body, $mac, Domain::SHOP, ''), false);
});
test('OAuth rejects wrong shop, stale timestamp, and tampered code', function () {
    $q = ['shop' => Domain::SHOP, 'code' => 'fixture-code', 'state' => 'fixture-state', 'timestamp' => (string) time()];
    ksort($q); $q['hmac'] = hash_hmac('sha256', http_build_query($q, '', '&', PHP_QUERY_RFC3986), 'fixture');
    equal(Domain::validOauth($q, 'fixture', time()), true);
    equal(Domain::validOauth($q, 'fixture', time() + 301), false);
    $q['code'] = 'changed'; equal(Domain::validOauth($q, 'fixture', time()), false);
});
test('private secrets are encrypted and never stored in plaintext', function () {
    Store::saveSecret('access_token', 'TEST-ONLY-token');
    equal(Store::secret('access_token'), 'TEST-ONLY-token');
    equal(str_contains(get_option('pit_rotation_secret_access_token'), 'TEST-ONLY-token'), false);
});

function contractFor(array $week): array {
    return ['id' => 'gid://shopify/SubscriptionContract/123', 'status' => 'ACTIVE', 'currencyCode' => 'USD', 'revisionId' => '1',
        'nextBillingDate' => gmdate(DATE_ATOM, time() - 10),
        'billingPolicy' => ['interval' => 'WEEK', 'intervalCount' => 1], 'deliveryPolicy' => ['interval' => 'WEEK', 'intervalCount' => 1],
        'deliveryMethod' => ['__typename' => 'SubscriptionDeliveryMethodPickup', 'pickupOption' => [
            'code' => 'pickup', 'location' => ['id' => 'gid://shopify/Location/1']]], 'deliveryPrice' => ['amount' => '0.00', 'currencyCode' => 'USD'],
        'customerPaymentMethod' => ['id' => 'gid://shopify/CustomerPaymentMethod/1'], 'discounts' => ['nodes' => []],
        'lines' => ['nodes' => array_map(fn($l) => ['id' => 'line-' . $l['variantId'], 'variantId' => $l['variantId'], 'quantity' => $l['quantity'],
            'currentPrice' => ['amount' => Domain::amount($l['priceCents']), 'currencyCode' => 'USD'],
            'sellingPlanId' => 'gid://shopify/SellingPlan/1', 'customAttributes' => []], $week['lines']), 'pageInfo' => ['hasNextPage' => false]]];
}
$fixtureContract = contractFor($approved['week-b']);
$calculation = ['__typename' => 'SubscriptionContractCalculationSuccess', 'warnings' => [], 'calculatedContract' => $fixtureContract,
    'projectedOrderTotals' => ['subtotal' => ['amount' => '133.00', 'currencyCode' => 'USD'],
        'totalDelivery' => ['amount' => '0.00', 'currencyCode' => 'USD'], 'totalMerchandiseDiscounts' => ['amount' => '0.00', 'currencyCode' => 'USD']]];
test('calculation must match quantities, unit prices, totals, delivery, and payment', fn() => Domain::assertCalculation($calculation, $approved['week-b'], $fixtureContract));
foreach (['warnings', 'total', 'quantity', 'delivery', 'payment'] as $bad) {
    test('calculation fails closed on ' . $bad, function () use ($calculation, $approved, $fixtureContract, $bad) {
        if ($bad === 'warnings') $calculation['warnings'] = [['code' => 'DELIVERY_CHANGED']];
        if ($bad === 'total') $calculation['projectedOrderTotals']['subtotal']['amount'] = '120.00';
        if ($bad === 'quantity') $calculation['calculatedContract']['lines']['nodes'][0]['quantity'] = 8;
        if ($bad === 'delivery') $calculation['calculatedContract']['deliveryMethod']['__typename'] = 'SubscriptionDeliveryMethodShipping';
        if ($bad === 'payment') $calculation['calculatedContract']['customerPaymentMethod']['id'] = 'changed';
        rejects(fn() => Domain::assertCalculation($calculation, $approved['week-b'], $fixtureContract));
    });
}
test('nationwide shipping cannot renew', function () use ($fixtureContract) {
    $fixtureContract['deliveryMethod']['__typename'] = 'SubscriptionDeliveryMethodShipping'; rejects(fn() => Domain::assertLocal($fixtureContract));
});
test('$15 native local delivery is supported, arbitrary fees are not', function () use ($fixtureContract) {
    $fixtureContract['deliveryMethod']['__typename'] = 'SubscriptionDeliveryMethodLocalDelivery';
    $fixtureContract['deliveryMethod']['address'] = ['address1' => 'Test only', 'address2' => '', 'city' => 'Mission Viejo',
        'zip' => '92691', 'countryCodeV2' => 'US', 'provinceCode' => 'CA'];
    $fixtureContract['deliveryPrice']['amount'] = '15.00'; Domain::assertLocal($fixtureContract);
    $fixtureContract['deliveryPrice']['amount'] = '14.00'; rejects(fn() => Domain::assertLocal($fixtureContract));
});
test('pickup location identity is required', function () use ($fixtureContract) {
    unset($fixtureContract['deliveryMethod']['pickupOption']); rejects(fn() => Domain::assertLocal($fixtureContract));
});
test('calculation rejects changed pickup locations', function () use ($calculation, $approved, $fixtureContract) {
    $calculation['calculatedContract']['deliveryMethod']['pickupOption']['location']['id'] = 'gid://shopify/Location/2';
    rejects(fn() => Domain::assertCalculation($calculation, $approved['week-b'], $fixtureContract));
});
test('delivery identity is a keyed digest, independent of object key ordering', function () use ($fixtureContract) {
    $method = $fixtureContract['deliveryMethod'];
    $digest = Domain::deliveryFingerprint($method, 'test-key');
    equal(strlen($digest), 64);
    equal($digest, Domain::deliveryFingerprint(array_reverse($method, true), 'test-key'));
    equal($digest === Domain::deliveryFingerprint($method, 'different-key'), false);
});

function seed(string $state, array $data): void {
    global $wpdb, $calls, $responses;
    $calls = []; $responses = [];
    $wpdb->rows['fixture'] = ['id' => 'fixture', 'lease' => 'lease', 'state' => $state,
        'contract_id' => 'gid://shopify/SubscriptionContract/123', 'payload' => json_encode($data), 'due_at' => time() - 1];
}
update_option('pit_rotation_launch_verified', true);
update_option('pit_rotation_checkout_verified', true);
update_option('pit_rotation_fulfillment_verified', true);
update_option('pit_rotation_storefront_verified', true);
update_option('pit_rotation_cli_heartbeat', time());
update_option('pit_rotation_webhooks', ['create' => 'fixture', 'update' => 'fixture', 'uninstall' => 'fixture']);
update_option('pit_rotation_plan', ['sellingPlans' => ['nodes' => [['id' => 'gid://shopify/SellingPlan/1']]]]);
$workerData = ['weeks' => $approved, 'nextWeek' => 'week-b', 'serviceDate' => '2099-10-19T09:00:00-07:00', 'cycle' => 1,
    'approvedDeliveryFingerprint' => Domain::deliveryFingerprint($fixtureContract['deliveryMethod'], wp_salt('nonce')),
    'approvedPaymentMethodId' => $fixtureContract['customerPaymentMethod']['id'],
    'calculationId' => 'gid://shopify/SubscriptionContractCalculation/1', 'idempotencyKey' => 'stable-key', 'billingOrigin' => gmdate(DATE_ATOM, time() - 10)];
test('billing OFF means zero network calls', function () use ($workerData) {
    global $calls; seed('billing', $workerData); update_option('pit_rotation_launch_verified', false);
    Worker::step('fixture', 'lease'); equal(count($calls), 0); update_option('pit_rotation_launch_verified', true);
});
foreach (['pit_rotation_checkout_verified', 'pit_rotation_fulfillment_verified', 'pit_rotation_storefront_verified'] as $gate) {
    test('unverified launch gate disables billing: ' . $gate, function () use ($gate, $workerData) {
        global $calls; seed('billing', $workerData); update_option($gate, false);
        Worker::step('fixture', 'lease'); equal(count($calls), 0); update_option($gate, true);
    });
}
test('stale server scheduler disables billing', function () use ($workerData) {
    global $calls; seed('billing', $workerData); update_option('pit_rotation_cli_heartbeat', time() - 601);
    Worker::step('fixture', 'lease'); equal(count($calls), 0); update_option('pit_rotation_cli_heartbeat', time());
});
test('changed payment method does not renew without review', function () use ($workerData, $fixtureContract) {
    global $responses, $calls; seed('billing', $workerData);
    $fixtureContract['customerPaymentMethod']['id'] = 'changed'; $responses = [['subscriptionContract' => $fixtureContract]];
    rejects(fn() => Worker::step('fixture', 'lease')); equal(count($calls), 1);
});
test('ambiguous payment retries use same saved idempotency key', function () use ($workerData, $fixtureContract) {
    global $responses, $calls;
    seed('billing', $workerData);
    $responses = [['subscriptionContract' => $fixtureContract], new RuntimeException('Fixture timeout')];
    rejects(fn() => Worker::step('fixture', 'lease'));
    $responses = [['subscriptionContract' => $fixtureContract], ['subscriptionBillingAttemptCreate' => [
        'subscriptionBillingAttempt' => ['id' => 'attempt-1', 'ready' => false, 'errorCode' => null, 'nextActionUrl' => null, 'order' => null], 'userErrors' => []]]];
    Worker::step('fixture', 'lease');
    equal($calls[1]['variables']['input']['idempotencyKey'], 'stable-key');
    equal($calls[3]['variables']['input']['idempotencyKey'], 'stable-key');
    equal(Store::get('fixture')['data']['nextWeek'], 'week-b');
});
test('failed payment does not advance or create a replacement attempt', function () use ($workerData, $fixtureContract) {
    global $responses, $calls;
    seed('billing', $workerData);
    $responses = [['subscriptionContract' => $fixtureContract], ['subscriptionBillingAttemptCreate' => [
        'subscriptionBillingAttempt' => ['id' => 'attempt-1', 'ready' => true, 'errorCode' => 'PAYMENT_FAILED', 'nextActionUrl' => null, 'order' => null], 'userErrors' => []]]];
    Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'review');
    equal(Store::get('fixture')['data']['nextWeek'], 'week-b'); Worker::step('fixture', 'lease'); equal(count($calls), 2);
});
test('successful billing checkpoints before advancing menu', function () use ($workerData, $fixtureContract) {
    global $responses;
    seed('billing', $workerData);
    $responses = [['subscriptionContract' => $fixtureContract], ['subscriptionBillingAttemptCreate' => [
        'subscriptionBillingAttempt' => ['id' => 'attempt-1', 'ready' => true, 'errorCode' => null, 'nextActionUrl' => null, 'order' => ['id' => 'order-1']], 'userErrors' => []]]];
    Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'finalizing'); equal(Store::get('fixture')['data']['nextWeek'], 'week-b');
    $responses = [['subscriptionContract' => $fixtureContract], ['subscriptionContractSetNextBillingDate' => ['contract' => ['id' => 'contract'], 'userErrors' => []]]];
    Worker::step('fixture', 'lease'); equal(Store::get('fixture')['data']['nextWeek'], 'week-c'); equal(Store::get('fixture')['data']['cycle'], 2);
});
test('paused or cancelled contracts never bill', function () use ($workerData, $fixtureContract) {
    global $responses, $calls;
    seed('billing', $workerData); $fixtureContract['status'] = 'CANCELLED'; $responses = [['subscriptionContract' => $fixtureContract]];
    Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'stopped'); equal(count($calls), 1);
});
test('mixed or externally edited lines are not replaced or billed', function () use ($workerData, $fixtureContract, $approved) {
    global $responses, $calls;
    seed('billing', $workerData); $fixtureContract['lines']['nodes'][] = contractFor($approved['week-c'])['lines']['nodes'][0];
    $responses = [['subscriptionContract' => $fixtureContract]]; rejects(fn() => Worker::step('fixture', 'lease'));
    equal(Store::get('fixture')['state'], 'review'); equal(count($calls), 1);
});
function catalogResponse(array $catalog): array {
    $nodes = [];
    foreach ($catalog as $id => $meal) $nodes[] = ['id' => $id, 'title' => $meal['title'], 'productType' => $meal['type'],
        'status' => $meal['status'], 'tags' => $meal['tags'], 'variants' => ['nodes' => [['id' => $id,
            'price' => $meal['price'], 'availableForSale' => $meal['available'], 'requiresComponents' => false]],
            'pageInfo' => ['hasNextPage' => false]]];
    return ['shop' => ['currencyCode' => 'USD', 'ianaTimezone' => Domain::TIME_ZONE],
        'products' => ['nodes' => $nodes, 'pageInfo' => ['hasNextPage' => false, 'endCursor' => null]]];
}
test('full calculate/commit/bill/finalize path rotates four cycles with exact prices', function () use ($workerData, $approved, $catalog) {
    global $responses, $calls;
    $date = Domain::firstServiceDate(new DateTimeImmutable('now'))->modify('+3 weeks');
    while (Domain::week($date) !== 'week-b') $date = $date->modify('+1 week');
    $workerData['serviceDate'] = $date->format(DATE_ATOM);
    seed('active', $workerData);
    $prior = contractFor($approved['week-a']);
    $charged = []; $keys = [];
    for ($cycle = 1; $cycle <= 4; $cycle++) {
        $weekKey = Store::get('fixture')['data']['nextWeek']; $week = $approved[$weekKey];
        $next = contractFor($week);
        $responses = [['subscriptionContract' => $prior], catalogResponse($catalog),
            ['subscriptionContractUpdateCalculate' => ['subscriptionContractCalculation' => ['id' => 'calculation-' . $cycle], 'userErrors' => []]]];
        Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'calculating');
        $last = $calls[array_key_last($calls)];
        equal($last['variables']['input']['lines'][0]['productVariantLine']['priceOverride']['amount'], Domain::amount($week['lines'][0]['priceCents']));
        $responses = [['subscriptionContract' => $prior], catalogResponse($catalog), ['subscriptionContractCalculation' => [
            '__typename' => 'SubscriptionContractCalculationSuccess', 'warnings' => [], 'calculatedContract' => $next,
            'projectedOrderTotals' => ['subtotal' => ['amount' => Domain::amount($week['subtotalCents']), 'currencyCode' => 'USD'],
                'totalDelivery' => ['amount' => '0.00', 'currencyCode' => 'USD'],
                'totalMerchandiseDiscounts' => ['amount' => '0.00', 'currencyCode' => 'USD']]]]];
        Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'committing');
        $responses = [['subscriptionContract' => $prior], ['subscriptionContractCalculationCommit' => ['contract' => ['id' => 'contract'], 'userErrors' => []]]];
        Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'billing');
        $keys[] = Store::get('fixture')['data']['idempotencyKey'];
        $responses = [['subscriptionContract' => $next], ['subscriptionBillingAttemptCreate' => [
            'subscriptionBillingAttempt' => ['id' => 'attempt-' . $cycle, 'ready' => true, 'errorCode' => null,
                'nextActionUrl' => null, 'order' => ['id' => 'order-' . $cycle]], 'userErrors' => []]]];
        Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'finalizing');
        equal(Store::get('fixture')['data']['nextWeek'], $weekKey);
        $responses = [['subscriptionContract' => $next], ['subscriptionContractSetNextBillingDate' => ['contract' => ['id' => 'contract'], 'userErrors' => []]]];
        Worker::step('fixture', 'lease'); equal(Store::get('fixture')['state'], 'active');
        equal(Store::get('fixture')['data']['cycle'], $cycle + 1);
        $charged[] = $week['subtotalCents']; $prior = $next;
    }
    equal($charged, [13300, 14000, 12600, 13300]); equal(count(array_unique($keys)), 4);
});
test('read-only preview works with billing OFF and creates no saved plan or checkout', function () use ($catalog, $selections, $approved) {
    global $wpdb, $responses, $calls;
    update_option('pit_rotation_connection_verified', time()); update_option('pit_rotation_launch_verified', false);
    $responses = [catalogResponse($catalog)]; $calls = []; $before = count($wpdb->rows);
    $result = Plugin::preview(new WP_REST_Request([], ['selections' => $selections]));
    equal($result->status, 200); equal($result->data['weeks'], $approved); equal($result->data['enrollmentReady'], false);
    equal(count($wpdb->rows), $before); equal(count($calls), 1); equal(str_contains($calls[0]['query'], 'mutation'), false);
    update_option('pit_rotation_launch_verified', true);
});
test('preview rejects a below-minimum week without saving records', function () use ($catalog, $selections) {
    global $wpdb, $responses;
    $selections['week-b'][variant(2)] = 6; $responses = [catalogResponse($catalog)]; $before = count($wpdb->rows);
    $result = Plugin::preview(new WP_REST_Request([], ['selections' => $selections]));
    equal($result->code, 'pit_preview_failed'); equal(count($wpdb->rows), $before);
});
test('preview rejects oversized requests before network access', function () {
    global $calls; $calls = [];
    equal(Plugin::preview(new WP_REST_Request([], [], [], str_repeat(' ', 30001)))->code, 'pit_preview_failed'); equal(count($calls), 0);
});
test('an unverified Shopify connection cannot expose a preview', function () {
    global $calls; $calls = []; update_option('pit_rotation_connection_verified', false);
    equal(Plugin::preview(new WP_REST_Request())->data['status'], 503); equal(count($calls), 0);
    update_option('pit_rotation_connection_verified', time());
});
test('origin check and rate limit apply to storefront requests', function () {
    global $transients; $transients = [];
    equal(Plugin::storefront(new WP_REST_Request([], [], ['origin' => 'https://shop.placeinthyme.com.evil.test']))->data['status'], 403);
    $request = new WP_REST_Request([], [], ['origin' => 'https://shop.placeinthyme.com']);
    for ($i = 0; $i < 20; $i++) equal(Plugin::storefront($request), true);
    equal(Plugin::storefront($request)->data['status'], 429); $transients = [];
});
test('management requires the correct private token and expires only unenrolled quotes', function () use ($workerData) {
    global $wpdb, $transients; $transients = [];
    seed('quoted', $workerData + ['firstWeek' => 'week-a', 'expiresAt' => time() - 1]);
    $wpdb->rows['fixture']['manage_hash'] = hash('sha256', str_repeat('a', 64));
    $request = new WP_REST_Request(['id' => 'fixture'], [], ['origin' => 'https://shop.placeinthyme.com', 'authorization' => 'Bearer ' . str_repeat('a', 64)]);
    equal(Plugin::managePermission($request)->data['status'], 410);
    $wpdb->rows['fixture']['state'] = 'active'; equal(Plugin::managePermission($request), true);
    $request->headers['authorization'] = 'Bearer ' . str_repeat('b', 64);
    equal(Plugin::managePermission($request)->data['status'], 403);
});
test('cancellation requires an explicit action and an enrolled contract', function () use ($workerData) {
    global $wpdb, $calls;
    seed('quoted', $workerData); $wpdb->rows['fixture']['contract_id'] = null;
    equal(Plugin::cancel(new WP_REST_Request(['id' => 'fixture']))->data['status'], 400);
    equal(Plugin::cancel(new WP_REST_Request(['id' => 'fixture'], ['action' => 'cancel']))->data['status'], 409);
    equal(count($calls), 0);
});
test('uncertain cancellation stops billing durably and remains retryable until confirmed', function () use ($workerData) {
    global $responses, $calls;
    seed('active', $workerData);
    $request = new WP_REST_Request(['id' => 'fixture'], ['action' => 'cancel']);
    $responses = [['subscriptionContract' => ['id' => 'gid://shopify/SubscriptionContract/123', 'status' => 'ACTIVE']], new RuntimeException('Fixture Shopify timeout')];
    $result = Plugin::cancel($request);
    equal($result->code, 'pit_cancel_pending'); equal(Store::get('fixture')['state'], 'stopped');
    $managed = Plugin::manage($request)->data;
    equal($managed['cancellationPending'], true); equal($managed['cancellationConfirmed'], false); equal($managed['canCancel'], true);
    Worker::step('fixture', 'lease'); equal(count($calls), 2);
    $responses = [['subscriptionContract' => ['id' => 'gid://shopify/SubscriptionContract/123', 'status' => 'ACTIVE']], ['subscriptionContractCancel' => ['contract' => ['id' => 'gid://shopify/SubscriptionContract/123', 'status' => 'CANCELLED'], 'userErrors' => []]]];
    equal(Plugin::cancel($request)->data['state'], 'cancelled');
    $managed = Plugin::manage($request)->data;
    equal($managed['cancellationPending'], false); equal($managed['cancellationConfirmed'], true); equal($managed['canCancel'], false);
    equal(Plugin::cancel($request)->data['state'], 'cancelled'); equal(count($calls), 4);
});
test('management does not mistake a worker retry timestamp for a billing date', function () use ($workerData) {
    seed('review', $workerData); equal(Plugin::manage(new WP_REST_Request(['id' => 'fixture']))->data['nextBillingDate'], null);
});
test('empty or wrong-contract Shopify cancellation responses do not count as confirmed', function () use ($workerData) {
    global $responses;
    foreach ([null, ['id' => 'wrong-contract', 'status' => 'CANCELLED'], ['id' => 'gid://shopify/SubscriptionContract/123', 'status' => 'ACTIVE']] as $contract) {
        seed('active', $workerData); $responses = [['subscriptionContract' => ['id' => 'gid://shopify/SubscriptionContract/123', 'status' => 'ACTIVE']], ['subscriptionContractCancel' => ['contract' => $contract, 'userErrors' => []]]];
        equal(Plugin::cancel(new WP_REST_Request(['id' => 'fixture'], ['action' => 'cancel']))->code, 'pit_cancel_pending');
        equal(Store::get('fixture')['data']['cancellationPending'], true);
    }
});
test('retrying a remotely completed cancellation requires no second mutation', function () use ($workerData) {
    global $responses, $calls;
    seed('stopped', $workerData + ['cancellationPending' => true]);
    $responses = [['subscriptionContract' => ['id' => 'gid://shopify/SubscriptionContract/123', 'status' => 'CANCELLED']]];
    equal(Plugin::cancel(new WP_REST_Request(['id' => 'fixture'], ['action' => 'cancel']))->data['state'], 'cancelled');
    equal(count($calls), 1); equal(str_contains($calls[0]['query'], 'mutation'), false);
});

echo "\n$passed PHP safety tests passed. No live requests or charges.\n";
