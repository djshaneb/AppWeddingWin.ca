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
?>
