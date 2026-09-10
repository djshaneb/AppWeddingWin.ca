<?php
// Offline integration harness: real widget core, mocked BD/MySQL and mail only.
$corePath = isset($argv[1]) ? $argv[1] : '/workspace/brilliant-directories/widgets/email-verification-core.php';
$w = array('database' => 'offline');
$members = array(); $privateRows = array(); $legacy = array(); $mailbox = array(); $failQuery = ''; $locked = false; $checks = 0; $failMail = false;
class OfflineRows { public $rows; function __construct($rows) { $this->rows = $rows; } }
function mysql_fetch_assoc($result) { return count($result->rows) ? array_shift($result->rows) : false; }
function mysql_real_escape_string($text) { return addslashes($text); }
function mysql($database, $sql) {
    global $members, $privateRows, $legacy, $failQuery, $locked;
    if ($failQuery !== '' && strpos($sql, $failQuery) !== false) return false;
    if (strpos($sql, 'SELECT GET_LOCK(') === 0) { $locked = true; return new OfflineRows(array(array('acquired' => 1))); }
    if (strpos($sql, 'SELECT RELEASE_LOCK(') === 0) { $locked = false; return new OfflineRows(array()); }
    if (preg_match("/SELECT user_id,email,active FROM users_data WHERE user_id='([0-9]+)'/", $sql, $m)) return new OfflineRows(isset($members[$m[1]]) ? array($members[$m[1]]) : array());
    if (preg_match("/SELECT \* FROM ww_email_verification_state WHERE user_id='([0-9]+)'/", $sql, $m)) return new OfflineRows(isset($privateRows[$m[1]]) ? array($privateRows[$m[1]]) : array());
    if (preg_match("/SELECT `value` FROM users_meta .*database_id='([0-9]+)' AND `key`='([^']+)'/", $sql, $m)) return new OfflineRows(isset($legacy[$m[1]][$m[2]]) ? array(array('value' => $legacy[$m[1]][$m[2]])) : array());
    if (preg_match("/SELECT user_id FROM users_data WHERE LOWER\(email\)='([^']+)'/", $sql, $m)) {
        $rows = array(); foreach ($members as $member) if (strtolower($member['email']) === stripslashes($m[1])) $rows[] = array('user_id' => $member['user_id']); return new OfflineRows($rows);
    }
    if (preg_match("/SELECT user_id FROM ww_email_verification_state WHERE token_hash='([^']+)'/", $sql, $m)) {
        $rows = array(); foreach ($privateRows as $id => $row) if ($row['token_hash'] === $m[1]) $rows[] = array('user_id' => (string)$id); return new OfflineRows($rows);
    }
    if (preg_match("/INSERT INTO ww_email_verification_state .* VALUES \('([0-9]+)',1,'([^']+)','([^']+)','([^']+)','([^']+)',1\)/", $sql, $m)) {
        $old = isset($privateRows[$m[1]]) ? $privateRows[$m[1]] : array();
        $privateRows[$m[1]] = array('user_id' => $m[1], 'verification_required' => '1', 'pending_email' => stripslashes($m[2]), 'existing_email' => stripslashes($m[3]), 'token_hash' => $m[4], 'requested_at' => $m[5], 'confirmed_email' => isset($old['confirmed_email']) ? $old['confirmed_email'] : null, 'confirmed_at' => isset($old['confirmed_at']) ? $old['confirmed_at'] : null, 'generation' => isset($old['generation']) ? $old['generation'] + 1 : 1);
        return new OfflineRows(array());
    }
    if (preg_match("/UPDATE users_data SET email='([^']+)' WHERE user_id='([0-9]+)' AND LOWER\(email\)='([^']+)'/", $sql, $m)) {
        if (strtolower($members[$m[2]]['email']) === stripslashes($m[3])) $members[$m[2]]['email'] = stripslashes($m[1]); return new OfflineRows(array());
    }
    if (preg_match("/UPDATE ww_email_verification_state SET confirmed_email='([^']+)',confirmed_at='([^']+)'.* WHERE user_id='([0-9]+)' AND token_hash='([^']+)'/", $sql, $m)) {
        if ($privateRows[$m[3]]['token_hash'] === $m[4]) { $row =& $privateRows[$m[3]]; $row['confirmed_email'] = stripslashes($m[1]); $row['confirmed_at'] = $m[2]; $row['verification_required'] = '0'; foreach (array('pending_email','existing_email','token_hash','requested_at') as $key) $row[$key] = null; } return new OfflineRows(array());
    }
    throw new Exception('Unexpected offline query: ' . $sql);
}
function ww_test_mail($to, $subject, $body, $headers) { global $mailbox, $locked, $failMail; if ($locked) throw new Exception('Mail called while mutation lock is held'); $mailbox[] = array('to' => $to, 'body' => $body); return !$failMail; }
class user { static function isUserLogged($cookies) { return isset($cookies['userid']) && $cookies['userid'] === 'encoded-cookie'; } }
function getUser($cookie, $w) { global $members; return $cookie === 'encoded-cookie' ? $members['101'] : false; }
$source = file_get_contents($corePath);
if (!is_string($source) || strpos($source, 'WW_EMAIL_VERIFICATION_CORE_START') === false) throw new Exception('Missing shared core');
// Replace the two mail transport calls only; no request/state/security logic changed.
eval('?>' . str_replace('@mail(', 'ww_test_mail(', $source));
function check($value, $label) { global $checks; if (!$value) throw new Exception('FAILED: ' . $label); $checks++; }
function rejects($callback, $label) { $failed = false; try { $callback(); } catch (Exception $error) { $failed = true; } check($failed, $label); }
function reset_fixture() {
    global $members, $privateRows, $legacy, $mailbox, $failQuery, $locked, $failMail;
    $members = array('101' => array('user_id' => '101', 'email' => 'relay-test@privaterelay.appleid.com', 'active' => '2'));
    $privateRows = array(); $legacy = array(); $mailbox = array(); $failQuery = ''; $locked = false; $failMail = false;
}
function requested_token() { global $mailbox; foreach ($mailbox as $mail) if (preg_match('/[?]token=([a-f0-9]{64})/', $mail['body'], $m)) return $m[1]; throw new Exception('Missing offline mail token'); }
reset_fixture();
foreach (array('', '0', '01', '-1', '1e2', '101extra', '99999999999999999999') as $id) rejects(function() use ($id) { ww_ev_member_id($id); }, 'reject malformed member id');
check(ww_ev_member_id('101') === 101, 'canonical id');
$_COOKIE = array('userid' => 'encoded-cookie');
check(ww_ev_current_member()['user_id'] === '101', 'encoded authenticated cookie resolved before numeric lookup');
$_COOKIE['userid'] = '101'; rejects(function() { ww_ev_current_member(); }, 'numeric forged cookie rejected');
check(ww_email_verification_state($members['101'])['email_verification_status'] === 'none', 'ordinary missing state has no fabricated proof');
check(ww_ev_is_relay(' RELAY-TEST@PRIVATERELAY.APPLEID.COM '), 'relay case trim');
check(!ww_ev_is_relay('test@privaterelay.appleid.com.attacker.invalid'), 'relay exact suffix');
$legacy['101'] = array('custom_pending_email' => 'next@example.invalid', 'custom_email_confirmed_email' => $members['101']['email'], 'custom_email_confirmed_at' => gmdate('Y-m-d H:i:s'));
$state = ww_email_verification_state($members['101']); check($state['email_confirmation_required'] && $state['email_verification_status'] === 'expired', 'legacy metadata only blocks; cannot confirm');
reset_fixture();
rejects(function() { ww_ev_send(ww_ev_user('101'), 'other@privaterelay.appleid.com', '/verify-email-change'); }, 'relay target rejected on server');
rejects(function() { ww_ev_send(ww_ev_user('101'), 'valid@example.invalid', 'https://evil.invalid'); }, 'arbitrary verification URL rejected');
ww_ev_send(ww_ev_user('101'), 'DIRECT@example.invalid', '/verify-email-change');
$token = requested_token(); $state = ww_email_verification_state($members['101']);
check($state['email_confirmation_required'] && $state['pending_email'] === 'direct@example.invalid' && $state['email_verification_status'] === 'pending', 'pending request canonical');
check($members['101']['email'] === 'relay-test@privaterelay.appleid.com', 'request never changes current email');
check($privateRows['101']['token_hash'] === hash('sha256', $token) && $privateRows['101']['token_hash'] !== $token, 'only hashed token stored');
check(!$locked && count($mailbox) === 2, 'lock released before confirmation mail and old-email notice');
rejects(function() { ww_ev_send(ww_ev_user('101'), 'other@example.invalid', '/verify-email-change'); }, 'resend throttled');
check(!$locked, 'failure releases lock');
rejects(function() { ww_ev_confirm(str_repeat('f', 64)); }, 'wrong token cannot confirm');
$confirmed = ww_ev_confirm($token); $state = ww_email_verification_state($confirmed);
check($confirmed['email'] === 'direct@example.invalid', 'proof updates exact member email');
check($state['email_verification_status'] === 'confirmed' && !$state['email_confirmation_required'] && $state['pending_email'] === null, 'confirmed durable marker bound to current email');
check(!$locked && $privateRows['101']['token_hash'] === null, 'token consumed and lock released');
rejects(function() use ($token) { ww_ev_confirm($token); }, 'replayed token rejected');
$members['101']['email'] = 'different@example.invalid'; check(ww_email_verification_state($members['101'])['email_verification_status'] !== 'confirmed', 'proof does not follow unproved address');
reset_fixture(); ww_ev_send(ww_ev_user('101'), 'direct@example.invalid', '/verify-email-change-app'); $token = requested_token();
$privateRows['101']['requested_at'] = gmdate('Y-m-d H:i:s', time() - 86401);
$state = ww_email_verification_state($members['101']); check($state['email_verification_status'] === 'expired' && $state['email_confirmation_required'], 'expired request stays blocked');
rejects(function() use ($token) { ww_ev_confirm($token); }, 'expired token rejected');
$privateRows['101']['pending_email'] = null; check(ww_email_verification_state($members['101'])['email_confirmation_required'], 'persistent required flag survives missing pending value');
reset_fixture(); ww_ev_send(ww_ev_user('101'), 'direct@example.invalid', '/verify-email-change-app'); $token = requested_token();
$members['101']['email'] = 'unexpected@example.invalid'; rejects(function() use ($token) { ww_ev_confirm($token); }, 'unexpected current email mismatch rejected');
reset_fixture(); ww_ev_send(ww_ev_user('101'), 'direct@example.invalid', '/verify-email-change-app'); $token = requested_token();
$members['202'] = array('user_id' => '202', 'email' => 'direct@example.invalid', 'active' => '2'); rejects(function() use ($token) { ww_ev_confirm($token); }, 'target acquired by another member rejected');
check($members['101']['email'] === 'relay-test@privaterelay.appleid.com', 'conflict leaves original email');
reset_fixture(); ww_ev_send(ww_ev_user('101'), 'direct@example.invalid', '/verify-email-change-app'); $token = requested_token();
$failQuery = 'UPDATE ww_email_verification_state'; rejects(function() use ($token) { ww_ev_confirm($token); }, 'partial proof save fails closed');
check(ww_email_verification_state($members['101'])['email_confirmation_required'], 'partial change stays blocked');
$failQuery = ''; check(ww_ev_confirm($token)['email'] === 'direct@example.invalid', 'safe retry completes partial BD update');
reset_fixture(); $failQuery = 'SELECT * FROM ww_email_verification_state'; rejects(function() { ww_email_verification_state(ww_ev_user('101')); }, 'missing private table fails closed');
reset_fixture(); $_SERVER['HTTP_ORIGIN'] = 'https://evil.invalid'; rejects(function() { ww_ev_require_origin(); }, 'foreign origin rejected');
$_SERVER['HTTP_ORIGIN'] = 'null'; rejects(function() { ww_ev_require_origin(); }, 'null origin remains rejected');
unset($_SERVER['HTTP_ORIGIN']); rejects(function() { ww_ev_require_origin(); }, 'missing origin remains rejected');
$_SERVER['HTTP_ORIGIN'] = 'https://www.weddingwin.ca'; ww_ev_require_origin(); check(true, 'exact first-party origin accepted');
reset_fixture(); $failMail = true; rejects(function() { ww_ev_send(ww_ev_user('101'), 'direct@example.invalid', '/verify-email-change'); }, 'mail transport failure reported');
check(ww_email_verification_state($members['101'])['email_confirmation_required'] && !$locked, 'mail failure retains pending proof and releases lock');
reset_fixture(); ww_ev_send(ww_ev_user('101'), 'direct@example.invalid', '/verify-email-change'); $oldToken = requested_token();
$privateRows['101']['requested_at'] = gmdate('Y-m-d H:i:s', time() - 61); $mailbox = array();
ww_ev_send(ww_ev_user('101'), 'new@example.invalid', '/verify-email-change'); $newToken = requested_token();
rejects(function() use ($oldToken) { ww_ev_confirm($oldToken); }, 'resend invalidates previous link');
check(ww_ev_confirm($newToken)['email'] === 'new@example.invalid', 'resend confirms only newest target');
reset_fixture(); $members['101']['active'] = '1'; rejects(function() { ww_ev_user('101'); }, 'inactive member rejected');

// Run actual signed-request helper using an offline-only fixture key.
function ww_aecv_secrets() { return array(str_repeat('offline-test-key-', 3)); }
$pageSource = file_get_contents(dirname($corePath) . '/email-verification-page.php');
$headerAt = strpos($pageSource, "@header('Cache-Control: no-store');");
check($headerAt !== false, 'page declaration boundary found');
eval('?>' . substr($pageSource, 0, $headerAt));
$expires = (string)(time() + 120); $key = ww_aecv_secrets()[0];
$signature = hash_hmac('sha256', 'status_app|101|' . $expires, $key);
check(ww_ev_signed_request('status_app', '101', '', $expires, $signature), 'purpose-bound status signature accepted');
check(!ww_ev_signed_request('status_app', '202', '', $expires, $signature), 'status signature binds exact member');
check(!ww_ev_signed_request('request_app', '101', '', $expires, $signature), 'status signature cannot send mail');
check(!ww_ev_signed_request('status_app', '101', '', (string)(time() - 1), $signature), 'expired signature rejected');
check(!ww_ev_signed_request('status_app', '101', '', (string)(time() + 301), $signature), 'long status TTL rejected');
check(!ww_ev_signed_request('status_app', '101', '', $expires, strtoupper($signature)), 'signature canonical lowercase required');
$legacySignature = hash_hmac('sha256', '101|direct@example.invalid|' . $expires, $key);
check(ww_ev_signed_request('request_app', '101', 'DIRECT@example.invalid', $expires, $legacySignature), 'existing app request signature preserved');
check(!ww_ev_signed_request('status_app', '101', 'direct@example.invalid', $expires, $legacySignature), 'request signature cannot read status');
check(!ww_ev_signed_request('request_app', '101', 'different@example.invalid', $expires, $legacySignature), 'request signature binds target address');

// Render the actual website widget with a real pending test token; GET does not consume it.
reset_fixture(); ww_ev_send(ww_ev_user('101'), 'direct@example.invalid', '/verify-email-change'); $token = requested_token();
$_GET = array('token' => $token); $_POST = array(); $_SERVER['REQUEST_METHOD'] = 'GET';
ob_start(); include dirname($corePath) . '/320-email-change-verification.php'; $html = ob_get_clean();
check(strpos($html, 'data-email-confirm-form') !== false && strpos($html, 'method="post"') !== false, 'GET renders explicit confirmation form');
check($privateRows['101']['token_hash'] === hash('sha256', $token) && $members['101']['email'] === 'relay-test@privaterelay.appleid.com', 'GET preview does not consume or mutate');
echo 'PASS: ' . $checks . ' offline PHP verification assertions; no network or real email.' . PHP_EOL;
