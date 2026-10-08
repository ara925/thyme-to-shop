<?php
declare(strict_types=1);

namespace PlaceInThyme\Rotation;

use DateTimeImmutable;
use RuntimeException;
use Throwable;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class Plugin
{
    public static function activate(): void
    {
        if (!function_exists('openssl_encrypt') || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) {
            wp_die('OpenSSL AES-GCM is required for private credential storage.');
        }
        Store::install();
        if (!wp_next_scheduled('pit_rotation_tick')) wp_schedule_event(time() + 60, 'pit_rotation_minute', 'pit_rotation_tick');
    }

    public static function boot(): void
    {
        add_filter('cron_schedules', static function (array $schedules): array {
            $schedules['pit_rotation_minute'] = ['interval' => 60, 'display' => 'Meal rotation, every minute'];
            return $schedules;
        });
        add_action('pit_rotation_tick', [Worker::class, 'tick']);
        add_action('admin_menu', static function (): void {
            add_menu_page('Meal Rotation', 'Meal Rotation', 'manage_options', 'pit-meal-rotation', [self::class, 'admin'], 'dashicons-carrot', 58);
        });
        add_action('admin_post_pit_rotation_action', [self::class, 'action']);
        add_action('rest_api_init', [self::class, 'routes']);
        add_filter('rest_pre_serve_request', static function (bool $served, $result, WP_REST_Request $request): bool {
            if (str_starts_with($request->get_route(), '/pit-rotation/v1/')) {
                header('Cache-Control: no-store, private');
                header('X-Robots-Tag: noindex, nofollow');
                // WordPress normally reflects arbitrary REST origins. Limit this namespace to our storefront.
                header_remove('Access-Control-Allow-Origin');
                header_remove('Access-Control-Allow-Credentials');
                if (($_SERVER['HTTP_ORIGIN'] ?? '') === 'https://shop.placeinthyme.com') {
                    header('Access-Control-Allow-Origin: https://shop.placeinthyme.com');
                    header('Vary: Origin', false);
                    header('Access-Control-Allow-Headers: Content-Type, Authorization');
                    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
                }
            }
            return $served;
        }, 20, 3);
    }

    private static function adminUrl(): string { return admin_url('admin.php?page=pit-meal-rotation'); }

    public static function action(): void
    {
        if (!current_user_can('manage_options')) wp_die('Administrator access required.', '', ['response' => 403]);
        check_admin_referer('pit_rotation_action');
        $task = sanitize_key($_POST['task'] ?? '');
        try {
            if ($task === 'save') {
                $secret = trim(wp_unslash($_POST['client_secret'] ?? ''));
                if ($secret !== '') {
                    if (!preg_match('/^[a-zA-Z0-9_-]{24,128}$/D', $secret)) throw new RuntimeException('Invalid Shopify client secret format.');
                    Store::saveSecret('client_secret', $secret);
                }
                self::notice('Credentials saved privately. Existing values are never displayed.');
            } elseif ($task === 'connect') {
                if (Store::secret('client_secret') === '') throw new RuntimeException('Save the installed app client secret first.');
                $state = bin2hex(random_bytes(32));
                set_transient('pit_rotation_oauth_' . hash('sha256', $state), get_current_user_id(), 300);
                setcookie('pit_rotation_oauth', $state, ['expires' => time() + 300, 'path' => '/',
                    'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
                $url = 'https://' . Domain::SHOP . '/admin/oauth/authorize?' . http_build_query([
                    'client_id' => Domain::CLIENT_ID, 'scope' => implode(',', Domain::SCOPES),
                    'redirect_uri' => rest_url('pit-rotation/v1/oauth/callback'), 'state' => $state,
                ], '', '&', PHP_QUERY_RFC3986);
                wp_redirect($url, 303); exit;
            } elseif ($task === 'verify') {
                $catalog = Shopify::catalog();
                // A read-only query validates the real contract field selection without creating a contract or order.
                $contracts = Shopify::request('query { subscriptionContracts(first: 1) { nodes { ' . Shopify::CONTRACT_FIELDS . ' originOrder { id displayFinancialStatus } } } }');
                unset($contracts);
                set_transient('pit_rotation_catalog', $catalog, 300);
                update_option('pit_rotation_connection_verified', time(), false);
                self::notice('Shopify connected: live meal prices, Pacific timezone, USD, and owned-contract access verified.');
            } elseif ($task === 'setup') {
                $catalog = Shopify::catalog();
                $plan = Shopify::createPlan();
                if (count($plan['sellingPlans']['nodes'] ?? []) !== 1) throw new RuntimeException('Exactly one owned weekly plan is required.');
                update_option('pit_rotation_plan', $plan, false);
                $hooks = Shopify::registerWebhooks();
                update_option('pit_rotation_webhooks', $hooks, false);
                set_transient('pit_rotation_catalog', $catalog, 300);
                self::notice('Owned weekly plan and signed webhook subscriptions configured. The plan is NOT attached to products; customer enrollment and billing remain off.');
            } elseif ($task === 'simulate') {
                $raw = wp_unslash($_POST['selections'] ?? []);
                $selections = array_fill_keys(Domain::WEEKS, []);
                foreach (Domain::WEEKS as $week) foreach (($raw[$week] ?? []) as $id => $qty) {
                    if (!preg_match('/^[0-9]{1,2}$/D', (string) $qty)) throw new RuntimeException('Use whole meal quantities from 0 to 50.');
                    if ((int) $qty > 0) $selections[$week][$id] = (int) $qty;
                }
                // Keep the user's draft even when live-price/minimum validation fails.
                set_transient('pit_rotation_draft_' . get_current_user_id(), $selections, 1800);
                delete_transient('pit_rotation_preview_' . get_current_user_id());
                $catalog = Shopify::catalog();
                set_transient('pit_rotation_catalog', $catalog, 300);
                $weeks = Domain::validateSelections($selections, $catalog);
                set_transient('pit_rotation_preview_' . get_current_user_id(), $weeks, 1800);
                set_transient('pit_rotation_catalog', $catalog, 300);
                self::notice('Live-price preview passed. Week 1 → Week 2 → Week 3 → Week 1. No checkout, contract change, order, or charge was created.');
            } elseif ($task === 'heartbeat') {
                // Manually testing a heartbeat never enables payment processing.
                if (Worker::enabled()) throw new RuntimeException('Use the server scheduler while live billing is enabled.');
                Worker::tick();
                self::notice('No-charge worker heartbeat completed. This does not prove a traffic-independent server scheduler.');
            } else { throw new RuntimeException('Unknown action.'); }
        } catch (Throwable $error) { self::notice($error->getMessage(), true); }
        wp_safe_redirect(self::adminUrl(), 303); exit;
    }

    private static function notice(string $message, bool $error = false): void
    {
        set_transient('pit_rotation_notice_' . get_current_user_id(), ['message' => $message, 'error' => $error], 120);
    }

    private static function form(string $task, string $label): void
    {
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline-block;margin:0 12px 12px 0">';
        wp_nonce_field('pit_rotation_action');
        echo '<input type="hidden" name="action" value="pit_rotation_action"><input type="hidden" name="task" value="' . esc_attr($task) . '">';
        submit_button($label, 'secondary', 'submit', false);
        echo '</form>';
    }

    public static function admin(): void
    {
        if (!current_user_can('manage_options')) return;
        $notice = get_transient('pit_rotation_notice_' . get_current_user_id());
        if ($notice) {
            echo '<div class="notice ' . ($notice['error'] ? 'notice-error' : 'notice-success') . '"><p>' . esc_html($notice['message']) . '</p></div>';
            delete_transient('pit_rotation_notice_' . get_current_user_id());
        }
        echo '<div class="wrap" style="max-width:1080px"><h1>Place in Thyme · Meal Rotation</h1>';
        echo '<p>Three independent menus · $120 minimum each · actual active-week total · cancel anytime.</p>';
        echo '<div class="notice notice-warning inline"><p><strong>Billing disabled. Customer enrollment disabled.</strong> Setup and previews do not charge customers. Launch requires an eligible payment gateway, verified native local fulfillment, a server scheduler, and a complete checkout/renewal acceptance test.</p></div>';
        echo '<h2>Private Shopify connection</h2><p>Store: <code>' . esc_html(Domain::SHOP) . '</code><br>Installed app client ID: <code>' . esc_html(Domain::CLIENT_ID) . '</code></p>';
        echo '<p>Connection: <strong>' . (get_option('pit_rotation_connection_verified') ? 'Verified with Shopify' : (get_option('pit_rotation_secret_access_token') ? 'Authorized; verify live data next' : 'Not connected')) . '</strong></p>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('pit_rotation_action');
        echo '<input type="hidden" name="action" value="pit_rotation_action"><input type="hidden" name="task" value="save">';
        echo '<label for="pit-client-secret"><strong>Installed app client secret</strong></label><p><input id="pit-client-secret" type="password" name="client_secret" autocomplete="new-password" class="regular-text" value="" aria-describedby="pit-secret-help"></p>';
        echo '<p id="pit-secret-help">' . (get_option('pit_rotation_secret_client_secret') ? 'Saved securely. Leave blank to retain it.' : 'Copy from the approved Partner app. Encrypted in the private WordPress database; never sent to the storefront.') . '</p>';
        submit_button('Save private credentials', 'primary'); echo '</form>';
        self::form('connect', 'Connect approved Shopify app');
        self::form('verify', 'Verify live Shopify connection');
        self::form('setup', 'Configure unpublished plan & signed webhooks');
        self::form('heartbeat', 'Test no-charge worker heartbeat');
        echo '<p>OAuth callback: <code>' . esc_html(rest_url('pit-rotation/v1/oauth/callback')) . '</code><br>Webhook: <code>' . esc_html(rest_url('pit-rotation/v1/webhook')) . '</code></p>';
        $plan = get_option('pit_rotation_plan', []);
        echo '<h2>Launch safety</h2><table class="widefat striped"><tbody>';
        foreach ([
            'Private credentials' => get_option('pit_rotation_secret_client_secret') ? 'Saved encrypted; not displayed' : 'Pending',
            'Shopify owned-contract access' => get_option('pit_rotation_connection_verified') ? 'Verified' : 'Pending',
            'Owned weekly selling plan' => $plan ? ($plan['name'] . ' — unpublished to products') : 'Pending',
            'Signed Shopify webhooks' => get_option('pit_rotation_webhooks') ? 'Registered' : 'Pending',
            'Worker heartbeat' => get_option('pit_rotation_heartbeat') ? gmdate('Y-m-d H:i:s', (int) get_option('pit_rotation_heartbeat')) . ' UTC' : 'Pending',
            'Traffic-independent server scheduler' => get_option('pit_rotation_cli_heartbeat') ?
                'Server-process heartbeat: ' . gmdate('Y-m-d H:i:s', (int) get_option('pit_rotation_cli_heartbeat')) . ' UTC' : 'Not observed yet',
            'Paid checkout and recurring-payment acceptance' => 'Not accepted — current store checkout is disabled',
            'Customer enrollment and automatic billing' => Worker::enabled() ? 'Server-enabled; launch acceptance required' : 'OFF',
        ] as $label => $value) echo '<tr><th scope="row">' . esc_html($label) . '</th><td>' . esc_html($value) . '</td></tr>';
        echo '</tbody></table><h2>No-charge preview with live meals</h2><p>Select quantities for each menu. Every menu must meet $120; the preview charges nothing.</p>';
        $catalog = get_transient('pit_rotation_catalog');
        if ($catalog) {
            echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">'; wp_nonce_field('pit_rotation_action');
            echo '<input type="hidden" name="action" value="pit_rotation_action"><input type="hidden" name="task" value="simulate">';
            $preview = get_transient('pit_rotation_preview_' . get_current_user_id());
            $draft = get_transient('pit_rotation_draft_' . get_current_user_id());
            foreach (Domain::WEEKS as $index => $week) {
                echo '<h3>Week ' . ($index + 1) . '</h3><table class="widefat striped"><thead><tr><th>Meal</th><th>Live unit price</th><th>Quantity</th></tr></thead><tbody>';
                foreach ($catalog as $id => $meal) {
                    if (!in_array($week, $meal['tags'], true)) continue;
                    $qty = (int) ($draft[$week][$id] ?? 0);
                    if (!$draft) foreach (($preview[$week]['lines'] ?? []) as $line) if ($line['variantId'] === $id) $qty = $line['quantity'];
                    $field = 'selections[' . $week . '][' . $id . ']';
                    echo '<tr><td>' . esc_html($meal['title']) . (!$meal['available'] ? ' (unavailable)' : '') . '</td><td>$' . esc_html($meal['price']) . '</td><td><label class="screen-reader-text" for="qty-' . esc_attr($week . '-' . substr($id, strrpos($id, '/') + 1)) . '">Quantity of ' . esc_html($meal['title']) . ' for Week ' . ($index + 1) . '</label>';
                    echo '<input id="qty-' . esc_attr($week . '-' . substr($id, strrpos($id, '/') + 1)) . '" name="' . esc_attr($field) . '" type="number" min="0" max="50" step="1" value="' . $qty . '" style="width:80px"' . (!$meal['available'] ? ' disabled' : '') . '></td></tr>';
                }
                echo '</tbody></table>';
            }
            submit_button('Preview four weeks — no charges'); echo '</form>';
            if ($preview) {
                echo '<h2>Verified preview · no charges</h2><table class="widefat striped"><thead><tr><th>Cycle</th><th>Active menu</th><th>Meal subtotal only</th><th>Selected meals</th></tr></thead><tbody>';
                for ($cycle = 0; $cycle < 4; $cycle++) {
                    $week = Domain::WEEKS[$cycle % 3];
                    echo '<tr><td>' . ($cycle + 1) . '</td><td>Week ' . (($cycle % 3) + 1) . '</td><td>$' . esc_html(Domain::amount($preview[$week]['subtotalCents'])) . '</td><td>';
                    echo esc_html(implode('; ', array_map(static fn(array $line): string => $line['quantity'] . ' × ' . $line['title'], $preview[$week]['lines']))) . '</td></tr>';
                }
                echo '</tbody></table><p>Tax and native local-delivery fees are separate. Only the active menu is included in each cycle.</p>';
            }
        } else echo '<p>Verify the Shopify connection to load the live menus.</p>';
        echo '</div>';
    }

    public static function routes(): void
    {
        register_rest_route('pit-rotation/v1', '/oauth/callback', ['methods' => 'GET', 'callback' => [self::class, 'callback'], 'permission_callback' => '__return_true']);
        register_rest_route('pit-rotation/v1', '/webhook', ['methods' => 'POST', 'callback' => [self::class, 'webhook'], 'permission_callback' => '__return_true']);
        register_rest_route('pit-rotation/v1', '/health', ['methods' => 'GET', 'callback' => static fn(): WP_REST_Response => new WP_REST_Response([
            'version' => '0.1.2', 'enrollmentReady' => Worker::enabled(), 'billingEnabled' => Worker::enabled(),
            'minimumCents' => Domain::MINIMUM, 'currencyCode' => 'USD', 'timeZone' => Domain::TIME_ZONE,
        ]), 'permission_callback' => '__return_true']);
        register_rest_route('pit-rotation/v1', '/quote', ['methods' => 'POST', 'callback' => [self::class, 'quote'], 'permission_callback' => [self::class, 'storefront']]);
        register_rest_route('pit-rotation/v1', '/manage/(?P<id>[a-f0-9]{48})', [
            ['methods' => 'GET', 'callback' => [self::class, 'manage'], 'permission_callback' => [self::class, 'managePermission']],
            ['methods' => 'POST', 'callback' => [self::class, 'cancel'], 'permission_callback' => [self::class, 'managePermission']],
        ]);
    }

    public static function callback(WP_REST_Request $request)
    {
        try {
            $query = $request->get_query_params();
            $state = $query['state'] ?? '';
            $cookie = $_COOKIE['pit_rotation_oauth'] ?? '';
            $key = 'pit_rotation_oauth_' . hash('sha256', $state);
            if (!$state || !$cookie || !hash_equals($cookie, $state) || !get_transient($key)
                || !Domain::validOauth($query, Store::secret('client_secret'), time()) || empty($query['code'])) {
                throw new RuntimeException('Shopify callback could not be verified. Start the connection again from WordPress.');
            }
            delete_transient($key);
            setcookie('pit_rotation_oauth', '', ['expires' => time() - 3600, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
            Shopify::tokenExchange(['code' => $query['code'], 'expiring' => 1]);
            return new WP_REST_Response(null, 303, ['Location' => self::adminUrl(), 'Cache-Control' => 'no-store']);
        } catch (Throwable $error) { return new WP_Error('pit_oauth_failed', $error->getMessage(), ['status' => 400]); }
    }

    public static function webhook(WP_REST_Request $request)
    {
        try {
            if (strlen($request->get_body()) > 1000000 || !Domain::validWebhook($request->get_body(),
                $request->get_header('x-shopify-hmac-sha256'), $request->get_header('x-shopify-shop-domain'), Store::secret('client_secret'))) {
                return new WP_Error('pit_invalid_webhook', 'Invalid webhook signature.', ['status' => 401]);
            }
            $topic = $request->get_header('x-shopify-topic');
            if ($topic === 'app/uninstalled') {
                foreach (['access_token', 'refresh_token'] as $name) delete_option('pit_rotation_secret_' . $name);
                delete_option('pit_rotation_connection_verified');
                update_option('pit_rotation_launch_verified', false, false);
                return new WP_REST_Response(['received' => true]);
            }
            if (!in_array($topic, ['subscription_contracts/create', 'subscription_contracts/update'], true)) {
                return new WP_Error('pit_invalid_topic', 'Unsupported webhook topic.', ['status' => 400]);
            }
            $body = json_decode($request->get_body(), true, 32, JSON_THROW_ON_ERROR);
            $resourceId = $body['admin_graphql_api_id'] ?? ('gid://shopify/SubscriptionContract/' . ($body['id'] ?? ''));
            $eventId = $request->get_header('x-shopify-webhook-id');
            if (!preg_match('~^gid://shopify/SubscriptionContract/[0-9]+$~D', $resourceId)
                || !preg_match('/^[a-zA-Z0-9-]{16,64}$/D', $eventId)) throw new RuntimeException('Invalid webhook IDs.');
            Store::enqueue($eventId, $topic, $resourceId);
            return new WP_REST_Response(['received' => true]);
        } catch (Throwable $error) { return new WP_Error('pit_webhook_failed', 'Webhook could not be safely saved.', ['status' => 503]); }
    }

    public static function storefront(WP_REST_Request $request)
    {
        if ($request->get_header('origin') !== 'https://shop.placeinthyme.com') return new WP_Error('pit_origin', 'Use the Place in Thyme shop.', ['status' => 403]);
        $key = 'pit_rate_' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . wp_salt('nonce'));
        $count = (int) get_transient($key);
        if ($count >= 20) return new WP_Error('pit_rate', 'Please wait a minute and try again.', ['status' => 429]);
        set_transient($key, $count + 1, 60);
        return true;
    }

    public static function quote(WP_REST_Request $request)
    {
        if (!Worker::enabled()) return new WP_Error('pit_not_ready', 'Automatic enrollment is not live yet. Your selections are preserved; contact the team for setup.', ['status' => 503]);
        try {
            if (strlen($request->get_body()) > 30000) throw new RuntimeException('Meal selections are too large.');
            $weeks = Domain::validateSelections($request->get_json_params()['selections'] ?? [], Shopify::catalog());
            $firstDate = Domain::firstServiceDate(new DateTimeImmutable('now'));
            $firstWeek = Domain::week($firstDate);
            $planId = get_option('pit_rotation_plan', [])['sellingPlans']['nodes'][0]['id'] ?? '';
            if (!$planId) throw new RuntimeException('Owned selling plan is unavailable.');
            $token = bin2hex(random_bytes(32));
            $id = Store::create(['weeks' => $weeks, 'firstWeek' => $firstWeek, 'serviceDate' => $firstDate->format(DATE_ATOM)], $token);
            return new WP_REST_Response(['id' => $id, 'manageToken' => $token, 'firstWeek' => $firstWeek,
                'firstServiceDate' => $firstDate->format('Y-m-d'), 'weeks' => $weeks, 'sellingPlanId' => $planId,
                'expiresAt' => gmdate(DATE_ATOM, time() + 1800)], 201);
        } catch (Throwable $error) { return new WP_Error('pit_quote_failed', $error->getMessage(), ['status' => 422]); }
    }

    public static function managePermission(WP_REST_Request $request)
    {
        $allowed = self::storefront($request);
        if (is_wp_error($allowed)) return $allowed;
        $token = preg_replace('/^Bearer /', '', $request->get_header('authorization'));
        $row = Store::get($request['id']);
        if (!preg_match('/^[a-f0-9]{64}$/D', $token) || !$row || !hash_equals($row['manage_hash'], hash('sha256', $token))) {
            return new WP_Error('pit_manage_denied', 'Invalid private meal-plan link.', ['status' => 403]);
        }
        return true;
    }

    public static function manage(WP_REST_Request $request): WP_REST_Response
    {
        $row = Store::get($request['id']);
        return new WP_REST_Response(['state' => $row['state'], 'weeks' => $row['data']['weeks'],
            'nextWeek' => $row['data']['nextWeek'] ?? $row['data']['firstWeek'],
            'serviceDate' => $row['data']['serviceDate'], 'canCancel' => !empty($row['contract_id']) && $row['state'] !== 'stopped']);
    }

    public static function cancel(WP_REST_Request $request)
    {
        $id = $request['id'];
        $lease = Store::claim($id);
        if (!$lease) return new WP_Error('pit_busy', 'A renewal is in progress. Please retry shortly or contact the team.', ['status' => 409]);
        try {
            $row = Store::get($id);
            // Stop local billing BEFORE the remote cancel; retry is safe if Shopify times out.
            Store::update($id, ['state' => 'stopped'], $lease);
            if ($row['contract_id']) Shopify::cancel($row['contract_id']);
            return new WP_REST_Response(['state' => 'cancelled']);
        } catch (Throwable $error) { return new WP_Error('pit_cancel_pending', 'Renewals are stopped locally. Shopify cancellation confirmation is pending; retry or contact the team.', ['status' => 503]); }
        finally { Store::unlock($id, $lease); }
    }
}
