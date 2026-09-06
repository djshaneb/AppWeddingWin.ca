<?php
// QR Bingo Scanner for Brilliant Directories
// This code checks if user is logged in and has proper subscription

if (!function_exists('ww_qr_bingo_runtime_config')) {
    function ww_qr_bingo_is_positive_json_integer($value) {
        return is_int($value) && $value > 0;
    }
    function ww_qr_bingo_is_event_key($value) {
        return is_string($value)
            && preg_match('/^[a-z0-9][a-z0-9-]{0,79}$/D', $value) === 1;
    }
    function ww_qr_bingo_is_weddingwin_https_url($value) {
        if (!is_string($value) || strlen($value) < 12 || strlen($value) > 500) { return false; }
        if (!filter_var($value, FILTER_VALIDATE_URL)) { return false; }
        $parts = parse_url($value);
        if (!is_array($parts)) { return false; }
        $scheme = isset($parts['scheme']) ? strtolower((string)$parts['scheme']) : '';
        $host = isset($parts['host']) ? strtolower(rtrim((string)$parts['host'], '.')) : '';
        $port = isset($parts['port']) ? (int)$parts['port'] : 443;
        return $scheme === 'https'
            && ($host === 'weddingwin.ca' || $host === 'www.weddingwin.ca')
            && $port === 443
            && !isset($parts['user'])
            && !isset($parts['pass'])
            && !isset($parts['fragment']);
    }
    function ww_qr_bingo_is_rfc3339_timestamp($value) {
        if (!is_string($value) || strlen($value) > 40) { return false; }
        $matches = array();
        if (preg_match(
            '/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:[.]([0-9]{1,6}))?(Z|[+-]([0-9]{2}):([0-9]{2}))$/D',
            $value,
            $matches
        ) !== 1) {
            return false;
        }
        $offsetHour = isset($matches[9]) && $matches[9] !== '' ? (int)$matches[9] : 0;
        $offsetMinute = isset($matches[10]) && $matches[10] !== '' ? (int)$matches[10] : 0;
        return checkdate((int)$matches[2], (int)$matches[3], (int)$matches[1])
            && (int)$matches[4] <= 23
            && (int)$matches[5] <= 59
            && (int)$matches[6] <= 59
            && $offsetHour <= 14
            && $offsetMinute <= 59
            && ($offsetHour !== 14 || $offsetMinute === 0)
            && strtotime($value) !== false;
    }
    function ww_qr_bingo_runtime_config() {
        $url = 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin?action=public_config';
        $body = '';
        $status = 0;
        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($curl, CURLOPT_FOLLOWLOCATION, false);
            curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 3);
            curl_setopt($curl, CURLOPT_TIMEOUT, 6);
            curl_setopt($curl, CURLOPT_HTTPHEADER, array('Accept: application/json'));
            $body = (string)curl_exec($curl);
            $status = intval(curl_getinfo($curl, CURLINFO_HTTP_CODE));
            curl_close($curl);
        }
        if ($status !== 200 || !$body) { return null; }
        $decoded = json_decode($body, true);
        $config = is_array($decoded) && isset($decoded['event_config']) && is_array($decoded['event_config'])
            ? $decoded['event_config']
            : null;
        if (!$config) { return null; }
        $tagId = isset($config['vendor_tag_id']) ? $config['vendor_tag_id'] : null;
        $revision = isset($config['revision']) ? $config['revision'] : null;
        $eventKey = isset($config['event_key']) ? $config['event_key'] : null;
        $historyTimestamp = isset($config['history_starts_at']) && ww_qr_bingo_is_rfc3339_timestamp($config['history_starts_at'])
            ? strtotime($config['history_starts_at'])
            : false;
        $entryClosesTimestamp = isset($config['entry_closes_at']) && ww_qr_bingo_is_rfc3339_timestamp($config['entry_closes_at'])
            ? strtotime($config['entry_closes_at'])
            : false;
        $eventName = isset($config['event_name']) && is_string($config['event_name'])
            ? trim($config['event_name'])
            : '';
        $officialRulesUrl = isset($config['official_rules_url']) ? $config['official_rules_url'] : null;
        $rulesVersion = isset($config['rules_version']) && is_string($config['rules_version'])
            ? trim($config['rules_version'])
            : '';
        $emailDeliveryMode = isset($config['email_delivery_mode']) && is_string($config['email_delivery_mode'])
            ? $config['email_delivery_mode']
            : '';
        if (!ww_qr_bingo_is_positive_json_integer($tagId)
            || !ww_qr_bingo_is_positive_json_integer($revision)
            || !ww_qr_bingo_is_event_key($eventKey)
            || $historyTimestamp === false
            || $entryClosesTimestamp === false
            || !$eventName
            || strlen($eventName) > 160
            || strip_tags($eventName) !== $eventName
            || !isset($config['scan_enabled'])
            || !is_bool($config['scan_enabled'])
            || !isset($config['vendor_draws_enabled'])
            || !is_bool($config['vendor_draws_enabled'])
            || !isset($config['send_vendor_email'])
            || !is_bool($config['send_vendor_email'])
            || !isset($config['send_couple_email'])
            || !is_bool($config['send_couple_email'])
            || preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/D', $rulesVersion) !== 1
            || ($emailDeliveryMode !== 'disabled' && $emailDeliveryMode !== 'production_verified_fulfillment')
            || !ww_qr_bingo_is_weddingwin_https_url($officialRulesUrl)) {
            return null;
        }
        $config['event_key'] = $eventKey;
        $config['vendor_tag_id'] = $tagId;
        $config['revision'] = $revision;
        $config['event_name'] = $eventName;
        $config['rules_version'] = $rulesVersion;
        $config['history_starts_at_sql'] = date('Y-m-d H:i:s', $historyTimestamp);
        $config['history_starts_at_unix'] = $historyTimestamp;
        $config['entry_closes_at_unix'] = $entryClosesTimestamp;
        return $config;
    }
}

if (!function_exists('ww_qr_bingo_vendor_draw_request')) {
    function ww_qrb_secure_hex($bytes) {
        if (function_exists('random_bytes')) {
            try { return bin2hex(random_bytes($bytes)); } catch (Exception $e) { return ''; }
        }
        if (function_exists('openssl_random_pseudo_bytes')) {
            $strong = false; $value = openssl_random_pseudo_bytes($bytes, $strong);
            if ($strong && is_string($value) && strlen($value) === $bytes) return bin2hex($value);
        }
        return '';
    }
    function ww_qrb_request_error($status, $message) {
        return array('status_code' => $status, 'body' => array('ok' => false, 'error' => $message));
    }
    function ww_qr_bingo_vendor_draw_request($action, $payload) {
        global $w;
        // A website couple is authenticated only by BD's current member session.
        if (!user::isUserLogged($_COOKIE) || !isset($_COOKIE['userid']) || !is_string($_COOKIE['userid'])
            || !ctype_digit($_COOKIE['userid']) || (int)$_COOKIE['userid'] < 1) {
            return ww_qrb_request_error(401, 'Sign in again before reviewing a vendor draw.');
        }
        $member = getUser($_COOKIE['userid'], $w);
        if (!is_array($member) || !isset($member['user_id'], $member['subscription_id'])
            || (string)$member['user_id'] !== (string)$_COOKIE['userid']
            || !in_array((string)$member['subscription_id'], array('4', '18'), true)) {
            return ww_qrb_request_error(403, 'Sign in with a couple account to use QR Bingo.');
        }
        if (!in_array($action, array('fixture_context', 'scan', 'raffle_offer', 'raffle_opt_in'), true)) {
            return ww_qrb_request_error(400, 'This couple action is not available.');
        }
        if ($action !== 'fixture_context') {
            $saved = isset($_SESSION['ww_qr_couple_website_csrf']) ? $_SESSION['ww_qr_couple_website_csrf'] : null;
            if (!isset($_SERVER['REQUEST_METHOD'], $_SERVER['HTTP_ORIGIN']) || $_SERVER['REQUEST_METHOD'] !== 'POST'
                || $_SERVER['HTTP_ORIGIN'] !== 'https://www.weddingwin.ca' || !is_array($saved)
                || !isset($saved['member_id'], $saved['token'], $_POST['qr_csrf'])
                || $saved['member_id'] !== (string)$member['user_id']
                || !is_string($_POST['qr_csrf']) || !is_string($saved['token'])
                || strlen($saved['token']) !== 64 || !hash_equals($saved['token'], $_POST['qr_csrf'])) {
                return ww_qrb_request_error(403, 'Refresh QR Bingo before continuing.');
            }
        }
        if (!function_exists('curl_init') || !function_exists('hash_hmac') || !isset($w['database'])) {
            return ww_qrb_request_error(503, 'Website sign-in verification is temporarily unavailable.');
        }
        $secret = '';
        $secretRows = mysql($w['database'], 'SELECT secret_text FROM ww_qr_bingo_admin_credentials WHERE active = 1 LIMIT 20');
        if ($secretRows) {
            while ($row = mysql_fetch_assoc($secretRows)) {
                $candidate = is_array($row) && isset($row['secret_text']) && is_string($row['secret_text']) ? $row['secret_text'] : '';
                if (strlen($candidate) >= 32 && strlen($candidate) <= 4096 && strpos($candidate, chr(0)) === false) {
                    $secret = $candidate; break;
                }
            }
        }
        unset($candidate, $row);
        if ($secret === '') return ww_qrb_request_error(503, 'Website sign-in verification is temporarily unavailable.');
        $requestBody = is_array($payload) ? $payload : array();
        foreach (array('native_session', 'website_member_id', 'website_session_token', 'user_id', 'userid', 'token', 'cookie') as $forbidden) {
            if (array_key_exists($forbidden, $requestBody)) return ww_qrb_request_error(400, 'An unsupported identity was provided.');
        }
        $memberId = (string)$member['user_id'];
        $requestBody['action'] = (string)$action;
        $requestBody['website_member_id'] = $memberId;
        $requestBody['client_platform'] = 'website';
        // Existing canonical token is used only for server-to-server BD history
        // transport. Website proof is the sole authentication; never cache or emit it.
        $transportToken = isset($member['token']) && is_string($member['token']) ? $member['token'] : '';
        if (strlen($transportToken) >= 16 && strlen($transportToken) <= 512) {
            $requestBody['website_session_token'] = $transportToken;
        }
        unset($member, $transportToken);
        $rawBody = json_encode($requestBody);
        if (!is_string($rawBody) || json_last_error() !== JSON_ERROR_NONE || strlen($rawBody) > 131072) {
            return ww_qrb_request_error(400, 'The request could not be prepared.');
        }
        $scope = 'weddingwin:qr-bingo:couple-website:v1';
        $expires = (string)(time() + 30);
        $nonce = ww_qrb_secure_hex(16);
        if (strlen($nonce) !== 32) return ww_qrb_request_error(503, 'Website sign-in verification is temporarily unavailable.');
        $bodyHash = hash('sha256', $rawBody);
        $key = hash_hmac('sha256', 'weddingwin:qr-bingo:website-key:v1', $secret);
        $signature = hash_hmac('sha256', implode(chr(10), array($scope, $memberId, $action, $expires, $nonce, $bodyHash)), $key);
        unset($secret, $key, $requestBody);
        $responseBody = ''; $tooLarge = false;
        $curl = curl_init('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-vendor-sync');
        if ($curl === false) return ww_qrb_request_error(503, 'Vendor draw tools are temporarily unavailable.');
        curl_setopt_array($curl, array(
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $rawBody,
            CURLOPT_HTTPHEADER => array('Accept: application/json', 'Content-Type: application/json',
                'x-ww-website-scope: ' . $scope, 'x-ww-website-member: ' . $memberId,
                'x-ww-website-expires: ' . $expires, 'x-ww-website-nonce: ' . $nonce,
                'x-ww-website-body-sha256: ' . $bodyHash, 'x-ww-website-signature: ' . $signature),
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
            CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_RETURNTRANSFER => false, CURLOPT_HEADER => false,
            CURLOPT_WRITEFUNCTION => function($handle, $chunk) use (&$responseBody, &$tooLarge) {
                if (strlen($responseBody) + strlen($chunk) > 4194304) { $tooLarge = true; return 0; }
                $responseBody .= $chunk; return strlen($chunk);
            }
        ));
        $transportOk = curl_exec($curl);
        $statusCode = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        unset($signature, $rawBody);
        $decoded = json_decode($responseBody, true);
        if ($transportOk === false || $tooLarge || $statusCode < 200 || $statusCode >= 600
            || !is_array($decoded) || !isset($decoded['ok']) || !is_bool($decoded['ok'])) {
            return ww_qrb_request_error(502, 'Vendor draw tools returned an unreadable response.');
        }
        return array('status_code' => $statusCode, 'body' => $decoded);
    }
}

if (!function_exists('ww_qr_bingo_contact_profile')) {
    function ww_qr_bingo_contact_profile($user) {
        $firstName = isset($user['first_name']) ? trim((string)$user['first_name']) : '';
        $lastName = isset($user['last_name']) ? trim((string)$user['last_name']) : '';
        $name = trim($firstName . ' ' . $lastName);
        $normalizedName = strtolower($name);
        $email = isset($user['email']) ? strtolower(trim((string)$user['email'])) : '';
        $phone = '';
        foreach (array('phone_number', 'phone', 'phone2', 'mobile_phone') as $phoneField) {
            if (isset($user[$phoneField]) && trim((string)$user[$phoneField]) !== '') {
                $phone = trim((string)$user[$phoneField]);
                break;
            }
        }
        $phoneDigits = preg_replace('/[^0-9]/', '', $phone);
        $missing = array();
        if ($name === '' || in_array($normalizedName, array('couple', 'weddingwin', 'weddingwin couple'), true)) {
            $missing[] = 'name';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $missing[] = 'email';
        }
        if (strlen($phoneDigits) < 7 || strlen($phoneDigits) > 15) {
            $missing[] = 'phone number';
        }
        return array(
            'complete' => count($missing) === 0,
            'missing_fields' => $missing,
            'profile_edit_url' => '/account/contact'
        );
    }
}

if (!function_exists('ww_qr_bingo_fixture_context')) {
    function ww_qr_bingo_fixture_context($response) {
        if (!is_array($response)
            || !isset($response['status_code'])
            || (int)$response['status_code'] !== 200
            || !isset($response['body'])
            || !is_array($response['body'])) {
            return null;
        }
        $body = $response['body'];
        $appReviewFixture = isset($body['app_review_fixture']) && $body['app_review_fixture'] === true;
        $emailTestFixture = isset($body['email_test_fixture']) && $body['email_test_fixture'] === true;
        if (!isset($body['ok']) || $body['ok'] !== true || $appReviewFixture === $emailTestFixture) {
            return null;
        }
        if (!isset($body['vendors']) || !is_array($body['vendors']) || count($body['vendors']) !== 1) {
            return null;
        }
        $vendor = $body['vendors'][0];
        if (!is_array($vendor)) { return null; }
        $vendorId = isset($vendor['id']) && is_string($vendor['id']) ? trim($vendor['id']) : '';
        $vendorUserId = isset($vendor['user_id']) && is_string($vendor['user_id']) ? trim($vendor['user_id']) : '';
        $vendorName = isset($vendor['name']) && is_string($vendor['name']) ? trim($vendor['name']) : '';
        if (!$vendorId
            || strlen($vendorId) > 20
            || preg_match('/^[1-9][0-9]{0,19}$/D', $vendorId) !== 1
            || !hash_equals($vendorId, $vendorUserId)
            || !$vendorName
            || strlen($vendorName) > 160
            || strip_tags($vendorName) !== $vendorName
            || preg_match('/[[:cntrl:]]/u', $vendorName) !== 0) {
            return null;
        }
        if (!isset($body['scanned']) || !is_array($body['scanned']) || count($body['scanned']) > 1) {
            return null;
        }
        $scanned = array();
        foreach ($body['scanned'] as $scannedVendorId) {
            if (!is_string($scannedVendorId) || !hash_equals($vendorId, $scannedVendorId)) {
                return null;
            }
            // Do not use the numeric vendor ID as a PHP array key: PHP coerces
            // numeric-string keys to integers, which breaks strict JS Set
            // comparisons against the string IDs in VENDORS.
            $scanned[] = $scannedVendorId;
        }
        $scannedCount = count($scanned);
        if (!isset($body['total_count'])
            || !is_int($body['total_count'])
            || $body['total_count'] !== 1
            || !isset($body['scanned_count'])
            || !is_int($body['scanned_count'])
            || $body['scanned_count'] !== $scannedCount
            || !isset($body['completed'])
            || !is_bool($body['completed'])
            || $body['completed'] !== ($scannedCount === 1)) {
            return null;
        }
        return array(
            'app_review_fixture' => $appReviewFixture,
            'email_test_fixture' => $emailTestFixture,
            'vendor' => array(
                'id' => $vendorId,
                'user_id' => $vendorUserId,
                'name' => $vendorName
            ),
            'scanned' => $scanned,
            'completed' => $body['completed']
        );
    }
}

// Check if user is logged in
if (user::isUserLogged($_COOKIE) && isset($_COOKIE['userid']) && is_string($_COOKIE['userid'])
    && ctype_digit($_COOKIE['userid']) && (int)$_COOKIE['userid'] > 0) {
    $loggedInUser = getUser($_COOKIE['userid'], $w);
    if (!is_array($loggedInUser) || !isset($loggedInUser['user_id'])
        || (string)$loggedInUser['user_id'] !== (string)$_COOKIE['userid']) {
        http_response_code(401); echo '<p>Sign in again to use QR Bingo.</p>'; return;
    }
    $userId = (string)$loggedInUser['user_id'];
    $qrWebsiteCsrf = '';
    if (function_exists('session_status')) {
        if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }
    } elseif (session_id() === '') { @session_start(); }
    if (session_id() !== '' && function_exists('hash_equals')) {
        if (!isset($_SESSION['ww_qr_couple_website_csrf']) || !is_array($_SESSION['ww_qr_couple_website_csrf'])
            || !isset($_SESSION['ww_qr_couple_website_csrf']['member_id'], $_SESSION['ww_qr_couple_website_csrf']['token'])
            || $_SESSION['ww_qr_couple_website_csrf']['member_id'] !== $userId
            || !is_string($_SESSION['ww_qr_couple_website_csrf']['token'])
            || !ctype_xdigit($_SESSION['ww_qr_couple_website_csrf']['token'])
            || strlen($_SESSION['ww_qr_couple_website_csrf']['token']) !== 64) {
            $_SESSION['ww_qr_couple_website_csrf'] = array('member_id' => $userId, 'token' => ww_qrb_secure_hex(32));
        }
        $qrWebsiteCsrf = (string)$_SESSION['ww_qr_couple_website_csrf']['token'];
    }
    if (strlen($qrWebsiteCsrf) !== 64) {
        http_response_code(503); echo '<p>A secure QR Bingo session is unavailable. Please refresh.</p>'; return;
    }
    if (!headers_sent()) {
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
    }
    // Release the PHP lock before read-only fixture/Edge calls; the scoped
    // CSRF remains in this request's session snapshot.
    if (function_exists('session_write_close')) { session_write_close(); }

    // The website and native app consume this same published, versioned event
    // configuration. Fail closed rather than silently reverting to an old tag.
    $eventConfig = ww_qr_bingo_runtime_config();
    if (!$eventConfig) {
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            http_response_code(503);
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(array('status' => 'error', 'message' => 'QR Bingo configuration is temporarily unavailable.'));
            exit();
        }
        echo '<div class="alert alert-warning" role="alert">QR Bingo is temporarily unavailable while its event settings are refreshed.</div>';
        return;
    }
    $eventTagId = intval($eventConfig['vendor_tag_id']);
    // Production progress and draw eligibility count only scans recorded during
    // the published wedding-show window.
    // Isolated review fixtures keep their separate service-side scan history.
    $eventHistoryStartsAt = (string)$eventConfig['history_starts_at_sql'];
    $eventScanClosesAt = date(
        'Y-m-d H:i:s',
        intval($eventConfig['entry_closes_at_unix'])
    );
    $eventName = $eventConfig['event_name'];
    $eventConfigRevision = intval($eventConfig['revision']);
    $officialRulesUrl = $eventConfig['official_rules_url'];
    $participationNoticeVersion = (string)$eventConfig['rules_version'] . '|2026-09-04-pre-scan-draw-consent';
    $rulesNoticeStorageKey = 'wwQrRulesNotice:' . hash(
        'sha256',
        'couple|' . (string)$userId . '|' . $eventConfig['event_key'] . '|' . $participationNoticeVersion
    );
    // Immutable mapping from the original active tag-27 roster order. Accept
    // legacy codes only for vendors in the current published event tag.
    $legacyNws25ByBdUserId = [
        '16849' => '002',
        '27768' => '009',
        '29211' => '010',
        '29215' => '011',
        '31521' => '013',
        '38085' => '026',
        '38117' => '030',
        '38118' => '031',
        '38140' => '032',
        '38290' => '039',
        '38519' => '066'
    ];
    $isCoupleScannerMember = ($loggedInUser['subscription_id'] == 4 || $loggedInUser['subscription_id'] == 18);
    $qrContactProfile = ww_qr_bingo_contact_profile($loggedInUser);
    $qrContactComplete = !empty($qrContactProfile['complete']);
    $qrContactMissingLabel = implode(', ', $qrContactProfile['missing_fields']);

    // Scan history is restricted to couple memberships. Vendor draw lookup uses
    // the BD API/tag fallback and does not depend on this presentation page.
    if ($isCoupleScannerMember) {
        // Fixture couples are detected only through the authenticated shared
        // Edge contract. A normal account receives both fixture flags as false
        // and therefore stays on the existing active-tag production path.
        $fixtureProbeResponse = ww_qr_bingo_vendor_draw_request(
            'fixture_context',
            array()
        );
        $fixtureContext = ww_qr_bingo_fixture_context($fixtureProbeResponse);
        $productionScanWindowOpensAt = intval($eventConfig['history_starts_at_unix']);
        $productionScanWindowClosesAt = intval($eventConfig['entry_closes_at_unix']);
        $showScanWindowOpen = !empty($fixtureContext)
            || ($productionScanWindowClosesAt > 0
                && time() >= $productionScanWindowOpensAt
                && time() < $productionScanWindowClosesAt);

        // Handle AJAX requests for scanning vendors
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
            header('Content-Type: application/json');
            if (!isset($_SERVER['HTTP_ORIGIN']) || $_SERVER['HTTP_ORIGIN'] !== 'https://www.weddingwin.ca'
                || !isset($_POST['qr_csrf']) || !is_string($_POST['qr_csrf']) || !hash_equals($qrWebsiteCsrf, $_POST['qr_csrf'])) {
                http_response_code(403);
                echo json_encode(array('ok' => false, 'status' => 'error', 'error' => 'Refresh QR Bingo before continuing.',
                    'message' => 'Refresh QR Bingo before continuing.'));
                exit();
            }

            $expectedEventKey = isset($_POST['expected_event_key']) && is_string($_POST['expected_event_key'])
                ? $_POST['expected_event_key']
                : '';
            $expectedRevision = isset($_POST['expected_config_revision']) && is_string($_POST['expected_config_revision'])
                ? $_POST['expected_config_revision']
                : '';
            if (!hash_equals((string)$eventConfig['event_key'], $expectedEventKey)
                || !preg_match('/^[1-9][0-9]{0,17}$/D', $expectedRevision)
                || (int)$expectedRevision !== $eventConfigRevision) {
                http_response_code(409);
                echo json_encode(array(
                    'status' => 'error',
                    'code' => 'stale_event_config',
                    'message' => 'QR Bingo settings changed. Reload before continuing.',
                    'event_config' => array(
                        'event_key' => $eventConfig['event_key'],
                        'revision' => $eventConfigRevision
                    )
                ));
                exit();
            }

            if (in_array($_POST['action'], array('scan_vendor', 'raffle_offer', 'raffle_opt_in'), true)
                && !$qrContactComplete) {
                http_response_code(422);
                echo json_encode(array(
                    'ok' => false,
                    'status' => 'error',
                    'code' => 'profile_incomplete',
                    'message' => 'Complete your ' . $qrContactMissingLabel . ' before continuing with QR Bingo.',
                    'missing_profile_fields' => $qrContactProfile['missing_fields'],
                    'profile_edit_url' => $qrContactProfile['profile_edit_url']
                ));
                exit();
            }

            if (in_array($_POST['action'], array('scan_vendor', 'raffle_offer', 'raffle_opt_in'), true)) {
                $submittedNoticeVersion = isset($_POST['participation_notice_version']) && is_string($_POST['participation_notice_version'])
                    ? trim($_POST['participation_notice_version'])
                    : '';
                // Released native builds still send the previous notice on
                // scan only. Preserve that exact evidence without relabelling
                // it as the expanded pre-scan agreement used by this website.
                $legacyScanNoticeAccepted = $_POST['action'] === 'scan_vendor'
                    && hash_equals(
                        (string)$eventConfig['rules_version'] . '|2026-09-01-in-person-entry',
                        $submittedNoticeVersion
                    );
                if (!hash_equals($participationNoticeVersion, $submittedNoticeVersion)
                    && !$legacyScanNoticeAccepted) {
                    http_response_code(428);
                    echo json_encode(array(
                        'ok' => false,
                        'status' => 'error',
                        'code' => 'participation_notice_required',
                        'message' => 'Read and accept the current QR Bingo agreement before continuing.'
                    ));
                    exit();
                }
            }

            if ($_POST['action'] === 'raffle_offer' || $_POST['action'] === 'raffle_opt_in') {
                if (empty($eventConfig['vendor_draws_enabled'])) {
                    http_response_code(503);
                    echo json_encode(array('ok' => false, 'error' => 'Optional vendor draws are temporarily unavailable.'));
                    exit();
                }
                $drawVendorId = isset($_POST['vendor_id']) && is_string($_POST['vendor_id'])
                    ? trim($_POST['vendor_id'])
                    : '';
                if (!$drawVendorId || strlen($drawVendorId) > 20 || preg_match('/^[0-9]+$/D', $drawVendorId) !== 1) {
                    http_response_code(400);
                    echo json_encode(array('ok' => false, 'error' => 'Vendor draw not found.'));
                    exit();
                }
                if ($fixtureContext) {
                    $fixtureVendorId = (string)$fixtureContext['vendor']['id'];
                    if (!hash_equals($fixtureVendorId, $drawVendorId)) {
                        http_response_code(404);
                        echo json_encode(array('ok' => false, 'error' => 'Vendor draw not found.'));
                        exit();
                    }
                } else {
                    $safeDrawVendorId = mysql_real_escape_string($drawVendorId);
                    $drawVendorQuery = "
                        SELECT u.user_id
                        FROM users_data u
                        INNER JOIN rel_tags rt ON rt.object_id = u.user_id
                        WHERE u.user_id = '$safeDrawVendorId'
                        AND rt.tag_id = '$eventTagId'
                        AND rt.tag_type_id = 1
                        AND u.active = 2
                        LIMIT 1
                    ";
                    $drawVendorResult = mysql($w['database'], $drawVendorQuery);
                    if (!$drawVendorResult || !mysql_fetch_assoc($drawVendorResult)) {
                        http_response_code(404);
                        echo json_encode(array('ok' => false, 'error' => 'Vendor draw not found.'));
                        exit();
                    }
                }

                $drawPayload = array(
                    'vendor_id' => $drawVendorId,
                    'participation_notice_version' => $submittedNoticeVersion
                );
                if ($_POST['action'] === 'raffle_opt_in') {
                    $consentVersion = isset($_POST['consent_version']) && is_string($_POST['consent_version'])
                        ? trim($_POST['consent_version'])
                        : '';
                    if (strlen($consentVersion) > 80 || strip_tags($consentVersion) !== $consentVersion) {
                        $consentVersion = '';
                    }
                    $vendorOfferVersion = isset($_POST['vendor_offer_version']) && is_string($_POST['vendor_offer_version'])
                        ? trim($_POST['vendor_offer_version'])
                        : '';
                    if (!ww_qr_bingo_is_rfc3339_timestamp($vendorOfferVersion)) {
                        http_response_code(400);
                        echo json_encode(array(
                            'ok' => false,
                            'code' => 'invalid_vendor_offer_version',
                            'error' => 'Reload the current vendor offer before entering.'
                        ));
                        exit();
                    }
                    $participantResponsibilityDisclosure = isset($_POST['participant_responsibility_disclosure'])
                        && is_string($_POST['participant_responsibility_disclosure'])
                        ? $_POST['participant_responsibility_disclosure']
                        : '';
                    $participantDisclosureControlMatch = preg_match(
                        '/[[:cntrl:]]/u',
                        $participantResponsibilityDisclosure
                    );
                    if ($participantResponsibilityDisclosure === ''
                        || strlen($participantResponsibilityDisclosure) > 2000
                        || trim($participantResponsibilityDisclosure) !== $participantResponsibilityDisclosure
                        || strpos($participantResponsibilityDisclosure, '<') !== false
                        || strpos($participantResponsibilityDisclosure, '>') !== false
                        || $participantDisclosureControlMatch !== 0) {
                        http_response_code(400);
                        echo json_encode(array(
                            'ok' => false,
                            'code' => 'invalid_participant_responsibility_disclosure',
                            'error' => 'Reload the current vendor offer before entering.'
                        ));
                        exit();
                    }
                    $drawPayload['rules_viewed'] = isset($_POST['rules_viewed']) && (string)$_POST['rules_viewed'] === '1';
                    $drawPayload['apple_non_sponsor_acknowledged'] = isset($_POST['apple_non_sponsor_acknowledged']) && (string)$_POST['apple_non_sponsor_acknowledged'] === '1';
                    $drawPayload['consent_version'] = $consentVersion;
                    $drawPayload['vendor_offer_version'] = $vendorOfferVersion;
                    $drawPayload['age_of_majority_attested'] = isset($_POST['age_of_majority_attested']) && (string)$_POST['age_of_majority_attested'] === '1';
                    $drawPayload['residency_attested'] = isset($_POST['residency_attested']) && (string)$_POST['residency_attested'] === '1';
                    $drawPayload['exclusions_attested'] = isset($_POST['exclusions_attested']) && (string)$_POST['exclusions_attested'] === '1';
                    $drawPayload['promotion_responsibility_acknowledged'] = isset($_POST['promotion_responsibility_acknowledged']) && (string)$_POST['promotion_responsibility_acknowledged'] === '1';
                    $drawPayload['draw_administration_contact_share_acknowledged'] = isset($_POST['draw_administration_contact_share_acknowledged']) && (string)$_POST['draw_administration_contact_share_acknowledged'] === '1';
                    $drawPayload['vendor_marketing_consent_acknowledged'] = isset($_POST['vendor_marketing_consent_acknowledged']) && (string)$_POST['vendor_marketing_consent_acknowledged'] === '1';
                    $drawPayload['participant_responsibility_disclosure'] = $participantResponsibilityDisclosure;
                }
                $drawResponse = ww_qr_bingo_vendor_draw_request(
                    $_POST['action'],
                    $drawPayload
                );
                http_response_code((int)$drawResponse['status_code']);
                echo json_encode($drawResponse['body']);
                exit();
            }

            if ($_POST['action'] === 'scan_vendor') {
                if (empty($eventConfig['scan_enabled'])) {
                    http_response_code(503);
                    echo json_encode(array('status' => 'error', 'message' => 'QR Bingo scanning is temporarily disabled.'));
                    exit();
                }
                $vendorId = isset($_POST['vendor_id']) && is_string($_POST['vendor_id'])
                    ? trim($_POST['vendor_id'])
                    : '';
                if ($fixtureContext) {
                    $fixtureVendorId = (string)$fixtureContext['vendor']['id'];
                    if (!$vendorId || !hash_equals($fixtureVendorId, $vendorId)) {
                        http_response_code(400);
                        echo json_encode(array('status' => 'error', 'message' => 'Invalid vendor ID'));
                        exit();
                    }
                    $fixtureScanResponse = ww_qr_bingo_vendor_draw_request(
                        'scan',
                        array(
                            'vendor_id' => $fixtureVendorId,
                            'participation_notice_version' => $submittedNoticeVersion
                        )
                    );
                    $freshFixtureContext = ww_qr_bingo_fixture_context($fixtureScanResponse);
                    if (!$freshFixtureContext
                        || !hash_equals($fixtureVendorId, (string)$freshFixtureContext['vendor']['id'])
                        || !in_array($fixtureVendorId, $freshFixtureContext['scanned'], true)) {
                        http_response_code(
                            isset($fixtureScanResponse['status_code']) && (int)$fixtureScanResponse['status_code'] >= 400
                                ? (int)$fixtureScanResponse['status_code']
                                : 502
                        );
                        $fixtureScanBody = isset($fixtureScanResponse['body']) && is_array($fixtureScanResponse['body'])
                            ? $fixtureScanResponse['body']
                            : array();
                        echo json_encode(array(
                            'status' => 'error',
                            'message' => isset($fixtureScanBody['error']) && is_string($fixtureScanBody['error'])
                                ? $fixtureScanBody['error']
                                : 'Fixture scan could not be saved.'
                        ));
                        exit();
                    }
                    echo json_encode(array(
                        'status' => 'success',
                        'scanned_count' => count($freshFixtureContext['scanned']),
                        'completed' => $freshFixtureContext['completed']
                    ));
                    exit();
                }
                $scanWindowOpensAt = isset($eventConfig['history_starts_at_unix'])
                    ? intval($eventConfig['history_starts_at_unix'])
                    : 0;
                $scanWindowClosesAt = isset($eventConfig['entry_closes_at_unix'])
                    ? intval($eventConfig['entry_closes_at_unix'])
                    : 0;
                if (!$scanWindowOpensAt || !$scanWindowClosesAt || time() < $scanWindowOpensAt || time() >= $scanWindowClosesAt) {
                    http_response_code(403);
                    echo json_encode(array(
                        'status' => 'error',
                        'code' => 'show_scan_window_closed',
                        'message' => 'QR Bingo booth scans are accepted only during the published wedding-show hours.'
                    ));
                    exit();
                }
                $vendorId = mysql_real_escape_string($vendorId);

                // Stable QR identifiers are Brilliant Directories user IDs.
                // Verify the submitted vendor belongs to the current event.
                $vendorUserQuery = "
                    SELECT u.user_id
                    FROM users_data u
                    INNER JOIN rel_tags rt ON rt.object_id = u.user_id
                    WHERE u.user_id = '$vendorId'
                    AND rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                    LIMIT 1
                ";
                $vendorUserResult = mysql($w['database'], $vendorUserQuery);
                $vendorUserRow = mysql_fetch_assoc($vendorUserResult);

                if ($vendorUserRow) {
                    $actualVendorUserId = $vendorUserRow['user_id'];

                    // Insert or update the visit using the stable BD user ID
                    $query = "INSERT INTO vendor_visits (user_id, vendor_id)
                             VALUES ('$userId', '$actualVendorUserId')
                             ON DUPLICATE KEY UPDATE scan_date = NOW()";
                    mysql($w['database'], $query);
                } else {
                    echo json_encode(['status' => 'error', 'message' => 'Invalid vendor ID']);
                    exit();
                }

                // Check if user has completed all vendors - get dynamic count
                $countQuery = "
                    SELECT COUNT(DISTINCT u.user_id) as total_vendors
                    FROM users_data u
                    INNER JOIN rel_tags rt ON rt.object_id = u.user_id
                    WHERE rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                ";
                $countResult = mysql($w['database'], $countQuery);
                $countRow = mysql_fetch_assoc($countResult);
                $totalVendors = $countRow['total_vendors'];
                $scannedQuery = "
                    SELECT COUNT(DISTINCT vv.vendor_id) as count
                    FROM vendor_visits vv
                    INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
                    INNER JOIN users_data u ON u.user_id = vv.vendor_id
                    WHERE vv.user_id = '$userId'
                    AND rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                    AND vv.scan_date >= '$eventHistoryStartsAt'
                    AND vv.scan_date < '$eventScanClosesAt'
                ";
                $result = mysql($w['database'], $scannedQuery);
                $row = mysql_fetch_assoc($result);
                $scannedCount = $row['count'];

                // If completed, update the completion status
                if ($scannedCount >= $totalVendors) {
                    $updateQuery = "UPDATE users_data SET bingo_completed = 1, bingo_completion_date = NOW()
                                  WHERE user_id = '$userId'";
                    mysql($w['database'], $updateQuery);
                }

                echo json_encode([
                    'status' => 'success',
                    'scanned_count' => $scannedCount,
                    'completed' => ($scannedCount >= $totalVendors)
                ]);
                exit();
            }

            if ($_POST['action'] === 'get_scanned') {
                if ($fixtureContext) {
                    echo json_encode(array(
                        'status' => 'success',
                        'scanned' => $fixtureContext['scanned']
                    ));
                    exit();
                }
                // Return only current-event vendor visits, keyed by stable BD user ID.
                $scannedQuery = "
                    SELECT DISTINCT vv.vendor_id
                    FROM vendor_visits vv
                    INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
                    INNER JOIN users_data u ON u.user_id = vv.vendor_id
                    WHERE vv.user_id = '$userId'
                    AND rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                    AND vv.scan_date >= '$eventHistoryStartsAt'
                    AND vv.scan_date < '$eventScanClosesAt'
                    ORDER BY vv.vendor_id ASC
                ";
                $scannedResult = mysql($w['database'], $scannedQuery);
                $scanned = [];
                while ($row = mysql_fetch_assoc($scannedResult)) {
                    $scanned[] = (string)$row['vendor_id'];
                }

                echo json_encode([
                    'status' => 'success',
                    'scanned' => $scanned
                ]);
                exit();
            }

            http_response_code(400);
            echo json_encode(array('status' => 'error', 'message' => 'Unsupported QR Bingo action.'));
            exit();
        }

        // Get current-event progress using stable BD vendor IDs.
        $scannedVendors = array();
        if ($fixtureContext) {
            $scannedVendors = $fixtureContext['scanned'];
        } else {
            $scannedQuery = "
                SELECT DISTINCT vv.vendor_id
                FROM vendor_visits vv
                INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
                INNER JOIN users_data u ON u.user_id = vv.vendor_id
                WHERE vv.user_id = '$userId'
                AND rt.tag_id = '$eventTagId'
                AND rt.tag_type_id = 1
                AND u.active = 2
                AND vv.scan_date >= '$eventHistoryStartsAt'
                AND vv.scan_date < '$eventScanClosesAt'
                ORDER BY vv.vendor_id ASC
            ";
            $scannedResult = mysql($w['database'], $scannedQuery);

            if ($scannedResult) {
                while ($row = mysql_fetch_assoc($scannedResult)) {
                    $scannedVendors[] = (string)$row['vendor_id'];
                }
            }
        }

        // The isolated reviewer/email fixture has one private vendor supplied by
        // the authenticated Edge response. Production totals remain sourced from
        // the current active Brilliant Directories tag roster.
        if ($fixtureContext) {
            $totalVendorCount = 1;
        } else {
            $totalCountQuery = "
                SELECT COUNT(DISTINCT u.user_id) as total_vendors
                FROM users_data u
                INNER JOIN rel_tags rt ON rt.object_id = u.user_id
                WHERE rt.tag_id = '$eventTagId'
                AND rt.tag_type_id = 1
                AND u.active = 2
            ";
            $totalCountResult = mysql($w['database'], $totalCountQuery);
            $totalCountRow = $totalCountResult ? mysql_fetch_assoc($totalCountResult) : array();
            $totalVendorCount = isset($totalCountRow['total_vendors'])
                ? max(0, intval($totalCountRow['total_vendors']))
                : 0;
        }

?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?php echo htmlspecialchars($eventName, ENT_QUOTES, 'UTF-8'); ?> — QR Bingo</title>
  <style>
    :root{
      --rose:#ff6f91; /* WeddingWin pink */
      --wine:#7a2d45;
      --gold:#c9a24e;
      --ink:#1f2937;
      --mist:#f8fafc;
      --stone:#e5e7eb;
      --success:#16a34a;
    }
    html,body{height:100%;}
    body{
      margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      color:var(--ink); background:linear-gradient(180deg,#fff, var(--mist));
    }
    header{
      padding:12px clamp(16px,4vw,24px); position:sticky; top:0; backdrop-filter: blur(8px);
      background:rgba(255,255,255,0.8); border-bottom:1px solid var(--stone); z-index:10;
    }
    .brand{display:flex; align-items:center; gap:10px;}
    .brand .mark{width:32px; height:32px; border-radius:50%; background: conic-gradient(from 180deg, var(--rose), var(--gold), #fff 70%);
      display:grid; place-items:center; box-shadow:0 4px 12px rgba(0,0,0,.06);}
    .brand .mark::after{content:"❤"; color:#fff; font-size:16px; filter: drop-shadow(0 1px 0 rgba(0,0,0,.2));}
    h1{font-size:clamp(18px,2.5vw,24px); margin:0; line-height:1.2;}
    .sub{color:#6b7280; font-size:12px; margin-top:2px;}

    .wrap{max-width:1100px; margin:24px auto; padding:0 clamp(16px,4vw,40px);}

    /* Hide original controls on mobile, show on desktop */
    .controls{display:none;}
    @media(min-width:768px){
      .controls{display:grid; gap:12px; grid-template-columns: 1fr auto auto; align-items:end;}
    }

    label{font-size:12px; color:#6b7280; display:block; margin-bottom:6px;}

    select, button, input[type=file]{
      appearance:none; border:1px solid var(--stone); background:#fff; border-radius:12px; padding:10px 14px;
      font-size:14px; line-height:1.2; box-shadow:0 1px 0 rgba(0,0,0,.04);
    }
    @media(min-width:768px){ .controls select, .controls button, .controls input[type=file]{ width:auto; } }
    button{ cursor:pointer; border:1px solid transparent; background:var(--rose); color:#fff; font-weight:600; }
    button.secondary{ background:#fff; color:var(--ink); border-color:var(--stone); }
    button.ghost{ background:transparent; color:var(--ink); border-color:transparent; }
    button:disabled{ opacity:.6; cursor:not-allowed; }

    /* Mobile scanner with overlay controls */
    .scanner{ margin:18px 0 8px; display:grid; gap:10px; position:relative; overflow:hidden; }
    video{ width:100%; height:60vh; max-height:60vh; background:#000; border-radius:16px; object-fit:cover; }
    @media(min-width:768px){ video{ max-height:55vh; height:auto; } }
    canvas{ display:none; }

    /* Camera overlay controls for mobile */
    .camera-overlay{
      position:absolute; top:0; left:0; right:0; bottom:0; z-index:5;
      pointer-events:none; border-radius:16px; overflow:hidden;
      box-sizing:border-box; /* Ensure proper sizing */
    }
    .camera-controls{
      position:absolute; right:20px; bottom:90px;
      display:flex; flex-direction:column; gap:12px; pointer-events:auto;
    }
    .camera-btn{
      width:56px; height:56px; border-radius:50%; border:2px solid rgba(255,255,255,0.3);
      background:rgba(0,0,0,0.6); backdrop-filter:blur(12px);
      color:#fff; font-size:14px; font-weight:500;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:all 0.25s ease;
      box-shadow:0 2px 8px rgba(0,0,0,0.2);
      position:relative;
    }
    .camera-btn:hover{
      transform:scale(1.08);
      background:rgba(0,0,0,0.8);
      border-color:rgba(255,255,255,0.5);
    }
    .camera-btn:active{
      transform:scale(0.92);
      transition:transform 0.1s ease;
    }
    .camera-btn.start{
      background:rgba(255,111,145,0.9);
      border-color:rgba(255,111,145,0.5);
    }
    .camera-btn.start:hover{
      background:var(--rose);
      border-color:var(--rose);
    }
    .camera-btn.stop{
      background:rgba(220,38,38,0.9);
      border-color:rgba(220,38,38,0.5);
    }
    .camera-btn.stop:hover{
      background:#dc2626;
      border-color:#dc2626;
    }
    .camera-btn:disabled{
      opacity:0.4;
      cursor:not-allowed;
      transform:none;
      background:rgba(0,0,0,0.3);
    }

    /* Enhanced Camera settings button */
    .camera-settings{
      position:absolute; top:20px; right:20px; pointer-events:auto;
      width:48px; height:48px; border-radius:50%;
      background:rgba(0,0,0,0.7); backdrop-filter:blur(16px);
      color:#fff; border:2px solid rgba(255,255,255,0.3);
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
    }
    .camera-settings:hover{
      background:rgba(0,0,0,0.85);
      border-color:rgba(255,255,255,0.5);
      transform:scale(1.1);
      box-shadow:0 6px 16px rgba(0,0,0,0.2);
    }
    .camera-settings:active{
      transform:scale(0.95);
      transition:transform 0.1s ease;
    }

    /* Active state when dropdown is open */
    .camera-settings.active{
      background:rgba(59, 130, 246, 0.9);
      border-color:rgba(255,255,255,0.6);
      transform:scale(1.05);
    }

    /* Animation for the settings icon */
    .camera-settings svg{
      transition:transform 0.3s ease;
    }
    .camera-settings.active svg{
      transform:rotate(45deg);
    }

    /* Enhanced Camera selection dropdown overlay */
    .camera-select-overlay{
      position:absolute; top:70px; right:20px; z-index:1000;
      background:#fff; border-radius:16px; padding:16px;
      box-shadow:0 12px 32px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15);
      min-width:240px; max-width:320px; pointer-events:auto;
      border:2px solid rgba(0,0,0,0.1);
      backdrop-filter:blur(8px);
      opacity:0; visibility:hidden; transform:translateY(-8px) scale(0.95);
      transition:all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .camera-select-overlay.show{
      opacity:1; visibility:visible; transform:translateY(0) scale(1);
    }

    /* Camera dropdown title */
    .camera-select-overlay::before{
      content:"📹 Select Camera";
      display:block; font-weight:600; font-size:14px;
      color:#333; margin-bottom:12px; text-align:center;
    }

    /* Enhanced select styling */
    .camera-select-overlay select{
      width:100%; margin:0; font-size:15px; padding:12px 16px;
      border:2px solid #e5e7eb; border-radius:12px;
      background:#fff; color:#374151; font-weight:500;
      cursor:pointer; transition:all 0.2s ease;
      outline:none; appearance:none;
      background-image:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
      background-position:right 12px center; background-repeat:no-repeat; background-size:16px;
      padding-right:48px;
    }
    .camera-select-overlay select:hover{
      border-color:#d1d5db; background-color:#f9fafb;
    }
    .camera-select-overlay select:focus{
      border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* Select options styling */
    .camera-select-overlay select option{
      padding:8px 12px; font-size:14px; font-weight:500;
    }

    /* Responsive adjustments for smaller screens */
    @media (max-width: 480px) {
      .camera-select-overlay{
        right:12px; top:75px; min-width:200px; max-width:280px;
        padding:12px;
      }
      .camera-select-overlay select{
        font-size:16px; /* Prevents zoom on iOS */
      }
    }

    /* Very small screens */
    @media (max-width: 360px) {
      .camera-select-overlay{
        right:8px; left:8px; min-width:auto; max-width:none;
      }
    }

    /* Scanning indicator - DISABLED */
    .scanning-indicator{
      display: none; /* Completely hide the scanning indicator */
    }
    .scanning-indicator.active{
      display: none; /* Keep it hidden even when active */
    }

    /* Loading state for camera */
    .camera-loading{
      position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);
      color:#fff; font-size:14px; background:rgba(0,0,0,0.7);
      padding:12px 20px; border-radius:8px; pointer-events:none;
      display:none;
    }
    .camera-loading.show{ display:block; }

    @keyframes scanningPulse{
      0%, 100%{ border-color:var(--rose); opacity:1; }
      50%{ border-color:var(--rose); opacity:0.6; }
    }

    /* SVG icon styling */
    .camera-btn svg, .camera-settings svg{
      transition:all 0.2s ease;
    }
    .camera-btn:hover svg{
      transform:scale(1.1);
    }

    /* Button press feedback */
    .camera-btn:active{
      transform:scale(0.92);
      transition:transform 0.1s ease;
    }

    /* Enhanced visual integration */
    .camera-controls{
      filter:drop-shadow(0 4px 12px rgba(0,0,0,0.15));
    }

    /* Mobile optimizations */
    @media(max-width:767px){
      .wrap{ padding:0 16px; }
      .scanner{ margin:12px 0 8px; }

      /* Hide camera settings if only one camera */
      .camera-settings.single-camera{ display:none; }

      /* Android-specific video optimizations */
      video {
        -webkit-backface-visibility: hidden;
        backface-visibility: hidden;
        /* Remove mirroring for rear cameras - will be handled dynamically */
      }

      /* Larger touch targets on small screens */
      @media(max-width:480px){
        .camera-btn{ width:60px; height:60px; }
        .camera-btn svg{ width:18px; height:18px; }
        .camera-controls{ bottom:80px; gap:14px; right:16px; }
        .camera-settings{ width:48px; height:48px; top:16px; right:16px; }
        .camera-settings svg{ width:20px; height:20px; }
      }
    }

    /* Android-specific improvements */
    @media screen and (max-width: 767px) {
      /* Prevent zoom on form interactions */
      input, select, textarea, button {
        font-size: 16px !important;
      }

      /* Improve video rendering on Android */
      video {
        will-change: transform;
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
      }

      /* Fix scanning indicator positioning on mobile */
      .scanner {
        /* Ensure proper containment */
        position: relative;
        overflow: hidden;
      }

      .camera-overlay {
        /* Ensure overlay matches video dimensions exactly */
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
      }

      .scanning-indicator {
        /* Force exact positioning for Android */
        position: absolute !important;
        top: 3px !important; /* Inset by border width */
        left: 3px !important; /* Inset by border width */
        right: 3px !important; /* Inset by border width */
        bottom: 3px !important; /* Inset by border width */
        width: calc(100% - 6px); /* Account for border width */
        height: calc(100% - 6px); /* Account for border width */
        border-radius: 13px; /* Slightly smaller to fit inside */
        box-sizing: border-box;
      }
    }

    /* Hide mobile controls on desktop */
    @media(min-width:768px){
      .camera-overlay{ display:none; }
    }

    /* Prevent zoom on button tap (iOS) */
    button, select{ font-size:16px; }
    @media(max-width:767px){
      button, select{ font-size:16px; }
    }

    .progress-bar{ height:20px; background:#fff; border:1px solid var(--stone); border-radius:999px; overflow:hidden; }
    .progress{ height:100%; width:0%; background:linear-gradient(90deg, var(--rose), var(--gold)); transition: width .3s ease; }
    .progress-meta{ display:flex; justify-content:space-between; font-size:12px; color:#6b7280; margin-top:8px; }

    .grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin:18px 0 30px; }
    @media(min-width:480px){ .grid{ grid-template-columns: repeat(3, 1fr); } }
    @media(min-width:720px){ .grid{ grid-template-columns: repeat(4, 1fr); } }
    @media(min-width:1024px){ .grid{ grid-template-columns: repeat(6, 1fr); } }

    .tile{ position:relative; background:#fff; border:1px solid var(--stone); border-radius:14px; padding:12px; min-height:130px;
      display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-shadow:0 2px 10px rgba(0,0,0,.04); }
    .tile .vendor-image{ width:55px; height:55px; border-radius:50%; object-fit:cover; margin-bottom:8px; border:2px solid var(--stone); }
    .tile .vendor-image.placeholder{ background:var(--mist); display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:16px; }
    .tile .name{ font-size:clamp(11px, 3.2vw, 13px); font-weight:700; line-height:1.2; }
    @media(min-width:1024px){ .tile{ min-height:120px; } }
    .tile .cat{ font-size:11px; color:#6b7280; margin-top:6px; }
    .tile.locked{ filter: grayscale(1) contrast(0.9) opacity(0.75); }
    .tile.locked .vendor-image{ filter: grayscale(1) opacity(0.7); }
    .tile.scanned{ background:#f0fff4; border-color:#bbf7d0; outline:2px solid var(--success); box-shadow:0 0 0 4px rgba(22,163,74,.15) inset; }
    .tile.scanned .vendor-image{ border-color:var(--success); filter: none; }
    .tile .check{ position:absolute; right:8px; top:8px; width:18px; height:18px; border-radius:50%; background:#e5ffe9; color:var(--success);
      display:none; align-items:center; justify-content:center; font-size:12px; }
    .tile.scanned .check{ display:flex; }
    .tile .vendor-draw-review{
      margin-top:9px; padding:7px 9px; border:1px solid #aa565d; border-radius:9px;
      background:#fff; color:#8f4148; font-size:12px; line-height:1.2; font-weight:700;
      cursor:pointer;
    }
    .tile .vendor-draw-review:hover,
    .tile .vendor-draw-review:focus-visible{ background:#fff4f5; outline:2px solid #8f4148; outline-offset:2px; }

    .done{
      display:none; position:sticky; bottom:0; background: #fff; border-top:1px solid var(--stone);
      padding:14px; padding-bottom: calc(14px + env(safe-area-inset-bottom));
      box-shadow:0 -10px 30px rgba(0,0,0,.06); z-index:20;
    }

    /* Safe-area support for notched devices */
    header{ padding-top: calc(12px + env(safe-area-inset-top)); }
    .done.on{ display:block; }

    .note{ font-size:12px; color:#6b7280; }

    .user-info{
      background: #fff; border:1px solid var(--stone); border-radius:12px; padding:12px; margin-bottom:20px;
      font-size:14px; color:#6b7280;
    }
    .user-info strong{ color:var(--ink); }

    .footer{ color:#6b7280; font-size:12px; text-align:center; padding:24px 0 50px; }

    /* Success Animation */
    .scan-success-overlay{
      position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.1);
      display:none; align-items:center; justify-content:center; z-index:9999;
      backdrop-filter: blur(2px);
    }
    .scan-success-animation{
      position:relative; width:120px; height:120px; border-radius:50%;
      background:linear-gradient(135deg, var(--success), #22c55e);
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 10px 30px rgba(22,163,74,0.3);
      animation: successPulse 0.6s ease-out;
    }
    .scan-success-animation::before{
      content:''; position:absolute; width:100%; height:100%; border-radius:50%;
      background:rgba(255,255,255,0.2); animation: ripple 0.6s ease-out;
    }
    .scan-success-animation .checkmark{
      font-size:48px; color:#fff; animation: checkmarkPop 0.4s 0.2s ease-out both;
    }
    .scan-success-animation .sparks{
      position:absolute; width:100%; height:100%;
    }
    .scan-success-animation .spark{
      position:absolute; width:6px; height:6px; background:#fff; border-radius:50%;
      animation: sparkFly 0.8s ease-out;
    }
    .scan-success-animation .spark:nth-child(1){ top:10%; left:50%; animation-delay:0.1s; transform:rotate(0deg); }
    .scan-success-animation .spark:nth-child(2){ top:25%; right:15%; animation-delay:0.2s; transform:rotate(45deg); }
    .scan-success-animation .spark:nth-child(3){ top:50%; right:5%; animation-delay:0.15s; transform:rotate(90deg); }
    .scan-success-animation .spark:nth-child(4){ bottom:25%; right:15%; animation-delay:0.25s; transform:rotate(135deg); }
    .scan-success-animation .spark:nth-child(5){ bottom:10%; left:50%; animation-delay:0.3s; transform:rotate(180deg); }
    .scan-success-animation .spark:nth-child(6){ bottom:25%; left:15%; animation-delay:0.2s; transform:rotate(225deg); }
    .scan-success-animation .spark:nth-child(7){ top:50%; left:5%; animation-delay:0.35s; transform:rotate(270deg); }
    .scan-success-animation .spark:nth-child(8){ top:25%; left:15%; animation-delay:0.1s; transform:rotate(315deg); }

    @keyframes successPulse{
      0%{ transform:scale(0.3) rotate(-10deg); opacity:0; }
      50%{ transform:scale(1.1) rotate(5deg); }
      100%{ transform:scale(1) rotate(0deg); opacity:1; }
    }
    @keyframes ripple{
      0%{ transform:scale(1); opacity:0.6; }
      100%{ transform:scale(2.5); opacity:0; }
    }
    @keyframes checkmarkPop{
      0%{ transform:scale(0); opacity:0; }
      80%{ transform:scale(1.2); }
      100%{ transform:scale(1); opacity:1; }
    }
    @keyframes sparkFly{
      0%{ transform:translateY(0) scale(0); opacity:1; }
      100%{ transform:translateY(-40px) scale(1); opacity:0; }
    }
    .vendor-draw-modal[hidden]{ display:none; }
    .qr-rules-notice[hidden]{ display:none; }
    .qr-rules-notice{
      background:#fff7f6; border:1px solid #efd8d5; border-radius:10px;
      color:#4f4b50; font-size:13px; line-height:1.45; margin-bottom:14px;
      padding:10px 12px;
    }
    .qr-rules-notice-row{ align-items:flex-start; display:flex; gap:9px; }
    .qr-rules-notice input{ flex:0 0 auto; height:18px; margin:1px 0 0; width:18px; }
    .qr-rules-notice h2{ color:#3f393f; font-size:20px; line-height:1.25; margin:0 0 12px; }
    .qr-rules-notice label{ cursor:pointer; margin:0; }
    .qr-rules-notice strong{ color:#3f393f; display:block; }
    .qr-rules-notice a{ color:#aa565d; font-weight:800; }
    .qr-rules-notice-links{ color:#6b646b; font-size:12px; margin:8px 0 0 27px; }
    .qr-fixture-scan{ background:#fff7f6; border:1px dashed #aa565d; border-radius:12px; margin:0 0 16px; padding:16px; }
    .qr-fixture-scan strong{ color:#88464d; display:block; }
    .qr-fixture-scan p{ color:#625b62; font-size:14px; line-height:1.5; margin:6px 0 12px; }
    .qr-fixture-scan button{ background:#aa565d; border:0; border-radius:9px; color:#fff; cursor:pointer; font-weight:800; min-height:44px; padding:10px 16px; }
    .qr-fixture-scan button:disabled{ cursor:not-allowed; opacity:.5; }
    .qr-contact-gate{ background:#fff; border:2px solid #efd8d5; border-radius:16px; box-shadow:0 10px 30px rgba(91,50,54,.08); margin:18px 0; padding:22px; text-align:center; }
    .qr-contact-gate h2{ color:#3f393f; font-size:24px; margin:0 0 9px; }
    .qr-contact-gate p{ color:#625b62; font-size:15px; line-height:1.55; margin:7px auto; max-width:620px; }
    .qr-contact-gate a{ background:#aa565d; border-radius:10px; color:#fff; display:inline-block; font-weight:800; margin-top:12px; min-height:44px; padding:12px 18px; text-decoration:none; }
    .vendor-draw-modal{ align-items:flex-start; background:rgba(20,20,24,.68); display:flex; inset:0; justify-content:center; overflow-y:auto; padding:24px 14px; position:fixed; z-index:10020; }
    .vendor-draw-dialog{ background:#fff; border-radius:16px; box-shadow:0 24px 70px rgba(0,0,0,.28); color:#292929; max-width:620px; padding:22px; width:100%; }
    .vendor-draw-dialog [hidden]{ display:none !important; }
    .vendor-draw-eyebrow{ color:#aa565d; font-size:12px; font-weight:800; letter-spacing:.06em; margin:0 0 6px; text-transform:uppercase; }
    .vendor-draw-dialog h2{ font-size:26px; line-height:1.2; margin:0 0 4px; }
    .vendor-draw-vendor{ color:#666168; font-weight:700; margin:0 0 14px; }
    .vendor-draw-copy{ color:#4f4b50; font-size:14px; line-height:1.55; margin:10px 0; white-space:pre-line; }
    .vendor-draw-terms{ background:#fff7f6; border:1px solid #efd8d5; border-radius:10px; margin:14px 0; padding:13px; }
    .vendor-draw-terms a{ color:#aa565d; display:inline-block; font-weight:800; margin:3px 12px 3px 0; }
    .vendor-draw-check{ align-items:flex-start; display:flex; font-size:13px; gap:9px; line-height:1.45; margin:12px 0; }
    .vendor-draw-check input{ flex:0 0 auto; height:19px; margin:1px 0 0; width:19px; }
    .vendor-draw-actions{ display:flex; gap:10px; justify-content:flex-end; margin-top:18px; }
    .vendor-draw-actions button{ border:0; border-radius:9px; cursor:pointer; font-weight:800; min-height:44px; padding:10px 16px; }
    .vendor-draw-actions button:disabled{ cursor:not-allowed; opacity:.5; }
    .vendor-draw-decline{ background:#f0eded; color:#292929; }
    .vendor-draw-enter{ background:#aa565d; color:#fff; }
    .vendor-draw-status{ color:#666168; font-size:13px; line-height:1.45; margin:12px 0 0; }
    .vendor-draw-status.is-error{ color:#8a2424; }
    @media (max-width:540px){
      .vendor-draw-modal{ padding:12px; }
      .vendor-draw-dialog{ padding:18px 16px; }
      .vendor-draw-actions{ align-items:stretch; flex-direction:column-reverse; }
      .vendor-draw-actions button{ width:100%; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div>
        <h1><?php echo htmlspecialchars($eventName, ENT_QUOTES, 'UTF-8'); ?> — QR Bingo</h1>
	        <div class="sub">Visit each participating vendor booth. Scan its QR to record your visit. 🎉</div>
      </div>
    </div>
  </header>

	  <div class="wrap">

    <?php if (empty($eventConfig['scan_enabled'])) { ?>
      <div class="alert alert-warning" role="status" style="margin-bottom:16px;">
        QR Bingo scanning is temporarily disabled by the event administrator. Your saved progress is unchanged.
      </div>
    <?php } elseif (empty($showScanWindowOpen)) { ?>
      <div class="alert alert-info" role="status" style="margin-bottom:16px;">
        QR Bingo booth scanning is available only during the published hours for <?php echo htmlspecialchars($eventName, ENT_QUOTES, 'UTF-8'); ?>.
      </div>
    <?php } ?>

    <?php if (!$qrContactComplete) { ?>
      <section class="qr-contact-gate" role="alert" aria-labelledby="qrContactGateTitle">
        <h2 id="qrContactGateTitle">Complete your contact details</h2>
        <p>Before scanning, add your <?php echo htmlspecialchars($qrContactMissingLabel, ENT_QUOTES, 'UTF-8'); ?>. This keeps every booth visit connected to a usable couple profile.</p>
        <p>If you enter a vendor draw, that named vendor receives these contact details for the draw and may use them to send wedding-related offers and promotions. You may unsubscribe from vendor marketing at any time.</p>
        <a href="/account/contact">Complete Contact Details</a>
      </section>
    <?php } ?>

    <div id="qrScannerExperience"<?php echo $qrContactComplete ? '' : ' hidden'; ?>>

	    <section
	      class="qr-rules-notice"
	      id="qrRulesNotice"
	      aria-label="QR Bingo terms acknowledgement"
	      data-storage-key="<?php echo htmlspecialchars($rulesNoticeStorageKey, ENT_QUOTES, 'UTF-8'); ?>"
	    >
	      <h2>Before you scan</h2>
	      <div class="qr-rules-notice-row">
	        <input id="qrRulesNoticeAcknowledged" type="checkbox">
	        <label for="qrRulesNoticeAcknowledged">
	          <strong>I have read and agree to the <a href="/about/terms#qr-bingo" target="_blank" rel="noopener">QR Bingo Terms</a> and <a href="<?php echo htmlspecialchars($officialRulesUrl, ENT_QUOTES, 'UTF-8'); ?>" target="_blank" rel="noopener">Draw Rules</a>.</strong>
	        </label>
	      </div>
	      <p class="qr-rules-notice-links"><a href="/about/privacy" target="_blank" rel="noopener">Privacy Policy</a></p>
	    </section>

    <?php if ($fixtureContext && $qrContactComplete && !empty($eventConfig['scan_enabled']) && $showScanWindowOpen) { ?>
      <section class="qr-fixture-scan" aria-labelledby="qrFixtureScanTitle">
        <strong id="qrFixtureScanTitle">Private test booth</strong>
        <p>Test the scan and optional draw for <?php echo htmlspecialchars($fixtureContext['vendor']['name'], ENT_QUOTES, 'UTF-8'); ?> without a camera. Accept the agreement above first. This records test progress only, not a real show visit.</p>
        <button id="qrFixtureScanButton" type="button" data-vendor-id="<?php echo htmlspecialchars($fixtureContext['vendor']['id'], ENT_QUOTES, 'UTF-8'); ?>" disabled>Scan test booth</button>
      </section>
    <?php } ?>

	    <section class="controls" aria-label="Scanner controls">
      <div>
        <label for="cameraSelect">Camera</label>
        <select id="cameraSelect" aria-label="Choose camera"></select>
      </div>
      <div>
        <label>&nbsp;</label>
        <button id="startBtn" disabled>🚀 Starting...</button>
      </div>
      <div>
        <label>&nbsp;</label>
        <button id="stopBtn" class="secondary" disabled>Stop</button>
      </div>
    </section>

    <section class="scanner" aria-live="polite">
      <video id="video" playsinline muted></video>
      <canvas id="frame" width="640" height="480"></canvas>

      <!-- Mobile Camera Overlay Controls -->
      <div class="camera-overlay">
        <!-- Scanning indicator border -->
        <div class="scanning-indicator" id="scanningIndicator"></div>

        <!-- Camera settings button (top right) -->
        <button class="camera-settings" id="mobileSettingsBtn" title="Camera Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
          </svg>
        </button>

        <!-- Camera selection overlay -->
        <div class="camera-select-overlay" id="cameraSelectMobile">
          <select id="cameraSelectMobile2" aria-label="Choose camera"></select>
        </div>

        <!-- Camera control buttons (bottom right) -->
        <div class="camera-controls">
          <button class="camera-btn start" id="mobileStartBtn" title="Starting..." disabled>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.5L12.5 8L3 13.5V2.5Z"/>
            </svg>
          </button>
          <button class="camera-btn stop" id="mobileStopBtn" title="Stop Scanner" disabled>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="2" width="10" height="10" rx="1"/>
            </svg>
          </button>
        </div>

        <!-- Loading indicator -->
        <div class="camera-loading" id="cameraLoading">
          📹 Initializing camera...
        </div>
      </div>

      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="<?php echo $totalVendorCount; ?>" aria-valuenow="0" aria-label="Completion progress">
        <div class="progress" id="progress"></div>
      </div>
      <div class="progress-meta"><span id="progressText">0 / <?php echo $totalVendorCount; ?> scanned</span><span id="lastScan" class="note"></span></div>
    </section>

    <section>
      <div class="grid" id="grid" aria-label="Bingo grid"></div>
    </section>

    <section class="done" id="doneBar" aria-live="polite">
      <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
	        <div><strong>All participating booths visited!</strong> Your QR Bingo card is complete. Any vendor prize entry remains separate and optional.</div>
      </div>
    </section>
    </div>

    <div class="footer">© 2025 Wedding Win Inc.</div>
  </div>

  <!-- Success Animation Overlay -->
  <div class="scan-success-overlay" id="successOverlay">
    <div class="scan-success-animation">
      <div class="sparks">
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
      </div>
      <div class="checkmark">✓</div>
    </div>
  </div>

  <div class="vendor-draw-modal" id="vendorDrawModal" hidden>
    <section class="vendor-draw-dialog" id="vendorDrawDialog" role="dialog" aria-modal="true" aria-labelledby="vendorDrawTitle" aria-describedby="vendorDrawDescription vendorDrawPrivacy vendorDrawStatus" tabindex="-1">
      <p class="vendor-draw-eyebrow">Optional vendor draw</p>
      <h2 id="vendorDrawTitle">Vendor prize</h2>
      <p class="vendor-draw-vendor" id="vendorDrawVendor"></p>
      <p class="vendor-draw-copy" id="vendorDrawDescription"></p>
      <p class="vendor-draw-copy" id="vendorDrawDisclosure"></p>
      <p class="vendor-draw-copy" id="vendorDrawPrivacy"></p>
      <div class="vendor-draw-terms" id="vendorDrawTerms" hidden>
        <a id="vendorDrawRules" target="_blank" rel="noopener" hidden>View draw rules</a>
      </div>
      <p class="vendor-draw-status" id="vendorDrawStatus" role="status" aria-live="polite">Prize entry is separate and optional. One valid in-show QR entry is allowed per eligible couple for this vendor draw. Declining does not change your saved booth visit.</p>
      <div class="vendor-draw-actions">
        <button class="vendor-draw-decline" id="vendorDrawDecline" type="button">No Thanks</button>
        <button class="vendor-draw-enter" id="vendorDrawEnter" type="button" disabled>Enter Draw</button>
      </div>
    </section>
  </div>

  <!-- Vendor Data -->
  <script>
    const EVENT_CONFIG = <?php echo json_encode(array(
      'event_key' => isset($eventConfig['event_key']) ? (string)$eventConfig['event_key'] : '',
      'revision' => $eventConfigRevision,
      'event_name' => $eventName,
      'rules_version' => (string)$eventConfig['rules_version'],
      'vendor_tag_id' => $eventTagId,
      'scan_enabled' => !empty($eventConfig['scan_enabled']),
      'show_scan_window_open' => !empty($showScanWindowOpen),
      'history_starts_at' => isset($eventConfig['history_starts_at']) ? (string)$eventConfig['history_starts_at'] : '',
      'entry_closes_at' => isset($eventConfig['entry_closes_at']) ? (string)$eventConfig['entry_closes_at'] : '',
      'vendor_draws_enabled' => !empty($eventConfig['vendor_draws_enabled'])
    ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_HEX_APOS); ?>;
    const CONTACT_PROFILE_COMPLETE = <?php echo $qrContactComplete ? 'true' : 'false'; ?>;
    const PARTICIPATION_NOTICE_VERSION = <?php echo json_encode($participationNoticeVersion, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_HEX_APOS); ?>;
    const VENDORS = <?php
    // Retrieve the exact private fixture roster only when the authenticated Edge
    // response passed the strict fixture validator. Every other account uses the
    // unchanged active-vendor/tag roster below.
    $targetTagId = $eventTagId;
    $vendors = [];

    if ($fixtureContext) {
        $fixtureVendor = $fixtureContext['vendor'];
        $vendors[] = array(
            'id' => (string)$fixtureVendor['id'],
            'name' => (string)$fixtureVendor['name'],
            'cover_photo' => '',
            'full_filename' => '',
            'user_id' => (string)$fixtureVendor['user_id'],
            'legacy_id' => ''
        );
    } else {
        // Query each tagged user exactly once. A vendor can have multiple matching
        // rel_tags/users_photo rows, so aggregate photos and group by the stable BD
        // user ID instead of allowing the joins to duplicate VENDORS entries.
        $vendorQuery = "
            SELECT
                u.user_id,
                u.company,
                TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as name,
                COALESCE(u.company, TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) as display_name,
                u.filename,
                COALESCE(
                    MAX(CASE WHEN up.type = 'cover_photo' THEN up.file END),
                    MAX(CASE WHEN up.type = 'logo' THEN up.file END)
                ) as photo_file,
                CASE
                    WHEN MAX(CASE WHEN up.type = 'cover_photo' THEN up.file END) IS NOT NULL THEN 'cover_photo'
                    WHEN MAX(CASE WHEN up.type = 'logo' THEN up.file END) IS NOT NULL THEN 'logo'
                    ELSE NULL
                END as photo_type
            FROM users_data u
            INNER JOIN rel_tags rt ON rt.object_id = u.user_id
            LEFT JOIN users_photo up ON up.user_id = u.user_id AND up.type IN ('cover_photo', 'logo')
            WHERE rt.tag_id = '$targetTagId'
            AND rt.tag_type_id = 1
            AND u.active = 2
            GROUP BY u.user_id, u.company, u.first_name, u.last_name, u.filename
            ORDER BY u.user_id ASC
        ";

        $result = mysql($w['database'], $vendorQuery);
        if ($result) {
            while ($row = mysql_fetch_assoc($result)) {
                // Use company name if available, otherwise use concatenated first/last name
                $vendorName = !empty(trim($row['company'])) ? trim($row['company']) : trim($row['display_name']);

                // Generate full URL for the vendor
                $baseUrl = "https://www.weddingwin.ca/";
                $fullUrl = $baseUrl . $row['filename'];

                // Construct photo URL based on photo type
                $coverPhoto = "";
                $vendorUserId = $row['user_id'];
                if (!empty($row['photo_file']) && !empty($row['photo_type'])) {
                    if ($row['photo_type'] === 'cover_photo') {
                        $coverPhoto = "https://www.weddingwin.ca/covers/profile/" . $row['photo_file'];
                    } elseif ($row['photo_type'] === 'logo') {
                        $coverPhoto = "https://www.weddingwin.ca/logos/profile/" . $row['photo_file'];
                    }
                }

                $vendors[] = [
                    "id" => (string)$vendorUserId,
                    "name" => $vendorName,
                    "cover_photo" => $coverPhoto,
                    "full_filename" => $fullUrl,
                    "user_id" => (string)$vendorUserId,
                    "legacy_id" => isset($legacyNws25ByBdUserId[(string)$vendorUserId])
                        ? $legacyNws25ByBdUserId[(string)$vendorUserId]
                        : ""
                ];
            }
        }
    }

    // If no vendors found, log an error
    if (empty($vendors)) {
        error_log("QR Bingo: No vendors found with tag ID {$targetTagId}");
        // Fallback to prevent JavaScript errors
        $vendors = [
            ["id" => "", "name" => "No vendors found", "cover_photo" => "", "full_filename" => "#", "user_id" => ""]
        ];
    }

    echo json_encode($vendors, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_HEX_AMP);
    ?>;

    // Initialize with server data
    const QR_AUTHENTICATED_MEMBER_ID = <?php echo json_encode((string)$userId, JSON_HEX_QUOT | JSON_HEX_APOS); ?>;
    const QR_WEBSITE_CSRF = <?php echo json_encode($qrWebsiteCsrf, JSON_HEX_QUOT | JSON_HEX_APOS); ?>;
    const INITIAL_SCANNED = <?php echo json_encode($scannedVendors, JSON_HEX_QUOT | JSON_HEX_APOS); ?>;
  </script>

  <!-- jsQR library -->
  <script src="https://unpkg.com/jsqr@1.4.0/dist/jsQR.js"></script>

  <!-- Modified JavaScript to use server storage -->
  <script>
    // --- State Management ---
    let scanned = new Set(INITIAL_SCANNED);
    let rafId = null;
    let stream = null;
    let decoding = false;
    let lastDecoded = '';
    let currentVendorDrawOffer = null;
    let currentVendorDrawVendor = null;
    let vendorDrawOfferInFlight = false;
    let vendorDrawEntryInFlight = false;
    let vendorDrawEntryRecorded = false;
    let vendorDrawReturnFocus = null;
    let qrRulesNoticeAccepted = false;
    let qrRulesNoticeAcceptedScope = '';
    let appInitialized = false;
    let eventConfigRefreshStarted = false;
    let qrFixtureScanInFlight = false;

    const qrRulesNotice = document.getElementById('qrRulesNotice');
    const qrRulesNoticeAcknowledged = document.getElementById('qrRulesNoticeAcknowledged');
    // Only the authenticated fixture response renders this control and its ID.
    // The server revalidates that same fixture on the ordinary scan request.
    const qrFixtureScanButton = document.getElementById('qrFixtureScanButton');

    function canScanFixtureBooth() {
      if (!qrFixtureScanButton || qrFixtureScanInFlight || !hasCurrentParticipationNotice() ||
          EVENT_CONFIG.scan_enabled !== true || EVENT_CONFIG.show_scan_window_open !== true ||
          VENDORS.length !== 1) return false;
      const vendorId = qrFixtureScanButton.dataset.vendorId || '';
      return Boolean(vendorId && VENDORS[0].id === vendorId && VENDORS[0].user_id === vendorId);
    }

    function updateFixtureScanButton() {
      if (qrFixtureScanButton) qrFixtureScanButton.disabled = !canScanFixtureBooth();
    }

    function currentParticipationNoticeScope() {
      const storageKey = qrRulesNotice && qrRulesNotice.dataset.storageKey || '';
      const eventKey = String(EVENT_CONFIG.event_key || '').trim();
      const rulesVersion = String(EVENT_CONFIG.rules_version || '').trim();
      if (!storageKey || !eventKey || !rulesVersion ||
          PARTICIPATION_NOTICE_VERSION !== rulesVersion + '|2026-09-04-pre-scan-draw-consent') return '';
      // The server-generated key includes the signed-in account. The stored
      // value also binds event and both versions; old generic '1' values never
      // stand in for the expanded pre-scan eligibility/rules agreement.
      return JSON.stringify([storageKey, eventKey, rulesVersion, PARTICIPATION_NOTICE_VERSION]);
    }

    function hasCurrentParticipationNotice() {
      const scope = currentParticipationNoticeScope();
      return Boolean(CONTACT_PROFILE_COMPLETE && !eventConfigRefreshStarted &&
        scope && qrRulesNoticeAccepted && qrRulesNoticeAcceptedScope === scope);
    }

    function initializeRulesNotice() {
      if (!qrRulesNotice || !qrRulesNoticeAcknowledged) return;
      const storageKey = qrRulesNotice.dataset.storageKey || '';
      const scope = currentParticipationNoticeScope();
      let alreadyAcknowledged = false;
      if (storageKey && scope) {
        try {
          alreadyAcknowledged = window.localStorage.getItem(storageKey) === scope;
        } catch (error) {
          alreadyAcknowledged = false;
        }
      }
      if (alreadyAcknowledged) {
        qrRulesNoticeAccepted = true;
        qrRulesNoticeAcceptedScope = scope;
        qrRulesNoticeAcknowledged.checked = true;
        qrRulesNotice.hidden = true;
      }
      qrRulesNoticeAcknowledged.addEventListener('change', () => {
        const acceptedScope = currentParticipationNoticeScope();
        if (!qrRulesNoticeAcknowledged.checked || !acceptedScope || !CONTACT_PROFILE_COMPLETE) {
          qrRulesNoticeAccepted = false;
          qrRulesNoticeAcceptedScope = '';
          qrRulesNotice.hidden = false;
          try { window.localStorage.removeItem(storageKey); } catch (error) {}
          stopScanner();
          appInitialized = false;
          updateVendorDrawEntryButton();
          updateFixtureScanButton();
          return;
        }
        qrRulesNoticeAccepted = true;
        qrRulesNoticeAcceptedScope = acceptedScope;
        if (storageKey) {
          try {
            window.localStorage.setItem(storageKey, acceptedScope);
          } catch (error) {
            // The notice still dismisses for this page when storage is unavailable.
          }
        }
        qrRulesNotice.hidden = true;
        updateVendorDrawEntryButton();
        initApp();
      });
    }

    initializeRulesNotice();

    // --- Server Communication ---
    async function saveVendorScan(vendorId) {
      if (!hasCurrentParticipationNotice()) return false;
      try {
        const response = await fetch('', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `qr_csrf=${encodeURIComponent(QR_WEBSITE_CSRF)}&action=scan_vendor&vendor_id=${encodeURIComponent(vendorId)}&participation_notice_version=${encodeURIComponent(PARTICIPATION_NOTICE_VERSION)}&expected_event_key=${encodeURIComponent(EVENT_CONFIG.event_key)}&expected_config_revision=${encodeURIComponent(EVENT_CONFIG.revision)}`,
          credentials: 'same-origin',
          cache: 'no-store'
        });

        const data = await response.json();
        if (refreshPageAfterStaleEventConfig(response, data)) return false;
        if (!response.ok || data.status !== 'success') {
          throw new Error(data.message || 'Vendor scan could not be saved');
        }
        console.log('✅ Vendor scan saved to database');
        if (data.completed) {
          console.log('🎉 Bingo completed!');
        }
        return true;
      } catch (error) {
        if (eventConfigRefreshStarted) return false;
        console.error('Error saving vendor scan:', error);
        return false;
      }
    }

    async function loadScannedVendors() {
      try {
        const response = await fetch('', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `qr_csrf=${encodeURIComponent(QR_WEBSITE_CSRF)}&action=get_scanned&expected_event_key=${encodeURIComponent(EVENT_CONFIG.event_key)}&expected_config_revision=${encodeURIComponent(EVENT_CONFIG.revision)}`,
          credentials: 'same-origin',
          cache: 'no-store'
        });

        const data = await response.json();
        if (refreshPageAfterStaleEventConfig(response, data)) return;
        if (data.status === 'success') {
          scanned = new Set(data.scanned);
          hydrateTiles();
        }
      } catch (error) {
        if (eventConfigRefreshStarted) return;
        console.error('Error loading scanned vendors:', error);
      }
    }

    // --- UI Build ---
    const gridEl = document.getElementById('grid');
    const progressEl = document.getElementById('progress');
    const progressTextEl = document.getElementById('progressText');
    const lastScanEl = document.getElementById('lastScan');
    const doneBar = document.getElementById('doneBar');
    const successOverlay = document.getElementById('successOverlay');
    const vendorDrawModal = document.getElementById('vendorDrawModal');
    const vendorDrawDialog = document.getElementById('vendorDrawDialog');
    const vendorDrawTitle = document.getElementById('vendorDrawTitle');
    const vendorDrawVendor = document.getElementById('vendorDrawVendor');
    const vendorDrawDescription = document.getElementById('vendorDrawDescription');
    const vendorDrawDisclosure = document.getElementById('vendorDrawDisclosure');
    const vendorDrawPrivacy = document.getElementById('vendorDrawPrivacy');
    const vendorDrawTerms = document.getElementById('vendorDrawTerms');
    const vendorDrawRules = document.getElementById('vendorDrawRules');
    const vendorDrawStatus = document.getElementById('vendorDrawStatus');
    const vendorDrawDecline = document.getElementById('vendorDrawDecline');
    const vendorDrawEnter = document.getElementById('vendorDrawEnter');

    function cleanPromotionText(value) {
      return String(value == null ? '' : value).trim();
    }

    function refreshPageAfterStaleEventConfig(response, data) {
      if (!response || response.status !== 409 || cleanPromotionText(data && data.code) !== 'stale_event_config') {
        return false;
      }
      if (eventConfigRefreshStarted) return true;

      const nextConfig = data && typeof data.event_config === 'object' && data.event_config
        ? data.event_config
        : {};
      const nextEventKey = cleanPromotionText(nextConfig.event_key);
      const nextRevision = Number(nextConfig.revision);
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(nextEventKey)
          || !Number.isSafeInteger(nextRevision)
          || nextRevision < 1) {
        return false;
      }

      // Refresh the entire page instead of trusting a new revision alongside
      // the old event roster. The revision query value bypasses stale page
      // caches; the user's scan or draw choice is never replayed automatically.
      eventConfigRefreshStarted = true;
      stopScanner();
      startBtn.disabled = true;
      mobileStartBtn.disabled = true;
      lastScanEl.textContent = 'Wedding show settings changed. Refreshing QR Bingo — please scan again.';
      const refreshUrl = new URL(window.location.href);
      refreshUrl.searchParams.set('ww_qr_config_revision', String(nextRevision));
      window.location.replace(refreshUrl.toString());
      return true;
    }

    function trustedWeddingWinPromotionUrl(value) {
      try {
        const url = new URL(cleanPromotionText(value));
        const host = url.hostname.toLowerCase().replace(/^www[.]/, '');
        if (url.protocol !== 'https:' || host !== 'weddingwin.ca') return '';
        if ((url.port && url.port !== '443') || url.username || url.password) return '';
        return url.toString();
      } catch (error) {
        return '';
      }
    }

    function formatPromotionDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return cleanPromotionText(value) || 'See the current rules';
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      }).format(date);
    }

    function trustedVendorOfferVersion(value) {
      const text = cleanPromotionText(value);
      const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:[.]([0-9]{1,6}))?(Z|[+-]([0-9]{2}):([0-9]{2}))$/.exec(text);
      if (!match) return '';
      const offsetHour = match[9] ? Number(match[9]) : 0;
      const offsetMinute = match[10] ? Number(match[10]) : 0;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const calendar = new Date(0);
      calendar.setUTCFullYear(year, month - 1, day);
      calendar.setUTCHours(0, 0, 0, 0);
      if (year < 1 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return '';
      if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) return '';
      if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return '';
      return Number.isFinite(Date.parse(text)) ? text : '';
    }

    async function requestVendorDraw(action, extra) {
      if (!hasCurrentParticipationNotice()) {
        throw new Error('Read and accept the current QR Bingo agreement before continuing.');
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const form = new URLSearchParams({
          action,
          participation_notice_version: PARTICIPATION_NOTICE_VERSION,
          expected_event_key: EVENT_CONFIG.event_key,
          expected_config_revision: String(EVENT_CONFIG.revision)
        });
        Object.entries(extra || {}).forEach(([key, value]) => {
          form.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : cleanPromotionText(value));
        });
        form.set('qr_csrf', QR_WEBSITE_CSRF);
        const response = await fetch('', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: form.toString(),
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal
        });
        const responseText = await response.text();
        let data = {};
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch (error) {
          throw new Error('Vendor draw tools returned an unreadable response.');
        }
        if (refreshPageAfterStaleEventConfig(response, data)) {
          const staleError = new Error('Wedding show settings changed. Refreshing QR Bingo.');
          staleError.code = 'stale_event_config';
          staleError.httpStatus = 409;
          throw staleError;
        }
        if (!response.ok || data.ok === false) {
          const failure = new Error(cleanPromotionText(data.detail || data.error || data.message) || 'Vendor draw tools are unavailable.');
          failure.code = cleanPromotionText(data.code);
          failure.httpStatus = response.status;
          throw failure;
        }
        return data;
      } catch (error) {
        if (eventConfigRefreshStarted) throw error;
        if (error && error.name === 'AbortError') {
          throw new Error('Vendor draw tools timed out. Your booth visit remains saved.');
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    function resetVendorDrawChoice() {
      vendorDrawEntryRecorded = false;
    }

    function vendorDrawEntryReady() {
      const version = cleanPromotionText(currentVendorDrawOffer && currentVendorDrawOffer.consent_version);
      const offerVersion = trustedVendorOfferVersion(currentVendorDrawOffer && currentVendorDrawOffer.vendor_offer_version);
      const participantDisclosure = cleanPromotionText(currentVendorDrawOffer && currentVendorDrawOffer.participant_responsibility_disclosure);
      return Boolean(
        !vendorDrawEntryInFlight &&
        !vendorDrawEntryRecorded &&
        hasCurrentParticipationNotice() &&
        version === String(EVENT_CONFIG.rules_version || '').trim() &&
        offerVersion &&
        participantDisclosure
      );
    }

    function updateVendorDrawEntryButton() {
      vendorDrawEnter.disabled = !vendorDrawEntryReady();
    }

    function closeVendorDraw() {
      if (vendorDrawEntryInFlight) return;
      const returnFocus = vendorDrawReturnFocus;
      vendorDrawModal.hidden = true;
      currentVendorDrawOffer = null;
      currentVendorDrawVendor = null;
      vendorDrawReturnFocus = null;
      resetVendorDrawChoice();
      vendorDrawDecline.disabled = false;
      updateVendorDrawEntryButton();
      if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') {
        window.setTimeout(() => returnFocus.focus(), 0);
      }
    }

    function showVendorDrawOffer(vendor, offer) {
      const rulesUrl = trustedWeddingWinPromotionUrl(offer && offer.terms_url);
      const offerVersion = trustedVendorOfferVersion(offer && offer.vendor_offer_version);
      const participantDisclosure = cleanPromotionText(offer && offer.participant_responsibility_disclosure);
      const offeredWinnerCount = Number(offer && offer.prize_count);
      if (
        !hasCurrentParticipationNotice() ||
        !offer ||
        cleanPromotionText(offer.consent_version) !== String(EVENT_CONFIG.rules_version || '').trim() ||
        !rulesUrl ||
        !offerVersion ||
        !participantDisclosure ||
        !Number.isInteger(offeredWinnerCount) ||
        offeredWinnerCount < 1 ||
        offeredWinnerCount > 3 ||
        typeof offer.exclude_previous_winners !== 'boolean'
      ) return false;
      currentVendorDrawOffer = Object.assign({}, offer, {
        vendor_offer_version: offerVersion,
        prize_count: offeredWinnerCount
      });
      currentVendorDrawVendor = vendor;
      resetVendorDrawChoice();
      vendorDrawDecline.disabled = false;
      vendorDrawDecline.textContent = 'No Thanks';
      vendorDrawEnter.hidden = false;
      vendorDrawDisclosure.hidden = false;
      vendorDrawPrivacy.hidden = false;
      vendorDrawTerms.hidden = false;
      vendorDrawRules.hidden = false;
      vendorDrawTitle.textContent = cleanPromotionText(offer.prize_title) || 'Vendor prize';
      const namedVendor = cleanPromotionText(offer.vendor_business_name) || cleanPromotionText(offer.vendor_name) || cleanPromotionText(vendor && vendor.name) || 'the named vendor';
      vendorDrawVendor.textContent = namedVendor;
      vendorDrawDescription.textContent = cleanPromotionText(offer.prize_description);
      const value = Number(offer.prize_approx_value_cad);
      vendorDrawDisclosure.textContent = [
        `Approximate prize value / maximum savings: $${Number.isFinite(value) ? value.toFixed(2) : '0.00'} CAD`,
        `Number of winners and prizes: ${offeredWinnerCount}`,
        cleanPromotionText(offer.eligibility_region) ? `Eligibility: ${cleanPromotionText(offer.eligibility_region)}` : '',
        cleanPromotionText(offer.entry_closes_at) ? `Entries close: ${formatPromotionDate(offer.entry_closes_at)}` : '',
        cleanPromotionText(offer.draw_at) ? `Scheduled draw: ${formatPromotionDate(offer.draw_at)}` : '',
        cleanPromotionText(offer.odds_basis) ? `Odds: ${cleanPromotionText(offer.odds_basis)}` : '',
        offer.exclude_previous_winners
          ? "Repeat-winner rule: A couple who is confirmed as a winner is excluded only from later selections for this vendor's current prize offer. It does not affect another vendor's draw."
          : "Repeat-winner rule: A confirmed winner remains eligible for another selection in this vendor's current prize offer.",
        'No purchase from this vendor is required.',
        'This in-show QR entry replaces a paper ballot. Eligibility, dates, odds, admission, and entry limits are explained in the Draw Rules.'
      ].filter(Boolean).join(String.fromCharCode(10));
      vendorDrawPrivacy.textContent = `Enter Draw confirms you meet this vendor's eligibility requirements and accept its prize details and Draw Rules. Your contact details will be shared with ${namedVendor} for this draw and wedding-related marketing.`;
      vendorDrawRules.href = rulesUrl;
      vendorDrawStatus.classList.remove('is-error');
      vendorDrawStatus.textContent = 'Prize entry is separate and optional. One valid in-show QR entry is allowed per eligible couple for this vendor draw. Declining does not change your saved booth visit.';
      updateVendorDrawEntryButton();
      vendorDrawModal.hidden = false;
      vendorDrawRules.focus();
      return true;
    }

    function showVendorDrawStatus(vendor, message, isError) {
      if (!hasCurrentParticipationNotice()) return false;
      currentVendorDrawOffer = null;
      currentVendorDrawVendor = vendor;
      resetVendorDrawChoice();
      vendorDrawTitle.textContent = 'Draw status';
      vendorDrawVendor.textContent = cleanPromotionText(vendor && vendor.name);
      vendorDrawDescription.textContent = 'Your QR Bingo progress is unchanged.';
      vendorDrawDisclosure.hidden = true;
      vendorDrawPrivacy.hidden = true;
      vendorDrawTerms.hidden = true;
      vendorDrawRules.hidden = true;
      vendorDrawRules.removeAttribute('href');
      vendorDrawEnter.hidden = true;
      vendorDrawDecline.disabled = false;
      vendorDrawDecline.textContent = 'Close';
      vendorDrawStatus.textContent = cleanPromotionText(message) || 'This draw is not accepting new entries right now.';
      if (isError) vendorDrawStatus.classList.add('is-error');
      else vendorDrawStatus.classList.remove('is-error');
      updateVendorDrawEntryButton();
      vendorDrawModal.hidden = false;
      vendorDrawDecline.focus();
      return true;
    }

    async function openVendorDrawOffer(vendor, showUnavailable = false) {
      if (!hasCurrentParticipationNotice() || !EVENT_CONFIG.vendor_draws_enabled || !vendor ||
          vendorDrawOfferInFlight || vendorDrawEntryInFlight || !vendorDrawModal.hidden) return;
      vendorDrawOfferInFlight = true;
      vendorDrawReturnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      try {
        const data = await requestVendorDraw('raffle_offer', { vendor_id: vendor.id });
        if (data.ok === true && data.raffle_offer === null) {
          // An absent offer can mean already entered OR closed. Display the
          // server's status on an explicit review, without guessing which.
          if (!showUnavailable || !showVendorDrawStatus(vendor, data.message, false)) vendorDrawReturnFocus = null;
          return;
        }
        if (!data.raffle_offer || !showVendorDrawOffer(vendor, data.raffle_offer)) {
          throw new Error('The current vendor offer did not include a valid version. No entry can be submitted.');
        }
      } catch (error) {
        if (!showUnavailable || eventConfigRefreshStarted ||
            !showVendorDrawStatus(vendor, 'We could not load this draw. Close this message and try again.', true)) {
          vendorDrawReturnFocus = null;
        }
        console.error('Optional vendor draw could not be loaded:', error);
      } finally {
        vendorDrawOfferInFlight = false;
      }
    }

    async function refreshVendorDrawAfterStale(vendor) {
      currentVendorDrawOffer = null;
      currentVendorDrawVendor = vendor;
      resetVendorDrawChoice();
      updateVendorDrawEntryButton();
      vendorDrawDecline.disabled = false;
      vendorDrawStatus.classList.add('is-error');
      vendorDrawStatus.textContent = 'The vendor changed this offer. Loading the current version…';
      try {
        const refreshed = await requestVendorDraw('raffle_offer', { vendor_id: vendor.id });
        if (!refreshed.raffle_offer || !showVendorDrawOffer(vendor, refreshed.raffle_offer)) {
          throw new Error('The refreshed vendor offer was unavailable or invalid.');
        }
        vendorDrawStatus.classList.add('is-error');
        vendorDrawStatus.textContent = 'The vendor offer changed. Review the updated prize and Draw Rules, then choose Enter Draw or No Thanks.';
      } catch (refreshError) {
        currentVendorDrawOffer = null;
        resetVendorDrawChoice();
        updateVendorDrawEntryButton();
        vendorDrawStatus.classList.add('is-error');
        vendorDrawStatus.textContent = refreshError instanceof Error
          ? refreshError.message + ' No entry was recorded.'
          : 'The current vendor offer could not be refreshed. No entry was recorded.';
      }
    }

    async function enterVendorDraw() {
      if (!vendorDrawEntryReady() || !currentVendorDrawOffer || !currentVendorDrawVendor) return;
      vendorDrawEntryInFlight = true;
      vendorDrawEnter.disabled = true;
      vendorDrawDecline.disabled = true;
      vendorDrawStatus.classList.remove('is-error');
      vendorDrawStatus.textContent = 'Recording your optional draw entry…';
      const participationAccepted = hasCurrentParticipationNotice();
      try {
        const data = await requestVendorDraw('raffle_opt_in', {
          vendor_id: currentVendorDrawVendor.id,
          rules_viewed: participationAccepted,
          apple_non_sponsor_acknowledged: participationAccepted,
          consent_version: cleanPromotionText(currentVendorDrawOffer.consent_version),
          vendor_offer_version: trustedVendorOfferVersion(currentVendorDrawOffer.vendor_offer_version),
          age_of_majority_attested: participationAccepted,
          residency_attested: participationAccepted,
          exclusions_attested: participationAccepted,
          promotion_responsibility_acknowledged: participationAccepted,
          draw_administration_contact_share_acknowledged: participationAccepted,
          vendor_marketing_consent_acknowledged: participationAccepted,
          participant_responsibility_disclosure: cleanPromotionText(currentVendorDrawOffer.participant_responsibility_disclosure)
        });
        vendorDrawEntryRecorded = true;
        vendorDrawStatus.textContent = cleanPromotionText(data.message) || 'Your optional vendor draw entry is confirmed.';
        const confirmedOffer = currentVendorDrawOffer;
        const confirmedVendor = currentVendorDrawVendor;
        window.setTimeout(() => {
          if (vendorDrawEntryRecorded && currentVendorDrawOffer === confirmedOffer && currentVendorDrawVendor === confirmedVendor) {
            closeVendorDraw();
          }
        }, 1600);
      } catch (error) {
        if (error && error.httpStatus === 409 && error.code === 'stale_vendor_offer') {
          await refreshVendorDrawAfterStale(currentVendorDrawVendor);
          return;
        }
        vendorDrawStatus.classList.add('is-error');
        vendorDrawStatus.textContent = error instanceof Error ? error.message : 'The draw entry could not be recorded.';
        vendorDrawDecline.disabled = false;
        updateVendorDrawEntryButton();
      } finally {
        vendorDrawEntryInFlight = false;
        vendorDrawDecline.disabled = false;
        updateVendorDrawEntryButton();
      }
    }

    vendorDrawDecline.addEventListener('click', closeVendorDraw);
    vendorDrawEnter.addEventListener('click', enterVendorDraw);
    vendorDrawModal.addEventListener('click', event => {
      if (event.target === vendorDrawModal) closeVendorDraw();
    });
    document.addEventListener('keydown', event => {
      if (vendorDrawModal.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeVendorDraw();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(vendorDrawDialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'))
        .filter(element => !element.disabled && !element.hidden && element.getAttribute('tabindex') !== '-1');
      if (!focusable.length) {
        event.preventDefault();
        vendorDrawDialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !vendorDrawDialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !vendorDrawDialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });

    function renderGrid() {
      if (!gridEl) {
        console.error('Grid element not found!');
        return;
      }

      gridEl.replaceChildren();
      VENDORS.forEach(v => {
        const tile = document.createElement('div');
        tile.className = 'tile locked';
        tile.id = `tile-${v.id}`;

        const placeholder = document.createElement('div');
        placeholder.className = 'vendor-image placeholder';
        placeholder.textContent = '📷';
        if (v.cover_photo && v.cover_photo.trim()) {
          const image = document.createElement('img');
          image.src = v.cover_photo;
          image.alt = v.name || 'Wedding vendor';
          image.className = 'vendor-image';
          placeholder.style.display = 'none';
          image.addEventListener('error', () => {
            image.style.display = 'none';
            placeholder.style.display = 'flex';
          });
          tile.appendChild(image);
          tile.appendChild(placeholder);
        } else {
          tile.appendChild(placeholder);
        }

        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = v.name || 'Wedding vendor';
        const check = document.createElement('div');
        check.className = 'check';
        check.textContent = '✓';
        tile.appendChild(name);
        tile.appendChild(check);
        if (EVENT_CONFIG.vendor_draws_enabled) {
          const drawButton = document.createElement('button');
          drawButton.type = 'button';
          drawButton.className = 'vendor-draw-review';
          drawButton.id = `vendor-draw-review-${v.id}`;
          drawButton.textContent = 'Review optional prize draw';
          drawButton.hidden = !scanned.has(v.id);
          drawButton.addEventListener('click', event => {
            event.stopPropagation();
            openVendorDrawOffer(v, true);
          });
          tile.appendChild(drawButton);
        }
        gridEl.appendChild(tile);
      });
      updateProgress();
      console.log('✅ Grid rendered with', VENDORS.length, 'vendor tiles');
    }

    async function markScanned(id) {
      if (!hasCurrentParticipationNotice()) return false;
      if (!VENDORS.find(v => v.id === id)) return false;
      if (scanned.has(id)) return true;

      // Never show a successful scan until the server confirms persistence.
      const saved = await saveVendorScan(id);
      if (!saved) return false;
      scanned.add(id);

      const tile = document.getElementById(`tile-${id}`);
      if (tile) {
        tile.classList.remove('locked');
        tile.classList.add('scanned');
        const drawButton = document.getElementById(`vendor-draw-review-${id}`);
        if (drawButton) drawButton.hidden = false;
      }
      updateProgress();
      return true;
    }

    function updateProgress() {
      const total = VENDORS.length;
      const count = scanned.size;
      const pct = Math.round((count / total) * 100);
      progressEl.style.width = pct + '%';
      const bar = document.querySelector('.progress-bar');
      bar.setAttribute('aria-valuenow', count);
      bar.setAttribute('aria-valuemax', total);
      progressTextEl.textContent = `${count} / ${total} scanned`;
      doneBar.classList.toggle('on', count === total);
    }

    function showSuccessAnimation() {
      successOverlay.style.display = 'flex';
      // Hide after animation completes
      setTimeout(() => {
        successOverlay.style.display = 'none';
      }, 1200);
    }

    function hydrateTiles() {
      VENDORS.forEach(v => {
        const tile = document.getElementById(`tile-${v.id}`);
        if (scanned.has(v.id)) {
          tile?.classList.remove('locked');
          tile?.classList.add('scanned');
          const drawButton = document.getElementById(`vendor-draw-review-${v.id}`);
          if (drawButton) drawButton.hidden = false;
        }
      });
      updateProgress();
    }

    // --- Camera / Scanning ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('frame');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const cameraSelect = document.getElementById('cameraSelect');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    // Mobile controls
    const mobileStartBtn = document.getElementById('mobileStartBtn');
    const mobileStopBtn = document.getElementById('mobileStopBtn');
    const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');
    const cameraSelectMobile = document.getElementById('cameraSelectMobile');
    const cameraSelectMobile2 = document.getElementById('cameraSelectMobile2');
    const scanningIndicator = document.getElementById('scanningIndicator');
    const cameraLoading = document.getElementById('cameraLoading');

    async function enumerateCameras() {
      cameraSelect.innerHTML = '';
      cameraSelectMobile2.innerHTML = '';

      try {
        // Request permission first on Android to get device labels
        if (isAndroid()) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            tempStream.getTracks().forEach(track => track.stop());
          } catch (permErr) {
            console.log('📱 Permission request for camera enumeration failed:', permErr);
          }
        }

        const devices = (await navigator.mediaDevices.enumerateDevices())
          .filter(d => d.kind === 'videoinput');

        console.log('📹 Raw devices found:', devices.length);

        // Enhanced function to detect rear cameras (multi-language support + device-specific patterns)
        const isRearCamera = (label, deviceId, cameraIndex) => {
          const lowerLabel = label.toLowerCase();
          const rearKeywords = [
            // English
            'back', 'rear', 'environment', 'main', 'primary',
            // Spanish
            'trasera', 'posterior', 'atrás', 'atras',
            // French
            'arrière', 'arriere',
            // German
            'hinten', 'rück',
            // Italian
            'posteriore',
            // Portuguese
            'traseira',
            // Android-specific patterns
            'facing back', 'camera2 api', 'back-facing',
            // Samsung-specific patterns (Galaxy S23, S22, etc.)
            'camera2 0', 'camera 0', 'wide', 'ultra wide',
            // Generic patterns for primary cameras
            'cam 0', 'cam_0', 'camera_0'
          ];

          const frontKeywords = [
            'front', 'frontal', 'user', 'selfie', 'facing front',
            'delantera', 'frontal', 'usuario', 'selfie',
            // Samsung front camera patterns
            'front facing', 'camera2 1', 'camera 1', 'cam 1', 'cam_1', 'camera_1'
          ];

          // Special handling for Samsung devices (Galaxy S23, etc.)
          const isSamsung = navigator.userAgent.toLowerCase().includes('samsung') ||
                          lowerLabel.includes('samsung');

          // Check for explicit front camera indicators first
          const isExplicitlyFront = frontKeywords.some(keyword => lowerLabel.includes(keyword));
          if (isExplicitlyFront) {
            console.log(`📱 Detected front camera: ${label} (explicitly marked as front)`);
            return false;
          }

          // Check for explicit rear camera indicators
          const isExplicitlyRear = rearKeywords.some(keyword => lowerLabel.includes(keyword));
          if (isExplicitlyRear) {
            console.log(`📱 Detected rear camera: ${label} (explicitly marked as rear)`);
            return true;
          }

          // For unlabeled cameras or generic labels, use device-specific heuristics
          if (!label || label === '' || label.includes('camera') || lowerLabel === 'camera') {
            // On most mobile devices, camera index 0 is typically the rear camera
            // Samsung Galaxy devices follow this pattern
            if (isSamsung || isAndroid()) {
              const isFirstCamera = cameraIndex === 0;
              console.log(`📱 Samsung/Android heuristic: Camera ${cameraIndex} - treating as ${isFirstCamera ? 'REAR' : 'FRONT'}`);
              return isFirstCamera;
            }
            // On iOS, first camera is also usually rear
            if (isiOS()) {
              const isFirstCamera = cameraIndex === 0;
              console.log(`📱 iOS heuristic: Camera ${cameraIndex} - treating as ${isFirstCamera ? 'REAR' : 'FRONT'}`);
              return isFirstCamera;
            }
          }

          // Default fallback: if no clear indicators, assume rear camera for better QR scanning
          console.log(`📱 Default fallback: ${label} - assuming REAR camera`);
          return true;
        };

        // Sort cameras to prioritize rear cameras, with enhanced mobile device handling
        const sortedDevices = devices.sort((a, b) => {
          // Get original indexes to help with camera detection
          const aIndex = devices.indexOf(a);
          const bIndex = devices.indexOf(b);

          const aIsRear = isRearCamera(a.label, a.deviceId, aIndex);
          const bIsRear = isRearCamera(b.label, b.deviceId, bIndex);

          // Prioritize rear cameras
          if (aIsRear && !bIsRear) return -1;
          if (!aIsRear && bIsRear) return 1;

          // If both are rear or both are front, maintain original order
          // This ensures camera 0 comes before camera 1, etc.
          return aIndex - bIndex;
        });

        let firstRearCameraSet = false;
        console.log('📹 Available cameras:', sortedDevices.map(d => ({
          label: d.label || 'Unlabeled Camera',
          deviceId: d.deviceId.substring(0, 10) + '...',
          isAndroid: isAndroid()
        })));

        sortedDevices.forEach((d, idx) => {
          const opt = document.createElement('option');
          const opt2 = document.createElement('option');
          opt.value = d.deviceId;
          opt2.value = d.deviceId;
          // Use the original device index for proper camera detection
          const originalIndex = devices.indexOf(d);
          const isRear = isRearCamera(d.label, d.deviceId, originalIndex);

          // Android-friendly display names
          let displayName = d.label;
          if (!displayName || displayName === '' || displayName.includes('camera')) {
            displayName = `Camera ${idx + 1}`;
            if (isAndroid()) {
              displayName += idx === 0 ? ' (Main/Rear)' : ` (Camera ${idx + 1})`;
            } else {
              displayName += isRear ? ' (Rear)' : ' (Front)';
            }
          } else {
            displayName += isRear ? ' (Rear)' : ' (Front)';
          }

          opt.textContent = displayName;
          opt2.textContent = displayName;

          // Auto-select the first rear camera with enhanced mobile detection
          if (isRear && !firstRearCameraSet) {
            opt.selected = true;
            opt2.selected = true;
            firstRearCameraSet = true;
            console.log('🎯 Auto-selected REAR camera:', displayName,
                       `(Original index: ${originalIndex}, Sorted index: ${idx})`);
          }

          cameraSelect.appendChild(opt);
          cameraSelectMobile2.appendChild(opt2);
          console.log(`📷 Camera ${idx + 1}: ${displayName} (${isRear ? 'REAR' : 'front'})`);
        });

        // Enhanced fallback strategy for rear camera selection
        if (!firstRearCameraSet && sortedDevices.length > 0) {
          console.log('⚠️ No rear camera auto-selected yet, trying fallback strategy...');

          // Try to find any rear camera in the list (not just the first one)
          let fallbackRearCameraIndex = -1;
          for (let i = 0; i < sortedDevices.length; i++) {
            const originalIndex = devices.indexOf(sortedDevices[i]);
            if (isRearCamera(sortedDevices[i].label, sortedDevices[i].deviceId, originalIndex)) {
              fallbackRearCameraIndex = i;
              console.log(`🔍 Found rear camera at position ${i}:`, sortedDevices[i].label);
              break;
            }
          }

          if (fallbackRearCameraIndex >= 0) {
            // Select the found rear camera
            cameraSelect.selectedIndex = fallbackRearCameraIndex;
            cameraSelectMobile2.selectedIndex = fallbackRearCameraIndex;
            cameraSelect.options[fallbackRearCameraIndex].selected = true;
            cameraSelectMobile2.options[fallbackRearCameraIndex].selected = true;
            console.log('🎯 Fallback: Selected rear camera at index', fallbackRearCameraIndex);
          } else {
            // Last resort: select first camera available
            console.log('⚠️ No rear camera found anywhere, using first available camera');
            cameraSelect.selectedIndex = 0;
            cameraSelectMobile2.selectedIndex = 0;
          }
        }

        // Hide camera settings button if only one camera
        if (sortedDevices.length <= 1) {
          mobileSettingsBtn.classList.add('single-camera');
        } else {
          mobileSettingsBtn.classList.remove('single-camera');
        }

        // Android-specific logging
        if (isAndroid()) {
          console.log('📱 Android camera enumeration complete. Found', sortedDevices.length, 'cameras');
        }

      } catch (err) {
        console.warn('📹 Camera enumeration failed:', err);

        // Android fallback: Add default options
        if (isAndroid()) {
          console.log('📱 Adding default Android camera options');
          const defaultOption = document.createElement('option');
          const defaultOption2 = document.createElement('option');
          defaultOption.value = '';
          defaultOption2.value = '';
          defaultOption.textContent = 'Default Camera (Rear)';
          defaultOption2.textContent = 'Default Camera (Rear)';
          cameraSelect.appendChild(defaultOption);
          cameraSelectMobile2.appendChild(defaultOption2);
        }
      }
    }

    // Detect Android and mobile browsers
    function isAndroid() {
      return /Android/i.test(navigator.userAgent);
    }

    function isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function isOldAndroid() {
      const match = navigator.userAgent.match(/Android ([0-9]+)/);
      return match && parseInt(match[1]) < 10;
    }

    function isiOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    // New function to switch cameras without stopping the scanner
    async function switchCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.warn('getUserMedia not available for camera switching');
        return;
      }

      // Show loading indicator
      cameraLoading.classList.add('show');

      // Get the selected camera
      const selectedCamera = cameraSelect.value || cameraSelectMobile2.value;
      if (!selectedCamera) {
        console.warn('No camera selected for switching');
        cameraLoading.classList.remove('show');
        return;
      }

      // Android-specific optimizations
      const isAndroidDevice = isAndroid();
      const isOldAndroidDevice = isOldAndroid();

      // Build constraints for the new camera
      const constraints = {
        video: {
          deviceId: { exact: selectedCamera },
          // Lower resolution for older Android devices
          width: { ideal: isOldAndroidDevice ? 640 : 1280 },
          height: { ideal: isOldAndroidDevice ? 480 : 720 },
          // Frame rate optimization for Android
          frameRate: { ideal: isAndroidDevice ? 15 : 30, max: 30 }
        },
        audio: false
      };

      try {
        // Get the new camera stream
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Verify stream is valid
        if (!newStream || !newStream.getVideoTracks().length) {
          throw new Error('No video tracks in new stream');
        }

        // Stop the current stream
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        // Set the new stream
        stream = newStream;
        video.srcObject = stream;

        // Android-specific video setup
        if (isAndroidDevice) {
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
        }

        await video.play();

        // Verify video is actually playing
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video play timeout')), 5000);
          const checkVideo = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(checkVideo, 100);
            }
          };
          checkVideo();
        });

        // Hide loading indicator
        cameraLoading.classList.remove('show');

        const selectedText = cameraSelect.options[cameraSelect.selectedIndex]?.text ||
                           cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text;
        console.log('📹 Camera switched successfully to:', selectedText);
        console.log('📹 New video dimensions:', video.videoWidth, 'x', video.videoHeight);

      } catch (err) {
        console.error('❌ Camera switching failed:', err);
        cameraLoading.classList.remove('show');

        // Show user-friendly error message
        const selectedText = cameraSelect.options[cameraSelect.selectedIndex]?.text ||
                           cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text || 'selected camera';
        alert(`Failed to switch to ${selectedText}. The camera might be in use by another application.`);
      }
    }

    async function startScanner() {
      if (!CONTACT_PROFILE_COMPLETE) {
        window.location.assign('/account/contact');
        return;
      }
      if (!hasCurrentParticipationNotice()) {
        lastScanEl.textContent = 'Read and accept the participation notice before scanning.';
        qrRulesNoticeAcknowledged.focus();
        return;
      }
      if (!EVENT_CONFIG.scan_enabled || !EVENT_CONFIG.show_scan_window_open) {
        lastScanEl.textContent = 'Scanning is available only during the wedding show while the scanner is enabled.';
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        const message = isAndroid() ?
          'Camera access not supported. Please use Chrome or Firefox on Android.' :
          'Your browser does not support camera access. Try a modern browser.';
        alert(message);
        return;
      }
      stopScanner();

      // Show loading indicator
      cameraLoading.classList.add('show');

      // Android-specific optimizations
      const isAndroidDevice = isAndroid();
      const isMobileDevice = isMobile();
      const isOldAndroidDevice = isOldAndroid();

      console.log('📱 Device info:', { isAndroidDevice, isMobileDevice, isOldAndroidDevice });

      // Build Android-optimized constraints
      const constraints = {
        video: {
          // Lower resolution for older Android devices
          width: { ideal: isOldAndroidDevice ? 640 : 1280 },
          height: { ideal: isOldAndroidDevice ? 480 : 720 },
          // Frame rate optimization for Android
          frameRate: { ideal: isAndroidDevice ? 15 : 30, max: 30 }
        },
        audio: false
      };

      // Check both desktop and mobile camera selects
      const selectedCamera = cameraSelect.value || cameraSelectMobile2.value;
      if (selectedCamera) {
        constraints.video.deviceId = { exact: selectedCamera };
        const selectedText = cameraSelect.options[cameraSelect.selectedIndex]?.text ||
                           cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text;
        console.log('📹 Using selected camera:', selectedText);
      } else {
        // Android-specific camera selection
        if (isAndroidDevice) {
          // Use ideal instead of exact for better Android compatibility
          constraints.video.facingMode = { ideal: 'environment' };
        } else {
          constraints.video.facingMode = { exact: 'environment' };
        }
        console.log('📹 Requesting rear camera for', isAndroidDevice ? 'Android' : 'other device');
      }

      console.log('📹 Camera constraints:', constraints);

      // Try multiple camera access strategies with Android-specific fallbacks
      const strategies = [
        // Strategy 1: Try with specified constraints
        async () => {
          console.log('🔄 Strategy 1: Using specified constraints');
          return await navigator.mediaDevices.getUserMedia(constraints);
        },

        // Strategy 2: Android fallback with simplified constraints
        async () => {
          console.log('🔄 Strategy 2: Android simplified constraints');
          const fallbackConstraints = {
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: { ideal: 'environment' }
            },
            audio: false
          };
          if (selectedCamera) {
            fallbackConstraints.video.deviceId = { ideal: selectedCamera };
          }
          return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        },

        // Strategy 3: Try without facingMode (for problematic Android devices)
        async () => {
          console.log('🔄 Strategy 3: No facingMode constraint');
          const basicConstraints = {
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 }
            },
            audio: false
          };
          if (selectedCamera) {
            basicConstraints.video.deviceId = { ideal: selectedCamera };
          }
          return await navigator.mediaDevices.getUserMedia(basicConstraints);
        },

        // Strategy 4: Minimal constraints (last resort)
        async () => {
          console.log('🔄 Strategy 4: Minimal constraints');
          return await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      ];

      // Try each strategy
      for (let i = 0; i < strategies.length; i++) {
        try {
          console.log(`📹 Attempting camera access strategy ${i + 1}/${strategies.length}`);
          stream = await strategies[i]();

          // Verify stream is valid
          if (!stream || !stream.getVideoTracks().length) {
            throw new Error('No video tracks in stream');
          }

          video.srcObject = stream;

          // Android-specific video setup
          if (isAndroidDevice) {
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            video.muted = true;
          }

          await video.play();

          // Verify video is actually playing
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Video play timeout')), 5000);
            const checkVideo = () => {
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                clearTimeout(timeout);
                resolve();
              } else {
                setTimeout(checkVideo, 100);
              }
            };
            checkVideo();
          });

          // Success!
          stopBtn.disabled = false;
          startBtn.disabled = true;
          startBtn.textContent = 'Scanner Running';
          mobileStopBtn.disabled = false;
          mobileStartBtn.disabled = true;
          mobileStartBtn.title = 'Scanner running';
          lastScanEl.textContent = 'Scanner ready. Point the camera at a participating vendor QR code.';
          // scanningIndicator.classList.add('active'); // REMOVED - no longer showing indicator
          cameraLoading.classList.remove('show');

          console.log(`✅ Camera started successfully with strategy ${i + 1}`);
          console.log('📹 Video dimensions:', video.videoWidth, 'x', video.videoHeight);

          scanLoop();
          return;

        } catch (err) {
          console.error(`❌ Strategy ${i + 1} failed:`, err);

          // Clean up failed stream
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
          }

          // Continue to next strategy unless this was the last one
          if (i === strategies.length - 1) {
            // This was the last strategy, show error
            cameraLoading.classList.remove('show');

            let errorMessage = 'Unable to access camera. ';

            if (isAndroidDevice) {
              errorMessage += [
                'Android troubleshooting:',
                '• Allow camera permission when prompted',
                '• Try Chrome or Firefox browser',
                '• Check if other apps are using the camera',
                ''
              ].join(String.fromCharCode(10));
              errorMessage += '• Try restarting your browser';
            } else {
              errorMessage += 'Please allow camera permission and try again.';
            }

            console.error('🚨 All camera strategies failed. Final error:', err);
            startBtn.disabled = false;
            startBtn.textContent = 'Start Scanner';
            mobileStartBtn.disabled = false;
            mobileStartBtn.title = 'Start Scanner';
            alert(errorMessage);
          }
        }
      }
    }

    function stopScanner() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      stopBtn.disabled = true;
      startBtn.disabled = false;
      startBtn.textContent = 'Start Scanner';
      mobileStopBtn.disabled = true;
      mobileStartBtn.disabled = false;
      mobileStartBtn.title = 'Start Scanner';
      // scanningIndicator.classList.remove('active'); // REMOVED - no longer using indicator
      cameraLoading.classList.remove('show');
    }

    function scanLoop() {
      if (!video.videoWidth) {
        rafId = requestAnimationFrame(scanLoop);
        return;
      }

      const w = video.videoWidth, h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;

      // Android optimization: Use lower frame rate for scanning
      const frameSkip = isAndroid() ? 3 : 1; // Scan every 3rd frame on Android
      if (!window.frameCounter) window.frameCounter = 0;
      window.frameCounter++;

      ctx.drawImage(video, 0, 0, w, h);

      if (window.frameCounter % frameSkip === 0) {
        try {
          decodeFrame();
        } catch (e) {
          /* ignore transient errors */
        }
      }

      rafId = requestAnimationFrame(scanLoop);
    }

    function decodeFrame() {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (typeof jsQR !== 'function') {
        console.log('❌ jsQR is not available');
        return;
      }

      // Android optimization: Use different scanning options
      const scanOptions = isAndroid() ?
        {
          inversionAttempts: 'dontInvert',
          // Reduce scan region for better performance on Android
          canOverwriteImage: true
        } :
        {
          inversionAttempts: 'attemptBoth',
          canOverwriteImage: true
        };

      const code = jsQR(imgData.data, canvas.width, canvas.height, scanOptions);
      if (code && code.data && code.data !== lastDecoded) {
        console.log('📱 QR detected on', isAndroid() ? 'Android' : 'other device', '!');
        lastDecoded = code.data;
        handleDecoded(code.data);
      }
    }

    function extractWeddingWinQrVendorId(value) {
      try {
        const url = new URL(String(value || '').trim());
        const host = url.hostname.toLowerCase().replace(/^www[.]/, '');
        const path = url.pathname.replace(/[/]+$/, '') || '/';
        if (url.protocol !== 'https:' || host !== 'weddingwin.ca' || path !== '/qr') return '';
        if ((url.port && url.port !== '443') || url.username || url.password || url.hash) return '';

        const entries = Array.from(url.searchParams.entries());
        if (entries.length !== 1 || entries[0][0] !== 'vendor_id') return '';
        const vendorId = String(entries[0][1] || '').trim();
        return /^[1-9][0-9]{0,19}$/.test(vendorId) ? vendorId : '';
      } catch (error) {
        return '';
      }
    }

    function resetLastDecodedForRetry(value) {
      // Avoid hammering the server or alerting on every camera frame, while
      // still allowing the same QR to be presented again after a failed or
      // unrecognized attempt. A successful saved scan remains suppressed.
      window.setTimeout(() => {
        if (lastDecoded === value) lastDecoded = '';
      }, 1000);
    }

    async function handleDecoded(data) {
      const raw = data.trim();
      const vendorId = extractWeddingWinQrVendorId(raw);
      console.log('🔍 QR Decoded:', raw);
      const matched = vendorId
        ? VENDORS.find(v => v.id === vendorId || (v.user_id && v.user_id.toString() === vendorId))
        : null;
      console.log('🎯 Canonical QR match:', matched ? `Found ${matched.name}` : 'No match');

      if (matched) {
        const ok = await markScanned(matched.id);
        if (ok) {
          lastScanEl.textContent = `Scanned: ${matched.name}`;
          // Show success animation
          showSuccessAnimation();
          console.log('✅ Successfully marked vendor:', matched.name);
          await openVendorDrawOffer(matched);
        } else {
          if (!eventConfigRefreshStarted) {
            lastScanEl.textContent = 'Scan could not be saved. Please try again.';
            resetLastDecodedForRetry(raw);
            console.log('❌ Vendor scan was not saved:', matched.name);
          }
        }
      } else {
        lastScanEl.textContent = 'Unrecognized QR';
        resetLastDecodedForRetry(raw);
        console.log('❌ No vendor matched for:', raw);
      }
    }

    async function scanFixtureBooth() {
      if (!canScanFixtureBooth() || vendorDrawEntryInFlight || !vendorDrawModal.hidden) return;
      qrFixtureScanInFlight = true;
      qrFixtureScanButton.textContent = 'Saving test scan...';
      updateFixtureScanButton();
      try {
        await handleDecoded('https://www.weddingwin.ca/qr?vendor_id=' + encodeURIComponent(qrFixtureScanButton.dataset.vendorId));
      } finally {
        qrFixtureScanInFlight = false;
        qrFixtureScanButton.textContent = 'Scan test booth';
        updateFixtureScanButton();
      }
    }

    if (qrFixtureScanButton) qrFixtureScanButton.addEventListener('click', scanFixtureBooth);

    // Event listeners for desktop controls
    startBtn.addEventListener('click', startScanner);
    stopBtn.addEventListener('click', stopScanner);

    // Event listeners for mobile controls
    mobileStartBtn.addEventListener('click', startScanner);
    mobileStopBtn.addEventListener('click', stopScanner);

    // Enhanced mobile settings toggle with visual feedback
    mobileSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = cameraSelectMobile.classList.contains('show');

      if (isOpen) {
        // Close dropdown
        cameraSelectMobile.classList.remove('show');
        mobileSettingsBtn.classList.remove('active');
      } else {
        // Open dropdown
        cameraSelectMobile.classList.add('show');
        mobileSettingsBtn.classList.add('active');

        // Focus the select element for better accessibility
        setTimeout(() => {
          const selectElement = cameraSelectMobile.querySelector('select');
          if (selectElement) {
            selectElement.focus();
          }
        }, 100);
      }
    });

    // Enhanced click outside handler with better touch support
    document.addEventListener('click', (e) => {
      if (!mobileSettingsBtn.contains(e.target) && !cameraSelectMobile.contains(e.target)) {
        cameraSelectMobile.classList.remove('show');
        mobileSettingsBtn.classList.remove('active');
      }
    });

    // Handle escape key to close dropdown
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cameraSelectMobile.classList.contains('show')) {
        cameraSelectMobile.classList.remove('show');
        mobileSettingsBtn.classList.remove('active');
        mobileSettingsBtn.focus();
      }
    });

    // Sync camera selection between desktop and mobile, and switch camera if scanner is running
    cameraSelect.addEventListener('change', () => {
      cameraSelectMobile2.value = cameraSelect.value;

      // If scanner is running (start button is disabled), switch camera without stopping
      if (stream && startBtn.disabled) {
        switchCamera();
      }
    });

    cameraSelectMobile2.addEventListener('change', () => {
      cameraSelect.value = cameraSelectMobile2.value;

      // Close dropdown and remove active state with animation
      cameraSelectMobile.classList.remove('show');
      mobileSettingsBtn.classList.remove('active');

      // Show visual feedback for camera switch
      const selectedText = cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text;
      console.log('📹 User selected camera:', selectedText);

      // If scanner is running (mobile start button is disabled), switch camera without stopping
      if (stream && mobileStartBtn.disabled) {
        // Provide immediate visual feedback
        cameraLoading.classList.add('show');
        switchCamera();
      }
    });


    // Initialize with auto-start functionality
    function initApp() {
      updateFixtureScanButton();
      if (!CONTACT_PROFILE_COMPLETE) return;
      if (!hasCurrentParticipationNotice()) {
        startBtn.disabled = true;
        startBtn.textContent = 'Accept Notice First';
        mobileStartBtn.disabled = true;
        mobileStartBtn.title = 'Accept participation notice first';
        cameraLoading.classList.remove('show');
        lastScanEl.textContent = 'Read and accept the participation notice above to start scanning.';
        return;
      }
      if (appInitialized) return;
      appInitialized = true;
      startBtn.disabled = true;
      startBtn.textContent = 'Starting Scanner...';
      mobileStartBtn.disabled = true;
      mobileStartBtn.title = 'Starting scanner';
      lastScanEl.textContent = 'Participation notice accepted. Starting the scanner...';
      // Android-specific initialization logging
      if (isAndroid()) {
        console.log('📱 Android device detected');
        console.log('📱 User Agent:', navigator.userAgent);
        console.log('📱 Android Version:', navigator.userAgent.match(/Android ([0-9]+)/)?.[1] || 'unknown');
        console.log('📱 Browser:', navigator.userAgent.includes('Chrome') ? 'Chrome' :
                                    navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other');

        // Check for known Android camera issues
        if (isOldAndroid()) {
          console.log('⚠️ Old Android version detected - using compatibility mode');
        }
      }

      renderGrid();
      hydrateTiles();

      if (!EVENT_CONFIG.scan_enabled) {
        startBtn.disabled = true;
        startBtn.textContent = 'Scanner Paused';
        mobileStartBtn.disabled = true;
        mobileStartBtn.title = 'Scanner paused';
        stopBtn.disabled = true;
        mobileStopBtn.disabled = true;
        cameraLoading.classList.remove('show');
        lastScan.textContent = 'Scanning is temporarily disabled.';
        console.log('QR Bingo scanning disabled by published event configuration.');
        return;
      }

      if (!EVENT_CONFIG.show_scan_window_open) {
        startBtn.disabled = true;
        startBtn.textContent = 'Opens at the Show';
        mobileStartBtn.disabled = true;
        mobileStartBtn.title = 'Scanning opens at the show';
        stopBtn.disabled = true;
        mobileStopBtn.disabled = true;
        cameraLoading.classList.remove('show');
        lastScan.textContent = `Scanning is available from ${formatPromotionDate(EVENT_CONFIG.history_starts_at)} until ${formatPromotionDate(EVENT_CONFIG.entry_closes_at)}.`;
        console.log('QR Bingo scanning is outside the configured wedding-show window.');
        return;
      }

      // Auto-start camera initialization and scanning
      (async function() {
        let cameraPermissionGranted = false;

        // Show initial loading state
        cameraLoading.classList.add('show');

        try {
          // Try to get camera permission and enumerate cameras
          if (isAndroid()) {
            console.log('📱 Requesting camera permission for Android auto-start...');
          } else {
            console.log('📹 Requesting camera permission for auto-start...');
          }

          const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          tmp.getTracks().forEach(t => t.stop());
          console.log('✅ Camera permission granted - proceeding with auto-start');
          cameraPermissionGranted = true;

        } catch (permError) {
          console.log('⚠️ Camera permission denied or failed:', permError);
          console.log('🔴 Auto-start disabled - user will need to click start button');

          // Hide loading indicator
          cameraLoading.classList.remove('show');

          // Show a user-friendly message about camera permission
          const permissionMessage = isAndroid() ?
            'Camera access is required for QR scanning. Please allow camera access and click the Start button.' :
            'Camera access is required for QR scanning. Please allow camera access and click the Start button.';

          // You could show this message in a toast or alert if desired
          console.log('📝 Permission message:', permissionMessage);
        }

        // Always enumerate cameras (even if permission failed, for UI purposes)
        await enumerateCameras();

        // Auto-start scanner if permission was granted
        if (cameraPermissionGranted) {
          console.log('🚀 Auto-starting QR scanner...');

          // Small delay to ensure UI is ready
          setTimeout(async () => {
            try {
              await startScanner();
              console.log('✅ QR scanner auto-started successfully');
            } catch (startError) {
              console.error('❌ Auto-start failed:', startError);
              console.log('🔄 User will need to manually start the scanner');

              // Reset button states to allow manual start
              startBtn.disabled = false;
              startBtn.textContent = 'Start Scanner';
              mobileStartBtn.disabled = false;
              mobileStartBtn.title = 'Start Scanner';
            }
          }, 500);
        } else {
          // Camera permission was denied, enable manual start
          console.log('🔄 Enabling manual start buttons due to permission denial');
          startBtn.disabled = false;
          startBtn.textContent = 'Start Scanner';
          mobileStartBtn.disabled = false;
          mobileStartBtn.title = 'Start Scanner';

          // Hide loading indicator
          cameraLoading.classList.remove('show');
        }
      })();

      console.log('🎉 QR Bingo initialized successfully');
    }

    // Ensure DOM is ready before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  </script>
</body>
</html>

<?php
    } else {
        // The scanner is reserved for the free couple account types.
        echo "<div style='padding: 20px; text-align: center;'>";
        echo "<h2>Couple Account Required</h2>";
        echo "<p>The free QR Bingo Scanner is available to signed-in couple accounts during participating events.</p>";
        echo "<p>Use or create a free couple account to record booth visits.</p>";
        echo "</div>";
    }
} else {
    // User is not logged in
    echo "<div style='padding: 20px; text-align: center;'>";
    echo "<h2>Please Log In</h2>";
    echo "<p>Sign in to a free couple account to access the QR Bingo Scanner.</p>";
    echo "<a href='/login'>Log In</a>";
    echo "</div>";
}
?>
