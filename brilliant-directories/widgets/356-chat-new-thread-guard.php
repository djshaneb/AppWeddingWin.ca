<?php
/* WW_EMAIL_VERIFICATION_CORE_START */
// Embedded unchanged in standalone widgets. Provision the private table once as admin.
if (!function_exists('ww_email_verification_state')) {
    function ww_ev_escape($value) { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
    function ww_ev_db_escape($value) {
        return function_exists('mysql_real_escape_string') ? mysql_real_escape_string((string)$value) : addslashes((string)$value);
    }
    function ww_ev_member_id($value) {
        $text = (string)$value;
        if (!preg_match('/^[1-9][0-9]{0,18}$/D', $text) || (string)intval($text) !== $text) throw new Exception('Please sign in again.');
        return intval($text);
    }
    function ww_ev_query($sql) {
        global $w;
        $result = mysql($w['database'], $sql);
        if ($result === false) throw new Exception('Email verification is temporarily unavailable. Please try again.');
        return $result;
    }
    function ww_ev_user($userId) {
        $id = ww_ev_member_id($userId);
        $result = ww_ev_query("SELECT user_id,email,active FROM users_data WHERE user_id='" . $id . "' LIMIT 1");
        $row = mysql_fetch_assoc($result);
        if (!$row || (string)$row['user_id'] !== (string)$id || (string)$row['active'] !== '2') throw new Exception('Please sign in to an active WeddingWin account.');
        return $row;
    }
    function ww_ev_current_member() {
        global $w;
        if (!class_exists('user') || empty($_COOKIE['userid']) || !user::isUserLogged($_COOKIE)) throw new Exception('Please sign in before changing your email.');
        // BD's cookie is encoded; only getUser resolves the authenticated canonical ID.
        $member = getUser($_COOKIE['userid'], $w);
        if (!is_array($member) || empty($member['user_id'])) throw new Exception('Please sign in again.');
        return ww_ev_user($member['user_id']);
    }
    function ww_ev_lock() {
        // One global lock serializes both member changes and competing target addresses.
        // Older MySQL releases do not safely retain two independent named locks.
        $result = ww_ev_query("SELECT GET_LOCK('ww_email_verification_mutations',5) AS acquired");
        $row = mysql_fetch_assoc($result);
        if (!$row || intval($row['acquired']) !== 1) throw new Exception('Another email request is in progress. Please try again.');
    }
    function ww_ev_unlock() {
        global $w;
        mysql($w['database'], "SELECT RELEASE_LOCK('ww_email_verification_mutations')");
    }
    function ww_ev_is_relay($email) { return preg_match('/@privaterelay\.appleid\.com$/iD', trim((string)$email)) === 1; }
    function ww_ev_utc_time($value) { return is_string($value) && $value !== '' ? strtotime($value . ' UTC') : false; }
    function ww_ev_private_state($userId) {
        $id = ww_ev_member_id($userId);
        $result = ww_ev_query("SELECT * FROM ww_email_verification_state WHERE user_id='" . $id . "' LIMIT 1");
        return mysql_fetch_assoc($result);
    }
    function ww_ev_legacy_meta($userId, $key) {
        $id = ww_ev_member_id($userId);
        $result = ww_ev_query("SELECT `value` FROM users_meta WHERE `database`='users_data' AND database_id='" . $id . "' AND `key`='" . ww_ev_db_escape($key) . "' ORDER BY meta_id DESC LIMIT 1");
        $row = mysql_fetch_assoc($result);
        return $row ? (string)$row['value'] : '';
    }
    function ww_email_verification_state($member) {
        $id = ww_ev_member_id(isset($member['user_id']) ? $member['user_id'] : '');
        $current = strtolower(trim(isset($member['email']) ? (string)$member['email'] : ''));
        if (!filter_var($current, FILTER_VALIDATE_EMAIL)) throw new Exception('Please refresh your account and try again.');
        $row = ww_ev_private_state($id);
        // Old user metadata can only require a new secure link, never establish proof.
        $pending = strtolower(trim($row ? (string)$row['pending_email'] : ww_ev_legacy_meta($id, 'custom_pending_email')));
        $required = ($row ? (string)$row['verification_required'] === '1' : ww_ev_legacy_meta($id, 'custom_email_verification_required') === '1') || $pending !== '';
        $requested = $row ? ww_ev_utc_time($row['requested_at']) : false;
        $status = 'none';
        if ($required) {
            $status = $row && filter_var($pending, FILTER_VALIDATE_EMAIL) && $requested && $requested <= time() + 30 && time() - $requested <= 86400 ? 'pending' : 'expired';
        } elseif ($row && (string)$row['confirmed_email'] === $current && ww_ev_utc_time($row['confirmed_at'])) {
            $status = 'confirmed';
        }
        return array('ok' => true, 'user_id' => (string)$id, 'current_email' => $current,
            'pending_email' => $pending !== '' && filter_var($pending, FILTER_VALIDATE_EMAIL) ? $pending : null,
            'email_confirmation_required' => $required, 'email_verification_status' => $status);
    }
    function ww_ev_random_token() {
        if (function_exists('random_bytes')) return bin2hex(random_bytes(32));
        if (function_exists('openssl_random_pseudo_bytes')) {
            $strong = false;
            $bytes = openssl_random_pseudo_bytes(32, $strong);
            if ($strong && is_string($bytes) && strlen($bytes) === 32) return bin2hex($bytes);
        }
        throw new Exception('Secure email verification is temporarily unavailable.');
    }
    function ww_ev_owner($email) {
        $result = ww_ev_query("SELECT user_id FROM users_data WHERE LOWER(email)='" . ww_ev_db_escape($email) . "' LIMIT 2");
        $first = mysql_fetch_assoc($result);
        if (mysql_fetch_assoc($result)) throw new Exception('That email is already connected to a WeddingWin account.');
        return $first ? (string)$first['user_id'] : '';
    }
    function ww_ev_require_origin() {
        $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
        if ($origin !== 'https://www.weddingwin.ca' && $origin !== 'https://weddingwin.ca') throw new Exception('Please open this form on WeddingWin.ca and try again.');
    }
    function ww_ev_json($body, $status) {
        while (function_exists('ob_get_level') && ob_get_level() > 0) @ob_end_clean();
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        header('Referrer-Policy: no-referrer');
        echo json_encode($body);
        exit();
    }
    function ww_ev_send($member, $newEmail, $verifyPath) {
        $id = ww_ev_member_id($member['user_id']);
        $newEmail = strtolower(trim((string)$newEmail));
        if (strlen($newEmail) > 254 || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) throw new Exception('Enter a valid email address.');
        if (ww_ev_is_relay($newEmail)) throw new Exception('Use the email address where you would like vendors to contact you, rather than an Apple relay address.');
        if ($verifyPath !== '/verify-email-change' && $verifyPath !== '/verify-email-change-app') throw new Exception('Invalid verification route.');
        ww_ev_lock();
        try {
            $current = ww_ev_user($id);
            $oldEmail = strtolower(trim((string)$current['email']));
            $state = ww_email_verification_state($current);
            if ($oldEmail === $newEmail && !$state['email_confirmation_required']) throw new Exception('That is already your current email address.');
            $owner = ww_ev_owner($newEmail);
            if ($owner !== '' && $owner !== (string)$id) throw new Exception('That email is already connected to another WeddingWin account.');
            $previous = ww_ev_private_state($id);
            $last = $previous ? ww_ev_utc_time($previous['requested_at']) : false;
            if ($last && time() - $last < 60) throw new Exception('Please wait one minute before requesting another email.');
            $token = ww_ev_random_token();
            $hash = hash('sha256', $token);
            $now = gmdate('Y-m-d H:i:s');
            ww_ev_query("INSERT INTO ww_email_verification_state (user_id,verification_required,pending_email,existing_email,token_hash,requested_at,generation) VALUES ('" . $id . "',1,'" . ww_ev_db_escape($newEmail) . "','" . ww_ev_db_escape($oldEmail) . "','" . $hash . "','" . $now . "',1) ON DUPLICATE KEY UPDATE verification_required=1,pending_email=VALUES(pending_email),existing_email=VALUES(existing_email),token_hash=VALUES(token_hash),requested_at=VALUES(requested_at),generation=generation+1");
            $saved = ww_ev_private_state($id);
            if (!$saved || (string)$saved['token_hash'] !== $hash || (string)$saved['pending_email'] !== $newEmail || (string)$saved['verification_required'] !== '1') throw new Exception('Email verification could not be saved. Please try again.');
        } catch (Exception $error) {
            ww_ev_unlock();
            throw $error;
        }
        ww_ev_unlock();
        // No network/mail operations while the database mutation lock is held.
        $url = 'https://www.weddingwin.ca' . $verifyPath . '?token=' . rawurlencode($token);
        $headers = 'From: WeddingWin.ca <noreply@weddingwin.ca>' . PHP_EOL . 'Reply-To: noreply@weddingwin.ca' . PHP_EOL . 'Content-Type: text/plain; charset=UTF-8';
        $body = 'Confirm your WeddingWin contact email by opening this link and choosing Confirm Email:' . PHP_EOL . $url . PHP_EOL . PHP_EOL . 'The link expires in 24 hours. Your current email stays unchanged until you confirm. If you did not request this, ignore this email.';
        if (!@mail($newEmail, 'Confirm your WeddingWin email', $body, $headers)) throw new Exception('Your request was saved, but the email could not be sent. Please try again in a minute.');
        if (filter_var($oldEmail, FILTER_VALIDATE_EMAIL)) @mail($oldEmail, 'WeddingWin email change requested', 'A request was made to change your WeddingWin contact email. It will change only after the new address is confirmed. If this was not you, contact WeddingWin support.', $headers);
        return 'Check your email for the confirmation link. Your current email has not changed.';
    }
    function ww_ev_confirm($token) {
        if (!preg_match('/^[a-f0-9]{64}$/D', (string)$token)) throw new Exception('This confirmation link is invalid or has already been used.');
        $hash = hash('sha256', $token);
        $result = ww_ev_query("SELECT user_id FROM ww_email_verification_state WHERE token_hash='" . $hash . "' LIMIT 2");
        $row = mysql_fetch_assoc($result);
        if (!$row || mysql_fetch_assoc($result)) throw new Exception('This confirmation link is invalid or has already been used. Please request a new email.');
        $id = ww_ev_member_id($row['user_id']);
        ww_ev_lock();
        try {
            $private = ww_ev_private_state($id);
            if (!$private || !function_exists('hash_equals') || !hash_equals((string)$private['token_hash'], $hash)) throw new Exception('This confirmation link is invalid or has already been used.');
            $member = ww_ev_user($id);
            $state = ww_email_verification_state($member);
            $oldEmail = (string)$private['existing_email'];
            if ($state['email_verification_status'] !== 'pending') throw new Exception('This link has expired. Request a new confirmation email.');
            $next = $state['pending_email'];
            if (!$next || ww_ev_is_relay($next)) throw new Exception('Please request confirmation for a direct contact email.');
            if ($oldEmail === '' || ($state['current_email'] !== $oldEmail && $state['current_email'] !== $next)) throw new Exception('Your account email changed after this request. Please request a new confirmation email.');
            $owner = ww_ev_owner($next);
            if ($owner !== '' && $owner !== (string)$id) throw new Exception('That email is already connected to another WeddingWin account.');
            ww_ev_query("UPDATE users_data SET email='" . ww_ev_db_escape($next) . "' WHERE user_id='" . $id . "' AND LOWER(email)='" . ww_ev_db_escape($state['current_email']) . "' LIMIT 1");
            $updated = ww_ev_user($id);
            if (strtolower(trim($updated['email'])) !== $next || ww_ev_owner($next) !== (string)$id) throw new Exception('Your email update could not be confirmed. Please try again.');
            ww_ev_query("UPDATE ww_email_verification_state SET confirmed_email='" . ww_ev_db_escape($next) . "',confirmed_at='" . gmdate('Y-m-d H:i:s') . "',verification_required=0,pending_email=NULL,existing_email=NULL,token_hash=NULL,requested_at=NULL WHERE user_id='" . $id . "' AND token_hash='" . $hash . "' LIMIT 1");
            $confirmed = ww_email_verification_state($updated);
            if ($confirmed['email_verification_status'] !== 'confirmed' || $confirmed['email_confirmation_required']) throw new Exception('Your email confirmation could not be saved. Please try again.');
        } catch (Exception $error) {
            ww_ev_unlock();
            throw $error;
        }
        ww_ev_unlock();
        return $updated;
    }
}
/* WW_EMAIL_VERIFICATION_CORE_END */

/**
 * WeddingWin new-thread abuse guard.
 *
 * This widget is called before BD's init-pmb-thread action. It intentionally
 * does not handle add-thread-message, so replies in existing chats are not
 * rate-limited by this protection.
 */

$json = array(
    'result' => 'error',
    'message' => 'Unable to verify this new conversation. Please try again.'
);

if (!isset($_POST['subaction']) || $_POST['subaction'] !== 'ww-chat-guard-check') {
    $json['message'] = 'Invalid chat guard request.';
    echo json_encode($json);
die();
}

// Reject cross-site requests while still allowing clients that omit Origin.
$wwGuardOrigin = isset($_SERVER['HTTP_ORIGIN']) ? parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) : '';
$wwGuardHost = isset($_SERVER['HTTP_HOST']) ? strtolower(preg_replace('/:[0-9]+$/', '', $_SERVER['HTTP_HOST'])) : '';
if (!empty($wwGuardOrigin) && strtolower($wwGuardOrigin) !== $wwGuardHost) {
    $json['message'] = 'Invalid request origin.';
    echo json_encode($json);
die();
}

if (empty($_COOKIE['userid'])) {
    $json['message'] = 'Please log in before starting a conversation.';
    echo json_encode($json);
die();
}

$wwGuardSender = getUser($_COOKIE['userid'], $w);
$wwGuardSenderId = !empty($wwGuardSender['user_id']) ? intval($wwGuardSender['user_id']) : 0;
$wwGuardRecipientId = isset($_POST['recipient_id']) ? intval($_POST['recipient_id']) : 0;

$wwGuardSenderEmail = isset($wwGuardSender['email']) ? strtolower(trim($wwGuardSender['email'])) : '';
$wwGuardEmailAt = strrpos($wwGuardSenderEmail, '@');
$wwGuardEmailLocal = $wwGuardEmailAt !== false ? substr($wwGuardSenderEmail, 0, $wwGuardEmailAt) : '';
$wwGuardEmailDomain = $wwGuardEmailAt !== false ? substr($wwGuardSenderEmail, $wwGuardEmailAt + 1) : '';
$wwGuardSignupRiskReason = '';

foreach (array('trapuniversity') as $wwGuardBlockedLocalPart) {
    if ($wwGuardEmailLocal !== '' && strpos($wwGuardEmailLocal, $wwGuardBlockedLocalPart) !== false) {
        $wwGuardSignupRiskReason = 'blocked_email_pattern';
        break;
    }
}
if ($wwGuardSignupRiskReason === '' && in_array($wwGuardEmailDomain, array('mxt20constructions.com'), true)) {
    $wwGuardSignupRiskReason = 'blocked_email_domain';
}

$wwGuardSignupTimestamp = !empty($wwGuardSender['signup_date']) ? strtotime($wwGuardSender['signup_date']) : false;
$wwGuardIsNewAccount = ($wwGuardSignupTimestamp !== false && $wwGuardSignupTimestamp >= (time() - 86400));

if ($wwGuardSenderId < 1 || $wwGuardRecipientId < 1 || $wwGuardSenderId === $wwGuardRecipientId) {
    $json['message'] = 'Unable to identify the conversation participants.';
    echo json_encode($json);
die();
}

if (isset($wwGuardSender['active']) && intval($wwGuardSender['active']) !== 2) {
    $json['message'] = 'This account cannot start new conversations.';
    echo json_encode($json);
die();
}

// The ordinary website preflight gives a friendly error before creating any
// abuse-guard event or sending a message. Database triggers separately guard
// proprietary add-on/API writes, including replies which skip this preflight.
try {
    $wwGuardFreshMember = ww_ev_current_member();
    if ((string)$wwGuardFreshMember['user_id'] !== (string)$wwGuardSenderId) {
        throw new Exception('The signed-in member changed.');
    }
    $wwGuardEmailState = ww_email_verification_state($wwGuardFreshMember);
    if ($wwGuardEmailState['email_confirmation_required']) {
        ww_ev_json(array('result' => 'email_confirmation_required',
            'message' => 'Confirm your new email address before sending messages.'), 403);
    }
} catch (Exception $error) {
    ww_ev_json(array('result' => 'error',
        'message' => 'We could not check your email confirmation. Please try again shortly.'), 503);
}


$wwGuardRecipient = getUser($wwGuardRecipientId, $w);
if (empty($wwGuardRecipient['user_id']) || intval($wwGuardRecipient['active']) !== 2) {
    $json['message'] = 'This member is not currently available for new conversations.';
    echo json_encode($json);
die();
}

$wwGuardMessage = isset($_POST['message']) ? trim(strip_tags(html_entity_decode($_POST['message'], ENT_QUOTES, 'UTF-8'))) : '';
if ($wwGuardMessage === '') {
    $json['message'] = 'Please enter a message before sending.';
    echo json_encode($json);
die();
}

// Normalize copied messages without storing message content.
$wwGuardNormalized = strtolower($wwGuardMessage);
$wwGuardNormalized = str_replace(array(chr(9), chr(10), chr(13), '.', ',', '!', '?', ';', ':', '"', "'", '-', '_', '(', ')', '[', ']', '{', '}'), ' ', $wwGuardNormalized);
while (strpos($wwGuardNormalized, '  ') !== false) {
    $wwGuardNormalized = str_replace('  ', ' ', $wwGuardNormalized);
}
$wwGuardMessageHash = hash('sha256', trim($wwGuardNormalized));
$wwGuardIp = '';
if (!empty($_SERVER['HTTP_CF_CONNECTING_IP']) && filter_var($_SERVER['HTTP_CF_CONNECTING_IP'], FILTER_VALIDATE_IP)) {
    $wwGuardIp = $_SERVER['HTTP_CF_CONNECTING_IP'];
} elseif (!empty($_SERVER['REMOTE_ADDR']) && filter_var($_SERVER['REMOTE_ADDR'], FILTER_VALIDATE_IP)) {
    $wwGuardIp = $_SERVER['REMOTE_ADDR'];
}
$wwGuardIpHash = hash('sha256', $wwGuardIp . '|' . intval($w['website_id']));
$wwGuardHasClientIp = ($wwGuardIp !== '');
$wwGuardDb = brilliantDirectories::getDatabaseConfiguration('database');

// Dedicated evidence table: no message bodies, email addresses, or raw IPs.
$wwGuardCreate = mysql($wwGuardDb, "CREATE TABLE IF NOT EXISTS `ww_chat_guard_events` (
    `event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `recipient_id` INT UNSIGNED NOT NULL,
    `message_hash` CHAR(64) NOT NULL,
    `ip_hash` CHAR(64) NOT NULL,
    `decision` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME NOT NULL,
    PRIMARY KEY (`event_id`),
    KEY `idx_wwcg_user_created` (`user_id`,`created_at`),
    KEY `idx_wwcg_user_message_created` (`user_id`,`message_hash`,`created_at`),
    KEY `idx_wwcg_ip_created` (`ip_hash`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

if ($wwGuardCreate === false) {
    $json['message'] = 'The chat safety service is temporarily unavailable.';
    echo json_encode($json);
die();
}

if (!function_exists('wwChatGuardCount')) {
    function wwChatGuardCount($db, $sql) {
        $result = mysql($db, $sql);
        if ($result === false) {
            return 0;
        }
        $row = mysql_fetch_assoc($result);
        return isset($row['total']) ? intval($row['total']) : 0;
    }
}

if (!function_exists('wwChatGuardInsert')) {
    function wwChatGuardInsert($db, $userId, $recipientId, $messageHash, $ipHash, $decision, $reason) {
        $decision = mysql_real_escape_string($decision);
        $reason = mysql_real_escape_string($reason);
        return mysql($db, "INSERT INTO `ww_chat_guard_events`
            (`user_id`,`recipient_id`,`message_hash`,`ip_hash`,`decision`,`reason`,`created_at`)
            VALUES (" . intval($userId) . "," . intval($recipientId) . ",'" . $messageHash . "','" . $ipHash . "','" . $decision . "','" . $reason . "',NOW())");
    }
}

$wwGuardLockName = 'ww_chat_guard_' . $wwGuardSenderId;
$wwGuardLockQuery = mysql($wwGuardDb, "SELECT GET_LOCK('" . $wwGuardLockName . "', 5) AS `guard_lock`");
$wwGuardLockRow = $wwGuardLockQuery !== false ? mysql_fetch_assoc($wwGuardLockQuery) : false;
if ($wwGuardLockRow === false || intval($wwGuardLockRow['guard_lock']) !== 1) {
    $json['result'] = 'rate_limited';
    $json['wait_seconds'] = 5;
    $json['message'] = 'Another conversation is already being processed. Please wait a moment.';
    echo json_encode($json);
die();
}

$wwGuardUser = intval($wwGuardSenderId);
$wwGuardUserWhere = "`user_id`=" . $wwGuardUser;
$wwGuardAllowed = "`decision`='allowed'";

if ($wwGuardSignupRiskReason !== '') {
    mysql($wwGuardDb, "UPDATE `users_data` SET `active`='4' WHERE `user_id`=" . $wwGuardUser . " AND `active`='2' LIMIT 1");
    wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'on_hold', $wwGuardSignupRiskReason);
    mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");
    $json['result'] = 'blocked';
    $json['message'] = 'This account cannot start new conversations. Please contact WeddingWin support if you believe this is an error.';
    echo json_encode($json);
die();
}

// Production limits apply uniformly to every member.
$wwGuardMinSeconds = 15;
$wwGuardChallengeMinutePrior = 2;
$wwGuardChallengeTenPrior = 7;
$wwGuardHardTenPrior = 9;
$wwGuardHardHourPrior = 24;
$wwGuardHardDayPrior = 49;

$wwGuardLastQuery = mysql($wwGuardDb, "SELECT TIMESTAMPDIFF(SECOND, MAX(`created_at`), NOW()) AS `seconds_since`
    FROM `ww_chat_guard_events` WHERE " . $wwGuardUserWhere . " AND " . $wwGuardAllowed);
$wwGuardLastRow = $wwGuardLastQuery !== false ? mysql_fetch_assoc($wwGuardLastQuery) : false;
$wwGuardSecondsSince = ($wwGuardLastRow !== false && $wwGuardLastRow['seconds_since'] !== null) ? intval($wwGuardLastRow['seconds_since']) : 999999;

$wwGuardRecentHard = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
    WHERE " . $wwGuardUserWhere . " AND (
        (`decision`='hard_block' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 HOUR))
        OR (`decision`='hard_block_24h' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 DAY))
    )");
if ($wwGuardRecentHard > 0) {
    mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");
    $json['result'] = 'blocked';
    $json['message'] = 'Starting new conversations is temporarily paused for this account. Existing conversations remain available.';
    echo json_encode($json);
die();
}

if ($wwGuardSecondsSince < $wwGuardMinSeconds) {
    $wwGuardWait = max(1, $wwGuardMinSeconds - $wwGuardSecondsSince);
    wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'rate_limited', 'minimum_interval');
    mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");
    $json['result'] = 'rate_limited';
    $json['wait_seconds'] = $wwGuardWait;
    $json['message'] = 'Please wait ' . $wwGuardWait . ' seconds before starting another conversation.';
    echo json_encode($json);
die();
}

$wwGuardCount60 = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
    WHERE " . $wwGuardUserWhere . " AND " . $wwGuardAllowed . " AND `created_at` >= DATE_SUB(NOW(), INTERVAL 60 SECOND)");
$wwGuardCount10 = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
    WHERE " . $wwGuardUserWhere . " AND " . $wwGuardAllowed . " AND `created_at` >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
$wwGuardCountHour = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
    WHERE " . $wwGuardUserWhere . " AND " . $wwGuardAllowed . " AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 HOUR)");
$wwGuardCountDay = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
    WHERE " . $wwGuardUserWhere . " AND " . $wwGuardAllowed . " AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
$wwGuardDuplicate10 = wwChatGuardCount($wwGuardDb, "SELECT COUNT(DISTINCT `recipient_id`) AS `total` FROM `ww_chat_guard_events`
    WHERE " . $wwGuardUserWhere . " AND " . $wwGuardAllowed . " AND `message_hash`='" . $wwGuardMessageHash . "'
    AND `created_at` >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
$wwGuardCaptchaTrust = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
    WHERE " . $wwGuardUserWhere . " AND `decision`='captcha_pass' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)");

$wwGuardIpAllowed60 = 0;
$wwGuardIpAllowed10 = 0;
$wwGuardIpAllowedHour = 0;
$wwGuardIpAllowedDay = 0;
$wwGuardIpDistinctUsersDay = 0;
if ($wwGuardHasClientIp) {
    $wwGuardIpAllowed60 = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
        WHERE `ip_hash`='" . $wwGuardIpHash . "' AND `decision`='allowed' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 60 SECOND)");
    $wwGuardIpAllowed10 = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
        WHERE `ip_hash`='" . $wwGuardIpHash . "' AND `decision`='allowed' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
    $wwGuardIpAllowedHour = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
        WHERE `ip_hash`='" . $wwGuardIpHash . "' AND `decision`='allowed' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    $wwGuardIpAllowedDay = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
        WHERE `ip_hash`='" . $wwGuardIpHash . "' AND `decision`='allowed' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
    $wwGuardIpDistinctUsersDay = wwChatGuardCount($wwGuardDb, "SELECT COUNT(DISTINCT `user_id`) AS `total` FROM `ww_chat_guard_events`
        WHERE `ip_hash`='" . $wwGuardIpHash . "' AND `decision`='allowed' AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
}

$wwGuardIpHardReason = '';
if ($wwGuardIpAllowed10 >= 18) {
    $wwGuardIpHardReason = 'ip_ten_minute_limit';
} elseif ($wwGuardIpAllowedHour >= 40) {
    $wwGuardIpHardReason = 'ip_hourly_limit';
} elseif ($wwGuardIpAllowedDay >= 100) {
    $wwGuardIpHardReason = 'ip_daily_limit';
}

if ($wwGuardIpHardReason !== '') {
    wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'hard_block_24h', $wwGuardIpHardReason);
    mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");
    $json['result'] = 'blocked';
    $json['message'] = 'Starting new conversations from this network is paused for 24 hours. Existing conversations remain available.';
    echo json_encode($json);
die();
}

$wwGuardHardReason = '';
if ($wwGuardCount10 >= $wwGuardHardTenPrior) {
    $wwGuardHardReason = 'ten_minute_limit';
} elseif ($wwGuardCountHour >= $wwGuardHardHourPrior) {
    $wwGuardHardReason = 'hourly_limit';
} elseif ($wwGuardCountDay >= $wwGuardHardDayPrior) {
    $wwGuardHardReason = 'daily_limit';
}

if ($wwGuardHardReason !== '') {
    $wwGuardPriorHard24 = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
        WHERE " . $wwGuardUserWhere . " AND `decision` IN ('hard_block','hard_block_24h','on_hold')
        AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
    $wwGuardPriorHard7 = wwChatGuardCount($wwGuardDb, "SELECT COUNT(*) AS `total` FROM `ww_chat_guard_events`
        WHERE " . $wwGuardUserWhere . " AND `decision` IN ('hard_block','hard_block_24h','on_hold')
        AND `created_at` >= DATE_SUB(NOW(), INTERVAL 7 DAY)");

    if ($wwGuardPriorHard7 >= 2) {
        mysql($wwGuardDb, "UPDATE `users_data` SET `active`='4' WHERE `user_id`=" . $wwGuardUser . " AND `active`='2' LIMIT 1");
        wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'on_hold', $wwGuardHardReason);
        $json['message'] = 'This account has been placed On Hold after repeated automated-looking chat activity. Existing evidence has been preserved.';
    } elseif ($wwGuardPriorHard24 >= 1) {
        wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'hard_block_24h', $wwGuardHardReason);
        $json['message'] = 'Starting new conversations is paused for 24 hours. Existing conversations remain available.';
    } else {
        wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'hard_block', $wwGuardHardReason);
        $json['message'] = 'Starting new conversations is paused for one hour. Existing conversations remain available.';
    }

    mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");
    $json['result'] = 'blocked';
    echo json_encode($json);
die();
}

$wwGuardNeedsCaptcha = (
    $wwGuardIsNewAccount
    || $wwGuardCount60 >= $wwGuardChallengeMinutePrior
    || $wwGuardCount10 >= $wwGuardChallengeTenPrior
    || $wwGuardDuplicate10 >= 2
    || $wwGuardIpAllowed60 >= 4
    || $wwGuardIpAllowed10 >= 12
    || ($wwGuardIpDistinctUsersDay >= 3 && $wwGuardIpAllowedHour >= 8)
);
$wwGuardCaptchaToken = isset($_POST['captcha_token']) ? trim($_POST['captcha_token']) : '';

if ($wwGuardNeedsCaptcha && $wwGuardCaptchaTrust < 1) {
    if ($wwGuardCaptchaToken === '') {
        wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'challenge_required', 'suspicious_new_thread_rate');
        mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");
        $json['result'] = 'challenge_required';
        $json['site_key'] = isset($w['recaptcha_site_key']) ? $w['recaptcha_site_key'] : '';
        $json['message'] = 'Please complete this quick security check before starting another conversation.';
        echo json_encode($json);
die();
    }

    if (reCaptchaCheck($wwGuardCaptchaToken, $w) !== true) {
        wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'challenge_failed', 'invalid_recaptcha');
        mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");
        $json['result'] = 'challenge_required';
        $json['site_key'] = isset($w['recaptcha_site_key']) ? $w['recaptcha_site_key'] : '';
        $json['message'] = 'The security check expired or was unsuccessful. Please try it again.';
        echo json_encode($json);
die();
    }

    wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'captcha_pass', 'recaptcha_verified');
}

wwChatGuardInsert($wwGuardDb, $wwGuardSenderId, $wwGuardRecipientId, $wwGuardMessageHash, $wwGuardIpHash, 'allowed', 'new_thread');
mysql($wwGuardDb, "SELECT RELEASE_LOCK('" . $wwGuardLockName . "')");

$json['result'] = 'allow';
$json['message'] = 'New conversation approved.';
$json['minimum_interval'] = $wwGuardMinSeconds;

// Opportunistic retention cleanup; message content and raw IP addresses are never stored.
if (mt_rand(1, 100) === 1) {
    mysql($wwGuardDb, "DELETE FROM `ww_chat_guard_events` WHERE `created_at` < DATE_SUB(NOW(), INTERVAL 30 DAY)");
}
echo json_encode($json);
die();
?>
