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
    function ww_qbdes_text_body($winnerName, $vendorName, $prizeTitle, $profileUrl) {
        $winner = ww_qbdes_label($winnerName, 'there', 80);
        $vendor = ww_qbdes_label($vendorName, 'the vendor', 140);
        $prize = ww_qbdes_label($prizeTitle, 'the booth draw item', 500);
        $lines = array(
            'Hi ' . $winner . ',',
            '',
            'You were selected as a potential winner in ' . $vendor . "'s draw. Wedding Win verified your eligibility and skill-testing answer.",
            '',
            'Vendor: ' . $vendor,
            'Draw item: ' . $prize,
            '',
            $vendor . ' may contact you only to verify and arrange prize fulfillment. This notice does not itself award the prize.',
            $profileUrl ? 'Vendor profile: ' . $profileUrl : 'You can connect with them through WeddingWin.ca.',
            '',
            'You received this because you opted in after scanning this vendor QR code at the wedding show.',
            '',
            'WeddingWin.ca'
        );
        return implode(PHP_EOL, $lines);
    }
    function ww_qbdes_couple_html($winnerName, $vendorName, $prizeTitle, $profileUrl) {
        $winner = ww_qbdes_label($winnerName, 'there', 80);
        $vendor = ww_qbdes_label($vendorName, 'the vendor', 140);
        $prize = ww_qbdes_label($prizeTitle, 'the booth draw item', 500);
        $profile = $profileUrl ? '<p style="margin:14px 0 0;"><a href="' . ww_qbdes_e($profileUrl) . '" target="_blank" style="background-color:#aa565d;border-radius:6px;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:18px;padding:11px 16px;text-decoration:none;">View vendor profile</a></p>' : '';
        $html = '';
        $html .= ww_qbdes_section('<p style="margin:0 0 14px;font-size:16px;line-height:1.55;">Hi ' . ww_qbdes_e($winner) . ',</p><p style="margin:0;font-size:16px;line-height:1.55;">You were selected as a potential winner in ' . ww_qbdes_e($vendor) . '&#39;s draw. Wedding Win verified your eligibility and skill-testing answer.</p>');
        $html .= ww_qbdes_section(ww_qbdes_heading('Your draw') . '<p style="margin:0 0 8px;"><strong>Vendor:</strong> ' . ww_qbdes_e($vendor) . '</p><p style="margin:0;"><strong>Draw item:</strong> ' . ww_qbdes_e($prize) . '</p>', '#fff7f6', '1px solid #efd8d5');
        $html .= ww_qbdes_section(ww_qbdes_heading('What happens next') . '<p style="margin:0;">' . ww_qbdes_e($vendor) . ' may contact you only to verify and arrange prize fulfillment. This notice does not itself award the prize.</p>' . $profile);
        $html .= ww_qbdes_section(ww_qbdes_heading('Why you received this') . '<p style="margin:0;">You received this because you opted in after scanning this vendor QR code at the wedding show.</p>');
        $html .= '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tr><td style="padding:4px 20px 0;font-family:Arial,Helvetica,sans-serif;color:#2e2e32;font-size:15px;line-height:1.55;">WeddingWin.ca</td></tr></table>';
        return $html;
    }
    function ww_qbdes_vendor_html($winnerName, $winnerEmail, $winnerPhone, $winnerWeddingDate, $prizeTitle) {
        $winner = ww_qbdes_label($winnerName, 'Winner', 120);
        $email = ww_qbdes_label($winnerEmail, 'Not provided', 180);
        $phone = ww_qbdes_label($winnerPhone, 'Not provided', 120);
        $date = ww_qbdes_label($winnerWeddingDate, 'Not provided', 120);
        $prize = ww_qbdes_label($prizeTitle, 'the booth draw item', 500);
        $html = '';
        $html .= ww_qbdes_section('<p style="margin:0;font-size:16px;line-height:1.55;">Wedding Win verified this QR Bingo potential winner&#39;s eligibility and skill-testing answer.</p>');
        $html .= ww_qbdes_section(ww_qbdes_heading('Winner details') . '<p style="margin:0 0 6px;"><strong>Name:</strong> ' . ww_qbdes_e($winner) . '</p><p style="margin:0 0 6px;"><strong>Email:</strong> <a href="mailto:' . ww_qbdes_e($email) . '" style="color:#aa565d;">' . ww_qbdes_e($email) . '</a></p><p style="margin:0 0 6px;"><strong>Phone:</strong> ' . ww_qbdes_e($phone) . '</p><p style="margin:0;"><strong>Wedding date:</strong> ' . ww_qbdes_e($date) . '</p>', '#fff7f6', '1px solid #efd8d5');
        $html .= ww_qbdes_section(ww_qbdes_heading('Draw item') . '<p style="margin:0;">' . ww_qbdes_e($prize) . '</p>');
        $html .= ww_qbdes_section(ww_qbdes_heading('Purpose limitation') . '<p style="margin:0;">Use these contact details only to verify or fulfill this prize. Marketing use is prohibited without separate consent. WeddingWin.ca has sent the verified potential winner a fulfillment notice.</p>');
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
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['ww_qr_draw_email_action']) && $_POST['ww_qr_draw_email_action'] === 'send_draw') {
    $payload = isset($_POST['payload']) ? (string)$_POST['payload'] : '';
    $expires = isset($_POST['expires']) ? intval($_POST['expires']) : 0;
    $signature = isset($_POST['signature']) ? trim($_POST['signature']) : '';
    if (!ww_qbdes_valid_signature($payload, $expires, $signature)) { ww_qbdes_json(false, 'This draw email request could not be verified.'); }
    $data = json_decode($payload, true);
    if (!is_array($data)) { ww_qbdes_json(false, 'Draw email payload is invalid.'); }
    if (!isset($data['winner_verified']) || (string)$data['winner_verified'] !== '1') { ww_qbdes_json(false, 'Potential-winner fulfillment notices require completed eligibility and skill-testing verification.'); }
    $eventKey = ww_qbdes_clean_header(isset($data['event_key']) ? $data['event_key'] : '', 180);
    $deliveryMode = ww_qbdes_clean_header(isset($data['delivery_mode']) ? $data['delivery_mode'] : '', 120);
    $verificationState = ww_qbdes_clean_header(isset($data['verification_state']) ? $data['verification_state'] : '', 120);
    if (strpos($eventKey, 'app-review-') === 0) {
        ww_qbdes_json(true, 'Outbound email is suppressed for the isolated App Review fixture.', array(
            'vendor_sent' => false,
            'couple_sent' => false,
            'outbound_email_suppressed' => true
        ));
    }
    if ($deliveryMode !== 'production_verified_fulfillment' || $verificationState !== 'verified_potential_winner') {
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
    $winnerName = ww_qbdes_line_after($vendorText, 'Name:');
    if (!$winnerName) { $winnerName = ww_qbdes_line_after($vendorText, 'Winner:'); }
    $winnerEmail = ww_qbdes_line_after($vendorText, 'Email:');
    $winnerPhone = ww_qbdes_line_after($vendorText, 'Phone:');
    $winnerWeddingDate = ww_qbdes_line_after($vendorText, 'Wedding date:');
    $prizeTitle = ww_qbdes_section_after($vendorText, 'Draw item');
    if (!$prizeTitle) { $prizeTitle = ww_qbdes_line_after($incomingCoupleText, 'Draw item:'); }
    $vendorName = ww_qbdes_vendor_from_couple_text($incomingCoupleText);
    $profileUrl = ww_qbdes_profile_url_from_text($incomingCoupleText);
    $coupleSubject = $incomingCoupleSubject ? $incomingCoupleSubject : 'QR Bingo potential-winner verification complete';
    $coupleText = ww_qbdes_text_body($winnerName, $vendorName, $prizeTitle, $profileUrl);
    $coupleHtml = ww_qbdes_couple_html($winnerName, $vendorName, $prizeTitle, $profileUrl);
    $vendorHtml = ww_qbdes_vendor_html($winnerName, $winnerEmail, $winnerPhone, $winnerWeddingDate, $prizeTitle);
    $vendorSent = $sendVendor ? ww_qbdes_send_mail($vendorTo, $vendorSubject, $vendorText, $vendorHtml) : true;
    $coupleSent = $sendCouple ? ww_qbdes_send_mail($coupleTo, $coupleSubject, $coupleText, $coupleHtml) : true;
    if (!$vendorSent || !$coupleSent) {
        ww_qbdes_json(false, 'One or more draw emails could not be sent through WeddingWin.ca.', array(
            'vendor_sent' => $vendorSent ? true : false,
            'couple_sent' => $coupleSent ? true : false,
            'vendor_skipped' => $sendVendor ? false : true,
            'couple_skipped' => $sendCouple ? false : true
        ));
    }
    ww_qbdes_json(true, 'Draw emails sent through WeddingWin.ca.', array(
        'vendor_sent' => true,
        'couple_sent' => true,
        'vendor_skipped' => $sendVendor ? false : true,
        'couple_skipped' => $sendCouple ? false : true,
        'couple_subject' => $coupleSubject
    ));
}
?>
<div class="ww-qbdes">
  <div class="ww-qbdes-card">
    <h2>QR Bingo Draw Email Sender</h2>
    <p>This secure WeddingWin endpoint sends QR Bingo draw winner emails for the app and website dashboard.</p>
  </div>
</div>
