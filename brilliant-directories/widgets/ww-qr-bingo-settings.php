<?php
/*
 * Wedding Win QR Bingo settings proxy for the Brilliant Directories admin.
 *
 * This widget deliberately keeps the Edge signing credential on the server.
 * It may be rendered only by the exact BD admin widget route below. All
 * changes are validated locally, revision-checked by Edge, and followed by a
 * redirect so a browser refresh cannot repeat a publish.
 */

$ww_qrbs_request_uri = isset($_SERVER['REQUEST_URI']) && is_string($_SERVER['REQUEST_URI'])
    ? $_SERVER['REQUEST_URI']
    : '';
$ww_qrbs_request_path = parse_url($ww_qrbs_request_uri, PHP_URL_PATH);
$ww_qrbs_widget_name = isset($_GET['widget']) && is_string($_GET['widget'])
    ? $_GET['widget']
    : '';

// This check must remain before session, database, and network work.
if ($ww_qrbs_request_path !== '/admin/go.php' || $ww_qrbs_widget_name !== 'ww_qr_bingo_settings') {
    http_response_code(403);
    echo '<p>QR Bingo settings are available only from the designated admin page.</p>';
    return;
}

$ww_qrbs_method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string)$_SERVER['REQUEST_METHOD']) : '';
if ($ww_qrbs_method !== 'GET' && $ww_qrbs_method !== 'POST') {
    http_response_code(405);
    if (!headers_sent()) { header('Allow: GET, POST'); }
    echo '<p>Method not allowed.</p>';
    return;
}

if ($ww_qrbs_method === 'POST') {
    $ww_qrbs_content_type = isset($_SERVER['CONTENT_TYPE']) ? strtolower((string)$_SERVER['CONTENT_TYPE']) : '';
    $ww_qrbs_content_length = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
    if (strpos($ww_qrbs_content_type, 'application/x-www-form-urlencoded') !== 0) {
        http_response_code(415);
        echo '<p>This settings form accepts standard form posts only.</p>';
        return;
    }
    if ($ww_qrbs_content_length < 1 || $ww_qrbs_content_length > 32768) {
        http_response_code(413);
        echo '<p>The settings request is empty or too large.</p>';
        return;
    }
    if (headers_sent()) {
        http_response_code(500);
        echo '<p>The settings request could not start safely. No change was made.</p>';
        return;
    }
}

if (!function_exists('ww_qrbs_escape')) {
    function ww_qrbs_escape($value) {
        return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
    }

    function ww_qrbs_secure_random_hex($bytes) {
        $bytes = (int)$bytes;
        if ($bytes < 16 || $bytes > 64) { return ''; }

        if (function_exists('random_bytes')) {
            try {
                return bin2hex(random_bytes($bytes));
            } catch (Exception $ignored) {
                return '';
            }
        }

        if (function_exists('openssl_random_pseudo_bytes')) {
            $strong = false;
            $random = openssl_random_pseudo_bytes($bytes, $strong);
            if ($random !== false && $strong === true && strlen($random) === $bytes) {
                return bin2hex($random);
            }
        }

        return '';
    }

    function ww_qrbs_text_length($value) {
        if (function_exists('mb_strlen')) { return mb_strlen((string)$value, 'UTF-8'); }
        return strlen((string)$value);
    }

    function ww_qrbs_contains_control_byte($value, $rejectSpace) {
        if (!is_string($value)) { return true; }
        $length = strlen($value);
        for ($index = 0; $index < $length; $index += 1) {
            $byte = ord($value[$index]);
            if ($byte < 32 || $byte === 127 || ($rejectSpace && $byte === 32)) { return true; }
        }
        return false;
    }

    function ww_qrbs_is_plain_text($value, $minimum, $maximum, $allow_angle_brackets) {
        if (!is_string($value)) { return false; }
        $length = ww_qrbs_text_length($value);
        if ($length < $minimum || $length > $maximum) { return false; }
        if (ww_qrbs_contains_control_byte($value, false)) { return false; }
        if (!$allow_angle_brackets && (strpos($value, '<') !== false || strpos($value, '>') !== false)) {
            return false;
        }
        return true;
    }

    function ww_qrbs_normalize_plain_text($value) {
        $value = trim((string)$value);
        return preg_replace('/[ ]+/', ' ', $value);
    }

    function ww_qrbs_validate_https_url($value) {
        if (!is_string($value)) { return ''; }
        $value = trim($value);
        if (strlen($value) < 12 || strlen($value) > 500 || !filter_var($value, FILTER_VALIDATE_URL)) {
            return '';
        }

        $parts = parse_url($value);
        if (!is_array($parts)) { return ''; }
        $scheme = isset($parts['scheme']) ? strtolower((string)$parts['scheme']) : '';
        $host = isset($parts['host']) ? strtolower(rtrim((string)$parts['host'], '.')) : '';
        $port = isset($parts['port']) ? (int)$parts['port'] : 443;
        if ($scheme !== 'https' || ($host !== 'weddingwin.ca' && $host !== 'www.weddingwin.ca')) {
            return '';
        }
        if ($port !== 443 || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
            return '';
        }
        if (!isset($parts['path']) || strpos((string)$parts['path'], '//') === 0) { return ''; }
        if (ww_qrbs_contains_control_byte($value, true)) { return ''; }

        return $value;
    }

    function ww_qrbs_validate_datetime($value) {
        if (!is_string($value) || strlen($value) > 40) { return ''; }
        $value = trim($value);
        $matches = array();
        if (!preg_match(
            '/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:[.]([0-9]{1,6}))?)?(Z|[+-][0-9]{2}:[0-9]{2})$/D',
            $value,
            $matches
        )) {
            return '';
        }

        $year = (int)$matches[1];
        $month = (int)$matches[2];
        $day = (int)$matches[3];
        $hour = (int)$matches[4];
        $minute = (int)$matches[5];
        $second = isset($matches[6]) && $matches[6] !== '' ? (int)$matches[6] : 0;
        $zone = (string)$matches[8];
        if (!checkdate($month, $day, $year) || $hour > 23 || $minute > 59 || $second > 59) {
            return '';
        }

        if ($zone !== 'Z') {
            $zoneHour = (int)substr($zone, 1, 2);
            $zoneMinute = (int)substr($zone, 4, 2);
            if ($zoneHour > 14 || $zoneMinute > 59 || ($zoneHour === 14 && $zoneMinute !== 0)) {
                return '';
            }
        }

        $seconds = str_pad((string)$second, 2, '0', STR_PAD_LEFT);
        $normalizedZone = $zone === 'Z' ? '+00:00' : $zone;
        $normalized = sprintf(
            '%04d-%02d-%02dT%02d:%02d:%s%s',
            $year,
            $month,
            $day,
            $hour,
            $minute,
            $seconds,
            $normalizedZone
        );
        $timestamp = strtotime($normalized);
        if ($timestamp === false) { return ''; }
        return gmdate('Y-m-d', $timestamp) . 'T' . gmdate('H:i:s', $timestamp) . 'Z';
    }

    function ww_qrbs_validate_rfc3339_version($value) {
        if (!is_string($value) || strlen($value) > 40) { return ''; }
        $value = trim($value);
        $matches = array();
        if (!preg_match(
            '/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:[.]([0-9]{1,6}))?(Z|[+-]([0-9]{2}):([0-9]{2}))$/D',
            $value,
            $matches
        )) {
            return '';
        }

        $offsetHour = isset($matches[9]) && $matches[9] !== '' ? (int)$matches[9] : 0;
        $offsetMinute = isset($matches[10]) && $matches[10] !== '' ? (int)$matches[10] : 0;
        if (
            !checkdate((int)$matches[2], (int)$matches[3], (int)$matches[1])
            || (int)$matches[4] > 23
            || (int)$matches[5] > 59
            || (int)$matches[6] > 59
            || $offsetHour > 14
            || $offsetMinute > 59
            || ($offsetHour === 14 && $offsetMinute !== 0)
            || strtotime($value) === false
        ) {
            return '';
        }
        return $value;
    }

    function ww_qrbs_validate_toronto_local_datetime($value) {
        if (!is_string($value) || strlen($value) > 24) { return ''; }
        $value = trim($value);
        $matches = array();
        if (!preg_match(
            '/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?$/D',
            $value,
            $matches
        )) {
            return '';
        }
        $second = isset($matches[6]) && $matches[6] !== '' ? (int)$matches[6] : 0;
        if (
            !checkdate((int)$matches[2], (int)$matches[3], (int)$matches[1])
            || (int)$matches[4] > 23
            || (int)$matches[5] > 59
            || $second > 59
            || !class_exists('DateTime')
            || !class_exists('DateTimeZone')
        ) {
            return '';
        }
        $normalized = sprintf(
            '%04d-%02d-%02dT%02d:%02d:%02d',
            (int)$matches[1],
            (int)$matches[2],
            (int)$matches[3],
            (int)$matches[4],
            (int)$matches[5],
            $second
        );
        try {
            $zone = new DateTimeZone('America/Toronto');
            $parseValue = str_replace('T', ' ', $normalized);
            $date = DateTime::createFromFormat('!Y-m-d H:i:s', $parseValue, $zone);
            $errors = DateTime::getLastErrors();
            if (
                $date === false
                || (is_array($errors) && ((int)$errors['warning_count'] > 0 || (int)$errors['error_count'] > 0))
                || $date->format('Y-m-d H:i:s') !== $parseValue
            ) {
                return '';
            }
            return gmdate('Y-m-d', $date->getTimestamp()) . 'T'
                . gmdate('H:i:s', $date->getTimestamp()) . 'Z';
        } catch (Exception $ignored) {
            return '';
        }
    }

    function ww_qrbs_validate_admin_datetime($value) {
        $localValue = ww_qrbs_validate_toronto_local_datetime($value);
        if ($localValue !== '') { return $localValue; }

        // Keep accepting the former RFC 3339 form value so a browser restoring
        // an older draft does not lose it during this user-interface upgrade.
        return ww_qrbs_validate_datetime($value);
    }

    function ww_qrbs_toronto_datetime_input_value($value) {
        $validated = ww_qrbs_validate_datetime((string)$value);
        if ($validated === '' || !class_exists('DateTime') || !class_exists('DateTimeZone')) {
            return '';
        }

        try {
            $date = new DateTime($validated);
            $date->setTimezone(new DateTimeZone('America/Toronto'));
            return $date->format('Y-m-d') . 'T' . $date->format('H:i:s');
        } catch (Exception $ignored) {
            return '';
        }
    }

    function ww_qrbs_post_scalar($source, $key, &$errors) {
        if (!array_key_exists($key, $source) || !is_string($source[$key])) {
            $errors[$key] = 'This field is required.';
            return '';
        }
        return $source[$key];
    }

    function ww_qrbs_post_boolean($source, $key, &$errors) {
        if (!array_key_exists($key, $source)) { return false; }
        if (!is_string($source[$key]) || $source[$key] !== '1') {
            $errors[$key] = 'Invalid toggle value.';
            return false;
        }
        return true;
    }

    function ww_qrbs_validate_publish($source) {
        $errors = array();
        $allowed = array(
            'csrf_token', 'action', 'expected_revision', 'event_name', 'venue_name',
            'vendor_tag_id', 'history_starts_at', 'app_card_enabled', 'scan_enabled',
            'scan_open_early',
            'vendor_draws_enabled',
            'email_delivery_mode', 'send_vendor_email', 'send_couple_email',
            'vendor_notice_title', 'couple_notice_title', 'rules_version',
            'official_rules_url', 'alternate_free_entry_url', 'eligibility_region',
            'draw_opens_at', 'entry_closes_at', 'draw_at'
        );
        $allowedMap = array_fill_keys($allowed, true);
        foreach ($source as $key => $submittedValue) {
            if (!is_string($key) || !isset($allowedMap[$key])) {
                $errors['_request'] = 'The request contains an unsupported field.';
                break;
            }
            if (!is_string($submittedValue) || ww_qrbs_contains_control_byte($submittedValue, false)) {
                $errors['_request'] = 'The request contains an invalid field value.';
                break;
            }
        }

        $action = ww_qrbs_post_scalar($source, 'action', $errors);
        if ($action !== 'publish') { $errors['action'] = 'Unsupported action.'; }

        $revisionText = trim(ww_qrbs_post_scalar($source, 'expected_revision', $errors));
        $revision = null;
        if (!preg_match('/^[1-9][0-9]{0,17}$/D', $revisionText)) {
            $errors['expected_revision'] = 'Reload the current revision before publishing.';
        } else {
            $revision = (int)$revisionText;
        }

        $eventName = ww_qrbs_normalize_plain_text(ww_qrbs_post_scalar($source, 'event_name', $errors));
        if (!ww_qrbs_is_plain_text($eventName, 1, 120, false)) {
            $errors['event_name'] = 'Use 1–120 plain-text characters.';
        }

        $venueName = ww_qrbs_normalize_plain_text(ww_qrbs_post_scalar($source, 'venue_name', $errors));
        if (!ww_qrbs_is_plain_text($venueName, 1, 160, false)) {
            $errors['venue_name'] = 'Use 1–160 plain-text characters.';
        }

        $vendorTagText = trim(ww_qrbs_post_scalar($source, 'vendor_tag_id', $errors));
        $vendorTagId = null;
        if (!preg_match('/^[1-9][0-9]{0,9}$/D', $vendorTagText) || (float)$vendorTagText > 2147483647) {
            $errors['vendor_tag_id'] = 'Enter a positive Brilliant Directories tag ID.';
        } else {
            $vendorTagId = (int)$vendorTagText;
        }

        $historyStartsAt = ww_qrbs_validate_admin_datetime(
            ww_qrbs_post_scalar($source, 'history_starts_at', $errors)
        );
        $drawOpensAt = ww_qrbs_validate_admin_datetime(
            ww_qrbs_post_scalar($source, 'draw_opens_at', $errors)
        );
        $entryClosesAt = ww_qrbs_validate_admin_datetime(
            ww_qrbs_post_scalar($source, 'entry_closes_at', $errors)
        );
        $drawAt = ww_qrbs_validate_admin_datetime(ww_qrbs_post_scalar($source, 'draw_at', $errors));
        if ($historyStartsAt === '') { $errors['history_starts_at'] = 'Choose a valid Toronto date and time.'; }
        if ($drawOpensAt === '') { $errors['draw_opens_at'] = 'Choose a valid Toronto date and time.'; }
        if ($entryClosesAt === '') { $errors['entry_closes_at'] = 'Choose a valid Toronto date and time.'; }
        if ($drawAt === '') { $errors['draw_at'] = 'Choose a valid Toronto date and time.'; }

        if ($historyStartsAt !== '' && $entryClosesAt !== '' && strtotime($historyStartsAt) > strtotime($entryClosesAt)) {
            $errors['history_starts_at'] = 'History must start no later than entry closing.';
        }
        if ($entryClosesAt !== '' && $drawOpensAt !== '' && strtotime($entryClosesAt) > strtotime($drawOpensAt)) {
            $errors['draw_opens_at'] = 'Draw controls cannot open before entries close.';
        }
        if ($drawOpensAt !== '' && $drawAt !== '' && strtotime($drawOpensAt) > strtotime($drawAt)) {
            $errors['draw_at'] = 'The scheduled draw cannot precede draw opening.';
        }

        $emailMode = trim(ww_qrbs_post_scalar($source, 'email_delivery_mode', $errors));
        if ($emailMode !== 'disabled' && $emailMode !== 'production_verified_fulfillment') {
            $errors['email_delivery_mode'] = 'Choose a supported delivery mode.';
        }

        // Brilliant Directories clears rendered admin inputs whose form names use
        // its reserved email-subject keys. Keep namespaced browser field names,
        // then map them back to the canonical Edge configuration keys below.
        $vendorSubject = ww_qrbs_normalize_plain_text(
            ww_qrbs_post_scalar($source, 'vendor_notice_title', $errors)
        );
        $coupleSubject = ww_qrbs_normalize_plain_text(
            ww_qrbs_post_scalar($source, 'couple_notice_title', $errors)
        );
        if (!ww_qrbs_is_plain_text($vendorSubject, 1, 180, false)) {
            $errors['vendor_notice_title'] = 'Use 1–180 plain-text characters with no line breaks or HTML.';
        }
        if (!ww_qrbs_is_plain_text($coupleSubject, 1, 180, false)) {
            $errors['couple_notice_title'] = 'Use 1–180 plain-text characters with no line breaks or HTML.';
        }

        $rulesVersion = trim(ww_qrbs_post_scalar($source, 'rules_version', $errors));
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/D', $rulesVersion)) {
            $errors['rules_version'] = 'Use 1–80 letters, numbers, dots, underscores, or hyphens.';
        }

        $officialRulesUrl = ww_qrbs_validate_https_url(
            ww_qrbs_post_scalar($source, 'official_rules_url', $errors)
        );
        $alternateFreeEntryUrl = ww_qrbs_validate_https_url(
            ww_qrbs_post_scalar($source, 'alternate_free_entry_url', $errors)
        );
        if ($officialRulesUrl === '') {
            $errors['official_rules_url'] = 'Use a public HTTPS URL on weddingwin.ca with no fragment.';
        }
        if ($alternateFreeEntryUrl === '') {
            $errors['alternate_free_entry_url'] = 'Use a public HTTPS URL on weddingwin.ca with no fragment.';
        }
        if ($officialRulesUrl !== '' && $officialRulesUrl === $alternateFreeEntryUrl) {
            $errors['alternate_free_entry_url'] = 'The free-entry page must be separate from the official rules.';
        }

        $eligibilityRegion = ww_qrbs_normalize_plain_text(
            ww_qrbs_post_scalar($source, 'eligibility_region', $errors)
        );
        if (!ww_qrbs_is_plain_text($eligibilityRegion, 1, 300, false)) {
            $errors['eligibility_region'] = 'Use 1–300 plain-text characters.';
        }

        $config = array(
            'event_name' => $eventName,
            'venue_name' => $venueName,
            'vendor_tag_id' => $vendorTagId,
            'history_starts_at' => $historyStartsAt,
            'app_card_enabled' => ww_qrbs_post_boolean($source, 'app_card_enabled', $errors),
            'scan_enabled' => ww_qrbs_post_boolean($source, 'scan_enabled', $errors),
            'scan_open_early' => ww_qrbs_post_boolean($source, 'scan_open_early', $errors),
            'vendor_draws_enabled' => ww_qrbs_post_boolean($source, 'vendor_draws_enabled', $errors),
            'email_delivery_mode' => $emailMode,
            'send_vendor_email' => ww_qrbs_post_boolean($source, 'send_vendor_email', $errors),
            'send_couple_email' => ww_qrbs_post_boolean($source, 'send_couple_email', $errors),
            'vendor_email_subject' => $vendorSubject,
            'couple_email_subject' => $coupleSubject,
            'rules_version' => $rulesVersion,
            'official_rules_url' => $officialRulesUrl,
            'alternate_free_entry_url' => $alternateFreeEntryUrl,
            'eligibility_region' => $eligibilityRegion,
            'draw_opens_at' => $drawOpensAt,
            'entry_closes_at' => $entryClosesAt,
            'draw_at' => $drawAt
        );

        return array(
            'ok' => count($errors) === 0,
            'errors' => $errors,
            'expected_revision' => $revision,
            'config' => $config
        );
    }

    function ww_qrbs_validate_calendar_date($value) {
        if (!is_string($value)) { return ''; }
        $value = trim($value);
        if ($value === '') { return ''; }
        $matches = array();
        if (!preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D', $value, $matches)) {
            return false;
        }
        if (!checkdate((int)$matches[2], (int)$matches[3], (int)$matches[1])) {
            return false;
        }
        return $value;
    }

    function ww_qrbs_validate_reconciliation_closure($source) {
        $errors = array();
        $allowed = array(
            'csrf_token', 'action', 'expected_revision', 'event_key',
            'operator_identity', 'all_timely_submissions_reviewed'
        );
        $allowedMap = array_fill_keys($allowed, true);
        foreach ($source as $key => $submittedValue) {
            if (!is_string($key) || !isset($allowedMap[$key])) {
                $errors['_closure'] = 'The queue-completion request contains an unsupported field.';
                break;
            }
            if (!is_string($submittedValue) || ww_qrbs_contains_control_byte($submittedValue, false)) {
                $errors['_closure'] = 'The queue-completion request contains an invalid field value.';
                break;
            }
        }

        $action = ww_qrbs_post_scalar($source, 'action', $errors);
        if ($action !== 'declare_alternate_entry_reconciliation_complete') {
            $errors['action'] = 'Unsupported action.';
        }

        $revisionText = trim(ww_qrbs_post_scalar($source, 'expected_revision', $errors));
        $revision = null;
        if (!preg_match('/^[1-9][0-9]{0,17}$/D', $revisionText)) {
            $errors['expected_revision'] = 'Reload the current event revision before declaring the queue complete.';
        } else {
            $revision = (int)$revisionText;
        }

        $eventKey = trim(ww_qrbs_post_scalar($source, 'event_key', $errors));
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $eventKey) || strlen($eventKey) > 100) {
            $errors['event_key'] = 'Reload the current event before declaring the queue complete.';
        }

        $operatorIdentity = ww_qrbs_normalize_plain_text(
            ww_qrbs_post_scalar($source, 'operator_identity', $errors)
        );
        if (!ww_qrbs_is_plain_text($operatorIdentity, 3, 160, false)) {
            $errors['closure_operator_identity'] = 'Enter your administrator name or work email for the append-only audit record.';
        }

        $reviewed = ww_qrbs_post_boolean($source, 'all_timely_submissions_reviewed', $errors);
        if (!$reviewed && !isset($errors['all_timely_submissions_reviewed'])) {
            $errors['all_timely_submissions_reviewed'] = 'This attestation is required.';
        }

        return array(
            'ok' => count($errors) === 0,
            'errors' => $errors,
            'expected_revision' => $revision,
            'event_key' => $eventKey,
            'operator_identity' => $operatorIdentity,
            'all_timely_submissions_reviewed' => $reviewed
        );
    }

    function ww_qrbs_validate_reconciliation($source) {
        $errors = array();
        $allowed = array(
            'csrf_token', 'action', 'expected_revision', 'event_key',
            'vendor_bingo_id', 'form_inquiry_id', 'form_submitted_local',
            'submitted_event_revision', 'vendor_offer_version',
            'submitted_rules_version', 'participant_responsibility_disclosure',
            'operator_identity',
            'couple_name', 'couple_email',
            'couple_phone', 'couple_wedding_date', 'age_of_majority_confirmed',
            'eligible_residency_confirmed', 'not_excluded_confirmed',
            'rules_acknowledged', 'promotion_responsibility_acknowledged',
            'contact_share_consent_confirmed',
            'apple_non_sponsor_acknowledged'
        );
        $allowedMap = array_fill_keys($allowed, true);
        foreach ($source as $key => $submittedValue) {
            if (!is_string($key) || !isset($allowedMap[$key])) {
                $errors['_reconciliation'] = 'The reconciliation request contains an unsupported field.';
                break;
            }
            if (!is_string($submittedValue) || ww_qrbs_contains_control_byte($submittedValue, false)) {
                $errors['_reconciliation'] = 'The reconciliation request contains an invalid field value.';
                break;
            }
        }

        $action = ww_qrbs_post_scalar($source, 'action', $errors);
        if ($action !== 'reconcile_alternate_free_entry') {
            $errors['action'] = 'Unsupported action.';
        }

        $revisionText = trim(ww_qrbs_post_scalar($source, 'expected_revision', $errors));
        $revision = null;
        if (!preg_match('/^[1-9][0-9]{0,17}$/D', $revisionText)) {
            $errors['expected_revision'] = 'Reload the current event revision before reconciling.';
        } else {
            $revision = (int)$revisionText;
        }

        $eventKey = trim(ww_qrbs_post_scalar($source, 'event_key', $errors));
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $eventKey) || strlen($eventKey) > 100) {
            $errors['event_key'] = 'Reload the current event before reconciling.';
        }

        $vendorBingoId = trim(ww_qrbs_post_scalar($source, 'vendor_bingo_id', $errors));
        if (!preg_match('/^[1-9][0-9]{0,19}$/D', $vendorBingoId)) {
            $errors['vendor_bingo_id'] = 'Enter the exact immutable Brilliant Directories vendor user ID.';
        }

        $submittedEventRevisionText = trim(
            ww_qrbs_post_scalar($source, 'submitted_event_revision', $errors)
        );
        $submittedEventRevision = null;
        if (!preg_match('/^[1-9][0-9]{0,17}$/D', $submittedEventRevisionText)) {
            $errors['submitted_event_revision'] = 'Enter the exact event revision recorded by Form 354.';
        } else {
            $submittedEventRevision = (int)$submittedEventRevisionText;
        }

        $vendorOfferVersion = ww_qrbs_validate_rfc3339_version(
            ww_qrbs_post_scalar($source, 'vendor_offer_version', $errors)
        );
        if ($vendorOfferVersion === '') {
            $errors['vendor_offer_version'] = 'Enter the exact RFC 3339 vendor offer version recorded by Form 354.';
        }

        $formInquiryId = trim(ww_qrbs_post_scalar($source, 'form_inquiry_id', $errors));
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $formInquiryId)) {
            $errors['form_inquiry_id'] = 'Enter the exact Form 354 inquiry ID from the forms inbox.';
        }

        $formSubmittedAt = ww_qrbs_validate_toronto_local_datetime(
            ww_qrbs_post_scalar($source, 'form_submitted_local', $errors)
        );
        if ($formSubmittedAt === '') {
            $errors['form_submitted_local'] = 'Enter the exact Form 354 submission date and time shown in the inbox, interpreted in Toronto time.';
        }

        $submittedRulesVersion = trim(
            ww_qrbs_post_scalar($source, 'submitted_rules_version', $errors)
        );
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/D', $submittedRulesVersion)) {
            $errors['submitted_rules_version'] = 'Enter the rules version recorded by Form 354.';
        }

        $participantResponsibilityDisclosure = ww_qrbs_normalize_plain_text(
            ww_qrbs_post_scalar($source, 'participant_responsibility_disclosure', $errors)
        );
        if (!ww_qrbs_is_plain_text($participantResponsibilityDisclosure, 1, 2000, false)) {
            $errors['participant_responsibility_disclosure'] = 'Copy the exact participant responsibility disclosure recorded by Form 354.';
        }

        $coupleName = ww_qrbs_normalize_plain_text(
            ww_qrbs_post_scalar($source, 'couple_name', $errors)
        );
        if (!ww_qrbs_is_plain_text($coupleName, 1, 160, false)) {
            $errors['couple_name'] = 'Use 1–160 plain-text characters.';
        }

        $coupleEmail = strtolower(trim(ww_qrbs_post_scalar($source, 'couple_email', $errors)));
        if (
            strlen($coupleEmail) > 254
            || !filter_var($coupleEmail, FILTER_VALIDATE_EMAIL)
            || ww_qrbs_contains_control_byte($coupleEmail, true)
        ) {
            $errors['couple_email'] = 'Enter the validated email from Form 354.';
        }

        $couplePhone = trim(isset($source['couple_phone']) && is_string($source['couple_phone'])
            ? $source['couple_phone']
            : '');
        if ($couplePhone !== '' && !ww_qrbs_is_plain_text($couplePhone, 1, 80, false)) {
            $errors['couple_phone'] = 'Use no more than 80 plain-text characters.';
        }

        $weddingDateInput = isset($source['couple_wedding_date']) && is_string($source['couple_wedding_date'])
            ? $source['couple_wedding_date']
            : '';
        $coupleWeddingDate = ww_qrbs_validate_calendar_date($weddingDateInput);
        if ($coupleWeddingDate === false) {
            $errors['couple_wedding_date'] = 'Use a valid date in YYYY-MM-DD format.';
            $coupleWeddingDate = '';
        }

        $operatorIdentity = ww_qrbs_normalize_plain_text(
            ww_qrbs_post_scalar($source, 'operator_identity', $errors)
        );
        if (!ww_qrbs_is_plain_text($operatorIdentity, 3, 160, false)) {
            $errors['operator_identity'] = 'Enter your administrator name or work email for the immutable audit record.';
        }

        $confirmationKeys = array(
            'age_of_majority_confirmed',
            'eligible_residency_confirmed',
            'not_excluded_confirmed',
            'rules_acknowledged',
            'promotion_responsibility_acknowledged',
            'contact_share_consent_confirmed',
            'apple_non_sponsor_acknowledged'
        );
        $confirmations = array();
        foreach ($confirmationKeys as $confirmationKey) {
            $confirmations[$confirmationKey] = ww_qrbs_post_boolean($source, $confirmationKey, $errors);
            if (!$confirmations[$confirmationKey] && !isset($errors[$confirmationKey])) {
                $errors[$confirmationKey] = 'This confirmation is required.';
            }
        }

        return array(
            'ok' => count($errors) === 0,
            'errors' => $errors,
            'expected_revision' => $revision,
            'event_key' => $eventKey,
            'submission' => array_merge(array(
                'vendor_bingo_id' => $vendorBingoId,
                'submitted_event_revision' => $submittedEventRevision,
                'vendor_offer_version' => $vendorOfferVersion,
                'form_inquiry_id' => $formInquiryId,
                'form_submitted_at' => $formSubmittedAt,
                'submitted_rules_version' => $submittedRulesVersion,
                'participant_responsibility_disclosure' => $participantResponsibilityDisclosure,
                'couple_name' => $coupleName,
                'couple_email' => $coupleEmail,
                'couple_phone' => $couplePhone,
                'couple_wedding_date' => $coupleWeddingDate,
                'operator_identity' => $operatorIdentity
            ), $confirmations)
        );
    }

    function ww_qrbs_load_signing_secret($database) {
        if (!function_exists('mysql') || !function_exists('mysql_fetch_assoc') || !$database) {
            return '';
        }

        $result = mysql(
            $database,
            "SELECT secret_text FROM ww_qr_bingo_admin_credentials WHERE active = 1 LIMIT 20"
        );
        if (!$result) { return ''; }

        while ($row = mysql_fetch_assoc($result)) {
            if (!is_array($row) || !isset($row['secret_text']) || !is_string($row['secret_text'])) {
                continue;
            }
            $secret = $row['secret_text'];
            if (strlen($secret) >= 32 && strlen($secret) <= 4096 && strpos($secret, chr(0)) === false) {
                return $secret;
            }
        }

        return '';
    }

    function ww_qrbs_local_tagged_vendor_count($database, $vendorTagId) {
        $vendorTagId = is_numeric($vendorTagId) ? (int)$vendorTagId : 0;
        if (
            $vendorTagId < 1
            || $vendorTagId > 2147483647
            || !function_exists('mysql')
            || !function_exists('mysql_fetch_assoc')
            || !$database
        ) {
            return null;
        }

        // vendorTagId is range-checked and cast to an integer before SQL use.
        $result = mysql(
            $database,
            "SELECT COUNT(DISTINCT u.user_id) AS vendor_count
             FROM users_data u
             INNER JOIN rel_tags rt ON rt.object_id = u.user_id
             WHERE rt.tag_id = '" . $vendorTagId . "'
               AND rt.tag_type_id = 1
               AND u.active = 2"
        );
        if (!$result) { return null; }
        $row = mysql_fetch_assoc($result);
        if (!is_array($row) || !isset($row['vendor_count']) || !is_numeric($row['vendor_count'])) {
            return null;
        }
        $count = (int)$row['vendor_count'];
        return $count >= 0 ? $count : null;
    }

    function ww_qrbs_local_vendor_tag_options($database) {
        $options = array();
        if (!function_exists('mysql') || !function_exists('mysql_fetch_assoc') || !$database) {
            return $options;
        }

        $result = mysql(
            $database,
            "SELECT t.id AS tag_id, t.tag_name, COUNT(DISTINCT u.user_id) AS active_vendor_count
             FROM tags t
             INNER JOIN rel_tags rt ON rt.tag_id = t.id AND rt.tag_type_id = 1
             INNER JOIN users_data u ON u.user_id = rt.object_id AND u.active = 2
             GROUP BY t.id, t.tag_name
             ORDER BY t.tag_name ASC, t.id ASC
             LIMIT 500"
        );
        if (!$result) { return $options; }

        while ($row = mysql_fetch_assoc($result)) {
            if (
                !is_array($row)
                || !isset($row['tag_id'])
                || !is_numeric($row['tag_id'])
                || !isset($row['tag_name'])
                || !is_string($row['tag_name'])
                || !isset($row['active_vendor_count'])
                || !is_numeric($row['active_vendor_count'])
            ) {
                continue;
            }

            $tagId = (int)$row['tag_id'];
            $vendorCount = (int)$row['active_vendor_count'];
            $tagName = ww_qrbs_normalize_plain_text($row['tag_name']);
            if ($tagId < 1 || $tagId > 2147483647 || $vendorCount < 1 || $tagName === '') {
                continue;
            }

            $options[] = array(
                'id' => $tagId,
                'name' => $tagName,
                'vendor_count' => $vendorCount
            );
        }

        return $options;
    }

    function ww_qrbs_local_tagged_vendor_options($database, $vendorTagId) {
        $options = array();
        $vendorTagId = is_numeric($vendorTagId) ? (int)$vendorTagId : 0;
        if (
            $vendorTagId < 1
            || $vendorTagId > 2147483647
            || !function_exists('mysql')
            || !function_exists('mysql_fetch_assoc')
            || !$database
        ) {
            return $options;
        }

        $result = mysql(
            $database,
            "SELECT DISTINCT u.user_id, u.company, u.first_name, u.last_name, u.active
             FROM users_data u
             INNER JOIN rel_tags rt ON rt.object_id = u.user_id
             WHERE rt.tag_id = '" . $vendorTagId . "'
               AND rt.tag_type_id = 1
               AND u.active IN (1, 2)
             ORDER BY u.company ASC, u.first_name ASC, u.last_name ASC, u.user_id ASC
             LIMIT 500"
        );
        if (!$result) { return $options; }

        while ($row = mysql_fetch_assoc($result)) {
            if (!is_array($row) || !isset($row['user_id']) || !is_numeric($row['user_id'])) {
                continue;
            }

            $vendorId = (int)$row['user_id'];
            if ($vendorId < 1 || $vendorId > 2147483647) { continue; }

            $company = isset($row['company']) && is_string($row['company'])
                ? ww_qrbs_normalize_plain_text($row['company'])
                : '';
            $firstName = isset($row['first_name']) && is_string($row['first_name'])
                ? ww_qrbs_normalize_plain_text($row['first_name'])
                : '';
            $lastName = isset($row['last_name']) && is_string($row['last_name'])
                ? ww_qrbs_normalize_plain_text($row['last_name'])
                : '';
            $personName = trim($firstName . ' ' . $lastName);
            $label = $company !== '' ? $company : ($personName !== '' ? $personName : 'Vendor');
            $isPublic = isset($row['active']) && (string)$row['active'] === '2';

            $options[] = array(
                'id' => $vendorId,
                'label' => $label,
                'is_public' => $isPublic
            );
        }

        return $options;
    }

    /* WW_QR_ADMIN_CONTACT_HELPERS_START */
    function ww_qrbs_contact_fields($source, $allowed) {
        if (!is_array($source)) throw new Exception('Review the contact details and try again.');
        foreach ($source as $key => $value) {
            if (!in_array($key, $allowed, true) || !is_string($value)) throw new Exception('Review the contact details and try again.');
        }
    }

    function ww_qrbs_contact_lookup_request($source) {
        ww_qrbs_contact_fields($source, array('csrf_token', 'action', 'search'));
        if (!isset($source['action']) || $source['action'] !== 'contact_lookup') throw new Exception('Choose a supported contact action.');
        $search = isset($source['search']) ? trim($source['search']) : '';
        if (!ww_qrbs_is_plain_text($search, 2, 120, false)) throw new Exception('Enter at least two characters of a couple name, email or member number.');
        return $search;
    }

    function ww_qrbs_contact_member_rows($database, $search, $exactId) {
        if (!$database || !function_exists('mysql_real_escape_string')) throw new Exception('Couple accounts could not be checked. Please try again.');
        if ($exactId) {
            if (!preg_match('/^[1-9][0-9]{0,17}$/D', $search)) throw new Exception('Choose an existing couple account.');
            $where = "u.user_id='" . mysql_real_escape_string($search) . "'";
        } else {
            $literal = str_replace(array(chr(92), '%', '_'), array(chr(92) . chr(92), chr(92) . '%', chr(92) . '_'), $search);
            $like = mysql_real_escape_string($literal);
            $where = "(CAST(u.user_id AS CHAR)='" . mysql_real_escape_string($search) . "' OR CONCAT_WS(' ',u.first_name,u.last_name) LIKE '%" . $like . "%' OR u.email LIKE '%" . $like . "%')";
        }
        // Public couple signup uses plan 18. Never infer couple status merely
        // from a non-vendor account; blog/admin plans must not be added here.
        $query = mysql($database, "SELECT u.user_id,u.first_name,u.last_name,u.email,u.subscription_id,u.active FROM users_data u WHERE u.subscription_id='18' AND u.active='2' AND " . $where . ' ORDER BY u.first_name,u.last_name,u.user_id LIMIT 20');
        if (!$query) throw new Exception('Couple accounts could not be checked. Please try again.');
        $members = array();
        while ($row = mysql_fetch_assoc($query)) {
            if (!is_array($row) || !isset($row['user_id'], $row['subscription_id'], $row['active']) || (string)$row['subscription_id'] !== '18' || (string)$row['active'] !== '2') continue;
            $id = (string)$row['user_id'];
            if (!preg_match('/^[1-9][0-9]{0,17}$/D', $id)) continue;
            $name = ww_qrbs_normalize_plain_text((isset($row['first_name']) ? $row['first_name'] : '') . ' ' . (isset($row['last_name']) ? $row['last_name'] : ''));
            $email = isset($row['email']) ? strtolower(trim((string)$row['email'])) : '';
            $members[] = array('couple_id' => $id, 'name' => $name, 'email' => $email);
        }
        return $members;
    }

    function ww_qrbs_contact_mutation($source) {
        $allowed = array('csrf_token', 'action', 'dataset', 'event_key', 'couple_id', 'expected_version', 'request_id', 'operator_identity');
        $action = isset($source['action']) && is_string($source['action']) ? $source['action'] : '';
        if (!in_array($action, array('contact_add', 'contact_remove', 'contact_restore'), true)) throw new Exception('Choose a supported contact action.');
        if ($action === 'contact_add') $allowed = array_merge($allowed, array('name', 'email', 'phone', 'wedding_date', 'wedding_venue'));
        ww_qrbs_contact_fields($source, $allowed);
        foreach (array('dataset', 'event_key', 'couple_id', 'expected_version', 'request_id', 'operator_identity') as $key) {
            if (!isset($source[$key])) throw new Exception('Review the contact details and try again.');
        }
        $event = trim($source['event_key']);
        $couple = trim($source['couple_id']);
        $operator = trim($source['operator_identity']);
        if ($source['dataset'] !== 'contacts' || strlen($event) > 100 || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $event)) throw new Exception('Choose a valid event contact list.');
        if (!preg_match('/^[1-9][0-9]{0,17}$/D', $couple)) throw new Exception('Choose an existing couple account.');
        if (!preg_match('/^(?:0|[1-9][0-9]{0,14})$/D', $source['expected_version']) || ($action === 'contact_add' ? $source['expected_version'] !== '0' : (int)$source['expected_version'] < 1)) throw new Exception('Refresh the contact list before making this change.');
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iD', $source['request_id'])) throw new Exception('Refresh the page and try again.');
        if (!ww_qrbs_is_plain_text($operator, 3, 160, false)) throw new Exception('Enter your admin name for the change history.');
        $payload = array('action' => $action, 'dataset' => 'contacts', 'event_key' => $event, 'couple_id' => $couple, 'expected_version' => (int)$source['expected_version'], 'request_id' => strtolower($source['request_id']), 'operator_identity' => $operator);
        if ($action === 'contact_add') {
            foreach (array('name', 'email', 'phone', 'wedding_date', 'wedding_venue') as $key) {
                if (!isset($source[$key])) throw new Exception('Complete the contact form and try again.');
                $payload[$key] = trim($source[$key]);
            }
            $payload['name'] = ww_qrbs_normalize_plain_text($payload['name']);
            $payload['email'] = strtolower($payload['email']);
            $payload['phone'] = ww_qrbs_normalize_plain_text($payload['phone']);
            $payload['wedding_venue'] = ww_qrbs_normalize_plain_text($payload['wedding_venue']);
            if (!ww_qrbs_is_plain_text($payload['name'], 1, 160, false) || in_array(strtolower($payload['name']), array('couple', 'weddingwin', 'weddingwin couple'), true)) throw new Exception('Enter the couple names. First names are fine.');
            if (strlen($payload['email']) > 254 || ww_qrbs_contains_control_byte($payload['email'], true) || !filter_var($payload['email'], FILTER_VALIDATE_EMAIL) || substr($payload['email'], -strlen('@privaterelay.appleid.com')) === '@privaterelay.appleid.com') throw new Exception('Enter a direct contact email, not an Apple private relay address.');
            $digits = preg_replace('/[^0-9]/', '', $payload['phone']);
            if (!ww_qrbs_is_plain_text($payload['phone'], 7, 80, false) || strlen($digits) < 7 || strlen($digits) > 15) throw new Exception('Enter a valid phone number.');
            $date = $payload['wedding_date'];
            if ($date !== '' && (!preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D', $date, $parts) || (int)$parts[1] < 1900 || !checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1]))) throw new Exception('Choose a real wedding date.');
            if (!ww_qrbs_is_plain_text($payload['wedding_venue'], 0, 200, false) || ($date === '' && $payload['wedding_venue'] !== '')) throw new Exception('Choose a wedding date before adding a venue.');
        }
        return $payload;
    }
    /* WW_QR_ADMIN_CONTACT_HELPERS_END */

    /* WW_QR_ADMIN_DATA_HELPERS_START */
    function ww_qrbs_data_filters($source) {
        $allowed = array('csrf_token', 'action', 'dataset', 'event_key', 'vendor_id', 'search', 'page', 'page_size', 'operator_identity', 'contact_status');
        foreach ($source as $key => $value) {
            if (!in_array($key, $allowed, true) || !is_string($value)) throw new Exception('Review the data filters and try again.');
        }
        $dataset = isset($source['dataset']) ? $source['dataset'] : '';
        if (!in_array($dataset, array('contacts', 'scans', 'entries', 'winners'), true)) throw new Exception('Choose a data list.');
        $event = isset($source['event_key']) ? trim($source['event_key']) : '';
        if (strlen($event) > 100 || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $event)) throw new Exception('Enter a valid event key.');
        $vendor = isset($source['vendor_id']) ? trim($source['vendor_id']) : '';
        if ($vendor !== '' && !preg_match('/^[1-9][0-9]{0,18}$/D', $vendor)) throw new Exception('Choose a valid vendor.');
        $search = isset($source['search']) ? trim($source['search']) : '';
        if (!ww_qrbs_is_plain_text($search, 0, 120, false)) throw new Exception('Use a shorter search without special markup.');
        $operator = isset($source['operator_identity']) ? trim($source['operator_identity']) : '';
        if (($operator !== '' && !ww_qrbs_is_plain_text($operator, 3, 160, false)) || (isset($source['action']) && $source['action'] === 'data_export' && $operator === '')) throw new Exception('Enter your administrator name or work email for the audit record.');
        $page = isset($source['page']) ? $source['page'] : '1';
        $size = isset($source['page_size']) ? $source['page_size'] : '50';
        if (!preg_match('/^[1-9][0-9]{0,4}$/D', $page) || (int)$page > 10000 || !preg_match('/^[1-9][0-9]{0,2}$/D', $size) || (int)$size > 100) throw new Exception('Use a valid page size.');
        if (isset($source['contact_status']) && ($dataset !== 'contacts' || !in_array($source['contact_status'], array('active', 'removed', 'all'), true))) throw new Exception('Choose a valid contact list status.');
        $filters = array('dataset' => $dataset, 'event_key' => $event, 'vendor_id' => $vendor, 'search' => $search,
            'page' => (int)$page, 'page_size' => (int)$size, 'operator_identity' => $operator);
        if ($dataset === 'contacts') $filters['contact_status'] = isset($source['contact_status']) ? $source['contact_status'] : 'active';
        return $filters;
    }

    function ww_qrbs_csv_cell($value) {
        $text = (string)$value;
        // Spreadsheet formula protection includes leading whitespace/control bytes.
        $index = 0;
        while ($index < strlen($text) && ord($text[$index]) <= 32) $index += 1;
        if ($index < strlen($text) && in_array($text[$index], array('=', '+', '@', '-'), true)) $text = "'" . $text;
        return '"' . str_replace('"', '""', $text) . '"';
    }

    function ww_qrbs_scans_data($database, $filters, $config, $export) {
        if (!is_array($config) || !isset($config['event_key'], $config['vendor_tag_id'], $config['history_starts_at'], $config['entry_closes_at'])
            || $filters['event_key'] !== (string)$config['event_key']) throw new Exception('Website scan history is available for the current published event only.');
        $start = ww_qrbs_validate_datetime(array_key_exists('scan_history_starts_at', $config) ? $config['scan_history_starts_at'] : $config['history_starts_at']);
        $end = ww_qrbs_validate_datetime($config['entry_closes_at']);
        $tag = (int)$config['vendor_tag_id'];
        if ($start === '' || $end === '' || $tag < 1 || !function_exists('mysql_real_escape_string')) throw new Exception('The scan history window could not be verified.');
        $sqlStart = mysql_real_escape_string(date('Y-m-d H:i:s', strtotime($start)));
        $sqlEnd = mysql_real_escape_string(date('Y-m-d H:i:s', strtotime($end)));
        $where = "vv.scan_date >= '" . $sqlStart . "' AND vv.scan_date < '" . $sqlEnd . "' AND EXISTS (SELECT 1 FROM rel_tags rt WHERE rt.object_id=vv.vendor_id AND rt.tag_id='" . $tag . "' AND rt.tag_type_id=1)";
        if ($filters['vendor_id'] !== '') $where .= " AND vv.vendor_id='" . mysql_real_escape_string($filters['vendor_id']) . "'";
        if ($filters['search'] !== '') {
            $search = mysql_real_escape_string(str_replace(array(chr(92), '%', '_'), array(chr(92) . chr(92), chr(92) . '%', chr(92) . '_'), $filters['search']));
            $where .= " AND (CONCAT_WS(' ',c.first_name,c.last_name,v.company,v.first_name,v.last_name,vv.user_id,vv.vendor_id) LIKE '%" . $search . "%')";
        }
        $from = ' FROM vendor_visits vv LEFT JOIN users_data c ON c.user_id=vv.user_id LEFT JOIN users_data v ON v.user_id=vv.vendor_id WHERE ' . $where;
        $countQuery = mysql($database, 'SELECT COUNT(*) AS total' . $from);
        $countRow = $countQuery ? mysql_fetch_assoc($countQuery) : false;
        if (!$countRow || !isset($countRow['total']) || !is_numeric($countRow['total'])) throw new Exception('Scan history could not be loaded.');
        $total = (int)$countRow['total'];
        if ($export && $total > 5000) throw new Exception('This download is too large. Narrow the vendor or search filter to 5,000 rows or fewer.');
        $limit = $export ? 5001 : $filters['page_size'];
        $offset = $export ? 0 : ($filters['page'] - 1) * $filters['page_size'];
        $result = mysql($database, "SELECT vv.user_id AS couple_id,TRIM(CONCAT_WS(' ',c.first_name,c.last_name)) AS name,vv.vendor_id AS vendor_id,COALESCE(NULLIF(v.company,''),TRIM(CONCAT_WS(' ',v.first_name,v.last_name))) AS vendor_name,vv.scan_date AS scanned_at" . $from . ' ORDER BY vv.scan_date DESC,vv.user_id ASC,vv.vendor_id ASC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset);
        if (!$result) throw new Exception('Scan history could not be loaded.');
        $rows = array();
        while ($row = mysql_fetch_assoc($result)) {
            $clean = array('event_key' => $filters['event_key']);
            foreach (array('couple_id', 'name', 'vendor_id', 'vendor_name', 'scanned_at') as $key) $clean[$key] = isset($row[$key]) ? (string)$row[$key] : '';
            $rows[] = $clean;
        }
        if ($export && count($rows) > 5000) throw new Exception('The scan list changed. Narrow the filters and retry the download.');
        $columns = array(array('key' => 'event_key', 'label' => 'Event'), array('key' => 'couple_id', 'label' => 'Couple ID'), array('key' => 'name', 'label' => 'Name'), array('key' => 'vendor_id', 'label' => 'Vendor ID'), array('key' => 'vendor_name', 'label' => 'Vendor'), array('key' => 'scanned_at', 'label' => 'Last scanned'));
        return array('ok' => true, 'dataset' => 'scans', 'event_key' => $filters['event_key'], 'columns' => $columns, 'rows' => $rows,
            'total' => $total, 'page' => $filters['page'], 'page_size' => $filters['page_size'], 'has_more' => $offset + count($rows) < $total);
    }

    function ww_qrbs_data_json($body, $status) {
        while (function_exists('ob_get_level') && ob_get_level() > 0) @ob_end_clean();
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($body);
        exit();
    }
    /* WW_QR_ADMIN_DATA_HELPERS_END */

    function ww_qrbs_edge_call($database, $payload) {
        $failure = array(
            'transport_ok' => false,
            'http_status' => 0,
            'payload' => array()
        );
        if (!is_array($payload) || !function_exists('curl_init') || !function_exists('hash_hmac')) {
            return $failure;
        }

        $secret = ww_qrbs_load_signing_secret($database);
        if ($secret === '') { return $failure; }

        $rawBody = json_encode($payload);
        if (!is_string($rawBody) || $rawBody === '' || json_last_error() !== JSON_ERROR_NONE) {
            return $failure;
        }

        $timestamp = (string)time();
        $nonce = ww_qrbs_secure_random_hex(16);
        if ($nonce === '') { return $failure; }
        $signature = hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $rawBody, $secret);
        unset($secret);

        $responseBody = '';
        $responseLimit = isset($payload['action']) && $payload['action'] === 'data_export' ? 8388608 : 262144;
        $responseTooLarge = false;
        $handle = curl_init('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin');
        if ($handle === false) { return $failure; }

        curl_setopt_array($handle, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $rawBody,
            CURLOPT_HTTPHEADER => array(
                'Content-Type: application/json',
                'Accept: application/json',
                'x-ww-timestamp: ' . $timestamp,
                'x-ww-nonce: ' . $nonce,
                'x-ww-signature: ' . $signature
            ),
            CURLOPT_HEADER => false,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'WeddingWin-BD-QR-Admin/1.0',
            CURLOPT_WRITEFUNCTION => function($curl, $chunk) use (&$responseBody, &$responseTooLarge, $responseLimit) {
                if (strlen($responseBody) + strlen($chunk) > $responseLimit) {
                    $responseTooLarge = true;
                    return 0;
                }
                $responseBody .= $chunk;
                return strlen($chunk);
            }
        ));

        $executed = curl_exec($handle);
        $curlErrorNumber = curl_errno($handle);
        $httpStatus = (int)curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);
        if ($executed === false || $curlErrorNumber !== 0 || $responseTooLarge) {
            return $failure;
        }

        $decoded = json_decode($responseBody, true);
        if (!is_array($decoded) || json_last_error() !== JSON_ERROR_NONE) {
            return array(
                'transport_ok' => false,
                'http_status' => $httpStatus,
                'payload' => array()
            );
        }

        return array(
            'transport_ok' => true,
            'http_status' => $httpStatus,
            'payload' => $decoded
        );
    }

    function ww_qrbs_response_succeeded($result) {
        return is_array($result)
            && !empty($result['transport_ok'])
            && isset($result['http_status'])
            && (int)$result['http_status'] >= 200
            && (int)$result['http_status'] < 300
            && isset($result['payload'])
            && is_array($result['payload'])
            && isset($result['payload']['ok'])
            && $result['payload']['ok'] === true;
    }

    function ww_qrbs_set_flash($type, $message, $errors, $draft) {
        $_SESSION['ww_qr_bingo_settings_flash'] = array(
            'type' => $type === 'success' ? 'success' : 'error',
            'message' => (string)$message,
            'errors' => is_array($errors) ? $errors : array(),
            'draft' => is_array($draft) ? $draft : array()
        );
    }

    function ww_qrbs_take_flash() {
        if (!isset($_SESSION['ww_qr_bingo_settings_flash']) || !is_array($_SESSION['ww_qr_bingo_settings_flash'])) {
            return array('type' => '', 'message' => '', 'errors' => array(), 'draft' => array());
        }
        $flash = $_SESSION['ww_qr_bingo_settings_flash'];
        unset($_SESSION['ww_qr_bingo_settings_flash']);
        return $flash;
    }

    function ww_qrbs_redirect() {
        header('Location: /admin/go.php?widget=ww_qr_bingo_settings', true, 303);
        exit();
    }

    function ww_qrbs_truthy($value) {
        return $value === true || $value === 1 || $value === '1';
    }

    function ww_qrbs_field_error($errors, $field) {
        if (!is_array($errors) || !isset($errors[$field]) || !is_string($errors[$field])) { return ''; }
        return '<p class="ww-qrbs-field-error">' . ww_qrbs_escape($errors[$field]) . '</p>';
    }

}

if (function_exists('session_status')) {
    if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }
} elseif (session_id() === '') {
    @session_start();
}

if (session_id() === '' || !function_exists('hash_equals')) {
    http_response_code(500);
    echo '<p>A secure admin session is unavailable. No QR Bingo settings were loaded or changed.</p>';
    return;
}

if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
}

if (
    !isset($_SESSION['ww_qr_bingo_settings_csrf'])
    || !is_string($_SESSION['ww_qr_bingo_settings_csrf'])
    || strlen($_SESSION['ww_qr_bingo_settings_csrf']) !== 64
) {
    $_SESSION['ww_qr_bingo_settings_csrf'] = ww_qrbs_secure_random_hex(32);
}
$ww_qrbs_csrf = (string)$_SESSION['ww_qr_bingo_settings_csrf'];
if (strlen($ww_qrbs_csrf) !== 64) {
    http_response_code(500);
    echo '<p>A secure request token could not be created. No QR Bingo settings were loaded or changed.</p>';
    return;
}

$ww_qrbs_database = isset($w) && is_array($w) && isset($w['database']) ? $w['database'] : null;

if ($ww_qrbs_method === 'POST') {
    // Brilliant Directories removes rendered values from type=hidden inputs.
    // The form therefore uses namespaced, visually hidden text controls and
    // maps them back to the canonical server keys before validation.
    $ww_qrbs_browser_post_fields = array(
        'ww_qrbs_csrf_token' => 'csrf_token',
        'ww_qrbs_form_action' => 'action',
        'ww_qrbs_expected_revision' => 'expected_revision',
        'ww_qrbs_event_key' => 'event_key'
    );
    foreach ($ww_qrbs_browser_post_fields as $ww_qrbs_browser_key => $ww_qrbs_server_key) {
        if (
            array_key_exists($ww_qrbs_browser_key, $_POST)
            && !array_key_exists($ww_qrbs_server_key, $_POST)
        ) {
            $_POST[$ww_qrbs_server_key] = $_POST[$ww_qrbs_browser_key];
            unset($_POST[$ww_qrbs_browser_key]);
        }
    }

    $ww_qrbs_submitted_csrf = isset($_POST['csrf_token']) && is_string($_POST['csrf_token'])
        ? $_POST['csrf_token']
        : '';
    if (!hash_equals($ww_qrbs_csrf, $ww_qrbs_submitted_csrf)) {
        $_SESSION['ww_qr_bingo_settings_csrf'] = ww_qrbs_secure_random_hex(32);
        ww_qrbs_set_flash('error', 'The form expired. Review the current settings and try again.', array(), array());
        ww_qrbs_redirect();
    }

    $ww_qrbs_post_action = isset($_POST['action']) && is_string($_POST['action'])
        ? $_POST['action']
        : '';

    /* WW_QR_ADMIN_CONTACT_REQUEST_START */
    if (in_array($ww_qrbs_post_action, array('contact_lookup', 'contact_add', 'contact_remove', 'contact_restore'), true)) {
        try {
            $origin = isset($_SERVER['HTTP_ORIGIN']) ? strtolower((string)$_SERVER['HTTP_ORIGIN']) : '';
            $host = isset($_SERVER['HTTP_HOST']) ? strtolower((string)$_SERVER['HTTP_HOST']) : '';
            if (!in_array($host, array('www.weddingwin.ca', 'weddingwin.ca', 'ww2.managemydirectory.com'), true) || $origin !== 'https://' . $host) throw new Exception('Open this contact tool in the signed-in WeddingWin admin.');
            if ($ww_qrbs_post_action === 'contact_lookup') {
                $search = ww_qrbs_contact_lookup_request($_POST);
                ww_qrbs_data_json(array('ok' => true, 'members' => ww_qrbs_contact_member_rows($ww_qrbs_database, $search, false)), 200);
            }
            $payload = ww_qrbs_contact_mutation($_POST);
            if ($payload['action'] === 'contact_add') {
                $members = ww_qrbs_contact_member_rows($ww_qrbs_database, $payload['couple_id'], true);
                if (count($members) !== 1 || $members[0]['couple_id'] !== $payload['couple_id']) throw new Exception('Choose an active couple account. No contact was added.');
                // Browser proof fields are not accepted by the allowlist. This
                // assertion is built only from a fresh, scoped BD member read.
                $payload['verified_couple'] = array('id' => $members[0]['couple_id'], 'subscription_id' => '18', 'active' => '2');
            }
            $result = ww_qrbs_edge_call($ww_qrbs_database, $payload);
            if (!ww_qrbs_response_succeeded($result)) {
                $status = isset($result['http_status']) ? (int)$result['http_status'] : 503;
                $error = isset($result['payload']['error']) && is_string($result['payload']['error']) ? $result['payload']['error'] : '';
                if (!in_array($status, array(400, 401, 403, 404, 409, 422, 429, 503), true)) $status = 503;
                if (!ww_qrbs_is_plain_text($error, 1, 400, false)) $error = 'The change could not be confirmed. Refresh the list before trying again.';
                ww_qrbs_data_json(array('ok' => false, 'error' => $error), $status);
            }
            $reply = $result['payload'];
            if (!isset($reply['action'], $reply['dataset'], $reply['event_key'], $reply['couple_id'], $reply['request_id'], $reply['version'], $reply['removed']) || $reply['action'] !== $payload['action'] || $reply['dataset'] !== 'contacts' || $reply['event_key'] !== $payload['event_key'] || (string)$reply['couple_id'] !== $payload['couple_id'] || $reply['request_id'] !== $payload['request_id'] || !is_int($reply['version']) || $reply['version'] <= $payload['expected_version'] || !is_bool($reply['removed']) || $reply['removed'] !== ($payload['action'] === 'contact_remove')) throw new Exception('The change response could not be verified. Refresh the list before trying again.');
            ww_qrbs_data_json($reply, 200);
        } catch (Exception $error) {
            ww_qrbs_data_json(array('ok' => false, 'error' => $error->getMessage()), 400);
        }
    }
    /* WW_QR_ADMIN_CONTACT_REQUEST_END */

    /* WW_QR_ADMIN_DATA_REQUEST_START */
    if ($ww_qrbs_post_action === 'data_list' || $ww_qrbs_post_action === 'data_export') {
        try {
            $origin = isset($_SERVER['HTTP_ORIGIN']) ? strtolower((string)$_SERVER['HTTP_ORIGIN']) : '';
            $host = isset($_SERVER['HTTP_HOST']) ? strtolower((string)$_SERVER['HTTP_HOST']) : '';
            if (!in_array($host, array('www.weddingwin.ca', 'weddingwin.ca', 'ww2.managemydirectory.com'), true) || $origin !== 'https://' . $host) throw new Exception('Open this data tool in the signed-in WeddingWin admin.');
            $filters = ww_qrbs_data_filters($_POST);
            if ($filters['dataset'] === 'scans') {
                $configResult = ww_qrbs_edge_call($ww_qrbs_database, array('action' => 'admin_get'));
                if (!ww_qrbs_response_succeeded($configResult)) throw new Exception('Current event settings could not be verified.');
                $export = $ww_qrbs_post_action === 'data_export';
                $data = ww_qrbs_scans_data($ww_qrbs_database, $filters, $configResult['payload']['event_config'], $export);
                if ($export) {
                    $audit = $filters; unset($audit['page'], $audit['page_size']);
                    $audit['action'] = 'data_export_audit'; $audit['row_count'] = count($data['rows']);
                    $auditResult = ww_qrbs_edge_call($ww_qrbs_database, $audit);
                    if (!ww_qrbs_response_succeeded($auditResult)) throw new Exception('The download audit could not be recorded. No file was downloaded; please try again.');
                    $csvRows = array(); $heading = array();
                    foreach ($data['columns'] as $column) $heading[] = ww_qrbs_csv_cell($column['label']);
                    $csvRows[] = implode(',', $heading);
                    foreach ($data['rows'] as $row) {
                        $cells = array();
                        foreach ($data['columns'] as $column) $cells[] = ww_qrbs_csv_cell($row[$column['key']]);
                        $csvRows[] = implode(',', $cells);
                    }
                    $data = array('ok' => true, 'dataset' => 'scans', 'event_key' => $filters['event_key'], 'report' => array(
                        'filename' => 'qr-bingo-scans-' . $filters['event_key'] . '.csv', 'mime_type' => 'text/csv;charset=utf-8',
                        'csv' => implode(chr(13) . chr(10), $csvRows) . chr(13) . chr(10), 'row_count' => count($data['rows']), 'generated_at' => gmdate('c')));
                }
                ww_qrbs_data_json($data, 200);
            }
            $filters['action'] = $ww_qrbs_post_action;
            $result = ww_qrbs_edge_call($ww_qrbs_database, $filters);
            if (!ww_qrbs_response_succeeded($result)) throw new Exception('The data request could not be completed. Check the filters or narrow the download and try again.');
            ww_qrbs_data_json($result['payload'], 200);
        } catch (Exception $error) {
            ww_qrbs_data_json(array('ok' => false, 'error' => $error->getMessage()), 400);
        }
    }
    /* WW_QR_ADMIN_DATA_REQUEST_END */

    if ($ww_qrbs_post_action === 'declare_alternate_entry_reconciliation_complete') {
        $ww_qrbs_validation = ww_qrbs_validate_reconciliation_closure($_POST);
        if (!$ww_qrbs_validation['ok']) {
            ww_qrbs_set_flash(
                'error',
                'The Form 354 queue was not declared complete. Review the attestation and operator identity.',
                $ww_qrbs_validation['errors'],
                array()
            );
            ww_qrbs_redirect();
        }

        $ww_qrbs_closure_result = ww_qrbs_edge_call($ww_qrbs_database, array(
            'action' => 'declare_alternate_entry_reconciliation_complete',
            'expected_revision' => $ww_qrbs_validation['expected_revision'],
            'event_key' => $ww_qrbs_validation['event_key'],
            'operator_identity' => $ww_qrbs_validation['operator_identity'],
            'all_timely_submissions_reviewed' => true
        ));
        $ww_qrbs_closure_status = isset($ww_qrbs_closure_result['http_status'])
            ? (int)$ww_qrbs_closure_result['http_status']
            : 0;
        $ww_qrbs_closure_payload = isset($ww_qrbs_closure_result['payload'])
            && is_array($ww_qrbs_closure_result['payload'])
            ? $ww_qrbs_closure_result['payload']
            : array();
        $ww_qrbs_closure_error = isset($ww_qrbs_closure_payload['error'])
            && is_string($ww_qrbs_closure_payload['error'])
            && ww_qrbs_is_plain_text($ww_qrbs_closure_payload['error'], 1, 300, false)
            ? $ww_qrbs_closure_payload['error']
            : '';

        if (ww_qrbs_response_succeeded($ww_qrbs_closure_result)) {
            $_SESSION['ww_qr_bingo_settings_csrf'] = ww_qrbs_secure_random_hex(32);
            ww_qrbs_set_flash(
                'success',
                'The Form 354 queue-completion attestation was recorded for this exact event revision. Vendor potential-winner selection is now unblocked unless a later alternate entry is reconciled.',
                array(),
                array()
            );
        } elseif ($ww_qrbs_closure_status === 409) {
            ww_qrbs_set_flash(
                'error',
                'The event configuration changed. No attestation was recorded; review the current revision and try again.',
                array(),
                array()
            );
        } elseif ($ww_qrbs_closure_status === 400 || $ww_qrbs_closure_status === 422) {
            ww_qrbs_set_flash(
                'error',
                $ww_qrbs_closure_error !== ''
                    ? $ww_qrbs_closure_error . ' No attestation was recorded.'
                    : 'The queue-completion declaration did not meet the current requirements. No attestation was recorded.',
                array(),
                array()
            );
        } elseif ($ww_qrbs_closure_status === 401 || $ww_qrbs_closure_status === 403) {
            ww_qrbs_set_flash(
                'error',
                'The secure service did not authorize this declaration. No attestation was recorded.',
                array(),
                array()
            );
        } else {
            ww_qrbs_set_flash(
                'error',
                'The secure queue-completion service is unavailable. No attestation was recorded.',
                array(),
                array()
            );
        }
        ww_qrbs_redirect();
    }

    if ($ww_qrbs_post_action === 'reconcile_alternate_free_entry') {
        $ww_qrbs_validation = ww_qrbs_validate_reconciliation($_POST);
        if (!$ww_qrbs_validation['ok']) {
            ww_qrbs_set_flash(
                'error',
                'No entry was created. Recheck the Form 354 inquiry and every confirmation.',
                $ww_qrbs_validation['errors'],
                array()
            );
            ww_qrbs_redirect();
        }

        $ww_qrbs_reconcile_result = ww_qrbs_edge_call($ww_qrbs_database, array(
            'action' => 'reconcile_alternate_free_entry',
            'expected_revision' => $ww_qrbs_validation['expected_revision'],
            'event_key' => $ww_qrbs_validation['event_key'],
            'submission' => $ww_qrbs_validation['submission']
        ));
        $ww_qrbs_reconcile_status = isset($ww_qrbs_reconcile_result['http_status'])
            ? (int)$ww_qrbs_reconcile_result['http_status']
            : 0;
        $ww_qrbs_reconcile_payload = isset($ww_qrbs_reconcile_result['payload'])
            && is_array($ww_qrbs_reconcile_result['payload'])
            ? $ww_qrbs_reconcile_result['payload']
            : array();
        $ww_qrbs_reconcile_error = isset($ww_qrbs_reconcile_payload['error'])
            && is_string($ww_qrbs_reconcile_payload['error'])
            && ww_qrbs_is_plain_text($ww_qrbs_reconcile_payload['error'], 1, 300, false)
            ? $ww_qrbs_reconcile_payload['error']
            : '';
        $ww_qrbs_reconcile_code = isset($ww_qrbs_reconcile_payload['code'])
            && is_string($ww_qrbs_reconcile_payload['code'])
            && preg_match('/^[a-z0-9_]{1,80}$/D', $ww_qrbs_reconcile_payload['code'])
            ? $ww_qrbs_reconcile_payload['code']
            : '';

        if (ww_qrbs_response_succeeded($ww_qrbs_reconcile_result)) {
            $_SESSION['ww_qr_bingo_settings_csrf'] = ww_qrbs_secure_random_hex(32);
            ww_qrbs_set_flash(
                'success',
                'The validated Form 354 inquiry was reconciled. It created one vendor-draw entry and no QR scan or Bingo progress.',
                array(),
                array()
            );
        } elseif ($ww_qrbs_reconcile_status === 409 && $ww_qrbs_reconcile_code === 'stale_vendor_offer') {
            ww_qrbs_set_flash(
                'error',
                ($ww_qrbs_reconcile_error !== ''
                    ? $ww_qrbs_reconcile_error
                    : 'The vendor offer changed after Form 354 was submitted.')
                    . ' No entry or scan progress was changed. Current admin data was refreshed; reopen the inquiry and verify its submitted event revision and exact vendor offer version.',
                array(),
                array()
            );
        } elseif ($ww_qrbs_reconcile_status === 400 || $ww_qrbs_reconcile_status === 409 || $ww_qrbs_reconcile_status === 422) {
            ww_qrbs_set_flash(
                'error',
                $ww_qrbs_reconcile_error !== ''
                    ? $ww_qrbs_reconcile_error . ' No entry or scan progress was changed.'
                    : 'The inquiry did not meet the current reconciliation requirements. No entry or scan progress was changed.',
                array(),
                array()
            );
        } elseif ($ww_qrbs_reconcile_status === 401 || $ww_qrbs_reconcile_status === 403) {
            ww_qrbs_set_flash(
                'error',
                'The secure service did not authorize reconciliation. No entry or scan progress was changed.',
                array(),
                array()
            );
        } else {
            ww_qrbs_set_flash(
                'error',
                'The secure reconciliation service is unavailable. No entry or scan progress was changed.',
                array(),
                array()
            );
        }
        ww_qrbs_redirect();
    }

    $ww_qrbs_validation = ww_qrbs_validate_publish($_POST);
    if (!$ww_qrbs_validation['ok']) {
        ww_qrbs_set_flash(
            'error',
            'Nothing was published. Correct the highlighted fields and try again.',
            $ww_qrbs_validation['errors'],
            $ww_qrbs_validation['config']
        );
        ww_qrbs_redirect();
    }

    $ww_qrbs_proposed_vendor_count = ww_qrbs_local_tagged_vendor_count(
        $ww_qrbs_database,
        $ww_qrbs_validation['config']['vendor_tag_id']
    );
    if ($ww_qrbs_proposed_vendor_count === null || $ww_qrbs_proposed_vendor_count < 1) {
        ww_qrbs_set_flash(
            'error',
            'Nothing was published. The selected tag must contain at least one active vendor.',
            array('vendor_tag_id' => 'Choose a tag that contains at least one active vendor.'),
            $ww_qrbs_validation['config']
        );
        ww_qrbs_redirect();
    }

    $ww_qrbs_publish_result = ww_qrbs_edge_call($ww_qrbs_database, array(
        'action' => 'publish',
        'expected_revision' => $ww_qrbs_validation['expected_revision'],
        'config' => $ww_qrbs_validation['config']
    ));
    $ww_qrbs_publish_status = isset($ww_qrbs_publish_result['http_status'])
        ? (int)$ww_qrbs_publish_result['http_status']
        : 0;

    if (ww_qrbs_response_succeeded($ww_qrbs_publish_result)) {
        $_SESSION['ww_qr_bingo_settings_csrf'] = ww_qrbs_secure_random_hex(32);
        ww_qrbs_set_flash(
            'success',
            'QR Bingo settings were published. The current revision is shown below.',
            array(),
            array()
        );
    } elseif ($ww_qrbs_publish_status === 409) {
        ww_qrbs_set_flash(
            'error',
            'These settings were changed elsewhere. Review the new revision before publishing again.',
            array(),
            $ww_qrbs_validation['config']
        );
    } elseif ($ww_qrbs_publish_status === 400 || $ww_qrbs_publish_status === 422) {
        ww_qrbs_set_flash(
            'error',
            'The server rejected this configuration. No change was published.',
            array(),
            $ww_qrbs_validation['config']
        );
    } elseif ($ww_qrbs_publish_status === 401 || $ww_qrbs_publish_status === 403) {
        ww_qrbs_set_flash(
            'error',
            'The secure settings service did not authorize this request. No change was published.',
            array(),
            $ww_qrbs_validation['config']
        );
    } else {
        ww_qrbs_set_flash(
            'error',
            'The secure settings service is unavailable. No change was published.',
            array(),
            $ww_qrbs_validation['config']
        );
    }
    ww_qrbs_redirect();
}

$ww_qrbs_flash = ww_qrbs_take_flash();
$ww_qrbs_get_result = ww_qrbs_edge_call($ww_qrbs_database, array('action' => 'admin_get'));
$ww_qrbs_get_ok = ww_qrbs_response_succeeded($ww_qrbs_get_result);
$ww_qrbs_data = $ww_qrbs_get_ok ? $ww_qrbs_get_result['payload'] : array();
$ww_qrbs_current_config = isset($ww_qrbs_data['event_config']) && is_array($ww_qrbs_data['event_config'])
    ? $ww_qrbs_data['event_config']
    : array();
$ww_qrbs_revision_raw = isset($ww_qrbs_current_config['revision']) && !is_array($ww_qrbs_current_config['revision'])
    ? (string)$ww_qrbs_current_config['revision']
    : '';
$ww_qrbs_revision_valid = preg_match('/^[1-9][0-9]{0,17}$/D', $ww_qrbs_revision_raw) === 1;
$ww_qrbs_revision = $ww_qrbs_revision_valid ? $ww_qrbs_revision_raw : '';
$ww_qrbs_stats = isset($ww_qrbs_data['stats']) && is_array($ww_qrbs_data['stats'])
    ? $ww_qrbs_data['stats']
    : array();
$ww_qrbs_alternate_operations = isset($ww_qrbs_data['alternate_entry_operations'])
    && is_array($ww_qrbs_data['alternate_entry_operations'])
    ? $ww_qrbs_data['alternate_entry_operations']
    : array();

$ww_qrbs_form_config = $ww_qrbs_current_config;
if (isset($ww_qrbs_flash['draft']) && is_array($ww_qrbs_flash['draft']) && count($ww_qrbs_flash['draft']) > 0) {
    $ww_qrbs_form_config = array_merge($ww_qrbs_form_config, $ww_qrbs_flash['draft']);
}
$ww_qrbs_errors = isset($ww_qrbs_flash['errors']) && is_array($ww_qrbs_flash['errors'])
    ? $ww_qrbs_flash['errors']
    : array();
$ww_qrbs_form_enabled = $ww_qrbs_get_ok && $ww_qrbs_revision_valid;
$ww_qrbs_action_url = '/admin/go.php?widget=ww_qr_bingo_settings';
$ww_qrbs_event_key = isset($ww_qrbs_current_config['event_key'])
    && is_string($ww_qrbs_current_config['event_key'])
    && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $ww_qrbs_current_config['event_key'])
    && strlen($ww_qrbs_current_config['event_key']) <= 100
    ? $ww_qrbs_current_config['event_key']
    : '';
$ww_qrbs_current_rules_version = isset($ww_qrbs_current_config['rules_version'])
    && is_string($ww_qrbs_current_config['rules_version'])
    && preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/D', $ww_qrbs_current_config['rules_version'])
    ? $ww_qrbs_current_config['rules_version']
    : '';
$ww_qrbs_reconciliation_enabled = $ww_qrbs_form_enabled
    && $ww_qrbs_event_key !== ''
    && $ww_qrbs_current_rules_version !== '';
$ww_qrbs_reconciliation_guidance = isset($ww_qrbs_alternate_operations['guidance'])
    && is_string($ww_qrbs_alternate_operations['guidance'])
    && ww_qrbs_is_plain_text($ww_qrbs_alternate_operations['guidance'], 1, 500, false)
    ? $ww_qrbs_alternate_operations['guidance']
    : 'Review pending Form 354 inquiries in the Brilliant Directories forms inbox, then separately capture the submitted event revision and exact vendor offer version and reconcile them against the current event and immutable vendor user ID.';
$ww_qrbs_closure = isset($ww_qrbs_alternate_operations['reconciliation'])
    && is_array($ww_qrbs_alternate_operations['reconciliation'])
    ? $ww_qrbs_alternate_operations['reconciliation']
    : array();
$ww_qrbs_closure_stale_reason = isset($ww_qrbs_closure['stale_reason'])
    && is_string($ww_qrbs_closure['stale_reason'])
    && preg_match('/^[a-z0-9_]{1,80}$/D', $ww_qrbs_closure['stale_reason'])
    ? $ww_qrbs_closure['stale_reason']
    : '';
$ww_qrbs_closure_draw_allowed = isset($ww_qrbs_closure['draw_selection_allowed'])
    && ww_qrbs_truthy($ww_qrbs_closure['draw_selection_allowed']);
$ww_qrbs_closure_declared_at = isset($ww_qrbs_closure['declared_at'])
    && is_string($ww_qrbs_closure['declared_at'])
    && ww_qrbs_is_plain_text($ww_qrbs_closure['declared_at'], 1, 80, false)
    ? $ww_qrbs_closure['declared_at']
    : '';
$ww_qrbs_closure_declared_by = isset($ww_qrbs_closure['declared_by'])
    && is_string($ww_qrbs_closure['declared_by'])
    && ww_qrbs_is_plain_text($ww_qrbs_closure['declared_by'], 1, 200, false)
    ? $ww_qrbs_closure['declared_by']
    : '';
$ww_qrbs_closure_latest_reconciled_at = isset($ww_qrbs_closure['latest_reconciled_at'])
    && is_string($ww_qrbs_closure['latest_reconciled_at'])
    && ww_qrbs_is_plain_text($ww_qrbs_closure['latest_reconciled_at'], 1, 80, false)
    ? $ww_qrbs_closure['latest_reconciled_at']
    : '';
$ww_qrbs_closure_enabled = $ww_qrbs_reconciliation_enabled
    && !$ww_qrbs_closure_draw_allowed
    && $ww_qrbs_closure_stale_reason !== 'entry_period_open';
$ww_qrbs_closure_status_label = $ww_qrbs_closure_draw_allowed
    ? 'Complete for the current revision'
    : ($ww_qrbs_closure_stale_reason === 'entry_period_open'
        ? 'Available only after entries close'
        : ($ww_qrbs_closure_stale_reason === 'reconciliation_recorded_after_declaration'
            ? 'Review again — a later entry was reconciled'
            : 'Required before potential-winner selection'));

$ww_qrbs_defaults = array(
    'event_name' => '',
    'venue_name' => '',
    'vendor_tag_id' => '',
    'history_starts_at' => '',
    'app_card_enabled' => false,
    'scan_enabled' => false,
    'scan_open_early' => false,
    'vendor_draws_enabled' => false,
    'email_delivery_mode' => 'disabled',
    'send_vendor_email' => false,
    'send_couple_email' => false,
    'vendor_email_subject' => 'WeddingWin QR Bingo Vendor: Winner Contact Information',
    'couple_email_subject' => 'Your name was selected for a QR Bingo booth draw',
    'rules_version' => '',
    'official_rules_url' => '',
    'alternate_free_entry_url' => '',
    'eligibility_region' => '',
    'draw_opens_at' => '',
    'entry_closes_at' => '',
    'draw_at' => ''
);
foreach ($ww_qrbs_defaults as $ww_qrbs_key => $ww_qrbs_default_value) {
    if (!array_key_exists($ww_qrbs_key, $ww_qrbs_form_config) || is_array($ww_qrbs_form_config[$ww_qrbs_key])) {
        $ww_qrbs_form_config[$ww_qrbs_key] = $ww_qrbs_default_value;
    }
}

$ww_qrbs_email_mode = (string)$ww_qrbs_form_config['email_delivery_mode'];
if ($ww_qrbs_email_mode !== 'production_verified_fulfillment') { $ww_qrbs_email_mode = 'disabled'; }

$ww_qrbs_current_scan_enabled = isset($ww_qrbs_current_config['scan_enabled'])
    ? $ww_qrbs_current_config['scan_enabled']
    : false;
$ww_qrbs_current_draws_enabled = isset($ww_qrbs_current_config['vendor_draws_enabled'])
    ? $ww_qrbs_current_config['vendor_draws_enabled']
    : false;
$ww_qrbs_current_vendor_tag_id = isset($ww_qrbs_current_config['vendor_tag_id'])
    ? $ww_qrbs_current_config['vendor_tag_id']
    : null;
// A successful signed admin_get returns the one canonical published revision.
// Older public DTOs omitted the redundant published flag, so derive true from
// that authenticated response while still honoring an explicit false value.
$ww_qrbs_current_published = $ww_qrbs_get_ok && $ww_qrbs_revision_valid;
if (array_key_exists('published', $ww_qrbs_current_config)) {
    $ww_qrbs_current_published = $ww_qrbs_current_published
        && ww_qrbs_truthy($ww_qrbs_current_config['published']);
}
$ww_qrbs_any_delivery_active = (
    ww_qrbs_truthy($ww_qrbs_current_scan_enabled)
    || ww_qrbs_truthy($ww_qrbs_current_draws_enabled)
    || $ww_qrbs_email_mode === 'production_verified_fulfillment'
);
$ww_qrbs_status_label = !$ww_qrbs_current_published
    ? 'Not ready yet'
    : ($ww_qrbs_any_delivery_active ? 'Using these saved settings' : 'Saved, but all features are off');

$ww_qrbs_stat_names = array(
    'vendors_configured',
    'vendors_enabled',
    'vendors_terms_accepted',
    'entries',
    'alternate_entries_reconciled',
    'verified_notices_pending'
);
$ww_qrbs_safe_stats = array();
foreach ($ww_qrbs_stat_names as $ww_qrbs_stat_name) {
    $ww_qrbs_stat_value = isset($ww_qrbs_stats[$ww_qrbs_stat_name])
        && is_numeric($ww_qrbs_stats[$ww_qrbs_stat_name])
        && (int)$ww_qrbs_stats[$ww_qrbs_stat_name] >= 0
        ? (int)$ww_qrbs_stats[$ww_qrbs_stat_name]
        : null;
    $ww_qrbs_safe_stats[$ww_qrbs_stat_name] = $ww_qrbs_stat_value;
}
$ww_qrbs_local_vendor_count = ww_qrbs_local_tagged_vendor_count(
    $ww_qrbs_database,
    $ww_qrbs_current_vendor_tag_id
);
$ww_qrbs_vendor_tag_options = ww_qrbs_local_vendor_tag_options($ww_qrbs_database);
$ww_qrbs_selected_vendor_tag_id = is_numeric($ww_qrbs_form_config['vendor_tag_id'])
    ? (int)$ww_qrbs_form_config['vendor_tag_id']
    : 0;
$ww_qrbs_selected_tag_is_listed = false;
foreach ($ww_qrbs_vendor_tag_options as $ww_qrbs_vendor_tag_option) {
    if ($ww_qrbs_vendor_tag_option['id'] === $ww_qrbs_selected_vendor_tag_id) {
        $ww_qrbs_selected_tag_is_listed = true;
        break;
    }
}
if ($ww_qrbs_selected_vendor_tag_id > 0 && !$ww_qrbs_selected_tag_is_listed) {
    $ww_qrbs_vendor_tag_options[] = array(
        'id' => $ww_qrbs_selected_vendor_tag_id,
        'name' => 'Current saved tag',
        'vendor_count' => 0
    );
}
$ww_qrbs_reconciliation_vendor_options = ww_qrbs_local_tagged_vendor_options(
    $ww_qrbs_database,
    $ww_qrbs_current_vendor_tag_id
);
$ww_qrbs_vendor_ready = $ww_qrbs_local_vendor_count !== null
    && $ww_qrbs_local_vendor_count > 0
    && $ww_qrbs_safe_stats['vendors_configured'] !== null
    && $ww_qrbs_safe_stats['vendors_configured'] === $ww_qrbs_local_vendor_count;
?>
<style>
  .ww-qrbs{max-width:1080px;margin:24px auto;padding:0 16px;color:#25252b;font-family:Arial,Helvetica,sans-serif}
  .ww-qrbs *{box-sizing:border-box}
  .ww-qrbs h1{margin:0 0 8px;font-size:28px;color:#723843}
  .ww-qrbs h2{margin:0 0 14px;font-size:19px;color:#723843}
  .ww-qrbs p{line-height:1.5}
  .ww-qrbs-lead{margin:0 0 20px;color:#5f6068}
  .ww-qrbs-guide{margin:0 0 20px;padding:18px 20px;background:#fff7f7;border:1px solid #e8cbcf;border-radius:10px}
  .ww-qrbs-guide h2{margin-bottom:8px}
  .ww-qrbs-guide ol{margin:8px 0 0;padding-left:22px;line-height:1.7}
  .ww-qrbs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 20px}
  .ww-qrbs-card,.ww-qrbs-section{background:#fff;border:1px solid #e5dada;border-radius:10px;box-shadow:0 1px 3px rgba(31,27,28,.06)}
  .ww-qrbs-card{padding:16px}
  .ww-qrbs-card span{display:block;margin-bottom:6px;color:#74747c;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em}
  .ww-qrbs-card strong{font-size:17px;color:#2e2e34}
  .ww-qrbs-section{padding:20px;margin:0 0 16px}
  .ww-qrbs-step{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-right:8px;border-radius:50%;background:#aa565d;color:#fff;font-size:14px;vertical-align:middle}
  .ww-qrbs-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  .ww-qrbs-field{min-width:0}
  .ww-qrbs-field.ww-qrbs-wide{grid-column:1/-1}
  .ww-qrbs-form-token{display:none!important}
  .ww-qrbs label{display:block;margin:0 0 6px;font-weight:bold;color:#34343a}
  .ww-qrbs input[type=text],.ww-qrbs input[type=url],.ww-qrbs input[type=number],.ww-qrbs input[type=email],.ww-qrbs input[type=tel],.ww-qrbs input[type=date],.ww-qrbs input[type=datetime-local],.ww-qrbs select,.ww-qrbs textarea{display:block;width:100%;padding:10px 11px;border:1px solid #cfc6c8;border-radius:6px;background:#fff;color:#202026;font-size:14px}
  .ww-qrbs input:focus,.ww-qrbs select:focus{outline:3px solid rgba(198,106,106,.2);border-color:#b75f66}
  .ww-qrbs-check{display:flex;align-items:flex-start;gap:9px;padding:10px 0}
  .ww-qrbs-check input{margin-top:3px}
  .ww-qrbs-check label{margin:0;font-weight:normal}
  .ww-qrbs-help{margin:5px 0 0;color:#686870;font-size:12px}
  .ww-qrbs-alert{padding:13px 15px;margin:0 0 18px;border-radius:7px;border:1px solid}
  .ww-qrbs-alert-success{background:#eff9f2;border-color:#abd8b8;color:#225c32}
  .ww-qrbs-alert-error{background:#fff2f1;border-color:#e5b0ab;color:#7e2e2a}
  .ww-qrbs-field-error{margin:5px 0 0;color:#a22e2e;font-size:12px;font-weight:bold}
  .ww-qrbs-warning{padding:12px 14px;background:#fff9ea;border:1px solid #ebd89c;border-radius:7px;color:#67531d}
  .ww-qrbs-advanced{padding:0;overflow:hidden}
  .ww-qrbs-advanced>summary{padding:18px 20px;cursor:pointer;font-size:17px;font-weight:bold;color:#723843;list-style-position:inside}
  .ww-qrbs-advanced[open]>summary{border-bottom:1px solid #eee2e3;background:#fffafa}
  .ww-qrbs-advanced-body{padding:20px}
  .ww-qrbs-advanced-body>.ww-qrbs-section{border:0;box-shadow:none;padding:0;margin:0}
  .ww-qrbs-advanced-body form>.ww-qrbs-section{border:0;box-shadow:none;padding:0;margin:0}
  .ww-qrbs-actions{display:flex;align-items:center;gap:14px;margin:18px 0 0}
  .ww-qrbs-button{appearance:none;border:0;border-radius:7px;padding:11px 18px;background:#aa565d;color:#fff;font-weight:bold;cursor:pointer}
  .ww-qrbs-button:hover{background:#91474e}
  .ww-qrbs-button:disabled{background:#aaa3a5;cursor:not-allowed}
  .ww-qrbs-status-ready{color:#25713a!important}.ww-qrbs-status-not-ready{color:#9b3a34!important}
  @media(max-width:760px){.ww-qrbs-grid,.ww-qrbs-fields{grid-template-columns:1fr}.ww-qrbs-field.ww-qrbs-wide{grid-column:auto}}
</style>

<div class="ww-qrbs">
  <h1>QR Bingo Settings</h1>
  <p class="ww-qrbs-lead">Choose the event, vendor group, dates, and email options used by both the Wedding Win app and website.</p>

  <details class="ww-qrbs-data" id="wwQrData">
    <summary>QR Bingo data &amp; downloads</summary>
    <p class="ww-qrbs-data-note">View saved QR contact details, booth scans, opted-in draw entries, and winners. Downloads use the selected filters and are recorded in the admin audit. Nothing here sends an email or enters a draw.</p>
    <div class="ww-qrbs-data-tabs" role="tablist" aria-label="QR Bingo data lists">
      <button type="button" role="tab" data-dataset="contacts" aria-selected="true">Contacts</button>
      <button type="button" role="tab" data-dataset="scans" aria-selected="false">Scans</button>
      <button type="button" role="tab" data-dataset="entries" aria-selected="false">Draw entries</button>
      <button type="button" role="tab" data-dataset="winners" aria-selected="false">Winners</button>
    </div>
    <form id="wwQrDataForm" action="<?php echo ww_qrbs_escape($ww_qrbs_action_url); ?>" method="post" autocomplete="off">
      <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_csrf_token" readonly tabindex="-1" aria-hidden="true" value="<?php echo ww_qrbs_escape($ww_qrbs_csrf); ?>">
      <div class="ww-qrbs-data-fields">
        <div><label for="wwQrDataEvent">Event</label><input id="wwQrDataEvent" name="event_key" required maxlength="100" value="<?php echo ww_qrbs_escape($ww_qrbs_event_key); ?>"></div>
        <div><label for="wwQrDataVendor">Vendor (all if blank)</label><input id="wwQrDataVendor" name="vendor_id" list="wwQrDataVendors" inputmode="numeric" maxlength="19" placeholder="Vendor ID"><datalist id="wwQrDataVendors"><?php foreach ($ww_qrbs_reconciliation_vendor_options as $option): ?><option value="<?php echo ww_qrbs_escape($option['id']); ?>"><?php echo ww_qrbs_escape($option['label']); ?></option><?php endforeach; ?></datalist></div>
        <div><label for="wwQrDataSearch">Search</label><input id="wwQrDataSearch" name="search" maxlength="120" placeholder="Name, email, or member ID"></div>
        <div><label for="wwQrDataOperator">Your admin name (for changes &amp; downloads)</label><input id="wwQrDataOperator" name="operator_identity" maxlength="160" autocomplete="name" placeholder="Name or work email"></div>
        <div id="wwQrDataContactStatusGroup"><label for="wwQrDataContactStatus">Contact list</label><select id="wwQrDataContactStatus" name="contact_status"><option value="active">Active contacts</option><option value="removed">Removed contacts</option><option value="all">All contacts</option></select></div>
      </div>
      <div class="ww-qrbs-data-actions"><button class="ww-qrbs-button" type="submit">Show list</button><button class="ww-qrbs-button" id="wwQrDataExport" type="button">Download CSV</button><button class="ww-qrbs-button ww-qrbs-data-secondary" id="wwQrContactAddOpen" type="button" aria-expanded="false" aria-controls="wwQrContactPanel">Add contact</button></div>
    </form>
    <section class="ww-qrbs-contact-panel" id="wwQrContactPanel" aria-labelledby="wwQrContactHeading" hidden>
      <h3 id="wwQrContactHeading">Add a Bingo contact</h3>
      <p class="ww-qrbs-data-note" id="wwQrContactEvent"></p>
      <p class="ww-qrbs-data-note">Choose an existing couple account. This adds contact details for this event only. It does not create an account, record a scan, enter a draw, or accept an agreement.</p>
      <form id="wwQrContactLookupForm" autocomplete="off">
        <label for="wwQrContactLookup">Find a couple</label>
        <div class="ww-qrbs-contact-search"><input id="wwQrContactLookup" minlength="2" maxlength="120" required placeholder="Name, email, or member ID"><button class="ww-qrbs-button" type="submit">Search couples</button></div>
      </form>
      <div class="ww-qrbs-contact-matches" id="wwQrContactMatches" aria-label="Matching couple accounts"></div>
      <form id="wwQrContactAddForm" autocomplete="off" hidden>
        <p class="ww-qrbs-contact-chosen" id="wwQrContactChosen"></p>
        <div class="ww-qrbs-data-fields">
          <div><label for="wwQrContactName">Couple's names</label><input id="wwQrContactName" required maxlength="160" placeholder="Alex &amp; Jamie"></div>
          <div><label for="wwQrContactEmail">Contact email</label><input id="wwQrContactEmail" type="email" required maxlength="254" autocomplete="off"></div>
          <div><label for="wwQrContactPhone">Phone number</label><input id="wwQrContactPhone" type="tel" required maxlength="40" autocomplete="off"></div>
          <div><label for="wwQrContactDate">Wedding date</label><input id="wwQrContactDate" type="date"><small class="ww-qrbs-data-note">Leave blank if it is not known.</small></div>
          <div id="wwQrContactVenueGroup" hidden><label for="wwQrContactVenue">Wedding venue</label><input id="wwQrContactVenue" maxlength="200"></div>
        </div>
        <div class="ww-qrbs-data-actions"><button class="ww-qrbs-button" type="submit">Add contact</button></div>
      </form>
      <p class="ww-qrbs-data-status" id="wwQrContactStatus" role="status" aria-live="polite"></p>
      <button class="ww-qrbs-button ww-qrbs-data-secondary" id="wwQrContactCancel" type="button">Cancel</button>
    </section>
    <section class="ww-qrbs-contact-panel" id="wwQrContactConfirm" aria-labelledby="wwQrContactConfirmHeading" hidden>
      <h3 id="wwQrContactConfirmHeading">Confirm contact change</h3>
      <p id="wwQrContactConfirmMessage"></p>
      <p class="ww-qrbs-data-note">Only this event's Bingo contact list changes. Accounts, scans, draw entries, consent records, and winner history stay unchanged. Removed contacts can be restored from the Removed contacts list.</p>
      <div class="ww-qrbs-data-actions"><button class="ww-qrbs-button" id="wwQrContactConfirmAction" type="button">Remove contact</button><button class="ww-qrbs-button ww-qrbs-data-secondary" id="wwQrContactConfirmCancel" type="button">Cancel</button></div>
    </section>
    <p class="ww-qrbs-data-note" id="wwQrDataScanNote" hidden>Scans show the latest recorded visit per couple/vendor in the current published event window. Older visits may have been replaced by a later scan. Scan rows use account names; saved QR contact details are in Contacts.</p>
    <p class="ww-qrbs-data-status" id="wwQrDataStatus" role="status" aria-live="polite">Choose a list and select Show list.</p>
    <div class="ww-qrbs-data-table"><table aria-label="Selected QR Bingo records"><thead id="wwQrDataHead"></thead><tbody id="wwQrDataRows"></tbody></table></div>
    <div class="ww-qrbs-data-actions"><button class="ww-qrbs-button" id="wwQrDataPrevious" type="button" disabled>Previous</button><button class="ww-qrbs-button" id="wwQrDataNext" type="button" disabled>Next</button></div>
  </details>

  <div class="ww-qrbs-guide">
    <h2>How to use this page</h2>
    <ol>
      <li>Choose the event and the group of vendors taking part.</li>
      <li>Turn QR scanning and optional vendor prize draws on or off.</li>
      <li>Choose the event deadlines in Toronto time.</li>
      <li>Review the email option, then save. The app and website update together.</li>
    </ol>
  </div>

  <?php if (isset($ww_qrbs_flash['message']) && is_string($ww_qrbs_flash['message']) && $ww_qrbs_flash['message'] !== ''): ?>
    <div class="ww-qrbs-alert <?php echo $ww_qrbs_flash['type'] === 'success' ? 'ww-qrbs-alert-success' : 'ww-qrbs-alert-error'; ?>" role="status">
      <?php echo ww_qrbs_escape($ww_qrbs_flash['message']); ?>
    </div>
  <?php endif; ?>

  <?php if (!$ww_qrbs_get_ok): ?>
    <div class="ww-qrbs-alert ww-qrbs-alert-error" role="alert">Current settings could not be verified. Publishing is disabled, and no secret or internal error detail is shown.</div>
  <?php endif; ?>

  <div class="ww-qrbs-grid" aria-label="Current QR Bingo status">
    <div class="ww-qrbs-card">
      <span>Saved version</span>
      <strong><?php echo $ww_qrbs_revision_valid ? ww_qrbs_escape($ww_qrbs_revision) : 'Unavailable'; ?></strong>
    </div>
    <div class="ww-qrbs-card">
      <span>App and website</span>
      <strong><?php echo ww_qrbs_escape($ww_qrbs_status_label); ?></strong>
    </div>
    <div class="ww-qrbs-card">
      <span>Vendors in QR Bingo</span>
      <strong><?php echo $ww_qrbs_local_vendor_count === null ? 'Unavailable' : ww_qrbs_escape($ww_qrbs_local_vendor_count); ?></strong>
      <p class="ww-qrbs-help">Live vendor profiles in the selected group.</p>
    </div>
    <div class="ww-qrbs-card">
      <span>Vendor draw setup</span>
      <strong class="<?php echo $ww_qrbs_vendor_ready ? 'ww-qrbs-status-ready' : 'ww-qrbs-status-not-ready'; ?>">
        <?php echo $ww_qrbs_vendor_ready ? 'Ready' : 'Some setup is still needed'; ?>
      </strong>
      <p class="ww-qrbs-help">
        <?php echo $ww_qrbs_safe_stats['vendors_configured'] === null ? '—' : ww_qrbs_escape($ww_qrbs_safe_stats['vendors_configured']); ?> vendor<?php echo $ww_qrbs_safe_stats['vendors_configured'] === 1 ? '' : 's'; ?> added a prize ·
        <?php echo $ww_qrbs_safe_stats['vendors_enabled'] === null ? '—' : ww_qrbs_escape($ww_qrbs_safe_stats['vendors_enabled']); ?> accepting entries ·
        <?php echo $ww_qrbs_safe_stats['vendors_terms_accepted'] === null ? '—' : ww_qrbs_escape($ww_qrbs_safe_stats['vendors_terms_accepted']); ?> accepted the terms
      </p>
    </div>
    <div class="ww-qrbs-card">
      <span>Prize-draw activity</span>
      <strong><?php echo $ww_qrbs_safe_stats['entries'] === null ? '—' : ww_qrbs_escape($ww_qrbs_safe_stats['entries']); ?> couple entr<?php echo $ww_qrbs_safe_stats['entries'] === 1 ? 'y' : 'ies'; ?></strong>
      <p class="ww-qrbs-help">
        <?php echo $ww_qrbs_safe_stats['alternate_entries_reconciled'] === null ? '—' : ww_qrbs_escape($ww_qrbs_safe_stats['alternate_entries_reconciled']); ?> historical entry record<?php echo $ww_qrbs_safe_stats['alternate_entries_reconciled'] === 1 ? '' : 's'; ?> retained (not current entries) ·
        <?php echo $ww_qrbs_safe_stats['verified_notices_pending'] === null ? '—' : ww_qrbs_escape($ww_qrbs_safe_stats['verified_notices_pending']); ?> winner emails waiting
      </p>
    </div>
  </div>

  <?php if (isset($ww_qrbs_errors['_request'])): ?>
    <div class="ww-qrbs-alert ww-qrbs-alert-error" role="alert"><?php echo ww_qrbs_escape($ww_qrbs_errors['_request']); ?></div>
  <?php endif; ?>

  <form method="post" action="<?php echo ww_qrbs_escape($ww_qrbs_action_url); ?>" accept-charset="UTF-8" autocomplete="off">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_csrf_token" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_csrf); ?>">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_form_action" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="publish">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_expected_revision" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_revision); ?>">

    <section class="ww-qrbs-section" aria-labelledby="ww-qrbs-event-heading">
      <h2 id="ww-qrbs-event-heading"><span class="ww-qrbs-step">1</span>Choose the event and vendors</h2>
      <div class="ww-qrbs-fields">
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-event-name">Event name</label>
          <input id="ww-qrbs-event-name" name="event_name" type="text" maxlength="120" required value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['event_name']); ?>">
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'event_name'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-venue-name">Venue</label>
          <input id="ww-qrbs-venue-name" name="venue_name" type="text" maxlength="160" required value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['venue_name']); ?>">
          <p class="ww-qrbs-help">This venue appears with the wedding show details in the app.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'venue_name'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-vendor-tag">Vendor group for QR Bingo</label>
          <select id="ww-qrbs-vendor-tag" name="vendor_tag_id" required>
            <option value="">Choose a vendor group</option>
            <?php foreach ($ww_qrbs_vendor_tag_options as $ww_qrbs_vendor_tag_option): ?>
              <?php if ((string)$ww_qrbs_vendor_tag_option['id'] === (string)$ww_qrbs_current_vendor_tag_id): ?>
                <option value="<?php echo ww_qrbs_escape($ww_qrbs_vendor_tag_option['id']); ?>"<?php echo $ww_qrbs_vendor_tag_option['id'] === $ww_qrbs_selected_vendor_tag_id ? ' selected' : ''; ?>>Current: <?php echo ww_qrbs_escape($ww_qrbs_vendor_tag_option['name']); ?> — <?php echo ww_qrbs_escape($ww_qrbs_vendor_tag_option['vendor_count']); ?> live vendor<?php echo $ww_qrbs_vendor_tag_option['vendor_count'] === 1 ? '' : 's'; ?></option>
              <?php endif; ?>
            <?php endforeach; ?>
            <optgroup label="Other Brilliant Directories vendor groups">
            <?php foreach ($ww_qrbs_vendor_tag_options as $ww_qrbs_vendor_tag_option): ?>
              <?php if ((string)$ww_qrbs_vendor_tag_option['id'] !== (string)$ww_qrbs_current_vendor_tag_id): ?>
                <option value="<?php echo ww_qrbs_escape($ww_qrbs_vendor_tag_option['id']); ?>"<?php echo $ww_qrbs_vendor_tag_option['id'] === $ww_qrbs_selected_vendor_tag_id ? ' selected' : ''; ?>><?php echo ww_qrbs_escape($ww_qrbs_vendor_tag_option['name']); ?> — <?php echo ww_qrbs_escape($ww_qrbs_vendor_tag_option['vendor_count']); ?> live vendor<?php echo $ww_qrbs_vendor_tag_option['vendor_count'] === 1 ? '' : 's'; ?></option>
              <?php endif; ?>
            <?php endforeach; ?>
            </optgroup>
          </select>
          <p class="ww-qrbs-help">The list shows the vendor groups already set up in Brilliant Directories. Changing the group requires a new Rules version in Advanced settings.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'vendor_tag_id'); ?>
        </div>
      </div>
    </section>

    <section class="ww-qrbs-section" aria-labelledby="ww-qrbs-controls-heading">
      <h2 id="ww-qrbs-controls-heading"><span class="ww-qrbs-step">2</span>Choose what couples can do</h2>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-app-card-enabled" name="app_card_enabled" type="checkbox" value="1"<?php echo ww_qrbs_truthy($ww_qrbs_form_config['app_card_enabled']) ? ' checked' : ''; ?>>
        <label for="ww-qrbs-app-card-enabled"><strong>Make the QR Bingo card available on the app home screen</strong><br><span class="ww-qrbs-help">When this is off, the card is grey and says “Available at Wedding Shows”.</span></label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'app_card_enabled'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-scan-enabled" name="scan_enabled" type="checkbox" value="1"<?php echo ww_qrbs_truthy($ww_qrbs_form_config['scan_enabled']) ? ' checked' : ''; ?>>
        <label for="ww-qrbs-scan-enabled"><strong>Let couples scan booth QR codes</strong><br><span class="ww-qrbs-help">Turn this off only if you need to pause scanning. Saved booth visits are not deleted.</span></label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'scan_enabled'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-scan-open-early" name="scan_open_early" type="checkbox" value="1"<?php echo ww_qrbs_truthy($ww_qrbs_form_config['scan_open_early']) ? ' checked' : ''; ?>>
        <label for="ww-qrbs-scan-open-early"><strong>Open scanner early</strong><br><span class="ww-qrbs-help">Allow Bingo scanning before the show day. Otherwise, it opens automatically at midnight on the wedding show date, Toronto time. Pausing scanning still overrides this. Vendor draws still open during show hours and need a fresh booth scan.</span></label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'scan_open_early'); ?>
      <?php $ww_qrbs_auto_scan_date = substr(ww_qrbs_toronto_datetime_input_value($ww_qrbs_form_config['history_starts_at']), 0, 10); ?>
      <p class="ww-qrbs-help">Automatic scanner opening: <strong><?php echo $ww_qrbs_auto_scan_date !== '' ? ww_qrbs_escape($ww_qrbs_auto_scan_date) . ' at 12:00 a.m. Toronto time' : 'midnight on the wedding show date'; ?></strong>. The wedding show start time and draw deadlines below stay unchanged.</p>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-draws-enabled" name="vendor_draws_enabled" type="checkbox" value="1"<?php echo ww_qrbs_truthy($ww_qrbs_form_config['vendor_draws_enabled']) ? ' checked' : ''; ?>>
        <label for="ww-qrbs-draws-enabled"><strong>Let couples optionally enter vendor prize draws</strong><br><span class="ww-qrbs-help">Each participating vendor still sets up its own prize and accepts the vendor terms.</span></label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'vendor_draws_enabled'); ?>
    </section>

    <section class="ww-qrbs-section" aria-labelledby="ww-qrbs-dates-heading">
      <h2 id="ww-qrbs-dates-heading"><span class="ww-qrbs-step">3</span>Set the schedule</h2>
      <p class="ww-qrbs-help">All times on this page use Toronto time. The system converts them automatically for the app and website.</p>
      <div class="ww-qrbs-fields">
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-history-start">Wedding show starts</label>
          <input id="ww-qrbs-history-start" name="history_starts_at" type="datetime-local" step="1" required value="<?php echo ww_qrbs_escape(ww_qrbs_toronto_datetime_input_value($ww_qrbs_form_config['history_starts_at'])); ?>">
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'history_starts_at'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-entry-close">Wedding show ends (and prize entries close)</label>
          <input id="ww-qrbs-entry-close" name="entry_closes_at" type="datetime-local" step="1" required value="<?php echo ww_qrbs_escape(ww_qrbs_toronto_datetime_input_value($ww_qrbs_form_config['entry_closes_at'])); ?>">
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'entry_closes_at'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-draw-open">Vendors can start choosing a winner</label>
          <input id="ww-qrbs-draw-open" name="draw_opens_at" type="datetime-local" step="1" required value="<?php echo ww_qrbs_escape(ww_qrbs_toronto_datetime_input_value($ww_qrbs_form_config['draw_opens_at'])); ?>">
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'draw_opens_at'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-draw-at">Planned draw time</label>
          <input id="ww-qrbs-draw-at" name="draw_at" type="datetime-local" step="1" required value="<?php echo ww_qrbs_escape(ww_qrbs_toronto_datetime_input_value($ww_qrbs_form_config['draw_at'])); ?>">
          <p class="ww-qrbs-help">This must be at or after the winner-selection start time.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'draw_at'); ?>
        </div>
      </div>
    </section>

    <section class="ww-qrbs-section" aria-labelledby="ww-qrbs-email-heading">
      <h2 id="ww-qrbs-email-heading"><span class="ww-qrbs-step">4</span>Choose the winner-email settings</h2>
      <div class="ww-qrbs-fields">
        <div class="ww-qrbs-field ww-qrbs-wide">
          <label for="ww-qrbs-email-mode">Automatic winner emails</label>
          <select id="ww-qrbs-email-mode" name="email_delivery_mode" required>
            <option value="disabled"<?php echo $ww_qrbs_email_mode === 'disabled' ? ' selected' : ''; ?>>Off — do not send automatically</option>
            <option value="production_verified_fulfillment"<?php echo $ww_qrbs_email_mode === 'production_verified_fulfillment' ? ' selected' : ''; ?>>On — send only after the winner is verified</option>
          </select>
          <p class="ww-qrbs-help">Winner emails are sent only after the vendor completes the winner-verification steps.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'email_delivery_mode'); ?>
        </div>
        <div class="ww-qrbs-field">
          <div class="ww-qrbs-check">
            <input id="ww-qrbs-send-vendor" name="send_vendor_email" type="checkbox" value="1"<?php echo ww_qrbs_truthy($ww_qrbs_form_config['send_vendor_email']) ? ' checked' : ''; ?>>
            <label for="ww-qrbs-send-vendor">Email the vendor</label>
          </div>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'send_vendor_email'); ?>
        </div>
        <div class="ww-qrbs-field">
          <div class="ww-qrbs-check">
            <input id="ww-qrbs-send-couple" name="send_couple_email" type="checkbox" value="1"<?php echo ww_qrbs_truthy($ww_qrbs_form_config['send_couple_email']) ? ' checked' : ''; ?>>
            <label for="ww-qrbs-send-couple">Email the couple</label>
          </div>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'send_couple_email'); ?>
        </div>
      </div>
      <details class="ww-qrbs-advanced"<?php echo isset($ww_qrbs_errors['vendor_notice_title']) || isset($ww_qrbs_errors['couple_notice_title']) ? ' open' : ''; ?>>
        <summary>Advanced: change the email subject lines</summary>
        <div class="ww-qrbs-advanced-body ww-qrbs-fields">
          <div class="ww-qrbs-field ww-qrbs-wide">
            <label for="ww-qrbs-vendor-subject">Vendor email subject</label>
            <input id="ww-qrbs-vendor-subject" name="vendor_notice_title" type="text" maxlength="180" required value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['vendor_email_subject']); ?>">
            <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'vendor_notice_title'); ?>
          </div>
          <div class="ww-qrbs-field ww-qrbs-wide">
            <label for="ww-qrbs-couple-subject">Couple email subject</label>
            <input id="ww-qrbs-couple-subject" name="couple_notice_title" type="text" maxlength="180" required value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['couple_email_subject']); ?>">
            <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'couple_notice_title'); ?>
          </div>
        </div>
      </details>
    </section>

    <details class="ww-qrbs-advanced ww-qrbs-section"<?php echo isset($ww_qrbs_errors['rules_version']) || isset($ww_qrbs_errors['eligibility_region']) || isset($ww_qrbs_errors['official_rules_url']) ? ' open' : ''; ?>>
      <summary>Advanced: legal pages and eligibility</summary>
      <div class="ww-qrbs-advanced-body">
        <p class="ww-qrbs-help">These normally stay the same. Change them only when the official rules or eligible region changes.</p>
        <div class="ww-qrbs-fields">
          <div class="ww-qrbs-field">
            <label for="ww-qrbs-rules-version">Rules version</label>
            <input id="ww-qrbs-rules-version" name="rules_version" type="text" maxlength="80" required value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['rules_version']); ?>">
            <p class="ww-qrbs-help">Use a new value whenever the rules, vendor group, eligibility, or dates materially change.</p>
            <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'rules_version'); ?>
          </div>
          <div class="ww-qrbs-field">
            <label for="ww-qrbs-region">Who is eligible</label>
            <input id="ww-qrbs-region" name="eligibility_region" type="text" maxlength="300" required value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['eligibility_region']); ?>">
            <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'eligibility_region'); ?>
          </div>
          <div class="ww-qrbs-field ww-qrbs-wide">
            <label for="ww-qrbs-rules-url">Official rules page</label>
            <input id="ww-qrbs-rules-url" name="official_rules_url" type="url" maxlength="500" required value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['official_rules_url']); ?>">
            <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'official_rules_url'); ?>
          </div>
          <input class="ww-qrbs-form-token" name="alternate_free_entry_url" type="text" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_form_config['alternate_free_entry_url']); ?>">
        </div>
      </div>
    </details>

    <div class="ww-qrbs-actions">
      <button class="ww-qrbs-button" type="submit"<?php echo $ww_qrbs_form_enabled ? '' : ' disabled'; ?>>Save settings for the app and website</button>
      <span class="ww-qrbs-help">Saving does not change vendor prizes, current entries, winner selections, or accepted terms.</span>
    </div>
  </form>

  <?php if (false): /* Historical Form 354 tools are intentionally retired. */ ?>
  <details class="ww-qrbs-advanced ww-qrbs-section"<?php echo isset($ww_qrbs_errors['_reconciliation']) || isset($ww_qrbs_errors['form_inquiry_id']) ? ' open' : ''; ?>>
    <summary>Advanced: process an alternate free-entry request</summary>
    <div class="ww-qrbs-advanced-body">
  <form method="post" action="<?php echo ww_qrbs_escape($ww_qrbs_action_url); ?>" accept-charset="UTF-8" autocomplete="off">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_csrf_token" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_csrf); ?>">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_form_action" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="reconcile_alternate_free_entry">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_expected_revision" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_revision); ?>">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_event_key" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_event_key); ?>">

    <section class="ww-qrbs-section" aria-labelledby="ww-qrbs-reconcile-heading">
      <h2 id="ww-qrbs-reconcile-heading">Process an alternate free-entry request</h2>
      <div class="ww-qrbs-warning">
        Use this only after reviewing a submitted Form 354 inquiry. A successful review adds one chance to that vendor’s draw. It does not record a booth visit or add QR Bingo progress.
      </div>
      <?php if (isset($ww_qrbs_errors['_reconciliation'])): ?>
        <div class="ww-qrbs-alert ww-qrbs-alert-error" role="alert"><?php echo ww_qrbs_escape($ww_qrbs_errors['_reconciliation']); ?></div>
      <?php endif; ?>
      <p class="ww-qrbs-help">
        Current event: <strong><?php echo $ww_qrbs_event_key === '' ? 'Unavailable' : ww_qrbs_escape($ww_qrbs_event_key); ?></strong>. Saved version: <strong><?php echo $ww_qrbs_revision_valid ? ww_qrbs_escape($ww_qrbs_revision) : 'Unavailable'; ?></strong>. The system verifies every copied value and blocks stale, duplicate, closed, or ineligible entries.
      </p>

      <div class="ww-qrbs-fields">
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-form-inquiry-id">Form 354 inquiry ID</label>
          <input id="ww-qrbs-form-inquiry-id" name="form_inquiry_id" type="text" maxlength="128" required>
          <p class="ww-qrbs-help">Copy the immutable inquiry ID from the BD forms inbox, not a name or email subject.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'form_inquiry_id'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-form-submitted-local">Form 354 submitted at (Toronto time)</label>
          <input id="ww-qrbs-form-submitted-local" name="form_submitted_local" type="datetime-local" step="1" required>
          <p class="ww-qrbs-help">Copy the original inquiry submission time from the BD inbox. This—not today’s reconciliation time—determines whether the entry met the deadline.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'form_submitted_local'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-reconcile-vendor-id">Vendor named on the entry</label>
          <select id="ww-qrbs-reconcile-vendor-id" name="vendor_bingo_id" required>
            <option value="">Choose the vendor from Form 354</option>
            <?php foreach ($ww_qrbs_reconciliation_vendor_options as $ww_qrbs_reconciliation_vendor_option): ?>
              <option value="<?php echo ww_qrbs_escape($ww_qrbs_reconciliation_vendor_option['id']); ?>"><?php echo ww_qrbs_escape($ww_qrbs_reconciliation_vendor_option['label']); ?> — ID <?php echo ww_qrbs_escape($ww_qrbs_reconciliation_vendor_option['id']); ?><?php echo $ww_qrbs_reconciliation_vendor_option['is_public'] ? '' : ' — private test account'; ?></option>
            <?php endforeach; ?>
          </select>
          <p class="ww-qrbs-help">Choose the same vendor shown in the form inquiry. The ID is shown only for matching and audit purposes.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'vendor_bingo_id'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-reconcile-event-revision">Event revision recorded by Form 354</label>
          <input id="ww-qrbs-reconcile-event-revision" name="submitted_event_revision" type="number" min="1" step="1" required>
          <p class="ww-qrbs-help">Copy the submitted event revision from the inquiry. Do not replace it with the current admin revision shown above.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'submitted_event_revision'); ?>
        </div>
        <div class="ww-qrbs-field ww-qrbs-wide">
          <label for="ww-qrbs-reconcile-offer-version">Vendor offer version recorded by Form 354</label>
          <input id="ww-qrbs-reconcile-offer-version" name="vendor_offer_version" type="text" maxlength="40" required placeholder="2026-09-01T12:34:56.123456Z" spellcheck="false" autocomplete="off">
          <p class="ww-qrbs-help">Copy the exact RFC 3339 value from the inquiry. It identifies the prize terms the participant saw and must not be replaced with a later version.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'vendor_offer_version'); ?>
        </div>
        <div class="ww-qrbs-field ww-qrbs-wide">
          <label for="ww-qrbs-reconcile-rules-version">Rules version recorded by Form 354</label>
          <input id="ww-qrbs-reconcile-rules-version" name="submitted_rules_version" type="text" maxlength="80" required placeholder="2026-09-01-vendor-marketing" spellcheck="false" autocomplete="off">
          <p class="ww-qrbs-help">Copy the exact rules version recorded in the inquiry. The service validates it with the immutable event and offer versions that were shown when the participant submitted Form 354; do not replace it with a later published version.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'submitted_rules_version'); ?>
        </div>
        <div class="ww-qrbs-field ww-qrbs-wide">
          <label for="ww-qrbs-reconcile-participant-disclosure">Participant responsibility disclosure recorded by Form 354</label>
          <textarea id="ww-qrbs-reconcile-participant-disclosure" name="participant_responsibility_disclosure" rows="7" maxlength="2000" required spellcheck="false" autocomplete="off"></textarea>
          <p class="ww-qrbs-help">Copy the exact hidden disclosure value from the inquiry. The service compares it with the immutable vendor-offer snapshot; do not rewrite or summarize it.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'participant_responsibility_disclosure'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-reconcile-name">Participant name</label>
          <input id="ww-qrbs-reconcile-name" name="couple_name" type="text" maxlength="160" required>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'couple_name'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-reconcile-email">Participant email</label>
          <input id="ww-qrbs-reconcile-email" name="couple_email" type="email" maxlength="254" required>
          <p class="ww-qrbs-help">The database uses a keyed normalized-email identity to prevent a second chance across website and app entry methods.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'couple_email'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-reconcile-phone">Phone (optional)</label>
          <input id="ww-qrbs-reconcile-phone" name="couple_phone" type="tel" maxlength="80">
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'couple_phone'); ?>
        </div>
        <div class="ww-qrbs-field">
          <label for="ww-qrbs-reconcile-wedding-date">Wedding date (optional)</label>
          <input id="ww-qrbs-reconcile-wedding-date" name="couple_wedding_date" type="date">
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'couple_wedding_date'); ?>
        </div>
        <div class="ww-qrbs-field ww-qrbs-wide">
          <label for="ww-qrbs-reconcile-operator">Administrator performing this reconciliation</label>
          <input id="ww-qrbs-reconcile-operator" name="operator_identity" type="text" maxlength="160" required autocomplete="name">
          <p class="ww-qrbs-help">Enter your administrator name or work email. It is stored in the immutable audit record so this action is attributable to a person, not only a shared server credential.</p>
          <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'operator_identity'); ?>
        </div>
      </div>

      <div class="ww-qrbs-check">
        <input id="ww-qrbs-reconcile-age" name="age_of_majority_confirmed" type="checkbox" value="1" required>
        <label for="ww-qrbs-reconcile-age">I verified that Form 354 confirms the participant has reached the age of majority.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'age_of_majority_confirmed'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-reconcile-residency" name="eligible_residency_confirmed" type="checkbox" value="1" required>
        <label for="ww-qrbs-reconcile-residency">I verified the participant's residency confirmation under the immutable vendor offer and rules version recorded by Form 354.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'eligible_residency_confirmed'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-reconcile-exclusions" name="not_excluded_confirmed" type="checkbox" value="1" required>
        <label for="ww-qrbs-reconcile-exclusions">I verified the participant's exclusion confirmation under the immutable vendor offer and rules version recorded by Form 354.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'not_excluded_confirmed'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-reconcile-rules" name="rules_acknowledged" type="checkbox" value="1" required>
        <label for="ww-qrbs-reconcile-rules">I verified acceptance of the exact Official Rules version recorded by Form 354 for the immutable offer shown at submission.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'rules_acknowledged'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-reconcile-responsibility" name="promotion_responsibility_acknowledged" type="checkbox" value="1" required>
        <label for="ww-qrbs-reconcile-responsibility">I verified the participant accepted the vendor-responsibility disclosure recorded with the immutable offer shown at submission.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'promotion_responsibility_acknowledged'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-reconcile-contact-share" name="contact_share_consent_confirmed" type="checkbox" value="1" required>
        <label for="ww-qrbs-reconcile-contact-share">I verified Form 354 records the participant's explicit agreement to share their name, email, phone number if provided, wedding date if provided, and entry or consent evidence with this named vendor to administer this draw and for that vendor's own wedding-related offers and promotions.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'contact_share_consent_confirmed'); ?>
      <div class="ww-qrbs-check">
        <input id="ww-qrbs-reconcile-apple" name="apple_non_sponsor_acknowledged" type="checkbox" value="1" required>
        <label for="ww-qrbs-reconcile-apple">I verified acknowledgement that Apple is not a sponsor and is not involved in the promotion.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'apple_non_sponsor_acknowledged'); ?>

      <div class="ww-qrbs-actions">
        <button class="ww-qrbs-button" type="submit"<?php echo $ww_qrbs_reconciliation_enabled ? '' : ' disabled'; ?>>Reconcile validated Form 354 inquiry</button>
        <span class="ww-qrbs-help">Contact details are not retained in this page’s session after submission.</span>
      </div>
    </section>
  </form>

    </div>
  </details>

  <details class="ww-qrbs-advanced ww-qrbs-section"<?php echo isset($ww_qrbs_errors['_closure']) || isset($ww_qrbs_errors['all_timely_submissions_reviewed']) ? ' open' : ''; ?>>
    <summary>Advanced: confirm all alternate entries were reviewed</summary>
    <div class="ww-qrbs-advanced-body">
  <form method="post" action="<?php echo ww_qrbs_escape($ww_qrbs_action_url); ?>" accept-charset="UTF-8" autocomplete="off">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_csrf_token" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_csrf); ?>">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_form_action" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="declare_alternate_entry_reconciliation_complete">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_expected_revision" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_revision); ?>">
    <input class="ww-qrbs-form-token" type="text" name="ww_qrbs_event_key" readonly tabindex="-1" aria-hidden="true" autocomplete="off" value="<?php echo ww_qrbs_escape($ww_qrbs_event_key); ?>">

    <section class="ww-qrbs-section" aria-labelledby="ww-qrbs-closure-heading">
      <h2 id="ww-qrbs-closure-heading">Confirm the alternate-entry review is complete</h2>
      <div class="ww-qrbs-warning">
        Potential-winner selection stays blocked until entries close and an administrator attests that every Form 354 submission received by the deadline was reviewed. A later successful reconciliation automatically makes this declaration stale, so review the queue and declare it complete again.
      </div>
      <?php if (isset($ww_qrbs_errors['_closure'])): ?>
        <div class="ww-qrbs-alert ww-qrbs-alert-error" role="alert"><?php echo ww_qrbs_escape($ww_qrbs_errors['_closure']); ?></div>
      <?php endif; ?>
      <p><strong>Status:</strong> <?php echo ww_qrbs_escape($ww_qrbs_closure_status_label); ?></p>
      <p class="ww-qrbs-help">
        Event <strong><?php echo $ww_qrbs_event_key === '' ? 'Unavailable' : ww_qrbs_escape($ww_qrbs_event_key); ?></strong> · revision <strong><?php echo $ww_qrbs_revision_valid ? ww_qrbs_escape($ww_qrbs_revision) : 'Unavailable'; ?></strong> · entries close <strong><?php echo ww_qrbs_escape($ww_qrbs_form_config['entry_closes_at']); ?></strong>
      </p>
      <?php if ($ww_qrbs_closure_declared_at !== ''): ?>
        <p class="ww-qrbs-help">Latest declaration: <?php echo ww_qrbs_escape($ww_qrbs_closure_declared_at); ?><?php echo $ww_qrbs_closure_declared_by !== '' ? ' by ' . ww_qrbs_escape($ww_qrbs_closure_declared_by) : ''; ?>.</p>
      <?php endif; ?>
      <?php if ($ww_qrbs_closure_latest_reconciled_at !== ''): ?>
        <p class="ww-qrbs-help">Latest reconciled alternate entry: <?php echo ww_qrbs_escape($ww_qrbs_closure_latest_reconciled_at); ?>.</p>
      <?php endif; ?>

      <div class="ww-qrbs-field ww-qrbs-wide">
        <label for="ww-qrbs-closure-operator">Administrator making this declaration</label>
        <input id="ww-qrbs-closure-operator" name="operator_identity" type="text" maxlength="160" required autocomplete="name">
        <p class="ww-qrbs-help">Enter your administrator name or work email. It is recorded with the append-only attestation.</p>
        <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'closure_operator_identity'); ?>
      </div>

      <div class="ww-qrbs-check">
        <input id="ww-qrbs-closure-attestation" name="all_timely_submissions_reviewed" type="checkbox" value="1" required>
        <label for="ww-qrbs-closure-attestation">I attest that every Brilliant Directories Form 354 submission received by the entry close for this event revision was reviewed, and each eligible timely request was reconciled or documented as rejected.</label>
      </div>
      <?php echo ww_qrbs_field_error($ww_qrbs_errors, 'all_timely_submissions_reviewed'); ?>

      <div class="ww-qrbs-actions">
        <button class="ww-qrbs-button" type="submit"<?php echo $ww_qrbs_closure_enabled ? '' : ' disabled'; ?>>Declare Form 354 queue complete</button>
        <span class="ww-qrbs-help">This never selects a winner, creates an entry, records a scan, or changes Bingo progress.</span>
      </div>
    </section>
  </form>
    </div>
  </details>
  <?php endif; ?>
</div>
