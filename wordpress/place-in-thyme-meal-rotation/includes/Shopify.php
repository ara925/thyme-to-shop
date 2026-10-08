<?php
declare(strict_types=1);

namespace PlaceInThyme\Rotation;

use RuntimeException;

final class Shopify
{
    public const VERSION = '2026-10';
    public const GROUP_NAME = 'Three-Week Meal Rotation - $120 Each Week';
    public const DELIVERY_FIELDS = '__typename
        ... on SubscriptionDeliveryMethodLocalDelivery {
            address { address1 address2 city zip countryCodeV2 provinceCode }
            localDeliveryOption { code }
        }
        ... on SubscriptionDeliveryMethodPickup { pickupOption { code location { id } } }';
    public const CONTRACT_FIELDS = 'id status currencyCode nextBillingDate revisionId
        billingPolicy { interval intervalCount } deliveryPolicy { interval intervalCount }
        deliveryMethod { ' . self::DELIVERY_FIELDS . ' } deliveryPrice { amount currencyCode }
        customerPaymentMethod { id }
        lines(first: 100) { nodes { id variantId quantity sellingPlanId currentPrice { amount currencyCode }
            customAttributes { key value } } pageInfo { hasNextPage } }
        discounts(first: 1) { nodes { id } }';
    public const SNAPSHOT_FIELDS = 'currencyCode
        billingPolicy { interval intervalCount } deliveryPolicy { interval intervalCount }
        deliveryMethod { ' . self::DELIVERY_FIELDS . ' } deliveryPrice { amount currencyCode }
        customerPaymentMethod { id }
        lines(first: 100) { nodes { id variantId quantity sellingPlanId currentPrice { amount currencyCode }
            customAttributes { key value } } pageInfo { hasNextPage } }
        discounts(first: 1) { nodes { id } }';

    private static function http(string $path, array $body, ?string $token = null): array
    {
        $headers = ['Content-Type' => 'application/json', 'Accept' => 'application/json'];
        if ($token !== null) $headers['X-Shopify-Access-Token'] = $token;
        $response = wp_remote_post('https://' . Domain::SHOP . $path, [
            'headers' => $headers, 'body' => wp_json_encode($body), 'timeout' => 15,
            'redirection' => 0, 'sslverify' => true, 'limit_response_size' => 2000000,
        ]);
        if (is_wp_error($response)) throw new RuntimeException('Shopify did not respond. Retry safely; no credential values are logged.');
        $status = wp_remote_retrieve_response_code($response);
        $json = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($json)) {
            throw new RuntimeException('Shopify request failed (HTTP ' . $status . ').');
        }
        return $json;
    }

    public static function tokenExchange(array $input): array
    {
        $response = self::http('/admin/oauth/access_token', $input + [
            'client_id' => Domain::CLIENT_ID, 'client_secret' => Store::secret('client_secret'),
        ]);
        $scopes = explode(',', $response['scope'] ?? '');
        if (!is_string($response['access_token'] ?? null) || array_diff(Domain::SCOPES, $scopes)) {
            throw new RuntimeException('Shopify did not grant the approved meal-rotation permissions.');
        }
        Store::saveSecret('access_token', $response['access_token']);
        if (!empty($response['refresh_token'])) Store::saveSecret('refresh_token', $response['refresh_token']);
        update_option('pit_rotation_token_expires', isset($response['expires_in']) ? time() + (int) $response['expires_in'] : 0, false);
        update_option('pit_rotation_scopes', $scopes, false);
        return $scopes;
    }

    private static function token(): string
    {
        $token = Store::secret('access_token');
        if ($token === '') throw new RuntimeException('Connect the approved Shopify app first.');
        $expires = (int) get_option('pit_rotation_token_expires', 0);
        if ($expires && $expires < time() + 120) {
            $refresh = Store::secret('refresh_token');
            if (!$refresh) throw new RuntimeException('Shopify authorization expired. Reconnect the app.');
            $lease = Store::lease('token-refresh', 60);
            if (!$lease) throw new RuntimeException('Shopify authorization is refreshing. Retry shortly.');
            try {
                // Re-read under the lock to avoid concurrent refresh token rotation.
                if ((int) get_option('pit_rotation_token_expires', 0) < time() + 120) {
                    self::tokenExchange(['grant_type' => 'refresh_token', 'refresh_token' => Store::secret('refresh_token')]);
                }
                $token = Store::secret('access_token');
            } finally { Store::release('token-refresh', $lease); }
        }
        return $token;
    }

    public static function request(string $query, array $variables = []): array
    {
        $response = self::http('/admin/api/' . self::VERSION . '/graphql.json', [
            'query' => $query, 'variables' => (object) $variables,
        ], self::token());
        if (!empty($response['errors']) || !isset($response['data'])) {
            // Messages can contain private data; only retain error codes in server diagnostics.
            $codes = array_map(static fn(array $error): string => $error['extensions']['code'] ?? 'GRAPHQL_ERROR', $response['errors'] ?? []);
            throw new RuntimeException('Shopify API rejected the request: ' . implode(', ', array_unique($codes)) . '.');
        }
        return $response['data'];
    }

    public static function mutation(string $query, array $variables, string $key): array
    {
        $data = self::request($query, $variables)[$key] ?? [];
        if (!$data || !empty($data['userErrors'])) {
            $codes = array_map(static fn(array $error): string => $error['code'] ?? implode('.', $error['field'] ?? []), $data['userErrors'] ?? []);
            throw new RuntimeException('Shopify could not apply ' . $key . ': ' . implode(', ', $codes) . '.');
        }
        return $data;
    }

    public static function catalog(): array
    {
        $catalog = [];
        $after = null;
        do {
            $data = self::request('query Meals($after: String) { shop { currencyCode ianaTimezone }
                products(first: 50, after: $after, query: "product_type:Meal AND status:active") {
                nodes { id title productType status tags variants(first: 100) {
                    nodes { id price availableForSale requiresComponents } pageInfo { hasNextPage } } }
                pageInfo { hasNextPage endCursor } } }', ['after' => $after]);
            if ($data['shop']['currencyCode'] !== 'USD' || $data['shop']['ianaTimezone'] !== Domain::TIME_ZONE) {
                throw new RuntimeException('Shopify must use USD and the approved Pacific store timezone.');
            }
            foreach ($data['products']['nodes'] as $product) {
                if ($product['variants']['pageInfo']['hasNextPage']) throw new RuntimeException('Meal variant pagination needs review.');
                foreach ($product['variants']['nodes'] as $variant) {
                    $catalog[$variant['id']] = ['productId' => $product['id'], 'title' => $product['title'],
                        'type' => $product['productType'], 'status' => $product['status'], 'tags' => $product['tags'],
                        'currency' => $data['shop']['currencyCode'], 'price' => $variant['price'],
                        'available' => $variant['availableForSale'], 'requiresComponents' => $variant['requiresComponents']];
                }
            }
            $after = $data['products']['pageInfo']['endCursor'];
            if (count($catalog) > 500) throw new RuntimeException('Meal catalog is larger than the approved safety limit.');
        } while ($data['products']['pageInfo']['hasNextPage']);
        return $catalog;
    }

    public static function createPlan(): array
    {
        // Discover our own code before creating. A timeout must not create duplicate plans on retry.
        $groups = self::request('query { sellingPlanGroups(first: 100) { nodes { id appId merchantCode name
            sellingPlans(first: 10) { nodes { id name } } } pageInfo { hasNextPage } } }')['sellingPlanGroups'];
        $matches = array_values(array_filter($groups['nodes'], static fn(array $g): bool => $g['merchantCode'] === 'pit-three-week-rotation-v1'));
        if (count($matches) > 1 || $groups['pageInfo']['hasNextPage']) throw new RuntimeException('Selling-plan ownership needs review.');
        if ($matches) return $matches[0];
        $input = ['name' => self::GROUP_NAME, 'merchantCode' => 'pit-three-week-rotation-v1',
            'options' => ['Delivery every'], 'position' => 1, 'sellingPlansToCreate' => [[
                'name' => 'Meal rotation, delivery every week', 'options' => ['1 week'], 'category' => 'SUBSCRIPTION',
                'billingPolicy' => ['recurring' => ['interval' => 'WEEK', 'intervalCount' => 1, 'minCycles' => 1]],
                'deliveryPolicy' => ['recurring' => ['interval' => 'WEEK', 'intervalCount' => 1]],
                'pricingPolicies' => [['fixed' => ['adjustmentType' => 'PERCENTAGE', 'adjustmentValue' => ['percentage' => 0]]]],
            ]]];
        return self::mutation('mutation Plan($input: SellingPlanGroupInput!) {
            sellingPlanGroupCreate(input: $input) { sellingPlanGroup { id name merchantCode appId sellingPlans(first: 10) { nodes { id name } } }
                userErrors { field message code } } }', ['input' => $input], 'sellingPlanGroupCreate')['sellingPlanGroup'];
    }

    public static function registerWebhooks(): array
    {
        $existing = self::request('query { webhookSubscriptions(first: 100) { nodes { id topic uri } pageInfo { hasNextPage } } }')['webhookSubscriptions'];
        if ($existing['pageInfo']['hasNextPage']) throw new RuntimeException('Webhook pagination needs review.');
        $ids = [];
        $uri = rest_url('pit-rotation/v1/webhook');
        foreach (['SUBSCRIPTION_CONTRACTS_CREATE', 'SUBSCRIPTION_CONTRACTS_UPDATE', 'APP_UNINSTALLED'] as $topic) {
            $found = array_values(array_filter($existing['nodes'], static fn(array $hook): bool => $hook['topic'] === $topic && $hook['uri'] === $uri));
            $ids[$topic] = $found ? $found[0]['id'] : self::mutation('mutation Hook($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
                webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) { webhookSubscription { id } userErrors { field message } } }',
                ['topic' => $topic, 'input' => ['uri' => $uri, 'format' => 'JSON']], 'webhookSubscriptionCreate')['webhookSubscription']['id'];
        }
        return $ids;
    }

    public static function contract(string $id): array
    {
        $result = self::request('query Contract($id: ID!) { subscriptionContract(id: $id) { ' . self::CONTRACT_FIELDS . '
            originOrder { id displayFinancialStatus } } }', ['id' => $id])['subscriptionContract'];
        if (!$result) throw new RuntimeException('Owned subscription contract not found.');
        return $result;
    }

    public static function calculate(string $id, array $week, string $intentId): string
    {
        $plan = get_option('pit_rotation_plan', []);
        $lines = array_map(static fn(array $line): array => ['productVariantLine' => [
            'productVariantId' => $line['variantId'], 'quantity' => $line['quantity'],
            'priceOverride' => ['amount' => Domain::amount($line['priceCents']), 'currencyCode' => 'USD'],
            'originSellingPlanId' => $plan['sellingPlans']['nodes'][0]['id'],
            'customAttributes' => [['key' => '_pit_rotation_id', 'value' => $intentId]], 'discounts' => [],
        ]], $week['lines']);
        return self::mutation('mutation Calculate($id: ID!, $input: SubscriptionContractCalculationContractUpdateInput!) {
            subscriptionContractUpdateCalculate(contractId: $id, contractUpdateInput: $input) {
                subscriptionContractCalculation {
                    ... on SubscriptionContractCalculationPending { id }
                    ... on SubscriptionContractCalculationSuccess { id }
                    ... on SubscriptionContractCalculationFailure { id }
                }
                userErrors { field message code } } }', ['id' => $id, 'input' => [
                    'withMerchandiseCustomizations' => false, 'lines' => $lines,
                ]], 'subscriptionContractUpdateCalculate')['subscriptionContractCalculation']['id'];
    }

    public static function calculation(string $id): array
    {
        return self::request('query Calculation($id: ID!) { subscriptionContractCalculation(id: $id) { __typename
            ... on SubscriptionContractCalculationPending { id }
            ... on SubscriptionContractCalculationFailure { id }
            ... on SubscriptionContractCalculationSuccess { id warnings { code message }
                calculatedContract { ' . self::SNAPSHOT_FIELDS . ' }
                projectedOrderTotals { subtotal { amount currencyCode } totalDelivery { amount currencyCode }
                    totalMerchandiseDiscounts { amount currencyCode } totalTax { amount currencyCode } } } } }', ['id' => $id])['subscriptionContractCalculation'] ?? [];
    }

    public static function commit(string $id): void
    {
        self::mutation('mutation Commit($id: ID!) { subscriptionContractCalculationCommit(id: $id) {
            contract { ... on SubscriptionContract { id status } } userErrors { field message code } } }', ['id' => $id], 'subscriptionContractCalculationCommit');
    }

    public static function attempt(string $contractId, string $key, string $origin): array
    {
        return self::mutation('mutation Bill($id: ID!, $input: SubscriptionBillingAttemptInput!) {
            subscriptionBillingAttemptCreate(subscriptionContractId: $id, subscriptionBillingAttemptInput: $input) {
                subscriptionBillingAttempt { id ready errorCode nextActionUrl order { id } }
                userErrors { field message code } } }', ['id' => $contractId, 'input' => [
                    'idempotencyKey' => $key, 'originTime' => $origin,
                    'paymentProcessingPolicy' => 'FAIL_UNLESS_VALID_PAYMENT_METHOD',
                ]], 'subscriptionBillingAttemptCreate')['subscriptionBillingAttempt'];
    }

    public static function pollAttempt(string $id): array
    {
        return self::request('query Attempt($id: ID!) { subscriptionBillingAttempt(id: $id) {
            id ready errorCode nextActionUrl order { id } } }', ['id' => $id])['subscriptionBillingAttempt'] ?? [];
    }

    public static function nextDate(string $id, string $date): void
    {
        self::mutation('mutation Next($id: ID!, $date: DateTime!) { subscriptionContractSetNextBillingDate(contractId: $id, date: $date) {
            contract { id nextBillingDate } userErrors { field message } } }', ['id' => $id, 'date' => $date], 'subscriptionContractSetNextBillingDate');
    }

    public static function cancel(string $id): void
    {
        self::mutation('mutation Cancel($id: ID!) { subscriptionContractCancel(subscriptionContractId: $id, actor: CUSTOMER) {
            contract { id status } userErrors { field message code } } }', ['id' => $id], 'subscriptionContractCancel');
    }
}
