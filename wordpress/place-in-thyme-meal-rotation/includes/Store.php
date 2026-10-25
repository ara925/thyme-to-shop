<?php
declare(strict_types=1);

namespace PlaceInThyme\Rotation;

use RuntimeException;

final class Store
{
    public static function install(): void
    {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $collation = $wpdb->get_charset_collate();
        dbDelta('CREATE TABLE ' . $wpdb->prefix . "pit_rotations (
            id varchar(64) NOT NULL,
            contract_id varchar(128) DEFAULT NULL,
            manage_hash varchar(64) NOT NULL,
            state varchar(32) NOT NULL,
            payload longtext NOT NULL,
            due_at bigint unsigned NOT NULL DEFAULT 0,
            locked_until bigint unsigned NOT NULL DEFAULT 0,
            lease varchar(64) NOT NULL DEFAULT '',
            created_at bigint unsigned NOT NULL,
            updated_at bigint unsigned NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY contract_id (contract_id),
            KEY work (state,due_at)
        ) $collation;");
        dbDelta('CREATE TABLE ' . $wpdb->prefix . "pit_rotation_events (
            id varchar(64) NOT NULL,
            topic varchar(64) NOT NULL,
            resource_id varchar(128) NOT NULL,
            state varchar(16) NOT NULL DEFAULT 'pending',
            created_at bigint unsigned NOT NULL,
            PRIMARY KEY  (id),
            KEY work (state,created_at)
        ) $collation;");
        update_option('pit_rotation_schema', 1, false);
    }

    public static function saveSecret(string $name, string $value): void
    {
        $iv = random_bytes(12);
        $key = hash('sha256', wp_salt('auth') . '|pit-rotation-secrets-v1', true);
        $cipher = openssl_encrypt($value, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) throw new RuntimeException('Private credential encryption failed.');
        update_option('pit_rotation_secret_' . $name, base64_encode($iv . $tag . $cipher), false);
    }

    public static function secret(string $name): string
    {
        $encoded = get_option('pit_rotation_secret_' . $name, '');
        if (!$encoded) return '';
        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 28) throw new RuntimeException('Private credential storage is invalid.');
        $key = hash('sha256', wp_salt('auth') . '|pit-rotation-secrets-v1', true);
        $value = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        if ($value === false) throw new RuntimeException('Private credential decryption failed. Reconnect after changing WordPress salts.');
        return $value;
    }

    public static function lease(string $name, int $seconds): ?string
    {
        global $wpdb;
        $option = 'pit_rotation_lock_' . $name;
        $token = bin2hex(random_bytes(16));
        $value = (time() + $seconds) . ':' . $token;
        if (add_option($option, $value, '', false)) return $value;
        $old = get_option($option, '');
        if ((int) explode(':', $old)[0] >= time()) return null;
        // Compare-and-swap: never remove another worker's lease.
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name=%s AND option_value=%s", $option, $old));
        wp_cache_delete($option, 'options');
        return add_option($option, $value, '', false) ? $value : null;
    }

    public static function release(string $name, string $lease): void
    {
        global $wpdb;
        $option = 'pit_rotation_lock_' . $name;
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name=%s AND option_value=%s", $option, $lease));
        wp_cache_delete($option, 'options');
    }

    public static function create(array $payload, string $manageToken): string
    {
        global $wpdb;
        $id = bin2hex(random_bytes(24));
        if (!$wpdb->insert($wpdb->prefix . 'pit_rotations', [
            'id' => $id, 'manage_hash' => hash('sha256', $manageToken), 'state' => 'quoted',
            'payload' => wp_json_encode($payload), 'created_at' => time(), 'updated_at' => time(),
        ])) throw new RuntimeException('The meal plan could not be saved. No checkout was created.');
        return $id;
    }

    public static function get(string $id): ?array
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . $wpdb->prefix . 'pit_rotations WHERE id=%s', $id), ARRAY_A);
        if (!$row) return null;
        $row['data'] = json_decode($row['payload'], true, 64, JSON_THROW_ON_ERROR);
        return $row;
    }

    public static function update(string $id, array $columns, ?string $lease = null): void
    {
        global $wpdb;
        if (isset($columns['data'])) {
            $columns['payload'] = wp_json_encode($columns['data']);
            unset($columns['data']);
        }
        $columns['updated_at'] = time();
        $where = ['id' => $id];
        if ($lease !== null) $where['lease'] = $lease;
        $changed = $wpdb->update($wpdb->prefix . 'pit_rotations', $columns, $where);
        if ($changed === false || ($lease !== null && $changed === 0 && (self::get($id)['lease'] ?? '') !== $lease)) {
            throw new RuntimeException('Durable meal-plan update failed. Billing is stopped.');
        }
    }

    public static function claim(string $id): ?string
    {
        global $wpdb;
        $lease = bin2hex(random_bytes(16));
        $changed = $wpdb->query($wpdb->prepare('UPDATE ' . $wpdb->prefix . 'pit_rotations SET lease=%s, locked_until=%d
            WHERE id=%s AND locked_until<%d', $lease, time() + 180, $id, time()));
        return $changed === 1 ? $lease : null;
    }

    public static function unlock(string $id, string $lease): void
    {
        self::update($id, ['locked_until' => 0, 'lease' => ''], $lease);
    }

    public static function enqueue(string $id, string $topic, string $resourceId): void
    {
        global $wpdb;
        $result = $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . $wpdb->prefix . 'pit_rotation_events
            (id,topic,resource_id,created_at) VALUES (%s,%s,%s,%d)', $id, $topic, $resourceId, time()));
        if ($result === false) throw new RuntimeException('Webhook could not be saved. Shopify should retry delivery.');
    }
}
