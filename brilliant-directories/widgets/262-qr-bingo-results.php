<?php
// Public QR Bingo results page for Brilliant Directories.
// Public results expose only aggregate current-event progress. Temporary
// participant numbers are reshuffled for every response; identities, stable
// references, booth history, timestamps, and contact details are never returned.

if (!function_exists('ww_qrr_json')) {
    function ww_qrr_json($body, $statusCode = 200) {
        while (function_exists('ob_get_level') && ob_get_level() > 0) { @ob_end_clean(); }
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
        return is_string($value)
            && strlen($value) <= 40
            && preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/D', $value) === 1
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
        $config = is_array($decoded) && isset($decoded['event_config']) && is_array($decoded['event_config'])
            ? $decoded['event_config']
            : null;
        if (!$config) { return null; }

        $eventKey = isset($config['event_key']) ? $config['event_key'] : null;
        $eventName = isset($config['event_name']) && is_string($config['event_name'])
            ? trim($config['event_name'])
            : '';
        $tagId = isset($config['vendor_tag_id']) ? $config['vendor_tag_id'] : null;
        $revision = isset($config['revision']) ? $config['revision'] : null;
        $historyStartsAt = isset($config['history_starts_at']) ? $config['history_starts_at'] : null;
        if (!ww_qrr_is_event_key($eventKey)
            || !$eventName
            || strlen($eventName) > 160
            || strip_tags($eventName) !== $eventName
            || !ww_qrr_is_positive_integer($tagId)
            || !ww_qrr_is_positive_integer($revision)
            || !ww_qrr_is_rfc3339_timestamp($historyStartsAt)) {
            return null;
        }

        return array(
            'event_key' => $eventKey,
            'event_name' => $eventName,
            'vendor_tag_id' => $tagId,
            'revision' => $revision,
            'history_starts_at_sql' => date('Y-m-d H:i:s', strtotime($historyStartsAt))
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
        return $row ? (int)$row['total_vendors'] : 0;
    }

    function ww_qrr_scoreboard($config) {
        global $w;
        $tagId = (int)$config['vendor_tag_id'];
        $historyStartsAt = mysql_real_escape_string((string)$config['history_starts_at_sql']);
        $totalVendors = ww_qrr_total_vendors($config);
        $query = "
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
            GROUP BY vv.user_id
            LIMIT 500
        ";
        $result = mysql($w['database'], $query);
        $progressRows = array();
        if ($result) {
            while ($row = mysql_fetch_assoc($result)) {
                $progressRows[] = min($totalVendors, max(0, (int)$row['scanned_count']));
            }
        }
        if (count($progressRows) > 1) { shuffle($progressRows); }

        $participants = array();
        $completedCount = 0;
        foreach ($progressRows as $index => $scannedCount) {
            $isCompleted = $totalVendors > 0 && $scannedCount >= $totalVendors;
            if ($isCompleted) { $completedCount += 1; }
            $participants[] = array(
                'label' => 'Participant ' . ((int)$index + 1),
                'scanned_count' => $scannedCount,
                'total_vendors' => $totalVendors,
                'progress_percentage' => $totalVendors > 0
                    ? min(100, (int)round(($scannedCount / $totalVendors) * 100))
                    : 0,
                'is_completed' => $isCompleted
            );
        }
        return array(
            'status' => 'success',
            'event_name' => (string)$config['event_name'],
            'participants' => $participants,
            'active_participants' => count($participants),
            'completed_participants' => $completedCount,
            'total_vendors' => $totalVendors,
            'revision' => (int)$config['revision'],
            'updated_at' => gmdate('c')
        );
    }

}

$wwQrrConfig = ww_qrr_runtime_config();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$wwQrrConfig) {
        ww_qrr_json(array('status' => 'error', 'message' => 'QR Bingo results are temporarily unavailable.'), 503);
    }
    ww_qrr_require_current_revision($wwQrrConfig);
    $action = isset($_POST['action']) && is_string($_POST['action']) ? $_POST['action'] : '';
    if ($action === 'get_scoreboard_data') {
        ww_qrr_json(ww_qrr_scoreboard($wwQrrConfig));
    }
    ww_qrr_json(array('status' => 'error', 'message' => 'Unsupported results request.'), 400);
}
?>

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
        <p class="ww-qrr-intro">Live, current-event booth progress. Temporary participant numbers are reshuffled whenever results refresh. Names, contact details, booth history, and timestamps are not displayed.</p>
      </div>
      <div class="ww-qrr-stats" aria-label="QR Bingo result totals">
        <div><span id="wwQrrActive">-</span><small>Participants</small></div>
        <div><span id="wwQrrCompleted">-</span><small>Completed</small></div>
        <div><span id="wwQrrVendors">-</span><small>Vendors</small></div>
      </div>
    </header>

    <div class="ww-qrr-toolbar">
      <label>
        <span class="sr-only">Search temporary participant numbers</span>
        <input id="wwQrrSearch" type="search" placeholder="Search participant number" autocomplete="off">
      </label>
      <button type="button" id="wwQrrRefresh">Refresh results</button>
    </div>

    <p class="ww-qrr-status" id="wwQrrStatus" role="status" aria-live="polite">Loading current results...</p>
    <div class="ww-qrr-table-wrap" id="wwQrrTableWrap" hidden>
      <table>
        <thead>
          <tr>
            <th scope="col">Participant</th>
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
<?php } ?>
