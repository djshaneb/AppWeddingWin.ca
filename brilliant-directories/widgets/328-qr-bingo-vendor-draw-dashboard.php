<?php
/*
 * Website-only vendor authentication. BD validates its own member cookies;
 * this narrow same-origin bridge never emits or changes member login tokens.
 */
if (!function_exists('ww_qrvd_secure_hex')) {
    function ww_qrvd_secure_hex($bytes) {
        if (function_exists('random_bytes')) {
            try { return bin2hex(random_bytes($bytes)); } catch (Exception $e) { return ''; }
        }
        if (function_exists('openssl_random_pseudo_bytes')) {
            $strong = false;
            $value = openssl_random_pseudo_bytes($bytes, $strong);
            if ($strong && is_string($value) && strlen($value) === $bytes) return bin2hex($value);
        }
        return '';
    }
    function ww_qrvd_bridge_json($status, $payload) {
        $levels = function_exists('ob_get_level') ? ob_get_level() : 0;
        for ($attempt = 0; $attempt < $levels; $attempt++) {
            $before = ob_get_level();
            if (@ob_end_clean() === false || ob_get_level() >= $before) break;
        }
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($payload);
        exit();
    }
    function ww_qrvd_signing_secret($database) {
        if (!$database || !function_exists('mysql') || !function_exists('mysql_fetch_assoc')) return '';
        $result = mysql($database, 'SELECT secret_text FROM ww_qr_bingo_admin_credentials WHERE active = 1 LIMIT 20');
        if (!$result) return '';
        while ($row = mysql_fetch_assoc($result)) {
            $secret = is_array($row) && isset($row['secret_text']) && is_string($row['secret_text']) ? $row['secret_text'] : '';
            if (strlen($secret) >= 32 && strlen($secret) <= 4096 && strpos($secret, chr(0)) === false) return $secret;
        }
        return '';
    }
}
$ww_qrvd_user_id = '';
$ww_qrvd_csrf = '';
$ww_qrvd_member = array();
// Never infer authentication from a client-supplied ID, token, or page context.
if (user::isUserLogged($_COOKIE) && isset($_COOKIE['userid']) && is_string($_COOKIE['userid'])
    && ctype_digit($_COOKIE['userid']) && (int)$_COOKIE['userid'] > 0) {
    $ww_qrvd_member = getUser($_COOKIE['userid'], $w);
    if (is_array($ww_qrvd_member) && isset($ww_qrvd_member['user_id'])
        && (string)$ww_qrvd_member['user_id'] === (string)$_COOKIE['userid']) {
        $ww_qrvd_user_id = (string)$ww_qrvd_member['user_id'];
    }
}
unset($ww_qrvd_member);
if ($ww_qrvd_user_id !== '' && function_exists('hash_equals')) {
    if (function_exists('session_status')) {
        if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }
    } elseif (session_id() === '') { @session_start(); }
    if (session_id() !== '') {
        if (!isset($_SESSION['ww_qr_vendor_website_csrf'])
            || !is_array($_SESSION['ww_qr_vendor_website_csrf'])
            || !isset($_SESSION['ww_qr_vendor_website_csrf']['member_id'], $_SESSION['ww_qr_vendor_website_csrf']['token'])
            || $_SESSION['ww_qr_vendor_website_csrf']['member_id'] !== $ww_qrvd_user_id
            || !is_string($_SESSION['ww_qr_vendor_website_csrf']['token'])
            || !ctype_xdigit($_SESSION['ww_qr_vendor_website_csrf']['token'])
            || strlen($_SESSION['ww_qr_vendor_website_csrf']['token']) !== 64) {
            $_SESSION['ww_qr_vendor_website_csrf'] = array(
                'member_id' => $ww_qrvd_user_id, 'token' => ww_qrvd_secure_hex(32)
            );
        }
        $ww_qrvd_csrf = (string)$_SESSION['ww_qr_vendor_website_csrf']['token'];
        if (strlen($ww_qrvd_csrf) !== 64) $ww_qrvd_csrf = '';
    }
}
if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}
$ww_qrvd_is_bridge = isset($_GET['ww_qrvd_bridge']) && $_GET['ww_qrvd_bridge'] === '1';
if ($ww_qrvd_is_bridge) {
    if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
        ww_qrvd_bridge_json(405, array('ok' => false, 'error' => 'Use a secure website request.'));
    }
    if ($ww_qrvd_user_id === '' || $ww_qrvd_csrf === '') {
        ww_qrvd_bridge_json(401, array('ok' => false, 'error' => 'Sign in again before opening vendor draw tools.'));
    }
    if (!isset($_SERVER['HTTP_ORIGIN']) || $_SERVER['HTTP_ORIGIN'] !== 'https://www.weddingwin.ca') {
        ww_qrvd_bridge_json(403, array('ok' => false, 'error' => 'Open vendor draw tools on WeddingWin.ca.'));
    }
    $ww_qrvd_content_type = explode(';', isset($_SERVER['CONTENT_TYPE']) ? (string)$_SERVER['CONTENT_TYPE'] : '');
    if (strtolower(trim($ww_qrvd_content_type[0])) !== 'application/json') {
        ww_qrvd_bridge_json(415, array('ok' => false, 'error' => 'Use a secure JSON website request.'));
    }
    $ww_qrvd_input = file_get_contents('php://input', false, null, 0, 131073);
    if (!is_string($ww_qrvd_input) || strlen($ww_qrvd_input) > 131072) {
        ww_qrvd_bridge_json(413, array('ok' => false, 'error' => 'This request is too large.'));
    }
    $ww_qrvd_payload = json_decode($ww_qrvd_input, true);
    unset($ww_qrvd_input);
    if (!is_array($ww_qrvd_payload) || !isset($ww_qrvd_payload['csrf']) || !is_string($ww_qrvd_payload['csrf'])
        || !hash_equals($ww_qrvd_csrf, $ww_qrvd_payload['csrf'])) {
        ww_qrvd_bridge_json(403, array('ok' => false, 'error' => 'Refresh the page before continuing.'));
    }
    foreach (array('native_session', 'website_member_id', 'website_session_token', 'user_id', 'userid', 'token', 'cookie') as $ww_qrvd_forbidden) {
        if (array_key_exists($ww_qrvd_forbidden, $ww_qrvd_payload)) {
            ww_qrvd_bridge_json(400, array('ok' => false, 'error' => 'The request contains an unsupported identity.'));
        }
    }
    $ww_qrvd_actions = array('vendor_dashboard_access', 'vendor_raffle_get', 'vendor_raffle_update',
        'vendor_raffle_draw', 'vendor_raffle_replace', 'vendor_raffle_export', 'vendor_raffle_review',
        'vendor_raffle_entries_get', 'vendor_raffle_entry_update', 'vendor_raffle_send_notice');
    $ww_qrvd_action = isset($ww_qrvd_payload['action']) && is_string($ww_qrvd_payload['action']) ? $ww_qrvd_payload['action'] : '';
    if (!in_array($ww_qrvd_action, $ww_qrvd_actions, true)) {
        ww_qrvd_bridge_json(400, array('ok' => false, 'error' => 'This vendor action is not available.'));
    }
    if (!function_exists('curl_init') || !function_exists('hash_hmac')) {
        ww_qrvd_bridge_json(503, array('ok' => false, 'error' => 'Website sign-in verification is temporarily unavailable.'));
    }
    $ww_qrvd_secret = ww_qrvd_signing_secret(isset($w['database']) ? $w['database'] : null);
    if ($ww_qrvd_secret === '') {
        ww_qrvd_bridge_json(503, array('ok' => false, 'error' => 'Website sign-in verification is temporarily unavailable.'));
    }
    unset($ww_qrvd_payload['csrf']);
    $ww_qrvd_payload['website_member_id'] = $ww_qrvd_user_id;
    $ww_qrvd_payload['client_platform'] = 'website';
    $ww_qrvd_body = json_encode($ww_qrvd_payload);
    if (!is_string($ww_qrvd_body) || json_last_error() !== JSON_ERROR_NONE || strlen($ww_qrvd_body) > 131072) {
        ww_qrvd_bridge_json(400, array('ok' => false, 'error' => 'The vendor request could not be prepared.'));
    }
    $ww_qrvd_scope = 'weddingwin:qr-bingo:vendor-website:v1';
    $ww_qrvd_nonce = ww_qrvd_secure_hex(16);
    if (strlen($ww_qrvd_nonce) !== 32) {
        ww_qrvd_bridge_json(503, array('ok' => false, 'error' => 'Website sign-in verification is temporarily unavailable.'));
    }
    $ww_qrvd_expires = (string)(time() + 30);
    $ww_qrvd_body_hash = hash('sha256', $ww_qrvd_body);
    $ww_qrvd_key = hash_hmac('sha256', 'weddingwin:qr-bingo:website-key:v1', $ww_qrvd_secret);
    $ww_qrvd_signature = hash_hmac('sha256', implode(chr(10), array(
        $ww_qrvd_scope, $ww_qrvd_user_id, $ww_qrvd_action, $ww_qrvd_expires, $ww_qrvd_nonce, $ww_qrvd_body_hash
    )), $ww_qrvd_key);
    unset($ww_qrvd_secret, $ww_qrvd_key);
    if (function_exists('session_write_close')) { session_write_close(); }
    $ww_qrvd_response = '';
    $ww_qrvd_too_large = false;
    $ww_qrvd_curl = curl_init('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-vendor-sync');
    if ($ww_qrvd_curl === false) {
        ww_qrvd_bridge_json(503, array('ok' => false, 'error' => 'Vendor draw tools are temporarily unavailable.'));
    }
    $ww_qrvd_public_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo';
    curl_setopt_array($ww_qrvd_curl, array(
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $ww_qrvd_body,
        CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'Accept: application/json',
            'Authorization: Bearer ' . $ww_qrvd_public_key, 'apikey: ' . $ww_qrvd_public_key,
            'x-ww-website-scope: ' . $ww_qrvd_scope, 'x-ww-website-member: ' . $ww_qrvd_user_id,
            'x-ww-website-expires: ' . $ww_qrvd_expires, 'x-ww-website-nonce: ' . $ww_qrvd_nonce,
            'x-ww-website-body-sha256: ' . $ww_qrvd_body_hash, 'x-ww-website-signature: ' . $ww_qrvd_signature),
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
        CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HEADER => false, CURLOPT_RETURNTRANSFER => false,
        CURLOPT_WRITEFUNCTION => function($handle, $chunk) use (&$ww_qrvd_response, &$ww_qrvd_too_large) {
            if (strlen($ww_qrvd_response) + strlen($chunk) > 4194304) {
                $ww_qrvd_too_large = true; return 0;
            }
            $ww_qrvd_response .= $chunk; return strlen($chunk);
        }
    ));
    $ww_qrvd_transport_ok = curl_exec($ww_qrvd_curl);
    $ww_qrvd_status = (int)curl_getinfo($ww_qrvd_curl, CURLINFO_HTTP_CODE);
    curl_close($ww_qrvd_curl);
    unset($ww_qrvd_signature, $ww_qrvd_body, $ww_qrvd_payload);
    $ww_qrvd_decoded = json_decode($ww_qrvd_response, true);
    unset($ww_qrvd_response);
    if ($ww_qrvd_transport_ok === false || $ww_qrvd_too_large || $ww_qrvd_status < 200 || $ww_qrvd_status >= 600
        || !is_array($ww_qrvd_decoded) || !isset($ww_qrvd_decoded['ok']) || !is_bool($ww_qrvd_decoded['ok'])) {
        ww_qrvd_bridge_json(502, array('ok' => false, 'error' => 'Vendor draw tools returned an unreadable response. Please try again.'));
    }
    ww_qrvd_bridge_json($ww_qrvd_status, $ww_qrvd_decoded);
}
?>

<section
  class="ww-qrvd"
  data-ww-qrvd
  data-user-id="<?php echo htmlspecialchars($ww_qrvd_user_id, ENT_QUOTES, 'UTF-8'); ?>"
  data-csrf="<?php echo htmlspecialchars($ww_qrvd_csrf, ENT_QUOTES, 'UTF-8'); ?>">
  <header class="ww-qrvd-hero">
    <div>
      <p class="ww-qrvd-eyebrow">QR Bingo</p>
      <h2>Your prize draw</h2>
    </div>
    <span class="ww-qrvd-badge">Website + app synced</span>
  </header>

  <nav class="ww-qrvd-steps" aria-label="Vendor prize draw setup steps">
    <button type="button" class="is-active" data-wizard-step="1" aria-current="step" aria-controls="ww-qrvd-panel-prize">
      <span class="ww-qrvd-step-number">1</span>
      <span><strong>Prize</strong><small data-role="wizard-state-1">Add details</small></span>
    </button>
    <button type="button" data-wizard-step="2" aria-controls="ww-qrvd-panel-rules">
      <span class="ww-qrvd-step-number">2</span>
      <span><strong>Open</strong><small data-role="wizard-state-2">Review and open</small></span>
    </button>
    <button type="button" data-wizard-step="3" aria-controls="ww-qrvd-panel-entries">
      <span class="ww-qrvd-step-number">3</span>
      <span><strong>Couples</strong><small data-role="wizard-state-3">See contacts</small></span>
    </button>
    <button type="button" data-wizard-step="4" aria-controls="ww-qrvd-panel-winner">
      <span class="ww-qrvd-step-number">4</span>
      <span><strong>Winner</strong><small data-role="wizard-state-4">Select and verify</small></span>
    </button>
  </nav>

  <div class="ww-qrvd-status" data-role="status" role="status" aria-live="polite">
    Loading your current vendor draw settings…
  </div>

  <div class="ww-qrvd-workspace is-hidden" data-role="workspace">
    <div class="ww-qrvd-notice is-hidden" data-role="app-review-fixture-notice">
      <strong>Test mode — no real prizes or emails.</strong>
    </div>
    <div class="ww-qrvd-notice is-hidden" data-role="email-test-fixture-notice">
      <strong>Email test mode — no real prize.</strong>
      Only the approved test recipient can receive this email.
    </div>

    <div class="ww-qrvd-wizard">
      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-prize" data-wizard-panel="1" aria-labelledby="ww-qrvd-settings-heading">
        <p class="ww-qrvd-step">Step 1 of 4</p>
        <h3 id="ww-qrvd-settings-heading" tabindex="-1">What can couples win?</h3>
        <p class="ww-qrvd-intro">A free gift, service, or discount — you choose.</p>

        <label class="ww-qrvd-field">
          <span>Your prize or discount</span>
          <textarea
            data-field="prize_description"
            rows="5"
            maxlength="1000"
            placeholder="Example: 50% off a photography package&#10;Maximum discount $500. New bookings only; include the package, expiry, and exclusions."></textarea>
          <small>Start with the prize name. Add any expiry date or conditions below it.</small>
        </label>

        <label class="ww-qrvd-field">
          <span>Value or maximum savings ($ CAD)</span>
          <input
            data-field="prize_approx_value_cad"
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            placeholder="250">
          <small>For a discount, enter the most the winner can save.</small>
        </label>

        <p class="ww-qrvd-small">One couple wins your draw. You can edit your prize until you send the winner email.</p>

        <p class="ww-qrvd-lock is-hidden" data-role="material-lock">
          Prize details are locked for the winner email.
        </p>

        <div class="ww-qrvd-actions">
          <button type="button" class="ww-qrvd-primary" data-wizard-next="2">Continue</button>
        </div>
      </section>

      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-rules" data-wizard-panel="2" aria-labelledby="ww-qrvd-rules-heading" hidden>
        <p class="ww-qrvd-step">Step 2 of 4</p>
        <h3 id="ww-qrvd-rules-heading" tabindex="-1">Ready to open your draw?</h3>
        <p class="ww-qrvd-intro">Review the rules, then turn your draw on.</p>

        <div class="ww-qrvd-rules-box">
          <details class="ww-qrvd-rules-details">
          <summary>Rules &amp; responsibilities</summary>
          <div class="ww-qrvd-rules-content">
          <p class="ww-qrvd-rules-help">By checking the box below, you confirm that you have read and accept the current Official Rules and vendor responsibilities, and are authorized to do so for this vendor.</p>
          <div class="ww-qrvd-rules-heading">
            <a data-role="rules-link" data-action="rules" href="#" target="_blank" rel="noopener">View the current Official Rules</a>
          </div>
          <details class="ww-qrvd-responsibility" data-role="vendor-responsibility-details">
            <summary>
              <strong>View the vendor responsibilities</strong>
            </summary>
            <p data-role="vendor-responsibility-disclosure">Loading the exact vendor responsibility agreement…</p>
            <p>Couples who enter accept this vendor's draw and wedding-related marketing terms. Honour unsubscribe requests and protect their contact information under the Vendor Draw Rules.</p>
          </details>
          <details class="ww-qrvd-responsibility">
            <summary><strong>Editing your prize</strong></summary>
            <p>Each draw has one winner. You can edit the prize details and value until you send the winner email. They stay locked while the email is sending and afterward. Event dates, eligibility, and the other draw rules still apply.</p>
          </details>
          <details class="ww-qrvd-disclosures" aria-label="Current draw terms">
            <summary>View event dates, eligibility, odds, admission, and entry rules</summary>
            <div>
              <p><strong>Eligibility:</strong> <span data-role="eligibility">Loading…</span></p>
              <p><strong>Entries close:</strong> <span data-role="entry-close">Loading…</span></p>
              <p><strong>Scheduled draw:</strong> <span data-role="draw-at">Loading…</span></p>
              <p><strong>Odds:</strong> <span data-role="odds">Loading…</span></p>
              <p>Vendor draws are only for eligible couples attending the wedding show in person. Couples visit your booth, scan your QR code, then separately choose whether to enter. The QR entry replaces a paper ballot. No purchase from your business is required. General admission is free in advance while available; VIP and door admission may be paid, but paid admission never creates an extra entry or improves the odds.</p>
            </div>
          </details>
          </div>
          </details>
          <label class="ww-qrvd-check">
            <input type="checkbox" data-field="legal_terms_accepted" aria-describedby="ww-qrvd-acceptance-state">
            <span class="ww-qrvd-review-copy">
              <strong>I have read and agree to the rules above.</strong>
              <small id="ww-qrvd-acceptance-state" data-role="acceptance-state">Not confirmed yet</small>
            </span>
          </label>
        </div>

        <label class="ww-qrvd-switch">
          <input type="checkbox" data-field="enabled">
          <span><strong>Open your prize draw</strong><small>Off: couples can scan your booth, but cannot enter your draw.</small></span>
        </label>

        <div class="ww-qrvd-actions">
          <button type="button" class="ww-qrvd-secondary" data-wizard-back="1">Back</button>
          <button type="button" class="ww-qrvd-secondary is-hidden" data-action="reload">Reload current settings</button>
          <button type="button" class="ww-qrvd-primary" data-action="save">Save and continue</button>
        </div>
      </section>

      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-entries" data-wizard-panel="3" aria-labelledby="ww-qrvd-entry-heading" hidden>
        <p class="ww-qrvd-step">Step 3 of 4</p>
        <h3 id="ww-qrvd-entry-heading" tabindex="-1">Your couples</h3>
        <p class="ww-qrvd-intro">See who entered and download their contact details.</p>
        <div class="ww-qrvd-stats" aria-label="Entrant summary">
          <div class="ww-qrvd-stat">
            <strong data-role="entry-count">0</strong>
            <span data-role="entry-count-label">opted-in couples</span>
          </div>
          <div class="ww-qrvd-stat">
            <strong data-role="selection-pool-count">0</strong>
            <span>in the draw</span>
          </div>
          <div class="ww-qrvd-stat">
            <strong data-role="excluded-count">0</strong>
            <span>out of the draw</span>
          </div>
        </div>

        <div class="ww-qrvd-contact-export">
          <div>
            <strong>Your contact list</strong>
            <span>Everyone who entered stays in your contacts, even if removed from the draw.</span>
          </div>
          <button type="button" class="ww-qrvd-secondary ww-qrvd-report-button" data-action="participation-report">Download contacts (CSV)</button>
        </div>

        <div class="ww-qrvd-entry-manager" aria-labelledby="ww-qrvd-manage-entries-heading">
          <div class="ww-qrvd-entry-manager-heading">
            <div>
              <h4 id="ww-qrvd-manage-entries-heading">Couple contacts</h4>
            </div>
            <button type="button" class="ww-qrvd-secondary" data-action="entries-reload">Refresh list</button>
          </div>
          <div class="ww-qrvd-contact-tools" aria-label="Find and filter couple contacts">
            <label class="ww-qrvd-contact-search">
              <span>Find a couple</span>
              <input type="search" data-role="entrant-search" placeholder="Search name, email or phone" autocomplete="off">
            </label>
            <label class="ww-qrvd-contact-filter">
              <span>Show</span>
              <select data-role="entrant-filter" aria-label="Show contacts">
                <option value="all">All contacts</option>
                <option value="included">In the draw</option>
                <option value="excluded">Out of the draw</option>
              </select>
            </label>
          </div>
          <p class="ww-qrvd-visible-count" data-role="entrant-visible-count" aria-live="polite">Contacts will appear here.</p>
          <p class="ww-qrvd-lock is-hidden" data-role="entry-management-lock">Review the selected winner before changing the draw list.</p>
          <div class="ww-qrvd-entry-status" data-role="entry-status" role="status" aria-live="polite">Loading your couples…</div>
          <div class="ww-qrvd-entrant-list" data-role="entrants" aria-busy="false"></div>
        </div>
        <div class="ww-qrvd-actions ww-qrvd-actions-between">
          <button type="button" class="ww-qrvd-secondary" data-wizard-back="2">Back</button>
          <button type="button" class="ww-qrvd-primary" data-wizard-next="4">Continue</button>
        </div>
      </section>

      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-winner" data-wizard-panel="4" aria-labelledby="ww-qrvd-draw-heading" hidden>
        <p class="ww-qrvd-step">Step 4 of 4</p>
        <h3 id="ww-qrvd-draw-heading" tabindex="-1">Pick your winner</h3>
        <p class="ww-qrvd-intro">Choose a couple, then send their winner email.</p>
        <div class="ww-qrvd-draw-status">
          <strong data-role="draw-status-label">Loading…</strong>
          <span data-role="draw-status"></span>
        </div>
        <button type="button" class="ww-qrvd-primary" data-action="draw" disabled>Select potential winner</button>
        <p class="ww-qrvd-small">This button only performs random selection. It cannot send winner email.</p>
        <div class="ww-qrvd-notice is-hidden" data-role="email-notice"></div>
        <h4 class="ww-qrvd-history-heading">Winner records and email</h4>
        <div class="ww-qrvd-history" data-role="draws" aria-live="polite">
          <p>No potential winner has been selected.</p>
        </div>
        <div class="ww-qrvd-actions ww-qrvd-actions-between">
          <button type="button" class="ww-qrvd-secondary" data-wizard-back="3">Back</button>
        </div>
      </section>
    </div>
  </div>
</section>
