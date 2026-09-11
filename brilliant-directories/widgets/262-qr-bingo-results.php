<?php
// Password-protected QR Bingo results. Both HTML and JSON require access.

if (!function_exists('ww_qrr_json')) {
    function ww_qrr_password_hash() {
        // Configure this in the PHP worker environment before deploying.
        $hash = getenv('WW_QR_RESULTS_PASSWORD_HASH', true);
        return is_string($hash) && preg_match('~^[$]2[aby][$](0[4-9]|[12][0-9]|3[01])[$][./A-Za-z0-9]{53}$~D', $hash) === 1 ? $hash : '';
    }
    function ww_qrr_secret() {
        global $w;
        $result = mysql($w['database'], 'SELECT secret_text FROM ww_qr_bingo_admin_credentials WHERE active = 1 LIMIT 20');
        if ($result) while ($row = mysql_fetch_assoc($result)) {
            if (isset($row['secret_text']) && is_string($row['secret_text']) && strlen($row['secret_text']) >= 32) return $row['secret_text'];
        }
        return '';
    }
    function ww_qrr_signature($payload, $secret) {
        return hash_hmac('sha256', 'qr_results|' . $payload . '|' . ww_qrr_password_hash(), $secret);
    }
    function ww_qrr_authorized() {
        if (ww_qrr_password_hash() === '') return false;
        $cookie = isset($_COOKIE['__Secure-ww_qrr_access']) ? $_COOKIE['__Secure-ww_qrr_access'] : '';
        if (!is_string($cookie) || strlen($cookie) > 160) return false;
        $parts = explode('.', $cookie);
        if (count($parts) !== 3 || !ctype_digit($parts[0]) || strlen($parts[1]) !== 32 || !ctype_xdigit($parts[1]) || strlen($parts[2]) !== 64) return false;
        if ((int)$parts[0] <= time() || (int)$parts[0] > time() + 3600) return false;
        $secret = ww_qrr_secret();
        return $secret !== '' && hash_equals(ww_qrr_signature($parts[0] . '.' . $parts[1], $secret), $parts[2]);
    }
    function ww_qrr_cookie($value, $expires) {
        if (headers_sent()) return false;
        // Compatible with BD hosts predating PHP's cookie-options array.
        header('Set-Cookie: __Secure-ww_qrr_access=' . rawurlencode($value) . '; Expires=' . gmdate('D, d M Y H:i:s', $expires) . ' GMT; Max-Age=' . max(0, $expires - time()) . '; Path=/qr_results; Secure; HttpOnly; SameSite=Strict', false);
        return true;
    }
    function ww_qrr_unlock($password) {
        $passwordHash = ww_qrr_password_hash();
        if ($passwordHash === '') return 'Access is temporarily unavailable. Please try again.';
        $secret = ww_qrr_secret();
        if ($secret === '') return 'Access is temporarily unavailable. Please try again.';
        // A shared, locked server-side counter survives cookie clearing.
        $ip = isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : 'unknown';
        $path = sys_get_temp_dir() . '/ww-qrr-' . hash_hmac('sha256', $ip, $secret) . '.json';
        $handle = @fopen($path, 'c+');
        if (!$handle || !flock($handle, LOCK_EX)) { if ($handle) fclose($handle); return 'Access is temporarily unavailable. Please try again.'; }
        @chmod($path, 0600);
        $state = json_decode(stream_get_contents($handle), true);
        if (!is_array($state) || !isset($state['until'], $state['attempts']) || $state['until'] <= time()) $state = array('until' => time() + 900, 'attempts' => 0);
        $error = '';
        if ($state['attempts'] >= 5) {
            http_response_code(429);
            header('Retry-After: ' . max(1, $state['until'] - time()));
            $error = 'Too many attempts. Please try again in 15 minutes.';
        } elseif (!is_string($password) || strlen($password) > 200 || !password_verify($password, $passwordHash)) {
            $state['attempts'] += 1;
            $error = 'That password is not correct. Please try again.';
        }
        rewind($handle); ftruncate($handle, 0);
        $saved = fwrite($handle, json_encode($state)) !== false;
        fflush($handle); flock($handle, LOCK_UN); fclose($handle);
        if (!$saved) return 'Access is temporarily unavailable. Please try again.';
        if ($error !== '') return $error;
        $expires = time() + 3600;
        $payload = $expires . '.' . bin2hex(random_bytes(16));
        if (!ww_qrr_cookie($payload . '.' . ww_qrr_signature($payload, $secret), $expires)) return 'Access could not be saved. Please try again.';
        return '';
    }
    function ww_qrr_json($body, $statusCode = 200) {
        while (function_exists('ob_get_level') && ob_get_level() > 0) { if (!@ob_end_clean()) break; }
        http_response_code((int)$statusCode);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        echo json_encode($body);
        exit();
    }

    function ww_qrr_is_positive_integer($value) {
        return is_int($value) && $value > 0;
    }

    function ww_qrr_is_event_key($value) {
        return is_string($value)
            && preg_match('/^[a-z0-9][a-z0-9-]{0,79}$/D', $value) === 1;
    }

    function ww_qrr_is_rfc3339_timestamp($value) {
        if (!is_string($value) || strlen($value) > 40) { return false; }
        $matches = array();
        if (preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:[.]([0-9]{1,6}))?(Z|[+-]([0-9]{2}):([0-9]{2}))$/D', $value, $matches) !== 1) {
            return false;
        }
        $offsetHour = isset($matches[9]) && $matches[9] !== '' ? (int)$matches[9] : 0;
        $offsetMinute = isset($matches[10]) && $matches[10] !== '' ? (int)$matches[10] : 0;
        return checkdate((int)$matches[2], (int)$matches[3], (int)$matches[1])
            && (int)$matches[4] <= 23 && (int)$matches[5] <= 59 && (int)$matches[6] <= 59
            && $offsetHour <= 14 && $offsetMinute <= 59 && ($offsetHour !== 14 || $offsetMinute === 0)
            && strtotime($value) !== false;
    }

    function ww_qrr_runtime_config() {
        $url = 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin?action=public_config';
        $body = '';
        $statusCode = 0;
        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($curl, CURLOPT_FOLLOWLOCATION, false);
            curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 3);
            curl_setopt($curl, CURLOPT_TIMEOUT, 6);
            curl_setopt($curl, CURLOPT_HTTPHEADER, array('Accept: application/json'));
            $body = (string)curl_exec($curl);
            $statusCode = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
            curl_close($curl);
        }
        if ($statusCode !== 200 || !$body) { return null; }
        $decoded = json_decode($body, true);
        $config = is_array($decoded) && isset($decoded['ok']) && $decoded['ok'] === true
            && isset($decoded['event_config']) && is_array($decoded['event_config'])
            ? $decoded['event_config']
            : null;
        return ww_qrr_normalize_config($config);
    }

    function ww_qrr_normalize_config($config) {
        if (!is_array($config)) { return null; }
        $eventKey = isset($config['event_key']) ? $config['event_key'] : null;
        $eventName = isset($config['event_name']) && is_string($config['event_name'])
            ? trim($config['event_name'])
            : '';
        $tagId = isset($config['vendor_tag_id']) ? $config['vendor_tag_id'] : null;
        $revision = isset($config['revision']) ? $config['revision'] : null;
        $historyStartsAt = isset($config['history_starts_at']) ? $config['history_starts_at'] : null;
        // The retained floor includes authorized early scans even after the
        // organizer turns early access off. Only legacy absence falls back.
        $scanHistoryStartsAt = array_key_exists('scan_history_starts_at', $config)
            ? $config['scan_history_starts_at'] : $historyStartsAt;
        $entryClosesAt = isset($config['entry_closes_at']) ? $config['entry_closes_at'] : null;
        if (!ww_qrr_is_event_key($eventKey)
            || !$eventName
            || strlen($eventName) > 160
            || strip_tags($eventName) !== $eventName
            || !ww_qrr_is_positive_integer($tagId)
            || !ww_qrr_is_positive_integer($revision)
            || !ww_qrr_is_rfc3339_timestamp($historyStartsAt)
            || !ww_qrr_is_rfc3339_timestamp($scanHistoryStartsAt)
            || !ww_qrr_is_rfc3339_timestamp($entryClosesAt)
            || strtotime($scanHistoryStartsAt) > strtotime($historyStartsAt)
            || strtotime($historyStartsAt) >= strtotime($entryClosesAt)) {
            return null;
        }

        return array(
            'event_key' => $eventKey,
            'event_name' => $eventName,
            'vendor_tag_id' => $tagId,
            'revision' => $revision,
            'history_starts_at_sql' => date('Y-m-d H:i:s', strtotime($historyStartsAt)),
            'scan_history_starts_at_sql' => date('Y-m-d H:i:s', strtotime($scanHistoryStartsAt)),
            'entry_closes_at_sql' => date('Y-m-d H:i:s', strtotime($entryClosesAt))
        );
    }

    function ww_qrr_require_current_revision($config) {
        $expectedEventKey = isset($_POST['expected_event_key']) && is_string($_POST['expected_event_key'])
            ? $_POST['expected_event_key']
            : '';
        $expectedRevision = isset($_POST['expected_config_revision']) && is_string($_POST['expected_config_revision'])
            ? $_POST['expected_config_revision']
            : '';
        if (!hash_equals((string)$config['event_key'], $expectedEventKey)
            || preg_match('/^[1-9][0-9]{0,17}$/D', $expectedRevision) !== 1
            || (int)$expectedRevision !== (int)$config['revision']) {
            ww_qrr_json(array(
                'status' => 'error',
                'code' => 'stale_event_config',
                'message' => 'QR Bingo settings changed. Reload the results page.'
            ), 409);
        }
    }

    function ww_qrr_total_vendors($config) {
        global $w;
        $tagId = (int)$config['vendor_tag_id'];
        $query = "
            SELECT COUNT(DISTINCT u.user_id) AS total_vendors
            FROM users_data u
            INNER JOIN rel_tags rt ON rt.object_id = u.user_id
            WHERE rt.tag_id = '$tagId'
            AND rt.tag_type_id = 1
            AND u.active = 2
        ";
        $result = mysql($w['database'], $query);
        $row = $result ? mysql_fetch_assoc($result) : false;
        if (!$row || !isset($row['total_vendors'])
            || !ctype_digit((string)$row['total_vendors'])) {
            throw new Exception('QR Bingo vendor totals are unavailable.');
        }
        return (int)$row['total_vendors'];
    }

    function ww_qrr_bingo_contacts($config, $members) {
        if (!ww_qrr_authorized()) throw new Exception('Password required.');
        $wanted = array();
        foreach ($members as $member) $wanted[$member['member_id']] = true;
        if (!$wanted) return array();
        $secret = ww_qrr_secret();
        if ($secret === '' || !function_exists('curl_init')) throw new Exception('Contact details are unavailable.');
        $contacts = array();
        $started = microtime(true);
        // Use the same active, admin-adjusted contact list as the admin plugin.
        // Only requested current-event scanner members leave this helper.
        for ($page = 1; $page <= 50; $page += 1) {
            if (microtime(true) - $started > 10) throw new Exception('Contact details are taking too long.');
            $payload = json_encode(array('action' => 'data_list', 'dataset' => 'contacts', 'event_key' => $config['event_key'], 'page' => $page, 'page_size' => 100, 'contact_status' => 'active'));
            $timestamp = (string)time();
            $nonce = bin2hex(random_bytes(16));
            $signature = hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $payload, $secret);
            $body = '';
            $curl = curl_init('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin');
            curl_setopt_array($curl, array(
                CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'Accept: application/json', 'x-ww-timestamp: ' . $timestamp, 'x-ww-nonce: ' . $nonce, 'x-ww-signature: ' . $signature),
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 5,
                CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_WRITEFUNCTION => function($handle, $chunk) use (&$body) { if (strlen($body) + strlen($chunk) > 262144) return 0; $body .= $chunk; return strlen($chunk); }
            ));
            $executed = curl_exec($curl);
            $http = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
            curl_close($curl);
            $data = json_decode($body, true);
            if ($executed === false || $http !== 200 || !is_array($data) || !isset($data['ok'], $data['dataset'], $data['event_key'], $data['rows'], $data['has_more'])
                || $data['ok'] !== true || $data['dataset'] !== 'contacts' || $data['event_key'] !== $config['event_key'] || !is_array($data['rows']) || !is_bool($data['has_more'])) throw new Exception('Contact details could not be loaded.');
            foreach ($data['rows'] as $row) {
                if (!is_array($row) || !isset($row['couple_id']) || !isset($wanted[(string)$row['couple_id']])) continue;
                $clean = array();
                foreach (array('name', 'email', 'phone') as $field) {
                    if (!isset($row[$field]) || !is_string($row[$field])) throw new Exception('Contact details could not be verified.');
                    $clean[$field] = $row[$field];
                }
                $contacts[(string)$row['couple_id']] = $clean;
                unset($wanted[(string)$row['couple_id']]);
            }
            if (!$wanted || !$data['has_more']) return $contacts;
        }
        throw new Exception('The contact list is too large to load.');
    }

    /* WW_QRR_CARD_RESET_FILTER_START */
    function ww_qrr_card_reset_filter($config) {
        if (!ww_qrr_authorized()) throw new Exception('Password required.');
        $secret = ww_qrr_secret();
        if ($secret === '' || !function_exists('curl_init')) throw new Exception('Bingo card resets are unavailable.');
        $payload = json_encode(array('action' => 'card_reset_cutoffs', 'event_key' => $config['event_key']));
        $timestamp = (string)time(); $nonce = bin2hex(random_bytes(16));
        $signature = hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $payload, $secret);
        $body = '';
        $curl = curl_init('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin');
        curl_setopt_array($curl, array(
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'Accept: application/json', 'x-ww-timestamp: ' . $timestamp, 'x-ww-nonce: ' . $nonce, 'x-ww-signature: ' . $signature),
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_WRITEFUNCTION => function($handle, $chunk) use (&$body) { if (strlen($body) + strlen($chunk) > 2097152) return 0; $body .= $chunk; return strlen($chunk); }
        ));
        $executed = curl_exec($curl); $http = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
        $data = json_decode($body, true);
        if ($executed === false || $http !== 200 || !is_array($data)
            || !isset($data['ok'], $data['action'], $data['event_key'], $data['rows'], $data['has_more'])
            || $data['ok'] !== true || $data['action'] !== 'card_reset_cutoffs'
            || $data['event_key'] !== $config['event_key'] || $data['has_more'] !== false
            || !is_array($data['rows']) || count($data['rows']) > 10000) throw new Exception('Bingo card resets could not be checked.');
        $conditions = array(); $seen = array();
        foreach ($data['rows'] as $row) {
            if (!is_array($row) || !isset($row['couple_id'], $row['generation'], $row['scan_reset_after'])
                || !is_string($row['couple_id']) || preg_match('/^[1-9][0-9]{0,17}$/D', $row['couple_id']) !== 1
                || isset($seen[$row['couple_id']]) || !is_int($row['generation']) || $row['generation'] < 1
                || $row['generation'] > 9007199254740991 || !ww_qrr_is_rfc3339_timestamp($row['scan_reset_after'])) throw new Exception('Bingo card resets could not be verified.');
            $seen[$row['couple_id']] = true;
            $id = mysql_real_escape_string($row['couple_id']);
            $cutoff = mysql_real_escape_string(date('Y-m-d H:i:s', strtotime($row['scan_reset_after'])));
            $conditions[] = "NOT (vv.user_id='$id' AND vv.scan_date <= '$cutoff')";
        }
        return $conditions ? ' AND ' . implode(' AND ', $conditions) : '';
    }
    /* WW_QRR_CARD_RESET_FILTER_END */

    function ww_qrr_scoreboard($config) {
        global $w;
        if (!ww_qrr_authorized()) throw new Exception('Password required.');
        $tagId = (int)$config['vendor_tag_id'];
        $historyStartsAt = mysql_real_escape_string((string)$config['scan_history_starts_at_sql']);
        $entryClosesAt = mysql_real_escape_string((string)$config['entry_closes_at_sql']);
        $cardResetFilter = ww_qrr_card_reset_filter($config);
        $totalVendors = ww_qrr_total_vendors($config);
        // One anonymous histogram gives complete totals without loading any
        // participant identities or truncating aggregate counts at 500.
        $query = "
            SELECT progress.scanned_count, COUNT(*) AS participant_count
            FROM (
                SELECT COUNT(DISTINCT vv.vendor_id) AS scanned_count
                FROM vendor_visits vv
                INNER JOIN users_data participant ON participant.user_id = vv.user_id
                INNER JOIN users_data vendor ON vendor.user_id = vv.vendor_id
                INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
                WHERE rt.tag_id = '$tagId'
                AND rt.tag_type_id = 1
                AND vendor.active = 2
                AND participant.subscription_id IN (4, 18)
                AND vv.scan_date >= '$historyStartsAt'
                AND vv.scan_date < '$entryClosesAt'
                $cardResetFilter
                GROUP BY vv.user_id
            ) progress
            GROUP BY progress.scanned_count
            ORDER BY progress.scanned_count DESC
        ";
        $result = mysql($w['database'], $query);
        if (!$result) { throw new Exception('QR Bingo progress is unavailable.'); }
        $displayLimit = 500;
        $activeCount = 0;
        $completedCount = 0;
        while ($row = mysql_fetch_assoc($result)) {
            if (!isset($row['scanned_count'], $row['participant_count'])
                || !ctype_digit((string)$row['scanned_count'])
                || !ctype_digit((string)$row['participant_count'])
                || (int)$row['participant_count'] < 1) {
                throw new Exception('QR Bingo progress is unavailable.');
            }
            $scannedCount = min($totalVendors, (int)$row['scanned_count']);
            $participantCount = (int)$row['participant_count'];
            $activeCount += $participantCount;
            if ($totalVendors > 0 && $scannedCount >= $totalVendors) { $completedCount += $participantCount; }
        }

        $details = mysql($w['database'], "
            SELECT participant.user_id AS member_id, participant.first_name, participant.last_name,
                participant.email, participant.phone_number, COUNT(DISTINCT vv.vendor_id) AS scanned_count
            FROM vendor_visits vv
            INNER JOIN users_data participant ON participant.user_id = vv.user_id
            INNER JOIN users_data vendor ON vendor.user_id = vv.vendor_id
            INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
            WHERE rt.tag_id = '$tagId' AND rt.tag_type_id = 1 AND vendor.active = 2
            AND participant.subscription_id IN (4, 18)
            AND vv.scan_date >= '$historyStartsAt' AND vv.scan_date < '$entryClosesAt'
            $cardResetFilter
            GROUP BY participant.user_id, participant.first_name, participant.last_name, participant.email, participant.phone_number
            ORDER BY scanned_count DESC, participant.user_id ASC LIMIT 500
        ");
        if (!$details) throw new Exception('Member details are unavailable.');
        $participants = array();
        while ($member = mysql_fetch_assoc($details)) {
            $scannedCount = min($totalVendors, max(0, (int)$member['scanned_count']));
            $isCompleted = $totalVendors > 0 && $scannedCount >= $totalVendors;
            $participants[] = array(
                'label' => trim((string)$member['first_name'] . ' ' . (string)$member['last_name']),
                'member_id' => (string)$member['member_id'],
                'email' => (string)$member['email'],
                'phone' => (string)$member['phone_number'],
                'scanned_count' => $scannedCount,
                'total_vendors' => $totalVendors,
                'progress_percentage' => $totalVendors > 0
                    ? min(100, (int)round(($scannedCount / $totalVendors) * 100))
                    : 0,
                'is_completed' => $isCompleted
            );
        }
        $contacts = ww_qrr_bingo_contacts($config, $participants);
        foreach ($participants as &$participant) {
            if (isset($contacts[$participant['member_id']])) {
                $contact = $contacts[$participant['member_id']];
                $participant['label'] = $contact['name'];
                $participant['email'] = $contact['email'];
                $participant['phone'] = $contact['phone'];
            }
        }
        unset($participant);
        return array(
            'status' => 'success',
            'event_name' => (string)$config['event_name'],
            'participants' => $participants,
            'active_participants' => $activeCount,
            'completed_participants' => $completedCount,
            'shown_participants' => count($participants),
            'display_limit' => $displayLimit,
            'has_more' => $activeCount > count($participants),
            'total_vendors' => $totalVendors,
            'revision' => (int)$config['revision'],
            'updated_at' => gmdate('c')
        );
    }

}

// WW_QRR_ACCESS_GATE
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    while (function_exists('ob_get_level') && ob_get_level() > 0) { if (!@ob_end_clean()) break; }
}
header('Cache-Control: private, no-store, no-cache, must-revalidate');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('Vary: Cookie');
$wwQrrAccessError = '';
$wwQrrWantsJson = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;
$wwQrrAction = isset($_POST['action']) && is_string($_POST['action']) ? $_POST['action'] : '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && (!isset($_SERVER['HTTP_ORIGIN']) || $_SERVER['HTTP_ORIGIN'] !== 'https://www.weddingwin.ca')) {
    ww_qrr_json(array('status' => 'error', 'message' => 'Open the results page on WeddingWin and try again.'), 403);
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $wwQrrAction === 'lock_results') {
    ww_qrr_cookie('', time() - 3600);
    if ($wwQrrWantsJson) ww_qrr_json(array('status' => 'success'));
    header('Location: /qr_results', true, 303); exit();
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $wwQrrAction === 'unlock_results') {
    $wwQrrAccessError = ww_qrr_unlock(isset($_POST['results_password']) ? $_POST['results_password'] : null);
    if ($wwQrrWantsJson) ww_qrr_json($wwQrrAccessError === '' ? array('status' => 'success') : array('status' => 'error', 'message' => $wwQrrAccessError), $wwQrrAccessError === '' ? 200 : (http_response_code() === 429 ? 429 : 401));
    if ($wwQrrAccessError === '') { header('Location: /qr_results', true, 303); exit(); }
}
if (!ww_qrr_authorized()) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $wwQrrAction !== 'unlock_results') ww_qrr_json(array('status' => 'error', 'code' => 'password_required', 'message' => 'Enter the page password to view results.'), 401);
    ?>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>QR Bingo Results | WeddingWin</title>
    <section class="ww-qrr ww-qrr-unavailable ww-qrr-password">
      <h1>QR Bingo Results</h1><p>Enter the password to view results and member contact details.</p>
      <form id="wwQrrPasswordForm" method="post" action="/qr_results">
        <input type="hidden" name="action" value="unlock_results">
        <label for="resultsPassword">Password</label>
        <input id="resultsPassword" type="password" name="results_password" autocomplete="current-password" required maxlength="200">
        <button type="submit">View results</button>
        <p id="wwQrrPasswordStatus" role="alert"><?php echo htmlspecialchars($wwQrrAccessError, ENT_QUOTES, 'UTF-8'); ?></p>
      </form>
    </section>
    <?php
} else {

$wwQrrConfig = ww_qrr_runtime_config();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$wwQrrConfig) {
        ww_qrr_json(array('status' => 'error', 'message' => 'QR Bingo results are temporarily unavailable.'), 503);
    }
    ww_qrr_require_current_revision($wwQrrConfig);
    $action = isset($_POST['action']) && is_string($_POST['action']) ? $_POST['action'] : '';
    if ($action === 'get_scoreboard_data') {
        try {
            ww_qrr_json(ww_qrr_scoreboard($wwQrrConfig));
        } catch (Exception $error) {
            ww_qrr_json(array('status' => 'error', 'message' => 'QR Bingo results are temporarily unavailable. Please try again.'), 503);
        }
    }
    ww_qrr_json(array('status' => 'error', 'message' => 'Unsupported results request.'), 400);
}
?>

<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>QR Bingo Results | WeddingWin</title>

<?php if (!$wwQrrConfig) { ?>
  <section class="ww-qrr ww-qrr-unavailable" role="status">
    <h1>QR Bingo Results</h1>
    <p>Results are temporarily unavailable while the event settings refresh.</p>
  </section>
<?php } else { ?>
  <section
    class="ww-qrr"
    id="wwQrResultsApp"
    data-event-key="<?php echo htmlspecialchars($wwQrrConfig['event_key'], ENT_QUOTES, 'UTF-8'); ?>"
    data-config-revision="<?php echo (int)$wwQrrConfig['revision']; ?>">
    <header class="ww-qrr-header">
      <div>
        <p class="ww-qrr-eyebrow"><?php echo htmlspecialchars($wwQrrConfig['event_name'], ENT_QUOTES, 'UTF-8'); ?></p>
        <h1>QR Bingo Results</h1>
        <p class="ww-qrr-intro">Vendor Bingo progress and saved contact details. Please keep this information private.</p>
      </div>
      <div class="ww-qrr-stats" aria-label="QR Bingo result totals">
        <div><span id="wwQrrActive">-</span><small>Participants</small></div>
        <div><span id="wwQrrCompleted">-</span><small>Completed</small></div>
        <div><span id="wwQrrVendors">-</span><small>Vendors</small></div>
      </div>
    </header>

    <div class="ww-qrr-toolbar">
      <label>
        <span class="sr-only">Search name, member ID, email or phone</span>
        <input id="wwQrrSearch" type="search" placeholder="Search name, member ID, email or phone" autocomplete="off">
      </label>
      <button type="button" id="wwQrrRefresh">Refresh results</button>
      <form id="wwQrrLockForm" method="post" action="/qr_results"><input type="hidden" name="action" value="lock_results"><button type="submit">Lock page</button></form>
    </div>

    <p class="ww-qrr-status" id="wwQrrStatus" role="status" aria-live="polite">Loading current results...</p>
    <div class="ww-qrr-table-wrap" id="wwQrrTableWrap" hidden>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Member ID</th>
            <th scope="col">Email</th>
            <th scope="col">Phone</th>
            <th scope="col">Progress</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody id="wwQrrBody"></tbody>
      </table>
    </div>
    <div class="ww-qrr-empty" id="wwQrrEmpty" hidden>
      <h2>No current-event scans yet</h2>
      <p>This page will update as couples visit vendors in the published QR Bingo event.</p>
    </div>
    <p class="ww-qrr-updated" id="wwQrrUpdated"></p>
  </section>
<?php } } ?>
