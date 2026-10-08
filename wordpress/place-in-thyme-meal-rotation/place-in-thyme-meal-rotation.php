<?php
/**
 * Plugin Name: Place in Thyme Meal Rotation
 * Description: Private Shopify connection and durable three-menu meal rotation. Billing disabled until launch acceptance.
 * Version: 0.1.2
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Author: Place in Thyme
 */
declare(strict_types=1);

if (!defined('ABSPATH')) exit;

foreach (['Domain', 'Store', 'Shopify', 'Worker', 'Plugin'] as $class) require_once __DIR__ . '/includes/' . $class . '.php';

register_activation_hook(__FILE__, [PlaceInThyme\Rotation\Plugin::class, 'activate']);
register_deactivation_hook(__FILE__, static function (): void {
    wp_clear_scheduled_hook('pit_rotation_tick');
    // Preserve all plans, credentials, and contracts. Never cancel or delete customer records on update/deactivation.
});
PlaceInThyme\Rotation\Plugin::boot();
