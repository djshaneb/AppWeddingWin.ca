<?php
if (!function_exists('ww_qbdes_json')) {
    function ww_qbdes_json($ok, $message, $extra = array()) {
        while (function_exists('ob_get_level') && ob_get_level() > 0) { @ob_end_clean(); }
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(array_merge(array('ok' => $ok ? true : false, 'message' => $message), $extra));
        exit();
    }
    function ww_qbdes_clean($value, $max = 4000) {
        $text = trim((string)$value);
        $text = str_replace(chr(0), '', $text);
        return substr($text, 0, $max);
    }
    function ww_qbdes_clean_header($value, $max = 180) {
        $text = ww_qbdes_clean($value, $max);
        return trim(str_replace(array(chr(10), chr(13)), ' ', $text));
    }
    function ww_qbdes_e($value) { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
    function ww_qbdes_flag($data, $key, $default = true) {
        if (!is_array($data) || !array_key_exists($key, $data)) { return $default ? true : false; }
        if (is_bool($data[$key])) { return $data[$key]; }
        $value = strtolower(trim((string)$data[$key]));
        return !in_array($value, array('', '0', 'false', 'no', 'off'), true);
    }
    function ww_qbdes_label($value, $fallback, $max = 160) {
        $text = ww_qbdes_clean_header(strip_tags((string)$value), $max);
        return $text ? $text : $fallback;
    }
    function ww_qbdes_public_key() {
        return implode(chr(10), array(
            '-----BEGIN PUBLIC KEY-----',
            'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0CsBYAytlPXaADHfwiEd',
            'IhDuJ4y6bZ02q3cxjBiGUA3NeaEHhCGjgFPhbtipUXxguee++ZoYeh8R2PmqCyeS',
            'pUAlKHblcHwXamZzJ7WoFFiyUK+0zaaLYcd+B/VEwtFxiVhFAwwsC6khV8uabU3F',
            '3fcAzlm1YUJULHLEi1fq5ZLp66ZUHStz3r0lk5Y7AqihnbYqNCc6DC3Sx8pYLxrw',
            'VptByqZl3Uf9KBm+XxG79RwXHkn01o909yM8Evt4nq/KXCIvUan2rcgaUjtNV5v5',
            'THwFwOMud8Km3LNPAvMh/XouCjx5Mg89caPs7agHq3joOCChRVX3QEsg5vbRQWmp',
            'FQIDAQAB',
            '-----END PUBLIC KEY-----'
        ));
    }
    function ww_qbdes_valid_signature($payload, $expires, $signature) {
        $expiresInt = intval($expires);
        if (!$expiresInt || $expiresInt < time() || $expiresInt > (time() + 600)) { return false; }
        if (!function_exists('openssl_verify')) { return false; }
        $decodedSignature = base64_decode((string)$signature, true);
        if ($decodedSignature === false) { return false; }
        $verified = openssl_verify(
            (string)$payload . '|' . $expiresInt,
            $decodedSignature,
            ww_qbdes_public_key(),
            OPENSSL_ALGO_SHA256
        );
        return $verified === 1;
    }
    function ww_qbdes_line_after($text, $prefix) {
        $lines = explode(chr(10), str_replace(chr(13), chr(10), (string)$text));
        foreach ($lines as $line) {
            $line = trim($line);
            if (stripos($line, $prefix) === 0) { return trim(substr($line, strlen($prefix))); }
        }
        return '';
    }
    function ww_qbdes_section_after($text, $heading) {
        $lines = explode(chr(10), str_replace(chr(13), chr(10), (string)$text));
        $collect = false;
        $out = array();
        foreach ($lines as $line) {
            $trim = trim($line);
            if (!$collect && strcasecmp($trim, $heading) === 0) { $collect = true; continue; }
            if ($collect) {
                if ($trim === '') { break; }
                $out[] = $trim;
            }
        }
        return trim(implode(' ', $out));
    }
    function ww_qbdes_prize_text($value, $max = 1000) {
        $text = trim(str_replace(array(chr(13) . chr(10), chr(13)), chr(10), (string)$value));
        // Older PHP rejects literal NUL inside a regex pattern. Remove these
        // bytes directly, retaining tabs and normalized line breaks.
        $controls = array_merge(range(0, 8), array(11, 12), range(14, 31), array(127));
        $text = str_replace(array_map('chr', $controls), '', $text);
        // Count UTF-8 characters, not bytes, and keep intentional line breaks.
        return preg_match('/^.{0,' . intval($max) . '}/us', $text, $match) ? $match[0] : '';
    }
    function ww_qbdes_prize_value($value) {
        $value = ww_qbdes_clean_header($value, 80);
        if (!preg_match('/^[$]([0-9]+(?:,[0-9]{3})*(?:[.][0-9]{1,2})?) CAD$/D', $value, $match)) { return ''; }
        return (float)str_replace(',', '', $match[1]) > 0 ? $value : '';
    }
    function ww_qbdes_prize_details($vendorText, $coupleText, $data = array()) {
        // New signed payloads carry the claim-time prize separately from prose.
        // Fail closed if either explicit field is invalid; never parse an old
        // or contradictory body in place of a provided authoritative snapshot.
        if (array_key_exists('prize_description', $data) || array_key_exists('prize_approx_value_cad', $data)) {
            if (!isset($data['prize_description'], $data['prize_approx_value_cad'])
                || !is_string($data['prize_description'])
                || !(is_string($data['prize_approx_value_cad']) || is_int($data['prize_approx_value_cad']) || is_float($data['prize_approx_value_cad']))) { return false; }
            $description = trim(str_replace(array(chr(13) . chr(10), chr(13)), chr(10), $data['prize_description']));
            $amount = trim((string)$data['prize_approx_value_cad']);
            if ($description === '' || ww_qbdes_prize_text($description) !== $description
                || !preg_match('/^[0-9]+(?:[.][0-9]{1,2})?$/D', $amount)
                || !is_finite((float)$amount) || (float)$amount <= 0) { return false; }
            return array('description' => $description, 'value' => '$' . number_format((float)$amount, 2, '.', '') . ' CAD');
        }
        $nl = chr(10);
        $couple = str_replace(array(chr(13) . $nl, chr(13)), $nl, (string)$coupleText);
        $vendor = str_replace(array(chr(13) . $nl, chr(13)), $nl, (string)$vendorText);
        $prize = ''; $value = '';
        if (preg_match('/(?:^|' . $nl . ')(?:Draw item|Prize):[[:blank:]]*/i', $couple, $start, PREG_OFFSET_CAPTURE)) {
            $prize = substr($couple, $start[0][1] + strlen($start[0][0]));
            if (preg_match('/' . $nl . '[[:blank:]]*' . $nl . '(?:What happens next|Next steps|Why you received this|WeddingWin[.]ca)(?:' . $nl . '|$)/i', $prize, $end, PREG_OFFSET_CAPTURE)) {
                $prize = substr($prize, 0, $end[0][1]);
            } else {
                $prize = preg_split('/' . $nl . '[[:blank:]]*' . $nl . '/', $prize, 2)[0];
            }
        }
        if (!$prize && preg_match('/(?:^|' . $nl . ')(Draw item|Draw record)' . $nl . '(.*?)(?=' . $nl . '[[:blank:]]*' . $nl . '(?:Couple notification|Next step|Contact information|Winner details)(?:' . $nl . '|$)|$)/is', $vendor, $section)) {
            $prize = trim($section[2]);
            if (strcasecmp($section[1], 'Draw record') === 0) {
                $prize = preg_replace('/^Prize details are included below for your reference[.]' . $nl . '/', '', $prize);
                // The current Draw record contains a title followed by its full description.
                $parts = explode($nl, $prize, 2);
                if (count($parts) === 2 && strpos($parts[1], 'Approximate value:') !== 0) { $prize = $parts[1]; }
            }
        }
        $prize = trim($prize);
        if (preg_match('/(?:^|' . $nl . ')Approximate value:[[:blank:]]*([^' . $nl . ']+)$/i', $prize, $match, PREG_OFFSET_CAPTURE)) {
            $value = ww_qbdes_prize_value($match[1][0]);
            if ($value) { $prize = trim(substr($prize, 0, $match[0][1])); }
        }
        if (!$value) {
            // Old senders may include the value only in the vendor reference copy.
            $value = ww_qbdes_prize_value(ww_qbdes_line_after($vendor, 'Approximate value:'));
        }
        return array('description' => ww_qbdes_prize_text($prize), 'value' => $value);
    }
    function ww_qbdes_vendor_from_couple_text($text) {
        $direct = ww_qbdes_line_after($text, 'Vendor:');
        if (!$direct) { $direct = ww_qbdes_line_after($text, 'Selected booth:'); }
        return $direct ? $direct : '';
    }
    function ww_qbdes_profile_url_from_text($text) {
        $url = ww_qbdes_line_after($text, 'Connect through WeddingWin.ca:');
        if (!$url) { $url = ww_qbdes_line_after($text, 'Vendor profile:'); }
        $url = trim($url);
        return filter_var($url, FILTER_VALIDATE_URL) ? $url : '';
    }
    function ww_qbdes_section($inner, $bg = '#ffffff', $border = '') {
        $borderStyle = $border ? 'border:' . $border . ';border-radius:10px;' : '';
        return '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 16px;background-color:' . $bg . ';' . $borderStyle . '"><tr><td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;color:#2e2e32;font-size:15px;line-height:1.55;">' . $inner . '</td></tr></table>';
    }
    function ww_qbdes_heading($text) {
        return '<p style="margin:0 0 8px;color:#aa565d;font-size:12px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;">' . ww_qbdes_e($text) . '</p>';
    }
    function ww_qbdes_text_body($winnerName, $vendorName, $prizeTitle, $profileUrl, $prizeValue = '') {
        $winner = ww_qbdes_label($winnerName, 'there', 80);
        $vendor = ww_qbdes_label($vendorName, 'the vendor', 140);
        $prize = ww_qbdes_prize_text($prizeTitle);
        if (!$prize) { $prize = 'the booth draw item'; }
        $value = ww_qbdes_prize_value($prizeValue);
        $lines = array(
            'Hi ' . $winner . ',',
            '',
            'Congratulations, your name was selected by ' . $vendor . ' for their draw.',
            '',
            'Your draw',
            'Vendor: ' . $vendor,
            'Draw item: ' . $prize . ($value ? PHP_EOL . 'Approximate value: ' . $value : ''),
            '',
            'What happens next',
            $vendor . ' will follow up with the prize details and next steps.',
            $profileUrl ? 'Vendor profile: ' . $profileUrl : 'You can connect with them through WeddingWin.ca.',
            '',
            'Why you received this',
            "You opted in after scanning this vendor's QR code during authorized QR Bingo scanning.",
            '',
            'WeddingWin.ca'
        );
        return implode(PHP_EOL, $lines);
    }
    function ww_qbdes_couple_html($winnerName, $vendorName, $prizeTitle, $profileUrl, $prizeValue = '') {
        $winner = ww_qbdes_label($winnerName, 'there', 80);
        $vendor = ww_qbdes_label($vendorName, 'the vendor', 140);
        $prize = ww_qbdes_prize_text($prizeTitle);
        if (!$prize) { $prize = 'the booth draw item'; }
        $value = ww_qbdes_prize_value($prizeValue);
        $valueHtml = $value ? '<p style="margin:8px 0 0;"><strong>Approximate value:</strong> ' . ww_qbdes_e($value) . '</p>' : '';
        $profile = $profileUrl ? '<p style="margin:14px 0 0;"><a href="' . ww_qbdes_e($profileUrl) . '" target="_blank" style="background-color:#aa565d;border-radius:6px;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:18px;padding:11px 16px;text-decoration:none;">View vendor profile</a></p>' : '';
        $html = '';
        $html .= ww_qbdes_section('<p style="margin:0 0 14px;font-size:16px;line-height:1.55;">Hi ' . ww_qbdes_e($winner) . ',</p><p style="margin:0;font-size:16px;line-height:1.55;"><strong>Congratulations,</strong> your name was selected by ' . ww_qbdes_e($vendor) . ' for their draw.</p>');
        $html .= ww_qbdes_section(ww_qbdes_heading('Your draw') . '<p style="margin:0 0 8px;"><strong>Vendor:</strong> ' . ww_qbdes_e($vendor) . '</p><p style="margin:0;overflow-wrap:anywhere;"><strong>Draw item:</strong> ' . nl2br(ww_qbdes_e($prize)) . '</p>' . $valueHtml, '#fff7f6', '1px solid #efd8d5');
        $html .= ww_qbdes_section(ww_qbdes_heading('What happens next') . '<p style="margin:0;">' . ww_qbdes_e($vendor) . ' will follow up with the prize details and next steps.</p>' . $profile);
        $html .= ww_qbdes_section(ww_qbdes_heading('Why you received this') . '<p style="margin:0;">You opted in after scanning this vendor&#39;s QR code during authorized QR Bingo scanning.</p>');
        $html .= '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tr><td style="padding:4px 20px 0;font-family:Arial,Helvetica,sans-serif;color:#2e2e32;font-size:15px;line-height:1.55;">WeddingWin.ca</td></tr></table>';
        return $html;
    }
    function ww_qbdes_vendor_html($winnerName, $winnerEmail, $winnerPhone, $winnerWeddingDate, $prizeTitle, $prizeValue = '') {
        $winner = ww_qbdes_label($winnerName, 'Winner', 120);
        $email = ww_qbdes_label($winnerEmail, 'Not provided', 254);
        $phone = ww_qbdes_label($winnerPhone, 'Not provided', 120);
        $date = ww_qbdes_label($winnerWeddingDate, 'Not provided', 120);
        $prize = ww_qbdes_prize_text($prizeTitle);
        if (!$prize) { $prize = 'the booth draw item'; }
        $value = ww_qbdes_prize_value($prizeValue);
        $valueHtml = $value ? '<p style="margin:8px 0 0;"><strong>Approximate value:</strong> ' . ww_qbdes_e($value) . '</p>' : '';
        $html = '';
        $html .= ww_qbdes_section('<p style="margin:0;font-size:16px;line-height:1.55;">WeddingWin recorded your business&#39;s confirmation that the selected couple meets the draw rules, answered the required short math question correctly, and completed any required declaration or release step. WeddingWin did not perform or certify the vendor checks. Your business remains responsible for the lawful promotion, winner notice, and prize fulfilment.</p>');
        $html .= ww_qbdes_section(ww_qbdes_heading('Winner details') . '<p style="margin:0 0 6px;"><strong>Name:</strong> ' . ww_qbdes_e($winner) . '</p><p style="margin:0 0 6px;overflow-wrap:anywhere;"><strong>Email:</strong> <a href="mailto:' . ww_qbdes_e($email) . '" style="color:#aa565d;overflow-wrap:anywhere;">' . ww_qbdes_e($email) . '</a></p><p style="margin:0 0 6px;"><strong>Phone:</strong> ' . ww_qbdes_e($phone) . '</p><p style="margin:0;"><strong>Wedding date:</strong> ' . ww_qbdes_e($date) . '</p>', '#fff7f6', '1px solid #efd8d5');
        $html .= ww_qbdes_section(ww_qbdes_heading('Draw item') . '<p style="margin:0;overflow-wrap:anywhere;">' . nl2br(ww_qbdes_e($prize)) . '</p>' . $valueHtml);
        $html .= ww_qbdes_section(ww_qbdes_heading('Contact information') . '<p style="margin:0;">This couple accepted your draw and agreed that your business may use the shared contact information for this draw and wedding-related marketing. Honour unsubscribe requests and protect the information under the Vendor Draw Rules. Your business is responsible for the promotion, winner confirmation, notice, and prize fulfilment; WeddingWin provides the technical record and email delivery.</p>');
        return $html;
    }
    function ww_qbdes_plain_to_html($body) {
        $safe = ww_qbdes_e($body);
        $safe = str_replace(chr(10), '<br>', str_replace(chr(13), chr(10), $safe));
        return ww_qbdes_section('<p style="margin:0;">' . $safe . '</p>');
    }
    function ww_qbdes_send_mail($to, $subject, $textBody, $htmlBody = '') {
        global $w;
        $safeTo = strtolower(ww_qbdes_clean_header($to, 254));
        $safeSubject = ww_qbdes_clean_header($subject, 180);
        $textBody = ww_qbdes_clean($textBody, 6000);
        if (!filter_var($safeTo, FILTER_VALIDATE_EMAIL) || !$safeSubject || !$textBody) { return false; }
        if (!function_exists('sendEmailTemplate')) { return false; }
        $sender = 'noreply@weddingwin.ca';
        if (isset($w['website_email']) && filter_var($w['website_email'], FILTER_VALIDATE_EMAIL)) { $sender = $w['website_email']; }
        if (!$htmlBody) { $htmlBody = ww_qbdes_plain_to_html($textBody); }
        $email = array('sender' => $sender, 'subject' => $safeSubject, 'html' => $htmlBody, 'text' => $textBody, 'priority' => '2');
        $result = sendEmailTemplate($sender, $safeTo, $safeSubject, $htmlBody, $textBody, '2', $w, $email);
        return $result !== false;
    }
    function ww_qbdes_random_hex($bytes) {
        $bytes = (int)$bytes;
        if ($bytes < 16 || $bytes > 64) { return ''; }
        if (function_exists('random_bytes')) {
            try { return bin2hex(random_bytes($bytes)); } catch (Exception $ignored) { return ''; }
        }
        if (function_exists('openssl_random_pseudo_bytes')) {
            $strong = false;
            $value = openssl_random_pseudo_bytes($bytes, $strong);
            if ($value !== false && $strong === true) { return bin2hex($value); }
        }
        return '';
    }
    function ww_qbdes_valid_delivery_key($value) {
        return is_string($value)
            && preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/D', $value) === 1;
    }
    function ww_qbdes_ensure_delivery_ledger() {
        global $w;
        $query = "CREATE TABLE IF NOT EXISTS ww_qr_bingo_email_delivery_keys (
            delivery_hash CHAR(64) NOT NULL,
            channel VARCHAR(16) NOT NULL,
            payload_hash CHAR(64) NOT NULL,
            status VARCHAR(16) NOT NULL,
            claim_token CHAR(64) DEFAULT NULL,
            claimed_at DATETIME DEFAULT NULL,
            lease_expires_at DATETIME DEFAULT NULL,
            sent_at DATETIME DEFAULT NULL,
            last_error VARCHAR(255) DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (delivery_hash, channel),
            KEY ww_qr_bingo_email_delivery_status (status, lease_expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
        return mysql($w['database'], $query) !== false;
    }
    function ww_qbdes_claim_delivery($eventKey, $channel, $deliveryKey, $payloadHash) {
        global $w;
        if (($channel !== 'vendor' && $channel !== 'couple')
            || !ww_qbdes_valid_delivery_key($deliveryKey)
            || !preg_match('/^[0-9a-f]{64}$/D', $payloadHash)) {
            return array('state' => 'invalid');
        }
        $claimToken = ww_qbdes_random_hex(32);
        if (!$claimToken || !ww_qbdes_ensure_delivery_ledger()) { return array('state' => 'error'); }
        $deliveryHash = hash('sha256', (string)$eventKey . '|' . $channel . '|' . $deliveryKey);
        $safeDeliveryHash = mysql_real_escape_string($deliveryHash);
        $safeChannel = mysql_real_escape_string($channel);
        $safePayloadHash = mysql_real_escape_string($payloadHash);
        $safeClaimToken = mysql_real_escape_string($claimToken);
        $query = "INSERT INTO ww_qr_bingo_email_delivery_keys
            (delivery_hash, channel, payload_hash, status, claim_token, claimed_at, lease_expires_at)
            VALUES ('$safeDeliveryHash', '$safeChannel', '$safePayloadHash', 'claimed', '$safeClaimToken', NOW(), DATE_ADD(NOW(), INTERVAL 15 MINUTE))
            ON DUPLICATE KEY UPDATE
              status = IF(payload_hash = VALUES(payload_hash) AND status <> 'sent' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()), 'claimed', status),
              claim_token = IF(payload_hash = VALUES(payload_hash) AND status <> 'sent' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()), VALUES(claim_token), claim_token),
              claimed_at = IF(payload_hash = VALUES(payload_hash) AND status <> 'sent' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()), NOW(), claimed_at),
              lease_expires_at = IF(payload_hash = VALUES(payload_hash) AND status <> 'sent' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()), DATE_ADD(NOW(), INTERVAL 15 MINUTE), lease_expires_at),
              last_error = IF(payload_hash = VALUES(payload_hash) AND status <> 'sent' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()), NULL, last_error)";
        if (mysql($w['database'], $query) === false) { return array('state' => 'error'); }
        $result = mysql($w['database'], "SELECT payload_hash, status, claim_token FROM ww_qr_bingo_email_delivery_keys WHERE delivery_hash = '$safeDeliveryHash' AND channel = '$safeChannel' LIMIT 1");
        $row = $result ? mysql_fetch_assoc($result) : false;
        if (!$row || !hash_equals($payloadHash, (string)$row['payload_hash'])) {
            return array('state' => $row ? 'conflict' : 'error');
        }
        if ((string)$row['status'] === 'sent') {
            return array('state' => 'sent', 'delivery_hash' => $deliveryHash, 'channel' => $channel);
        }
        if (hash_equals($claimToken, (string)$row['claim_token'])) {
            return array(
                'state' => 'claimed',
                'delivery_hash' => $deliveryHash,
                'channel' => $channel,
                'claim_token' => $claimToken
            );
        }
        return array('state' => 'in_progress');
    }
    function ww_qbdes_finish_delivery($claim, $sent, $errorMessage = '') {
        global $w;
        if (!is_array($claim) || !isset($claim['state']) || $claim['state'] !== 'claimed') { return false; }
        $safeDeliveryHash = mysql_real_escape_string((string)$claim['delivery_hash']);
        $safeChannel = mysql_real_escape_string((string)$claim['channel']);
        $safeClaimToken = mysql_real_escape_string((string)$claim['claim_token']);
        $safeError = mysql_real_escape_string(ww_qbdes_clean_header($errorMessage, 240));
        if ($sent) {
            $set = "status = 'sent', sent_at = NOW(), claim_token = NULL, lease_expires_at = NULL, last_error = NULL";
        } else {
            $set = "status = 'failed', claim_token = NULL, lease_expires_at = NULL, last_error = '$safeError'";
        }
        $updated = mysql($w['database'], "UPDATE ww_qr_bingo_email_delivery_keys SET $set WHERE delivery_hash = '$safeDeliveryHash' AND channel = '$safeChannel' AND claim_token = '$safeClaimToken' AND status = 'claimed' LIMIT 1");
        if ($updated === false) { return false; }
        $result = mysql($w['database'], "SELECT status FROM ww_qr_bingo_email_delivery_keys WHERE delivery_hash = '$safeDeliveryHash' AND channel = '$safeChannel' LIMIT 1");
        $row = $result ? mysql_fetch_assoc($result) : false;
        return $row && (string)$row['status'] === ($sent ? 'sent' : 'failed');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['ww_qr_draw_email_action']) && $_POST['ww_qr_draw_email_action'] === 'send_draw') {
    $payload = isset($_POST['payload']) ? (string)$_POST['payload'] : '';
    $expires = isset($_POST['expires']) ? intval($_POST['expires']) : 0;
    $signature = isset($_POST['signature']) ? trim($_POST['signature']) : '';
    if (!ww_qbdes_valid_signature($payload, $expires, $signature)) { ww_qbdes_json(false, 'This draw email request could not be verified.'); }
    $data = json_decode($payload, true);
    if (!is_array($data)) { ww_qbdes_json(false, 'Draw email payload is invalid.'); }
    if (!isset($data['winner_verified']) || (string)$data['winner_verified'] !== '1') { ww_qbdes_json(false, 'Potential-winner notices require confirmation that the selected couple meets the draw rules and answered the required short math question correctly.'); }
    $eventKey = ww_qbdes_clean_header(isset($data['event_key']) ? $data['event_key'] : '', 180);
    $deliveryMode = ww_qbdes_clean_header(isset($data['delivery_mode']) ? $data['delivery_mode'] : '', 120);
    $verificationState = ww_qbdes_clean_header(isset($data['verification_state']) ? $data['verification_state'] : '', 120);
    $isEmailTestFixture = strpos($eventKey, 'email-test-') === 0;
    if (strpos($eventKey, 'app-review-') === 0) {
        ww_qbdes_json(true, 'Outbound email is suppressed for the isolated App Review fixture.', array(
            'vendor_sent' => false,
            'couple_sent' => false,
            'outbound_email_suppressed' => true
        ));
    }
    $validDeliveryMode = $isEmailTestFixture
        ? $deliveryMode === 'isolated_verified_email_test'
        : $deliveryMode === 'production_verified_fulfillment';
    if (!$validDeliveryMode || $verificationState !== 'verified_potential_winner') {
        ww_qbdes_json(false, 'Outbound potential-winner notices are disabled for this delivery mode.');
    }
    $vendorTo = strtolower(ww_qbdes_clean_header(isset($data['vendor_to']) ? $data['vendor_to'] : '', 254));
    $coupleTo = strtolower(ww_qbdes_clean_header(isset($data['couple_to']) ? $data['couple_to'] : '', 254));
    $vendorSubject = ww_qbdes_clean_header(isset($data['vendor_subject']) ? $data['vendor_subject'] : '', 180);
    $vendorText = ww_qbdes_clean(isset($data['vendor_text']) ? $data['vendor_text'] : '', 6000);
    $incomingCoupleSubject = ww_qbdes_clean_header(isset($data['couple_subject']) ? $data['couple_subject'] : '', 180);
    $incomingCoupleText = ww_qbdes_clean(isset($data['couple_text']) ? $data['couple_text'] : '', 6000);
    $sendVendor = ww_qbdes_flag($data, 'send_vendor', true);
    $sendCouple = ww_qbdes_flag($data, 'send_couple', true);
    if ($isEmailTestFixture) {
        $drawId = ww_qbdes_clean_header(isset($data['draw_id']) ? $data['draw_id'] : '', 80);
        $fixtureId = ww_qbdes_clean_header(isset($data['fixture_id']) ? $data['fixture_id'] : '', 80);
        $emailTestFlag = isset($data['email_test_fixture']) && (string)$data['email_test_fixture'] === '1';
        $emailTestVendorCopy = isset($data['email_test_vendor_copy']) && (string)$data['email_test_vendor_copy'] === '1';
        $expectedRecipientHash = '05d7d3b40670d8471795b130efde1c37d9b391c9561550e5f34b5e07cf92b6fc';
        $expectedCoupleAliasHash = 'e1375389609977e97e17682cc8e198e88db77ca801f3d2729b73d1473dec19ea';
        $validUuid = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di';
        if (
            !$emailTestFlag
            || (!$sendVendor && !$sendCouple)
            || ($sendVendor && !$emailTestVendorCopy)
            || (!$emailTestVendorCopy && !$sendCouple)
            || !preg_match($validUuid, $drawId)
            || !preg_match($validUuid, $fixtureId)
            || !(hash_equals($expectedRecipientHash, hash('sha256', $coupleTo))
                || hash_equals($expectedCoupleAliasHash, hash('sha256', $coupleTo)))
            // Optional vendor copies require the signed fixture opt-in marker.
            // Both copies are pinned to the same exact owner-approved address;
            // no real vendor address or alternate alias can receive this copy.
            || ($emailTestVendorCopy && (
                !hash_equals($expectedRecipientHash, hash('sha256', $coupleTo))
                || !hash_equals($coupleTo, $vendorTo)
            ))
            || $incomingCoupleSubject !== 'Your name was selected for a QR Bingo booth draw'
        ) {
            ww_qbdes_json(false, 'The isolated email-test request is not allowlisted.');
        }
    } elseif (isset($data['email_test_fixture']) && (string)$data['email_test_fixture'] === '1') {
        ww_qbdes_json(false, 'The isolated email-test marker is not valid for this event.');
    }
    if (!$sendVendor && !$sendCouple) {
        ww_qbdes_json(true, 'Draw emails were already delivered.', array(
            'vendor_sent' => true,
            'couple_sent' => true,
            'vendor_skipped' => true,
            'couple_skipped' => true
        ));
    }
    if ($sendVendor && !filter_var($vendorTo, FILTER_VALIDATE_EMAIL)) { ww_qbdes_json(false, 'Vendor email address is missing or invalid.'); }
    if ($sendCouple && !filter_var($coupleTo, FILTER_VALIDATE_EMAIL)) { ww_qbdes_json(false, 'Couple email address is missing or invalid.'); }
    if (($sendVendor || $sendCouple) && (!$vendorSubject || !$vendorText)) { ww_qbdes_json(false, 'Draw email content is incomplete.'); }
    $vendorDeliveryKey = isset($data['vendor_delivery_key']) ? (string)$data['vendor_delivery_key'] : '';
    $coupleDeliveryKey = isset($data['couple_delivery_key']) ? (string)$data['couple_delivery_key'] : '';
    if ($sendVendor && !ww_qbdes_valid_delivery_key($vendorDeliveryKey)) { ww_qbdes_json(false, 'Vendor delivery key is missing or invalid.'); }
    if ($sendCouple && !ww_qbdes_valid_delivery_key($coupleDeliveryKey)) { ww_qbdes_json(false, 'Couple delivery key is missing or invalid.'); }
    $winnerName = ww_qbdes_line_after($vendorText, 'Name:');
    if (!$winnerName) { $winnerName = ww_qbdes_line_after($vendorText, 'Winner:'); }
    $winnerEmail = ww_qbdes_line_after($vendorText, 'Email:');
    $winnerPhone = ww_qbdes_line_after($vendorText, 'Phone:');
    $winnerWeddingDate = ww_qbdes_line_after($vendorText, 'Wedding date:');
    $prizeDetails = ww_qbdes_prize_details($vendorText, $incomingCoupleText, $data);
    if ($prizeDetails === false) { ww_qbdes_json(false, 'The signed prize details are missing or invalid.'); }
    $prizeTitle = $prizeDetails['description'];
    $prizeValue = $prizeDetails['value'];
    $vendorName = ww_qbdes_vendor_from_couple_text($incomingCoupleText);
    $profileUrl = ww_qbdes_profile_url_from_text($incomingCoupleText);
    $coupleSubject = $incomingCoupleSubject ? $incomingCoupleSubject : 'Your name was selected for a QR Bingo booth draw';
    $coupleText = ww_qbdes_text_body($winnerName, $vendorName, $prizeTitle, $profileUrl, $prizeValue);
    $coupleHtml = ww_qbdes_couple_html($winnerName, $vendorName, $prizeTitle, $profileUrl, $prizeValue);
    $vendorHtml = ww_qbdes_vendor_html($winnerName, $winnerEmail, $winnerPhone, $winnerWeddingDate, $prizeTitle, $prizeValue);
    $vendorPayloadHash = hash('sha256', json_encode(array($vendorTo, $vendorSubject, $vendorText)));
    $couplePayloadHash = hash('sha256', json_encode(array($coupleTo, $coupleSubject, $coupleText)));
    $vendorClaim = $sendVendor
        ? ww_qbdes_claim_delivery($eventKey, 'vendor', $vendorDeliveryKey, $vendorPayloadHash)
        : array('state' => 'sent');
    $blockingClaimStates = array('invalid', 'conflict', 'error', 'in_progress');
    if (in_array($vendorClaim['state'], $blockingClaimStates, true)) {
        ww_qbdes_json(false, 'Vendor email delivery is already in progress or its delivery key conflicts with an earlier request.', array(
            'vendor_sent' => false,
            'couple_sent' => false
        ));
    }
    $coupleClaim = $sendCouple
        ? ww_qbdes_claim_delivery($eventKey, 'couple', $coupleDeliveryKey, $couplePayloadHash)
        : array('state' => 'sent');
    if (in_array($coupleClaim['state'], $blockingClaimStates, true)) {
        if ($vendorClaim['state'] === 'claimed') { ww_qbdes_finish_delivery($vendorClaim, false, 'Companion channel could not be claimed.'); }
        ww_qbdes_json(false, 'Couple email delivery is already in progress or its delivery key conflicts with an earlier request.', array(
            'vendor_sent' => $vendorClaim['state'] === 'sent',
            'couple_sent' => false
        ));
    }
    $vendorSent = $vendorClaim['state'] === 'sent';
    $coupleSent = $coupleClaim['state'] === 'sent';
    if ($vendorClaim['state'] === 'claimed') {
        $vendorSent = ww_qbdes_send_mail($vendorTo, $vendorSubject, $vendorText, $vendorHtml);
        if (!ww_qbdes_finish_delivery($vendorClaim, $vendorSent, $vendorSent ? '' : 'WeddingWin mail transport returned failure.')) {
            $vendorSent = false;
        }
    }
    if ($coupleClaim['state'] === 'claimed') {
        $coupleSent = ww_qbdes_send_mail($coupleTo, $coupleSubject, $coupleText, $coupleHtml);
        if (!ww_qbdes_finish_delivery($coupleClaim, $coupleSent, $coupleSent ? '' : 'WeddingWin mail transport returned failure.')) {
            $coupleSent = false;
        }
    }
    if (!$vendorSent || !$coupleSent) {
        ww_qbdes_json(false, 'One or more draw emails could not be sent through WeddingWin.ca.', array(
            'vendor_sent' => $vendorSent ? true : false,
            'couple_sent' => $coupleSent ? true : false,
            'vendor_skipped' => !$sendVendor || $vendorClaim['state'] === 'sent',
            'couple_skipped' => !$sendCouple || $coupleClaim['state'] === 'sent'
        ));
    }
    ww_qbdes_json(true, 'Draw emails sent through WeddingWin.ca.', array(
        'vendor_sent' => true,
        'couple_sent' => true,
        'vendor_skipped' => !$sendVendor || $vendorClaim['state'] === 'sent',
        'couple_skipped' => !$sendCouple || $coupleClaim['state'] === 'sent',
        'couple_subject' => $coupleSubject
    ));
}
?>
<div class="ww-qbdes">
  <div class="ww-qbdes-card">
    <h2>QR Bingo Draw Email Sender</h2>
    <p>This secure WeddingWin endpoint sends vendor-draw potential-winner notices for the app and website dashboard.</p>
  </div>
</div>
