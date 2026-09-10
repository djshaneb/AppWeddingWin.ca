<?php
/* WW_EMAIL_VERIFICATION_PAGE_START */
// $wwEvApp is a fixed deployment value, never supplied by a request.
if (!function_exists('ww_aecv_secrets')) {
    // Deployment injects the private configuration from the current app widget.
    // Never publish this fail-closed repository stub without secure substitution.
    function ww_aecv_secrets() { /* WW_PRIVATE_EMAIL_CHANGE_SECRETS */ return array(); }
}
if (!function_exists('ww_ev_signed_request')) {
    function ww_ev_signed_request($action, $id, $email, $expires, $signature) {
        if (!is_string($expires) || !preg_match('/^[1-9][0-9]{9}$/D', $expires) || !is_string($signature) || !preg_match('/^[a-f0-9]{64}$/D', $signature)) return false;
        $ttl = $action === 'status_app' ? 300 : 600;
        if (intval($expires) <= time() || intval($expires) > time() + $ttl || !function_exists('hash_equals')) return false;
        if ($action === 'status_app') $payload = 'status_app|' . $id . '|' . $expires;
        elseif ($action === 'request_app') $payload = $id . '|' . strtolower(trim($email)) . '|' . $expires;
        else return false;
        foreach (ww_aecv_secrets() as $secret) {
            if (is_string($secret) && strlen($secret) >= 32 && hash_equals(hash_hmac('sha256', $payload, $secret), $signature)) return true;
        }
        return false;
    }
    function ww_ev_sync_confirmed($member) {
        if (!function_exists('curl_init')) return false;
        $id = (string)ww_ev_member_id($member['user_id']);
        foreach (ww_aecv_secrets() as $secret) {
            if (!is_string($secret) || strlen($secret) < 32) continue;
            $expires = time() + 120;
            $payload = array('user_id' => $id, 'expires' => $expires, 'signature' => hash_hmac('sha256', 'sync_verified_email|' . $id . '|' . $expires, $secret));
            $curl = curl_init('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-sync-confirmed-profile-email');
            curl_setopt_array($curl, array(CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_HTTPHEADER => array('Content-Type: application/json'), CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2));
            $body = curl_exec($curl);
            $status = intval(curl_getinfo($curl, CURLINFO_HTTP_CODE));
            curl_close($curl);
            $decoded = is_string($body) ? json_decode($body, true) : null;
            if ($status === 200 && is_array($decoded) && isset($decoded['ok']) && $decoded['ok'] === true) return true;
            // Only an obsolete rotation key warrants trying the next private key.
            if ($status !== 401) return false;
        }
        return false;
    }
    function ww_ev_post_string($key) { return isset($_POST[$key]) && is_string($_POST[$key]) ? $_POST[$key] : ''; }
}
@header('Cache-Control: no-store');
// Keep token/path out of referrers without making HTML form POST Origin null.
@header('Referrer-Policy: strict-origin');
$wwEvMethod = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$wwEvAction = ww_ev_post_string('ww_email_change_action');
$wwEvPath = $wwEvApp ? '/verify-email-change-app' : '/verify-email-change';
if ($wwEvMethod === 'POST' && ($wwEvAction === 'request_app' || $wwEvAction === 'status_app')) {
    if (!$wwEvApp) ww_ev_json(array('ok' => false, 'message' => 'Invalid verification route.'), 400);
    try {
        $wwEvId = (string)ww_ev_member_id(ww_ev_post_string('user_id'));
        $wwEvNew = ww_ev_post_string('new_email');
        if (!ww_ev_signed_request($wwEvAction, $wwEvId, $wwEvNew, ww_ev_post_string('expires'), ww_ev_post_string('signature'))) ww_ev_json(array('ok' => false, 'message' => 'This request could not be verified.'), 401);
        $wwEvMember = ww_ev_user($wwEvId);
        if ($wwEvAction === 'status_app') {
            // Pure read: never acquire the confirmation mutation lock here.
            ww_ev_json(ww_email_verification_state($wwEvMember), 200);
        }
        $wwEvMessage = ww_ev_send($wwEvMember, $wwEvNew, $wwEvPath);
        ww_ev_json(array('ok' => true, 'message' => $wwEvMessage), 200);
    } catch (Exception $error) {
        ww_ev_json(array('ok' => false, 'message' => $wwEvAction === 'status_app' ? 'Email verification is temporarily unavailable. Please try again.' : $error->getMessage()), $wwEvAction === 'status_app' ? 503 : 400);
    }
}
if ($wwEvMethod === 'POST' && ($wwEvAction === 'request' || $wwEvAction === 'status')) {
    try {
        ww_ev_require_origin();
        $wwEvMember = ww_ev_current_member();
        if ($wwEvAction === 'status') ww_ev_json(ww_email_verification_state($wwEvMember), 200);
        $wwEvMessage = ww_ev_send($wwEvMember, ww_ev_post_string('new_email'), $wwEvPath);
        ww_ev_json(array('ok' => true, 'message' => $wwEvMessage), 200);
    } catch (Exception $error) { ww_ev_json(array('ok' => false, 'message' => $error->getMessage()), 400); }
}
$wwEvMode = 'request';
$wwEvMessage = '';
$wwEvTone = '';
$wwEvMember = false;
$wwEvState = false;
$wwEvToken = isset($_GET['token']) && is_string($_GET['token']) ? $_GET['token'] : '';
if ($wwEvMethod === 'POST' && $wwEvAction === 'confirm') {
    $wwEvMode = 'result';
    try {
        ww_ev_require_origin();
        // GET is intentionally read-only; scanners and email previews cannot consume it.
        $wwEvMember = ww_ev_confirm(ww_ev_post_string('token'));
        $wwEvSynced = ww_ev_sync_confirmed($wwEvMember);
        $wwEvTone = $wwEvSynced ? 'success' : 'info';
        $wwEvMessage = $wwEvSynced ? 'Your contact email is confirmed. You can continue with WeddingWin.' : 'Your contact email is confirmed. The app update is still finishing. Return to the app and refresh your details, or try signing in again shortly.';
    } catch (Exception $error) { $wwEvTone = 'error'; $wwEvMessage = $error->getMessage(); }
} elseif ($wwEvToken !== '') {
    $wwEvMode = preg_match('/^[a-f0-9]{64}$/D', $wwEvToken) ? 'confirm' : 'result';
    if ($wwEvMode === 'result') { $wwEvTone = 'error'; $wwEvMessage = 'This confirmation link is invalid. Please request a new email.'; }
} elseif ($wwEvApp) {
    $wwEvMode = 'result';
    $wwEvMessage = 'Open the confirmation link from your email, or return to the app to request a new one.';
} else {
    try { $wwEvMember = ww_ev_current_member(); $wwEvState = ww_email_verification_state($wwEvMember); }
    catch (Exception $error) { $wwEvMode = 'result'; $wwEvTone = 'error'; $wwEvMessage = $error->getMessage(); }
}
?>
<meta name="referrer" content="strict-origin">
<section class="ww-email-verification" aria-labelledby="wwEmailTitle" data-email-verification>
  <div class="ww-email-icon" aria-hidden="true">&#9993;</div>
  <h1 id="wwEmailTitle"><?php echo $wwEvMode === 'confirm' ? 'Confirm your email' : 'Your contact email'; ?></h1>
  <?php if ($wwEvMode === 'confirm'): ?>
    <p>Confirm this email address for your WeddingWin account.</p>
    <form method="post" action="<?php echo ww_ev_escape($wwEvPath); ?>" data-email-confirm-form>
      <input type="hidden" name="ww_email_change_action" value="confirm">
      <input type="hidden" name="token" value="<?php echo ww_ev_escape($wwEvToken); ?>">
      <button type="submit" class="ww-email-primary">Confirm Email</button>
    </form>
  <?php elseif ($wwEvMode === 'request' && $wwEvState): ?>
    <p>Use an email where wedding vendors can reach you. We will send a link to confirm it. Your Apple sign-in stays connected.</p>
    <p class="ww-email-current">Current email: <strong><?php echo ww_ev_escape($wwEvState['current_email']); ?></strong></p>
    <?php if ($wwEvState['email_confirmation_required']): ?>
      <p class="ww-email-notice">Confirm the link sent to <strong><?php echo ww_ev_escape($wwEvState['pending_email'] ? $wwEvState['pending_email'] : 'your new email'); ?></strong> before using QR Bingo or sending messages.<?php if ($wwEvState['email_verification_status'] === 'expired'): ?> That link has expired. Request a new one below.<?php endif; ?></p>
    <?php endif; ?>
    <form method="post" action="/verify-email-change" data-email-request-form>
      <input type="hidden" name="ww_email_change_action" value="request">
      <label for="wwContactEmail">Contact email</label>
      <input id="wwContactEmail" name="new_email" type="email" maxlength="254" autocomplete="email" inputmode="email" required placeholder="you@example.com">
      <button type="submit" class="ww-email-primary">Send Confirmation Email</button>
    </form>
    <p class="ww-email-status" role="status" aria-live="polite" data-email-status></p>
    <button type="button" class="ww-email-secondary" data-email-refresh>I&#8217;ve Confirmed My Email</button>
  <?php else: ?>
    <p class="ww-email-notice <?php echo ww_ev_escape($wwEvTone); ?>" role="status"><?php echo ww_ev_escape($wwEvMessage); ?></p>
  <?php endif; ?>
  <nav class="ww-email-links" aria-label="Continue with WeddingWin">
    <?php if ($wwEvApp): ?><a class="ww-email-primary" href="weddingwin://email-confirmed">Return to App</a><?php else: ?><a href="/qr">Back to QR Bingo</a><a href="/account/home">My Account</a><?php endif; ?>
    <?php if ($wwEvMode === 'result' && $wwEvTone === 'error' && !$wwEvApp): ?><a href="/verify-email-change">Request a New Email</a><?php endif; ?>
  </nav>
</section>
<?php /* WW_EMAIL_VERIFICATION_PAGE_END */ ?>
