<?php
declare(strict_types=1);

namespace PlaceInThyme\Rotation;

use DateTimeImmutable;
use DateTimeZone;
use RuntimeException;

/** Pure, independently tested rules. No WordPress or Shopify side effects. */
final class Domain
{
    public const SHOP = 'thyme-time-store-brreo.myshopify.com';
    public const CLIENT_ID = '7d9a72b3188adb3a745370a1768b751d';
    public const WEEKS = ['week-a', 'week-b', 'week-c'];
    public const MINIMUM = 12000;
    public const TIME_ZONE = 'America/Los_Angeles';
    public const SCOPES = ['write_products', 'write_purchase_options', 'write_own_subscription_contracts'];

    public static function cents(string $amount): int
    {
        if (!preg_match('/^(0|[1-9][0-9]{0,6})(?:\.([0-9]{1,2}))?$/D', $amount, $matches)) {
            throw new RuntimeException('Invalid USD amount.');
        }
        return ((int) $matches[1]) * 100 + (int) str_pad($matches[2] ?? '', 2, '0');
    }

    public static function amount(int $cents): string
    {
        if ($cents < 0) throw new RuntimeException('Invalid price.');
        return intdiv($cents, 100) . '.' . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    public static function week(DateTimeImmutable $date): string
    {
        $local = $date->setTimezone(new DateTimeZone(self::TIME_ZONE));
        // Calendar days, not elapsed hours: DST must not shift the Monday boundary.
        $day = new DateTimeImmutable($local->format('Y-m-d'), new DateTimeZone('UTC'));
        $anchor = new DateTimeImmutable('2026-03-16', new DateTimeZone('UTC'));
        $weeks = (int) floor(($day->getTimestamp() - $anchor->getTimestamp()) / 604800);
        return self::WEEKS[(($weeks % 3) + 3) % 3];
    }

    public static function firstServiceDate(DateTimeImmutable $now): DateTimeImmutable
    {
        $local = $now->setTimezone(new DateTimeZone(self::TIME_ZONE));
        $monday = $local->modify('monday this week')->setTime(9, 0)->modify('+1 week');
        $cutoff = $monday->modify('-2 days')->setTime(0, 0); // Saturday 00:00 = Friday midnight.
        if ($local >= $cutoff) $monday = $monday->modify('+1 week');
        return $monday;
    }

    public static function nextServiceDate(DateTimeImmutable $date): DateTimeImmutable
    {
        // Saved ISO timestamps contain an offset, not an IANA zone. Restore the zone before advancing.
        return $date->setTimezone(new DateTimeZone(self::TIME_ZONE))->modify('+1 week');
    }

    public static function serviceCutoff(DateTimeImmutable $date): DateTimeImmutable
    {
        return $date->setTimezone(new DateTimeZone(self::TIME_ZONE))->modify('-2 days')->setTime(0, 0);
    }

    public static function validOauth(array $query, string $secret, int $now): bool
    {
        if (($query['shop'] ?? '') !== self::SHOP || !isset($query['hmac'], $query['timestamp'])) return false;
        if (abs($now - (int) $query['timestamp']) > 300) return false;
        $provided = $query['hmac'];
        unset($query['hmac'], $query['signature']);
        foreach ($query as $value) if (!is_string($value)) return false;
        ksort($query);
        $message = http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        return is_string($provided) && hash_equals(hash_hmac('sha256', $message, $secret), $provided);
    }

    public static function validWebhook(string $body, string $hmac, string $shop, string $secret): bool
    {
        return $secret !== '' && $shop === self::SHOP
            && hash_equals(base64_encode(hash_hmac('sha256', $body, $secret, true)), $hmac);
    }

    /** Catalog is live server data indexed by variant ID. Client totals are never trusted. */
    public static function validateSelections(array $selections, array $catalog): array
    {
        if (count($selections) !== 3 || array_diff(array_keys($selections), self::WEEKS)) {
            throw new RuntimeException('Choose meals for all three menus.');
        }
        $result = [];
        foreach (self::WEEKS as $week) {
            $items = $selections[$week] ?? null;
            if (!is_array($items) || !$items || count($items) > 50) throw new RuntimeException('Every menu needs meals.');
            $total = 0;
            $lines = [];
            foreach ($items as $variantId => $quantity) {
                if (!is_string($variantId) || !preg_match('~^gid://shopify/ProductVariant/[0-9]+$~D', $variantId)
                    || !is_int($quantity) || $quantity < 1 || $quantity > 50) {
                    throw new RuntimeException('Invalid meal quantity or variant.');
                }
                $meal = $catalog[$variantId] ?? null;
                if (!$meal || $meal['type'] !== 'Meal' || $meal['status'] !== 'ACTIVE'
                    || $meal['currency'] !== 'USD' || !$meal['available'] || $meal['requiresComponents']
                    || !in_array($week, $meal['tags'], true)) {
                    throw new RuntimeException('A meal is unavailable or belongs to another menu.');
                }
                $price = self::cents($meal['price']);
                if ($price <= 0) throw new RuntimeException('A meal has an invalid price.');
                $total += $quantity * $price;
                $lines[] = ['variantId' => $variantId, 'quantity' => $quantity,
                    'priceCents' => $price, 'title' => $meal['title']];
            }
            if ($total < self::MINIMUM || $total > 1000000) throw new RuntimeException('Each menu must be at least $120 (maximum $10,000).');
            $result[$week] = ['subtotalCents' => $total, 'lines' => $lines];
        }
        return $result;
    }

    public static function validateUnchanged(array $approved, array $catalog): void
    {
        $selections = [];
        foreach (self::WEEKS as $week) {
            foreach ($approved[$week]['lines'] as $line) {
                $selections[$week][$line['variantId']] = $line['quantity'];
            }
        }
        $live = self::validateSelections($selections, $catalog);
        foreach (self::WEEKS as $week) {
            foreach ($live[$week]['lines'] as $index => $line) {
                if ($line['priceCents'] !== $approved[$week]['lines'][$index]['priceCents']) {
                    throw new RuntimeException('A meal price changed. Customer approval is required before billing.');
                }
            }
        }
    }

    public static function matchLines(array $expected, array $actual): bool
    {
        $normalize = static function (array $lines): array {
            $map = [];
            foreach ($lines as $line) {
                $id = $line['variantId'] ?? '';
                if (!$id || isset($map[$id]) || !isset($line['currentPrice'])
                    || $line['currentPrice']['currencyCode'] !== 'USD') return [];
                $map[$id] = [(int) $line['quantity'], self::cents($line['currentPrice']['amount'])];
            }
            ksort($map);
            return $map;
        };
        $wanted = [];
        foreach ($expected as $line) $wanted[] = ['variantId' => $line['variantId'], 'quantity' => $line['quantity'],
            'currentPrice' => ['amount' => self::amount($line['priceCents']), 'currencyCode' => 'USD']];
        return $expected !== [] && $normalize($wanted) === $normalize($actual);
    }

    public static function assertLocal(array $contract): void
    {
        $kind = $contract['deliveryMethod']['__typename'] ?? '';
        $fee = $contract['deliveryPrice'] ?? [];
        if (($fee['currencyCode'] ?? '') !== 'USD') throw new RuntimeException('Delivery currency is not USD.');
        $expected = ['SubscriptionDeliveryMethodPickup' => 0, 'SubscriptionDeliveryMethodLocalDelivery' => 1500];
        if (!isset($expected[$kind]) || self::cents($fee['amount']) !== $expected[$kind]) {
            throw new RuntimeException('Only free pickup or $15 Shopify local delivery is supported.');
        }
        $method = $contract['deliveryMethod'];
        if ($kind === 'SubscriptionDeliveryMethodPickup') {
            if (!preg_match('~^gid://shopify/Location/[0-9]+$~D', $method['pickupOption']['location']['id'] ?? '')) {
                throw new RuntimeException('Native pickup location must be identifiable.');
            }
        } else {
            $address = $method['address'] ?? [];
            if (($address['countryCodeV2'] ?? '') !== 'US' || ($address['provinceCode'] ?? '') !== 'CA'
                || empty($address['address1']) || empty($address['city'])
                || !preg_match('/^[0-9]{5}(?:-[0-9]{4})?$/D', $address['zip'] ?? '')) {
                throw new RuntimeException('Native local-delivery address must be in California. Orange County eligibility must also be verified in Shopify.');
            }
        }
        foreach (['billingPolicy', 'deliveryPolicy'] as $key) {
            if (($contract[$key]['interval'] ?? '') !== 'WEEK' || ($contract[$key]['intervalCount'] ?? 0) !== 1) {
                throw new RuntimeException('Contract must bill and deliver every week.');
            }
        }
    }

    /** Persist only a keyed identity digest, never a plaintext customer delivery address. */
    public static function deliveryFingerprint(array $method, string $key): string
    {
        $sort = static function (array $value) use (&$sort): array {
            ksort($value);
            foreach ($value as &$item) if (is_array($item)) $item = $sort($item);
            return $value;
        };
        return hash_hmac('sha256', json_encode($sort($method), JSON_THROW_ON_ERROR), $key);
    }

    public static function assertCalculation(array $calculation, array $week, array $contract): void
    {
        if (($calculation['__typename'] ?? '') !== 'SubscriptionContractCalculationSuccess'
            || !empty($calculation['warnings'])) throw new RuntimeException('Contract calculation needs review.');
        $snapshot = $calculation['calculatedContract'] ?? [];
        self::assertLocal($snapshot);
        if (($snapshot['currencyCode'] ?? '') !== 'USD' || !empty($snapshot['discounts']['nodes'])
            || !self::matchLines($week['lines'], $snapshot['lines']['nodes'] ?? [])
            || !empty($snapshot['lines']['pageInfo']['hasNextPage'])
            || ($snapshot['deliveryMethod'] ?? null) !== ($contract['deliveryMethod'] ?? null)
            || ($snapshot['customerPaymentMethod']['id'] ?? null) !== ($contract['customerPaymentMethod']['id'] ?? null)) {
            throw new RuntimeException('Calculated meals, prices, delivery, or payment method do not match the approved plan.');
        }
        $totals = $calculation['projectedOrderTotals'] ?? [];
        foreach (['subtotal' => $week['subtotalCents'], 'totalDelivery' => self::cents($contract['deliveryPrice']['amount']),
            'totalMerchandiseDiscounts' => 0] as $key => $expected) {
            if (($totals[$key]['currencyCode'] ?? '') !== 'USD' || self::cents($totals[$key]['amount']) !== $expected) {
                throw new RuntimeException('Projected totals do not match the approved weekly total.');
            }
        }
    }
}
