<?php
/*
 * Public, unlisted read-only roster for printing vendor Bingo QR codes.
 * Intentionally no login gate. Only the currently published event is accepted.
 * Keep PHP free of source backslashes: BD strips them when rendering widgets.
 */
if (!function_exists('ww_vbqc_request')) {
    /* WW_VENDOR_CODES_HELPERS_START */
    function ww_vbqc_request($server) {
        $uri = isset($server['REQUEST_URI']) && is_string($server['REQUEST_URI']) ? $server['REQUEST_URI'] : '';
        $path = parse_url($uri, PHP_URL_PATH);
        if ($path !== '/vendor-bingo-qr-codes' && $path !== '/vendor-bingo-qr-codes/') {
            throw new Exception('Page not found.', 404);
        }
        if (!isset($server['REQUEST_METHOD']) || $server['REQUEST_METHOD'] !== 'GET') {
            throw new Exception('This page accepts GET requests only.', 405);
        }
        // BD rewrites GET/QUERY_STRING with internal routing fields. Inspect only
        // the original public URI, not those injected values. Exact matching also
        // rejects duplicate, array and encoded parameter ambiguities.
        $query = parse_url($uri, PHP_URL_QUERY);
        if ($query === null || $query === '') { return 'html'; }
        if ($query === 'format=json') { return 'json'; }
        throw new Exception('Only the current published event is available here.', 400);
    }

    function ww_vbqc_plain_text($value, $maxLength, $required) {
        if (!is_string($value) || strlen($value) > $maxLength * 4 || preg_match('//u', $value) !== 1) {
            throw new Exception('The published roster is temporarily unavailable.', 503);
        }
        for ($index = 0; $index < strlen($value); $index += 1) {
            $byte = ord($value[$index]);
            if ($byte < 32 || $byte === 127) {
                throw new Exception('The published roster is temporarily unavailable.', 503);
            }
        }
        $value = trim($value);
        $matches = array();
        $length = preg_match_all('/./us', $value, $matches);
        if ($length === false || $length > $maxLength || ($required && $value === '') || strip_tags($value) !== $value) {
            throw new Exception('The published roster is temporarily unavailable.', 503);
        }
        return $value;
    }

    function ww_vbqc_timestamp($value) {
        $parts = array();
        if (!is_string($value) || strlen($value) > 40 || preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:[.][0-9]{1,6})?(Z|[+-]([0-9]{2}):([0-9]{2}))$/D', $value, $parts) !== 1) {
            return false;
        }
        $hour = isset($parts[8]) ? (int)$parts[8] : 0;
        $minute = isset($parts[9]) ? (int)$parts[9] : 0;
        return checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1])
            && (int)$parts[4] <= 23 && (int)$parts[5] <= 59 && (int)$parts[6] <= 59
            && $hour <= 14 && $minute <= 59 && ($hour !== 14 || $minute === 0)
            && strtotime($value) !== false;
    }

    function ww_vbqc_config($body) {
        if (!is_string($body) || strlen($body) > 65536) { throw new Exception('The published event is temporarily unavailable.', 503); }
        $decoded = json_decode($body, true);
        $config = is_array($decoded) && isset($decoded['ok']) && $decoded['ok'] === true
            && isset($decoded['event_config']) && is_array($decoded['event_config']) ? $decoded['event_config'] : null;
        if (!$config || !isset($config['published']) || $config['published'] !== true
            || !isset($config['vendor_tag_id']) || !is_int($config['vendor_tag_id']) || $config['vendor_tag_id'] < 1 || $config['vendor_tag_id'] > 2147483647
            || !isset($config['revision']) || !is_int($config['revision']) || $config['revision'] < 1 || $config['revision'] > 2147483647
            || !isset($config['event_key']) || !is_string($config['event_key']) || preg_match('/^[a-z0-9][a-z0-9._-]{0,79}$/D', $config['event_key']) !== 1
            || !isset($config['history_starts_at']) || !ww_vbqc_timestamp($config['history_starts_at'])) {
            throw new Exception('The published event is temporarily unavailable.', 503);
        }
        return array(
            'tag_id' => $config['vendor_tag_id'],
            'event' => array(
                'key' => $config['event_key'],
                'name' => ww_vbqc_plain_text(isset($config['event_name']) ? $config['event_name'] : null, 160, true),
                'venue' => ww_vbqc_plain_text(isset($config['venue_name']) ? $config['venue_name'] : null, 160, true),
                'starts_at' => $config['history_starts_at'],
                'revision' => $config['revision']
            )
        );
    }

    function ww_vbqc_public_config() {
        if (!function_exists('curl_init')) { throw new Exception('The published event is temporarily unavailable.', 503); }
        $body = '';
        $curl = curl_init('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin?action=public_config');
        if (!$curl) { throw new Exception('The published event is temporarily unavailable.', 503); }
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, false);
        curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($curl, CURLOPT_TIMEOUT, 6);
        curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($curl, CURLOPT_SSL_VERIFYHOST, 2);
        curl_setopt($curl, CURLOPT_HTTPHEADER, array('Accept: application/json'));
        curl_setopt($curl, CURLOPT_WRITEFUNCTION, function ($handle, $chunk) use (&$body) {
            if (strlen($body) + strlen($chunk) > 65536) { return 0; }
            $body .= $chunk;
            return strlen($chunk);
        });
        $success = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        if ($success === false || $status !== 200 || $body === '') { throw new Exception('The published event is temporarily unavailable.', 503); }
        return ww_vbqc_config($body);
    }

    function ww_vbqc_vendor($row) {
        if (!is_array($row) || !isset($row['user_id']) || (!is_string($row['user_id']) && !is_int($row['user_id']))) {
            throw new Exception('The published roster is temporarily unavailable.', 503);
        }
        $id = (string)$row['user_id'];
        if (preg_match('/^[1-9][0-9]{0,17}$/D', $id) !== 1) { throw new Exception('The published roster is temporarily unavailable.', 503); }
        $company = isset($row['company']) && is_string($row['company']) ? trim($row['company']) : '';
        $name = $company !== '' ? $company : trim(
            (isset($row['first_name']) && is_string($row['first_name']) ? $row['first_name'] : '') . ' ' .
            (isset($row['last_name']) && is_string($row['last_name']) ? $row['last_name'] : '')
        );
        $name = strip_tags(html_entity_decode($name, ENT_QUOTES, 'UTF-8'));
        $name = ww_vbqc_plain_text($name, 200, true);
        return array('id' => $id, 'name' => $name, 'qr_url' => 'https://www.weddingwin.ca/qr?vendor_id=' . $id);
    }

    function ww_vbqc_roster($database, $tagId) {
        if (!is_int($tagId) || $tagId < 1 || $tagId > 2147483647 || !$database || !function_exists('mysql') || !function_exists('mysql_fetch_assoc')) {
            throw new Exception('The published roster is temporarily unavailable.', 503);
        }
        // This is the same active, published-tag roster used by Bingo. No draw or fixture filter.
        $result = mysql($database, "SELECT DISTINCT u.user_id, u.company, u.first_name, u.last_name
            FROM users_data u
            INNER JOIN rel_tags rt ON rt.object_id = u.user_id
            WHERE rt.tag_id = '" . $tagId . "' AND rt.tag_type_id = 1 AND u.active = 2
            ORDER BY u.user_id ASC LIMIT 5001");
        if (!$result) { throw new Exception('The published roster is temporarily unavailable.', 503); }
        $vendors = array();
        $seen = array();
        $rowCount = 0;
        while ($row = mysql_fetch_assoc($result)) {
            $rowCount += 1;
            if ($rowCount > 5000) { throw new Exception('This roster is too large to display safely. Please contact WeddingWin.', 503); }
            $vendor = ww_vbqc_vendor($row);
            $key = 'vendor-' . $vendor['id'];
            if (isset($seen[$key])) {
                if ($seen[$key] !== $vendor['name']) { throw new Exception('The published roster changed. Please reload.', 503); }
                continue;
            }
            $seen[$key] = $vendor['name'];
            $vendors[] = $vendor;
        }
        return $vendors;
    }

    function ww_vbqc_headers() {
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('X-Content-Type-Options: nosniff');
        header('X-Robots-Tag: noindex, nofollow');
        header('Referrer-Policy: no-referrer');
    }

    function ww_vbqc_json($body, $status) {
        // BD may buffer its page wrapper before this widget runs. JSON must stand alone.
        while (function_exists('ob_get_level') && ob_get_level() > 0) {
            if (!@ob_end_clean()) { break; }
        }
        $json = json_encode($body);
        if ($json === false) { $json = '{"ok":false,"error":"The published roster is temporarily unavailable."}'; $status = 503; }
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        if ($status === 405) { header('Allow: GET'); }
        ww_vbqc_headers();
        echo $json;
        exit();
    }
    /* WW_VENDOR_CODES_HELPERS_END */
}

try {
    $ww_vbqc_format = ww_vbqc_request($_SERVER);
    if ($ww_vbqc_format === 'json') {
        $ww_vbqc_config = ww_vbqc_public_config();
        $ww_vbqc_database = isset($w) && is_array($w) && isset($w['database']) ? $w['database'] : null;
        $ww_vbqc_vendors = ww_vbqc_roster($ww_vbqc_database, $ww_vbqc_config['tag_id']);
        ww_vbqc_json(array('ok' => true, 'event' => $ww_vbqc_config['event'], 'vendors' => $ww_vbqc_vendors,
            'total' => count($ww_vbqc_vendors), 'generated_at' => gmdate('Y-m-d') . 'T' . gmdate('H:i:s') . 'Z'), 200);
    }
    ww_vbqc_headers();
} catch (Exception $ww_vbqc_error) {
    $ww_vbqc_status = (int)$ww_vbqc_error->getCode();
    if (!in_array($ww_vbqc_status, array(400, 404, 405, 503), true)) { $ww_vbqc_status = 503; }
    $ww_vbqc_message = $ww_vbqc_status === 503
        ? 'Vendor QR codes are temporarily unavailable. Please refresh shortly.'
        : $ww_vbqc_error->getMessage();
    ww_vbqc_json(array('ok' => false, 'error' => $ww_vbqc_message), $ww_vbqc_status);
}
?>
<!-- WW_VENDOR_CODES_SHELL_START -->
<meta name="robots" content="noindex,nofollow">
<main class="ww-vendor-codes" id="wwVendorCodes" data-feed-url="/vendor-bingo-qr-codes?format=json" data-print-layout="letter-eight" data-card-orientation="standard" data-print-page="letter-portrait">
  <header class="ww-vendor-codes-header">
    <p class="ww-vendor-codes-brand">WeddingWin</p>
    <h1>Wedding Show Vendor QR Codes</h1>
    <p class="ww-vendor-codes-intro">Find a vendor or print the full set. Scan these codes with WeddingWin at the show.</p>
    <div class="ww-vendor-codes-event" aria-label="Wedding show details">
      <h2 id="wwVendorCodesEventName">Loading wedding show details…</h2>
      <p id="wwVendorCodesEventDetails"></p>
    </div>
  </header>
  <section class="ww-vendor-codes-tools" aria-label="Find and print vendor codes">
    <div class="ww-vendor-codes-search">
      <label for="wwVendorCodesSearch">Find a vendor</label>
      <input id="wwVendorCodesSearch" type="search" maxlength="200" placeholder="Search vendor names" autocomplete="off">
    </div>
    <div class="ww-vendor-codes-print-options">
      <label for="wwVendorCodesPrintLayout">Print layout</label>
      <select id="wwVendorCodesPrintLayout" aria-label="Print layout" aria-describedby="wwVendorCodesPrintHelp">
        <optgroup label="Letter · 8.5 × 11 inches">
          <option value="letter-eight">3.74 × 2.56 cards · 8 per Letter sheet</option>
          <option value="letter-six">3 × 4 cards · 6 per Letter sheet</option>
          <option value="letter-four">3.5 × 5 cards · 4 per Letter sheet</option>
          <option value="letter-two">4 × 6 cards · 2 per Letter sheet</option>
          <option value="letter-custom">Custom card size · Letter paper</option>
        </optgroup>
        <optgroup label="Tabloid · 11 × 17 inches">
          <option value="tabloid-sixteen">3.74 × 2.56 cards · 16 per 11 × 17 sheet</option>
          <option value="tabloid-twelve">3 × 4 cards · 12 per 11 × 17 sheet</option>
          <option value="tabloid-nine">3.5 × 5 cards · 9 per 11 × 17 sheet</option>
          <option value="tabloid-four">4 × 6 cards · 4 per 11 × 17 sheet</option>
          <option value="tabloid-custom">Custom card size · 11 × 17 paper</option>
        </optgroup>
      </select>
    </div>
    <div class="ww-vendor-codes-orientation">
      <label for="wwVendorCodesCardOrientation">Card orientation</label>
      <select id="wwVendorCodesCardOrientation" aria-label="Card orientation" aria-describedby="wwVendorCodesPrintHelp">
        <option value="standard">Standard</option>
        <option value="horizontal">Horizontal (wide)</option>
      </select>
    </div>
    <div class="ww-vendor-codes-custom" id="wwVendorCodesCustomSize" hidden>
      <div><label for="wwVendorCodesCardWidth">Width (inches)</label><input id="wwVendorCodesCardWidth" type="number" inputmode="decimal" min="1.5" max="16.5" step="0.01" value="3.74" aria-describedby="wwVendorCodesLayoutError"></div>
      <div><label for="wwVendorCodesCardHeight">Height (inches)</label><input id="wwVendorCodesCardHeight" type="number" inputmode="decimal" min="1.5" max="16.5" step="0.01" value="2.56" aria-describedby="wwVendorCodesLayoutError"></div>
    </div>
    <div class="ww-vendor-codes-buttons">
      <button id="wwVendorCodesRefresh" type="button">Refresh</button>
      <button class="ww-vendor-codes-primary" id="wwVendorCodesPrint" type="button" disabled>Print all QR codes</button>
      <button id="wwVendorCodesDownload" type="button" disabled>Download PDF</button>
    </div>
  </section>
  <p class="ww-vendor-codes-layout-error" id="wwVendorCodesLayoutError" role="alert" hidden></p>
  <p class="ww-vendor-codes-print-help" id="wwVendorCodesPrintHelp" aria-live="polite">Letter paper, portrait: eight 3.74 × 2.56 inch cards per sheet.</p>
  <p class="ww-vendor-codes-print-help">Choose <strong>Letter (8.5 × 11 inches)</strong> or <strong>Tabloid (11 × 17 inches)</strong> to match your paper. Print at <strong>100% / Actual size</strong>, with 0.25-inch margins and headers and footers off. Cut along the card outlines.</p>
  <div class="ww-vendor-codes-summary">
    <p id="wwVendorCodesCount">Loading vendor list…</p>
    <p id="wwVendorCodesChecked">Not checked yet</p>
  </div>
  <p class="ww-vendor-codes-status" id="wwVendorCodesStatus" role="status" aria-live="polite">Loading QR codes…</p>
  <p class="ww-vendor-codes-print-summary" id="wwVendorCodesPrintSummary"></p>
  <div class="ww-vendor-codes-grid" id="wwVendorCodesGrid" aria-label="Participating vendor QR codes" aria-busy="true"></div>
  <p class="ww-vendor-codes-empty" id="wwVendorCodesEmpty" hidden></p>
  <noscript><p class="ww-vendor-codes-empty">Enable JavaScript to load the current vendor QR codes.</p></noscript>
</main>
