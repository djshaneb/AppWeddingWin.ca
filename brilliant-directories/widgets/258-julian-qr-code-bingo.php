<?php
// QR Bingo Scanner for Brilliant Directories
// This code checks if user is logged in and has proper subscription

// Check if user is logged in
if (user::isUserLogged($_COOKIE)) {
    $loggedInUser = getUser($_COOKIE['userid'], $w);
    $userId = $loggedInUser['user_id'];

    // October 18, 2026 Niagara Wedding Show vendors.
    $eventTagId = 30;
    // Visits before this cutoff belong to earlier 2026 shows. vendor_visits has
    // no event key, so scan_date is the event boundary for October history.
    $eventHistoryStartsAt = '2026-08-01 00:00:00';
    // Immutable mapping from the original active tag-27 roster order. Accept
    // legacy codes only for vendors that also belong to the tag-30 event.
    $legacyNws25ByBdUserId = [
        '16849' => '002',
        '27768' => '009',
        '29211' => '010',
        '29215' => '011',
        '31521' => '013',
        '38085' => '026',
        '38117' => '030',
        '38118' => '031',
        '38140' => '032',
        '38290' => '039',
        '38519' => '066'
    ];
    $isCoupleScannerMember = ($loggedInUser['subscription_id'] == 4 || $loggedInUser['subscription_id'] == 18);

    // Scan history is restricted to couple memberships. Vendor draw lookup uses
    // the BD API/tag fallback and does not depend on this presentation page.
    if ($isCoupleScannerMember) {

        // Handle AJAX requests for scanning vendors
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
            header('Content-Type: application/json');

            if ($_POST['action'] === 'scan_vendor') {
                $vendorId = $_POST['vendor_id'];
                $vendorId = mysql_real_escape_string($vendorId);

                // Stable QR identifiers are Brilliant Directories user IDs.
                // Verify the submitted vendor belongs to the current event.
                $vendorUserQuery = "
                    SELECT u.user_id
                    FROM users_data u
                    INNER JOIN rel_tags rt ON rt.object_id = u.user_id
                    WHERE u.user_id = '$vendorId'
                    AND rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                    LIMIT 1
                ";
                $vendorUserResult = mysql($w['database'], $vendorUserQuery);
                $vendorUserRow = mysql_fetch_assoc($vendorUserResult);

                if ($vendorUserRow) {
                    $actualVendorUserId = $vendorUserRow['user_id'];

                    // Insert or update the visit using the stable BD user ID
                    $query = "INSERT INTO vendor_visits (user_id, vendor_id)
                             VALUES ('$userId', '$actualVendorUserId')
                             ON DUPLICATE KEY UPDATE scan_date = NOW()";
                    mysql($w['database'], $query);
                } else {
                    echo json_encode(['status' => 'error', 'message' => 'Invalid vendor ID']);
                    exit();
                }

                // Check if user has completed all vendors - get dynamic count
                $countQuery = "
                    SELECT COUNT(DISTINCT u.user_id) as total_vendors
                    FROM users_data u
                    INNER JOIN rel_tags rt ON rt.object_id = u.user_id
                    WHERE rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                ";
                $countResult = mysql($w['database'], $countQuery);
                $countRow = mysql_fetch_assoc($countResult);
                $totalVendors = $countRow['total_vendors'];
                $scannedQuery = "
                    SELECT COUNT(DISTINCT vv.vendor_id) as count
                    FROM vendor_visits vv
                    INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
                    INNER JOIN users_data u ON u.user_id = vv.vendor_id
                    WHERE vv.user_id = '$userId'
                    AND rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                    AND vv.scan_date >= '$eventHistoryStartsAt'
                ";
                $result = mysql($w['database'], $scannedQuery);
                $row = mysql_fetch_assoc($result);
                $scannedCount = $row['count'];

                // If completed, update the completion status
                if ($scannedCount >= $totalVendors) {
                    $updateQuery = "UPDATE users_data SET bingo_completed = 1, bingo_completion_date = NOW()
                                  WHERE user_id = '$userId'";
                    mysql($w['database'], $updateQuery);
                }

                echo json_encode([
                    'status' => 'success',
                    'scanned_count' => $scannedCount,
                    'completed' => ($scannedCount >= $totalVendors)
                ]);
                exit();
            }

            if ($_POST['action'] === 'get_scanned') {
                // Return only current-event vendor visits, keyed by stable BD user ID.
                $scannedQuery = "
                    SELECT DISTINCT vv.vendor_id
                    FROM vendor_visits vv
                    INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
                    INNER JOIN users_data u ON u.user_id = vv.vendor_id
                    WHERE vv.user_id = '$userId'
                    AND rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND u.active = 2
                    AND vv.scan_date >= '$eventHistoryStartsAt'
                    ORDER BY vv.vendor_id ASC
                ";
                $scannedResult = mysql($w['database'], $scannedQuery);
                $scanned = [];
                while ($row = mysql_fetch_assoc($scannedResult)) {
                    $scanned[] = (string)$row['vendor_id'];
                }

                echo json_encode([
                    'status' => 'success',
                    'scanned' => $scanned
                ]);
                exit();
            }

            if ($_POST['action'] === 'reset_progress') {
                // Reset only this event; preserve visits from prior shows.
                $query = "
                    DELETE vv
                    FROM vendor_visits vv
                    INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
                    WHERE vv.user_id = '$userId'
                    AND rt.tag_id = '$eventTagId'
                    AND rt.tag_type_id = 1
                    AND vv.scan_date >= '$eventHistoryStartsAt'
                ";
                mysql($w['database'], $query);

                $updateQuery = "UPDATE users_data SET bingo_completed = 0, bingo_completion_date = NULL
                              WHERE user_id = '$userId'
                              AND bingo_completion_date >= '$eventHistoryStartsAt'";
                mysql($w['database'], $updateQuery);

                echo json_encode(['status' => 'success']);
                exit();
            }
        }

        // Get current-event progress using stable BD vendor IDs.
        $scannedVendors = [];
        $scannedQuery = "
            SELECT DISTINCT vv.vendor_id
            FROM vendor_visits vv
            INNER JOIN rel_tags rt ON rt.object_id = vv.vendor_id
            INNER JOIN users_data u ON u.user_id = vv.vendor_id
            WHERE vv.user_id = '$userId'
            AND rt.tag_id = '$eventTagId'
            AND rt.tag_type_id = 1
            AND u.active = 2
            AND vv.scan_date >= '$eventHistoryStartsAt'
            ORDER BY vv.vendor_id ASC
        ";
        $scannedResult = mysql($w['database'], $scannedQuery);

        if ($scannedResult) {
            while ($row = mysql_fetch_assoc($scannedResult)) {
                $scannedVendors[] = (string)$row['vendor_id'];
            }
        }

?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Niagara Wedding Show — QR Bingo</title>
  <style>
    :root{
      --rose:#ff6f91; /* WeddingWin pink */
      --wine:#7a2d45;
      --gold:#c9a24e;
      --ink:#1f2937;
      --mist:#f8fafc;
      --stone:#e5e7eb;
      --success:#16a34a;
    }
    html,body{height:100%;}
    body{
      margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      color:var(--ink); background:linear-gradient(180deg,#fff, var(--mist));
    }
    header{
      padding:12px clamp(16px,4vw,24px); position:sticky; top:0; backdrop-filter: blur(8px);
      background:rgba(255,255,255,0.8); border-bottom:1px solid var(--stone); z-index:10;
    }
    .brand{display:flex; align-items:center; gap:10px;}
    .brand .mark{width:32px; height:32px; border-radius:50%; background: conic-gradient(from 180deg, var(--rose), var(--gold), #fff 70%);
      display:grid; place-items:center; box-shadow:0 4px 12px rgba(0,0,0,.06);}
    .brand .mark::after{content:"❤"; color:#fff; font-size:16px; filter: drop-shadow(0 1px 0 rgba(0,0,0,.2));}
    h1{font-size:clamp(18px,2.5vw,24px); margin:0; line-height:1.2;}
    .sub{color:#6b7280; font-size:12px; margin-top:2px;}

    .wrap{max-width:1100px; margin:24px auto; padding:0 clamp(16px,4vw,40px);}

    /* Hide original controls on mobile, show on desktop */
    .controls{display:none;}
    @media(min-width:768px){
      .controls{display:grid; gap:12px; grid-template-columns: 1fr auto auto; align-items:end;}
    }

    label{font-size:12px; color:#6b7280; display:block; margin-bottom:6px;}

    select, button, input[type=file]{
      appearance:none; border:1px solid var(--stone); background:#fff; border-radius:12px; padding:10px 14px;
      font-size:14px; line-height:1.2; box-shadow:0 1px 0 rgba(0,0,0,.04);
    }
    @media(min-width:768px){ .controls select, .controls button, .controls input[type=file]{ width:auto; } }
    button{ cursor:pointer; border:1px solid transparent; background:var(--rose); color:#fff; font-weight:600; }
    button.secondary{ background:#fff; color:var(--ink); border-color:var(--stone); }
    button.ghost{ background:transparent; color:var(--ink); border-color:transparent; }
    button:disabled{ opacity:.6; cursor:not-allowed; }

    /* Mobile scanner with overlay controls */
    .scanner{ margin:18px 0 8px; display:grid; gap:10px; position:relative; overflow:hidden; }
    video{ width:100%; height:60vh; max-height:60vh; background:#000; border-radius:16px; object-fit:cover; }
    @media(min-width:768px){ video{ max-height:55vh; height:auto; } }
    canvas{ display:none; }

    /* Camera overlay controls for mobile */
    .camera-overlay{
      position:absolute; top:0; left:0; right:0; bottom:0; z-index:5;
      pointer-events:none; border-radius:16px; overflow:hidden;
      box-sizing:border-box; /* Ensure proper sizing */
    }
    .camera-controls{
      position:absolute; right:20px; bottom:90px;
      display:flex; flex-direction:column; gap:12px; pointer-events:auto;
    }
    .camera-btn{
      width:56px; height:56px; border-radius:50%; border:2px solid rgba(255,255,255,0.3);
      background:rgba(0,0,0,0.6); backdrop-filter:blur(12px);
      color:#fff; font-size:14px; font-weight:500;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:all 0.25s ease;
      box-shadow:0 2px 8px rgba(0,0,0,0.2);
      position:relative;
    }
    .camera-btn:hover{
      transform:scale(1.08);
      background:rgba(0,0,0,0.8);
      border-color:rgba(255,255,255,0.5);
    }
    .camera-btn:active{
      transform:scale(0.92);
      transition:transform 0.1s ease;
    }
    .camera-btn.start{
      background:rgba(255,111,145,0.9);
      border-color:rgba(255,111,145,0.5);
    }
    .camera-btn.start:hover{
      background:var(--rose);
      border-color:var(--rose);
    }
    .camera-btn.stop{
      background:rgba(220,38,38,0.9);
      border-color:rgba(220,38,38,0.5);
    }
    .camera-btn.stop:hover{
      background:#dc2626;
      border-color:#dc2626;
    }
    .camera-btn:disabled{
      opacity:0.4;
      cursor:not-allowed;
      transform:none;
      background:rgba(0,0,0,0.3);
    }

    /* Enhanced Camera settings button */
    .camera-settings{
      position:absolute; top:20px; right:20px; pointer-events:auto;
      width:48px; height:48px; border-radius:50%;
      background:rgba(0,0,0,0.7); backdrop-filter:blur(16px);
      color:#fff; border:2px solid rgba(255,255,255,0.3);
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
    }
    .camera-settings:hover{
      background:rgba(0,0,0,0.85);
      border-color:rgba(255,255,255,0.5);
      transform:scale(1.1);
      box-shadow:0 6px 16px rgba(0,0,0,0.2);
    }
    .camera-settings:active{
      transform:scale(0.95);
      transition:transform 0.1s ease;
    }

    /* Active state when dropdown is open */
    .camera-settings.active{
      background:rgba(59, 130, 246, 0.9);
      border-color:rgba(255,255,255,0.6);
      transform:scale(1.05);
    }

    /* Animation for the settings icon */
    .camera-settings svg{
      transition:transform 0.3s ease;
    }
    .camera-settings.active svg{
      transform:rotate(45deg);
    }

    /* Enhanced Camera selection dropdown overlay */
    .camera-select-overlay{
      position:absolute; top:70px; right:20px; z-index:1000;
      background:#fff; border-radius:16px; padding:16px;
      box-shadow:0 12px 32px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15);
      min-width:240px; max-width:320px; pointer-events:auto;
      border:2px solid rgba(0,0,0,0.1);
      backdrop-filter:blur(8px);
      opacity:0; visibility:hidden; transform:translateY(-8px) scale(0.95);
      transition:all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .camera-select-overlay.show{
      opacity:1; visibility:visible; transform:translateY(0) scale(1);
    }

    /* Camera dropdown title */
    .camera-select-overlay::before{
      content:"📹 Select Camera";
      display:block; font-weight:600; font-size:14px;
      color:#333; margin-bottom:12px; text-align:center;
    }

    /* Enhanced select styling */
    .camera-select-overlay select{
      width:100%; margin:0; font-size:15px; padding:12px 16px;
      border:2px solid #e5e7eb; border-radius:12px;
      background:#fff; color:#374151; font-weight:500;
      cursor:pointer; transition:all 0.2s ease;
      outline:none; appearance:none;
      background-image:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
      background-position:right 12px center; background-repeat:no-repeat; background-size:16px;
      padding-right:48px;
    }
    .camera-select-overlay select:hover{
      border-color:#d1d5db; background-color:#f9fafb;
    }
    .camera-select-overlay select:focus{
      border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* Select options styling */
    .camera-select-overlay select option{
      padding:8px 12px; font-size:14px; font-weight:500;
    }

    /* Responsive adjustments for smaller screens */
    @media (max-width: 480px) {
      .camera-select-overlay{
        right:12px; top:75px; min-width:200px; max-width:280px;
        padding:12px;
      }
      .camera-select-overlay select{
        font-size:16px; /* Prevents zoom on iOS */
      }
    }

    /* Very small screens */
    @media (max-width: 360px) {
      .camera-select-overlay{
        right:8px; left:8px; min-width:auto; max-width:none;
      }
    }

    /* Scanning indicator - DISABLED */
    .scanning-indicator{
      display: none; /* Completely hide the scanning indicator */
    }
    .scanning-indicator.active{
      display: none; /* Keep it hidden even when active */
    }

    /* Loading state for camera */
    .camera-loading{
      position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);
      color:#fff; font-size:14px; background:rgba(0,0,0,0.7);
      padding:12px 20px; border-radius:8px; pointer-events:none;
      display:none;
    }
    .camera-loading.show{ display:block; }

    @keyframes scanningPulse{
      0%, 100%{ border-color:var(--rose); opacity:1; }
      50%{ border-color:var(--rose); opacity:0.6; }
    }

    /* SVG icon styling */
    .camera-btn svg, .camera-settings svg{
      transition:all 0.2s ease;
    }
    .camera-btn:hover svg{
      transform:scale(1.1);
    }

    /* Button press feedback */
    .camera-btn:active{
      transform:scale(0.92);
      transition:transform 0.1s ease;
    }

    /* Enhanced visual integration */
    .camera-controls{
      filter:drop-shadow(0 4px 12px rgba(0,0,0,0.15));
    }

    /* Mobile optimizations */
    @media(max-width:767px){
      .wrap{ padding:0 16px; }
      .scanner{ margin:12px 0 8px; }

      /* Hide camera settings if only one camera */
      .camera-settings.single-camera{ display:none; }

      /* Android-specific video optimizations */
      video {
        -webkit-backface-visibility: hidden;
        backface-visibility: hidden;
        /* Remove mirroring for rear cameras - will be handled dynamically */
      }

      /* Larger touch targets on small screens */
      @media(max-width:480px){
        .camera-btn{ width:60px; height:60px; }
        .camera-btn svg{ width:18px; height:18px; }
        .camera-controls{ bottom:80px; gap:14px; right:16px; }
        .camera-settings{ width:48px; height:48px; top:16px; right:16px; }
        .camera-settings svg{ width:20px; height:20px; }
      }
    }

    /* Android-specific improvements */
    @media screen and (max-width: 767px) {
      /* Prevent zoom on form interactions */
      input, select, textarea, button {
        font-size: 16px !important;
      }

      /* Improve video rendering on Android */
      video {
        will-change: transform;
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
      }

      /* Fix scanning indicator positioning on mobile */
      .scanner {
        /* Ensure proper containment */
        position: relative;
        overflow: hidden;
      }

      .camera-overlay {
        /* Ensure overlay matches video dimensions exactly */
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
      }

      .scanning-indicator {
        /* Force exact positioning for Android */
        position: absolute !important;
        top: 3px !important; /* Inset by border width */
        left: 3px !important; /* Inset by border width */
        right: 3px !important; /* Inset by border width */
        bottom: 3px !important; /* Inset by border width */
        width: calc(100% - 6px); /* Account for border width */
        height: calc(100% - 6px); /* Account for border width */
        border-radius: 13px; /* Slightly smaller to fit inside */
        box-sizing: border-box;
      }
    }

    /* Hide mobile controls on desktop */
    @media(min-width:768px){
      .camera-overlay{ display:none; }
    }

    /* Prevent zoom on button tap (iOS) */
    button, select{ font-size:16px; }
    @media(max-width:767px){
      button, select{ font-size:16px; }
    }

    .progress-bar{ height:20px; background:#fff; border:1px solid var(--stone); border-radius:999px; overflow:hidden; }
    .progress{ height:100%; width:0%; background:linear-gradient(90deg, var(--rose), var(--gold)); transition: width .3s ease; }
    .progress-meta{ display:flex; justify-content:space-between; font-size:12px; color:#6b7280; margin-top:8px; }

    .grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin:18px 0 30px; }
    @media(min-width:480px){ .grid{ grid-template-columns: repeat(3, 1fr); } }
    @media(min-width:720px){ .grid{ grid-template-columns: repeat(4, 1fr); } }
    @media(min-width:1024px){ .grid{ grid-template-columns: repeat(6, 1fr); } }

    .tile{ position:relative; background:#fff; border:1px solid var(--stone); border-radius:14px; padding:12px; min-height:130px;
      display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-shadow:0 2px 10px rgba(0,0,0,.04); }
    .tile .vendor-image{ width:55px; height:55px; border-radius:50%; object-fit:cover; margin-bottom:8px; border:2px solid var(--stone); }
    .tile .vendor-image.placeholder{ background:var(--mist); display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:16px; }
    .tile .name{ font-size:clamp(11px, 3.2vw, 13px); font-weight:700; line-height:1.2; }
    @media(min-width:1024px){ .tile{ min-height:120px; } }
    .tile .cat{ font-size:11px; color:#6b7280; margin-top:6px; }
    .tile.locked{ filter: grayscale(1) contrast(0.9) opacity(0.75); }
    .tile.locked .vendor-image{ filter: grayscale(1) opacity(0.7); }
    .tile.scanned{ background:#f0fff4; border-color:#bbf7d0; outline:2px solid var(--success); box-shadow:0 0 0 4px rgba(22,163,74,.15) inset; }
    .tile.scanned .vendor-image{ border-color:var(--success); filter: none; }
    .tile .check{ position:absolute; right:8px; top:8px; width:18px; height:18px; border-radius:50%; background:#e5ffe9; color:var(--success);
      display:none; align-items:center; justify-content:center; font-size:12px; }
    .tile.scanned .check{ display:flex; }

    .done{
      display:none; position:sticky; bottom:0; background: #fff; border-top:1px solid var(--stone);
      padding:14px; padding-bottom: calc(14px + env(safe-area-inset-bottom));
      box-shadow:0 -10px 30px rgba(0,0,0,.06); z-index:20;
    }

    /* Safe-area support for notched devices */
    header{ padding-top: calc(12px + env(safe-area-inset-top)); }
    .done.on{ display:block; }

    .note{ font-size:12px; color:#6b7280; }

    .user-info{
      background: #fff; border:1px solid var(--stone); border-radius:12px; padding:12px; margin-bottom:20px;
      font-size:14px; color:#6b7280;
    }
    .user-info strong{ color:var(--ink); }

    .footer{ color:#6b7280; font-size:12px; text-align:center; padding:24px 0 50px; }

    /* Success Animation */
    .scan-success-overlay{
      position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.1);
      display:none; align-items:center; justify-content:center; z-index:9999;
      backdrop-filter: blur(2px);
    }
    .scan-success-animation{
      position:relative; width:120px; height:120px; border-radius:50%;
      background:linear-gradient(135deg, var(--success), #22c55e);
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 10px 30px rgba(22,163,74,0.3);
      animation: successPulse 0.6s ease-out;
    }
    .scan-success-animation::before{
      content:''; position:absolute; width:100%; height:100%; border-radius:50%;
      background:rgba(255,255,255,0.2); animation: ripple 0.6s ease-out;
    }
    .scan-success-animation .checkmark{
      font-size:48px; color:#fff; animation: checkmarkPop 0.4s 0.2s ease-out both;
    }
    .scan-success-animation .sparks{
      position:absolute; width:100%; height:100%;
    }
    .scan-success-animation .spark{
      position:absolute; width:6px; height:6px; background:#fff; border-radius:50%;
      animation: sparkFly 0.8s ease-out;
    }
    .scan-success-animation .spark:nth-child(1){ top:10%; left:50%; animation-delay:0.1s; transform:rotate(0deg); }
    .scan-success-animation .spark:nth-child(2){ top:25%; right:15%; animation-delay:0.2s; transform:rotate(45deg); }
    .scan-success-animation .spark:nth-child(3){ top:50%; right:5%; animation-delay:0.15s; transform:rotate(90deg); }
    .scan-success-animation .spark:nth-child(4){ bottom:25%; right:15%; animation-delay:0.25s; transform:rotate(135deg); }
    .scan-success-animation .spark:nth-child(5){ bottom:10%; left:50%; animation-delay:0.3s; transform:rotate(180deg); }
    .scan-success-animation .spark:nth-child(6){ bottom:25%; left:15%; animation-delay:0.2s; transform:rotate(225deg); }
    .scan-success-animation .spark:nth-child(7){ top:50%; left:5%; animation-delay:0.35s; transform:rotate(270deg); }
    .scan-success-animation .spark:nth-child(8){ top:25%; left:15%; animation-delay:0.1s; transform:rotate(315deg); }

    @keyframes successPulse{
      0%{ transform:scale(0.3) rotate(-10deg); opacity:0; }
      50%{ transform:scale(1.1) rotate(5deg); }
      100%{ transform:scale(1) rotate(0deg); opacity:1; }
    }
    @keyframes ripple{
      0%{ transform:scale(1); opacity:0.6; }
      100%{ transform:scale(2.5); opacity:0; }
    }
    @keyframes checkmarkPop{
      0%{ transform:scale(0); opacity:0; }
      80%{ transform:scale(1.2); }
      100%{ transform:scale(1); opacity:1; }
    }
    @keyframes sparkFly{
      0%{ transform:translateY(0) scale(0); opacity:1; }
      100%{ transform:translateY(-40px) scale(1); opacity:0; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div>
        <h1>Niagara Wedding Show — QR Bingo</h1>
        <div class="sub">Visit every vendor booth. Scan each QR. Fill your card. 🎉</div>
      </div>
    </div>
  </header>

	  <div class="wrap">

	    <section aria-label="QR Bingo promotion notice" style="background:#fff7f6;border:1px solid #efd8d5;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
	      <strong>Official rules apply to any prize entry.</strong>
	      <p style="margin:8px 0;">Scanning fills your QR Bingo card; it does not silently accept promotion rules or enter a prize draw. No purchase is necessary. A promotion must remain closed unless its entry screen provides a working alternate free entry route that requires no purchase, show attendance, or QR scan. If a promotion is open, Wedding Win Inc. will show that route plus the configured prize, approximate retail value in Canadian dollars, sponsor/prize provider, eligible region, entry close and draw time, odds basis, skill-testing-question condition, and official rules before you may choose to enter.</p>
	      <p style="margin:8px 0;"><a href="/qr-bingo-vendor-draw-rules" target="_blank" rel="noopener">View QR Bingo official rules</a></p>
	      <p style="margin:8px 0 0;">Apple Inc. is not a sponsor of and is not involved in any QR Bingo promotion, its administration, winner selection, or prize fulfillment.</p>
	    </section>

	    <section class="controls" aria-label="Scanner controls">
      <div>
        <label for="cameraSelect">Camera</label>
        <select id="cameraSelect" aria-label="Choose camera"></select>
      </div>
      <div>
        <label>&nbsp;</label>
        <button id="startBtn" disabled>🚀 Starting...</button>
      </div>
      <div>
        <label>&nbsp;</label>
        <button id="stopBtn" class="secondary" disabled>Stop</button>
      </div>
    </section>

    <section class="scanner" aria-live="polite">
      <video id="video" playsinline muted></video>
      <canvas id="frame" width="640" height="480"></canvas>

      <!-- Mobile Camera Overlay Controls -->
      <div class="camera-overlay">
        <!-- Scanning indicator border -->
        <div class="scanning-indicator" id="scanningIndicator"></div>

        <!-- Camera settings button (top right) -->
        <button class="camera-settings" id="mobileSettingsBtn" title="Camera Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
          </svg>
        </button>

        <!-- Camera selection overlay -->
        <div class="camera-select-overlay" id="cameraSelectMobile">
          <select id="cameraSelectMobile2" aria-label="Choose camera"></select>
        </div>

        <!-- Camera control buttons (bottom right) -->
        <div class="camera-controls">
          <button class="camera-btn start" id="mobileStartBtn" title="Starting..." disabled>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.5L12.5 8L3 13.5V2.5Z"/>
            </svg>
          </button>
          <button class="camera-btn stop" id="mobileStopBtn" title="Stop Scanner" disabled>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="2" width="10" height="10" rx="1"/>
            </svg>
          </button>
        </div>

        <!-- Loading indicator -->
        <div class="camera-loading" id="cameraLoading">
          📹 Initializing camera...
        </div>
      </div>

      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="<?php
      // Get total vendor count for progress bar
      $totalCountQuery = "
          SELECT COUNT(DISTINCT u.user_id) as total_vendors
          FROM users_data u
          INNER JOIN rel_tags rt ON rt.object_id = u.user_id
          WHERE rt.tag_id = '$eventTagId'
          AND rt.tag_type_id = 1
          AND u.active = 2
      ";
      $totalCountResult = mysql($w['database'], $totalCountQuery);
      $totalCountRow = mysql_fetch_assoc($totalCountResult);
      echo $totalCountRow['total_vendors'];
      ?>" aria-valuenow="0" aria-label="Completion progress">
        <div class="progress" id="progress"></div>
      </div>
      <div class="progress-meta"><span id="progressText">0 / <?php echo $totalCountRow['total_vendors']; ?> scanned</span><span id="lastScan" class="note"></span></div>
    </section>

    <section>
      <div class="grid" id="grid" aria-label="Bingo grid"></div>
    </section>

    <section class="done" id="doneBar" aria-live="polite">
      <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
	        <div><strong>All vendors scanned!</strong> Your QR Bingo card is complete. If a grand-prize promotion is open, review its official rules and confirm entry separately in the WeddingWin app.</div>
      </div>
    </section>

    <div class="footer">© 2025 Wedding Win Inc.</div>
  </div>

  <!-- Success Animation Overlay -->
  <div class="scan-success-overlay" id="successOverlay">
    <div class="scan-success-animation">
      <div class="sparks">
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
      </div>
      <div class="checkmark">✓</div>
    </div>
  </div>

  <!-- Vendor Data -->
  <script>
    const VENDORS = <?php
    // Retrieve active vendors for the October 18, 2026 show.
    $targetTagId = $eventTagId;
    $vendors = [];

    // Query each tagged user exactly once. A vendor can have multiple matching
    // rel_tags/users_photo rows, so aggregate photos and group by the stable BD
    // user ID instead of allowing the joins to duplicate VENDORS entries.
    $vendorQuery = "
        SELECT
            u.user_id,
            u.company,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as name,
            COALESCE(u.company, TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) as display_name,
            u.filename,
            COALESCE(
                MAX(CASE WHEN up.type = 'cover_photo' THEN up.file END),
                MAX(CASE WHEN up.type = 'logo' THEN up.file END)
            ) as photo_file,
            CASE
                WHEN MAX(CASE WHEN up.type = 'cover_photo' THEN up.file END) IS NOT NULL THEN 'cover_photo'
                WHEN MAX(CASE WHEN up.type = 'logo' THEN up.file END) IS NOT NULL THEN 'logo'
                ELSE NULL
            END as photo_type
        FROM users_data u
        INNER JOIN rel_tags rt ON rt.object_id = u.user_id
        LEFT JOIN users_photo up ON up.user_id = u.user_id AND up.type IN ('cover_photo', 'logo')
        WHERE rt.tag_id = '$targetTagId'
        AND rt.tag_type_id = 1
        AND u.active = 2
        GROUP BY u.user_id, u.company, u.first_name, u.last_name, u.filename
        ORDER BY u.user_id ASC
    ";

    $result = mysql($w['database'], $vendorQuery);
    if ($result) {
        while ($row = mysql_fetch_assoc($result)) {
            // Use company name if available, otherwise use concatenated first/last name
            $vendorName = !empty(trim($row['company'])) ? trim($row['company']) : trim($row['display_name']);

            // Generate full URL for the vendor
            $baseUrl = "https://www.weddingwin.ca/";
            $fullUrl = $baseUrl . $row['filename'];

            // Construct photo URL based on photo type
            $coverPhoto = "";
            $userId = $row['user_id'];
            if (!empty($row['photo_file']) && !empty($row['photo_type'])) {
                if ($row['photo_type'] === 'cover_photo') {
                    $coverPhoto = "https://www.weddingwin.ca/covers/profile/" . $row['photo_file'];
                } elseif ($row['photo_type'] === 'logo') {
                    $coverPhoto = "https://www.weddingwin.ca/logos/profile/" . $row['photo_file'];
                }
            }

            $vendors[] = [
                "id" => (string)$userId,
                "name" => $vendorName,
                "cover_photo" => $coverPhoto,
                "full_filename" => $fullUrl,
                "user_id" => (string)$userId,
                "legacy_id" => isset($legacyNws25ByBdUserId[(string)$userId])
                    ? $legacyNws25ByBdUserId[(string)$userId]
                    : ""
            ];
        }
    }

    // If no vendors found, log an error
    if (empty($vendors)) {
        error_log("QR Bingo: No vendors found with tag ID {$targetTagId}");
        // Fallback to prevent JavaScript errors
        $vendors = [
            ["id" => "", "name" => "No vendors found", "cover_photo" => "", "full_filename" => "#", "user_id" => ""]
        ];
    }

    echo json_encode($vendors, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_HEX_AMP);
    ?>;

    // Initialize with server data
    const INITIAL_SCANNED = <?php echo json_encode($scannedVendors, JSON_HEX_QUOT | JSON_HEX_APOS); ?>;
  </script>

  <!-- jsQR library -->
  <script src="https://unpkg.com/jsqr@1.4.0/dist/jsQR.js"></script>

  <!-- Modified JavaScript to use server storage -->
  <script>
    // --- State Management ---
    let scanned = new Set(INITIAL_SCANNED);
    let rafId = null;
    let stream = null;
    let decoding = false;
    let lastDecoded = '';

    // --- Server Communication ---
    async function saveVendorScan(vendorId) {
      try {
        const response = await fetch('', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `action=scan_vendor&vendor_id=${encodeURIComponent(vendorId)}`
        });

        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
          throw new Error(data.message || 'Vendor scan could not be saved');
        }
        console.log('✅ Vendor scan saved to database');
        if (data.completed) {
          console.log('🎉 Bingo completed!');
        }
        return true;
      } catch (error) {
        console.error('Error saving vendor scan:', error);
        return false;
      }
    }

    async function loadScannedVendors() {
      try {
        const response = await fetch('', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'action=get_scanned'
        });

        const data = await response.json();
        if (data.status === 'success') {
          scanned = new Set(data.scanned);
          hydrateTiles();
        }
      } catch (error) {
        console.error('Error loading scanned vendors:', error);
      }
    }

    // --- UI Build ---
    const gridEl = document.getElementById('grid');
    const progressEl = document.getElementById('progress');
    const progressTextEl = document.getElementById('progressText');
    const lastScanEl = document.getElementById('lastScan');
    const doneBar = document.getElementById('doneBar');
    const successOverlay = document.getElementById('successOverlay');

    function renderGrid() {
      if (!gridEl) {
        console.error('Grid element not found!');
        return;
      }

      gridEl.replaceChildren();
      VENDORS.forEach(v => {
        const tile = document.createElement('div');
        tile.className = 'tile locked';
        tile.id = `tile-${v.id}`;

        const placeholder = document.createElement('div');
        placeholder.className = 'vendor-image placeholder';
        placeholder.textContent = '📷';
        if (v.cover_photo && v.cover_photo.trim()) {
          const image = document.createElement('img');
          image.src = v.cover_photo;
          image.alt = v.name || 'Wedding vendor';
          image.className = 'vendor-image';
          placeholder.style.display = 'none';
          image.addEventListener('error', () => {
            image.style.display = 'none';
            placeholder.style.display = 'flex';
          });
          tile.appendChild(image);
          tile.appendChild(placeholder);
        } else {
          tile.appendChild(placeholder);
        }

        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = v.name || 'Wedding vendor';
        const check = document.createElement('div');
        check.className = 'check';
        check.textContent = '✓';
        tile.appendChild(name);
        tile.appendChild(check);
        gridEl.appendChild(tile);
      });
      updateProgress();
      console.log('✅ Grid rendered with', VENDORS.length, 'vendor tiles');
    }

    async function markScanned(id) {
      if (!VENDORS.find(v => v.id === id)) return false;
      if (scanned.has(id)) return true;

      // Never show a successful scan until the server confirms persistence.
      const saved = await saveVendorScan(id);
      if (!saved) return false;
      scanned.add(id);

      const tile = document.getElementById(`tile-${id}`);
      if (tile) {
        tile.classList.remove('locked');
        tile.classList.add('scanned');
      }
      updateProgress();
      return true;
    }

    function updateProgress() {
      const total = VENDORS.length;
      const count = scanned.size;
      const pct = Math.round((count / total) * 100);
      progressEl.style.width = pct + '%';
      const bar = document.querySelector('.progress-bar');
      bar.setAttribute('aria-valuenow', count);
      bar.setAttribute('aria-valuemax', total);
      progressTextEl.textContent = `${count} / ${total} scanned`;
      doneBar.classList.toggle('on', count === total);
    }

    function showSuccessAnimation() {
      successOverlay.style.display = 'flex';
      // Hide after animation completes
      setTimeout(() => {
        successOverlay.style.display = 'none';
      }, 1200);
    }

    function hydrateTiles() {
      VENDORS.forEach(v => {
        const tile = document.getElementById(`tile-${v.id}`);
        if (scanned.has(v.id)) {
          tile?.classList.remove('locked');
          tile?.classList.add('scanned');
        }
      });
      updateProgress();
    }

    // --- Camera / Scanning ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('frame');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const cameraSelect = document.getElementById('cameraSelect');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    // Mobile controls
    const mobileStartBtn = document.getElementById('mobileStartBtn');
    const mobileStopBtn = document.getElementById('mobileStopBtn');
    const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');
    const cameraSelectMobile = document.getElementById('cameraSelectMobile');
    const cameraSelectMobile2 = document.getElementById('cameraSelectMobile2');
    const scanningIndicator = document.getElementById('scanningIndicator');
    const cameraLoading = document.getElementById('cameraLoading');

    async function enumerateCameras() {
      cameraSelect.innerHTML = '';
      cameraSelectMobile2.innerHTML = '';

      try {
        // Request permission first on Android to get device labels
        if (isAndroid()) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            tempStream.getTracks().forEach(track => track.stop());
          } catch (permErr) {
            console.log('📱 Permission request for camera enumeration failed:', permErr);
          }
        }

        const devices = (await navigator.mediaDevices.enumerateDevices())
          .filter(d => d.kind === 'videoinput');

        console.log('📹 Raw devices found:', devices.length);

        // Enhanced function to detect rear cameras (multi-language support + device-specific patterns)
        const isRearCamera = (label, deviceId, cameraIndex) => {
          const lowerLabel = label.toLowerCase();
          const rearKeywords = [
            // English
            'back', 'rear', 'environment', 'main', 'primary',
            // Spanish
            'trasera', 'posterior', 'atrás', 'atras',
            // French
            'arrière', 'arriere',
            // German
            'hinten', 'rück',
            // Italian
            'posteriore',
            // Portuguese
            'traseira',
            // Android-specific patterns
            'facing back', 'camera2 api', 'back-facing',
            // Samsung-specific patterns (Galaxy S23, S22, etc.)
            'camera2 0', 'camera 0', 'wide', 'ultra wide',
            // Generic patterns for primary cameras
            'cam 0', 'cam_0', 'camera_0'
          ];

          const frontKeywords = [
            'front', 'frontal', 'user', 'selfie', 'facing front',
            'delantera', 'frontal', 'usuario', 'selfie',
            // Samsung front camera patterns
            'front facing', 'camera2 1', 'camera 1', 'cam 1', 'cam_1', 'camera_1'
          ];

          // Special handling for Samsung devices (Galaxy S23, etc.)
          const isSamsung = navigator.userAgent.toLowerCase().includes('samsung') ||
                          lowerLabel.includes('samsung');

          // Check for explicit front camera indicators first
          const isExplicitlyFront = frontKeywords.some(keyword => lowerLabel.includes(keyword));
          if (isExplicitlyFront) {
            console.log(`📱 Detected front camera: ${label} (explicitly marked as front)`);
            return false;
          }

          // Check for explicit rear camera indicators
          const isExplicitlyRear = rearKeywords.some(keyword => lowerLabel.includes(keyword));
          if (isExplicitlyRear) {
            console.log(`📱 Detected rear camera: ${label} (explicitly marked as rear)`);
            return true;
          }

          // For unlabeled cameras or generic labels, use device-specific heuristics
          if (!label || label === '' || label.includes('camera') || lowerLabel === 'camera') {
            // On most mobile devices, camera index 0 is typically the rear camera
            // Samsung Galaxy devices follow this pattern
            if (isSamsung || isAndroid()) {
              const isFirstCamera = cameraIndex === 0;
              console.log(`📱 Samsung/Android heuristic: Camera ${cameraIndex} - treating as ${isFirstCamera ? 'REAR' : 'FRONT'}`);
              return isFirstCamera;
            }
            // On iOS, first camera is also usually rear
            if (isiOS()) {
              const isFirstCamera = cameraIndex === 0;
              console.log(`📱 iOS heuristic: Camera ${cameraIndex} - treating as ${isFirstCamera ? 'REAR' : 'FRONT'}`);
              return isFirstCamera;
            }
          }

          // Default fallback: if no clear indicators, assume rear camera for better QR scanning
          console.log(`📱 Default fallback: ${label} - assuming REAR camera`);
          return true;
        };

        // Sort cameras to prioritize rear cameras, with enhanced mobile device handling
        const sortedDevices = devices.sort((a, b) => {
          // Get original indexes to help with camera detection
          const aIndex = devices.indexOf(a);
          const bIndex = devices.indexOf(b);

          const aIsRear = isRearCamera(a.label, a.deviceId, aIndex);
          const bIsRear = isRearCamera(b.label, b.deviceId, bIndex);

          // Prioritize rear cameras
          if (aIsRear && !bIsRear) return -1;
          if (!aIsRear && bIsRear) return 1;

          // If both are rear or both are front, maintain original order
          // This ensures camera 0 comes before camera 1, etc.
          return aIndex - bIndex;
        });

        let firstRearCameraSet = false;
        console.log('📹 Available cameras:', sortedDevices.map(d => ({
          label: d.label || 'Unlabeled Camera',
          deviceId: d.deviceId.substring(0, 10) + '...',
          isAndroid: isAndroid()
        })));

        sortedDevices.forEach((d, idx) => {
          const opt = document.createElement('option');
          const opt2 = document.createElement('option');
          opt.value = d.deviceId;
          opt2.value = d.deviceId;
          // Use the original device index for proper camera detection
          const originalIndex = devices.indexOf(d);
          const isRear = isRearCamera(d.label, d.deviceId, originalIndex);

          // Android-friendly display names
          let displayName = d.label;
          if (!displayName || displayName === '' || displayName.includes('camera')) {
            displayName = `Camera ${idx + 1}`;
            if (isAndroid()) {
              displayName += idx === 0 ? ' (Main/Rear)' : ` (Camera ${idx + 1})`;
            } else {
              displayName += isRear ? ' (Rear)' : ' (Front)';
            }
          } else {
            displayName += isRear ? ' (Rear)' : ' (Front)';
          }

          opt.textContent = displayName;
          opt2.textContent = displayName;

          // Auto-select the first rear camera with enhanced mobile detection
          if (isRear && !firstRearCameraSet) {
            opt.selected = true;
            opt2.selected = true;
            firstRearCameraSet = true;
            console.log('🎯 Auto-selected REAR camera:', displayName,
                       `(Original index: ${originalIndex}, Sorted index: ${idx})`);
          }

          cameraSelect.appendChild(opt);
          cameraSelectMobile2.appendChild(opt2);
          console.log(`📷 Camera ${idx + 1}: ${displayName} (${isRear ? 'REAR' : 'front'})`);
        });

        // Enhanced fallback strategy for rear camera selection
        if (!firstRearCameraSet && sortedDevices.length > 0) {
          console.log('⚠️ No rear camera auto-selected yet, trying fallback strategy...');

          // Try to find any rear camera in the list (not just the first one)
          let fallbackRearCameraIndex = -1;
          for (let i = 0; i < sortedDevices.length; i++) {
            const originalIndex = devices.indexOf(sortedDevices[i]);
            if (isRearCamera(sortedDevices[i].label, sortedDevices[i].deviceId, originalIndex)) {
              fallbackRearCameraIndex = i;
              console.log(`🔍 Found rear camera at position ${i}:`, sortedDevices[i].label);
              break;
            }
          }

          if (fallbackRearCameraIndex >= 0) {
            // Select the found rear camera
            cameraSelect.selectedIndex = fallbackRearCameraIndex;
            cameraSelectMobile2.selectedIndex = fallbackRearCameraIndex;
            cameraSelect.options[fallbackRearCameraIndex].selected = true;
            cameraSelectMobile2.options[fallbackRearCameraIndex].selected = true;
            console.log('🎯 Fallback: Selected rear camera at index', fallbackRearCameraIndex);
          } else {
            // Last resort: select first camera available
            console.log('⚠️ No rear camera found anywhere, using first available camera');
            cameraSelect.selectedIndex = 0;
            cameraSelectMobile2.selectedIndex = 0;
          }
        }

        // Hide camera settings button if only one camera
        if (sortedDevices.length <= 1) {
          mobileSettingsBtn.classList.add('single-camera');
        } else {
          mobileSettingsBtn.classList.remove('single-camera');
        }

        // Android-specific logging
        if (isAndroid()) {
          console.log('📱 Android camera enumeration complete. Found', sortedDevices.length, 'cameras');
        }

      } catch (err) {
        console.warn('📹 Camera enumeration failed:', err);

        // Android fallback: Add default options
        if (isAndroid()) {
          console.log('📱 Adding default Android camera options');
          const defaultOption = document.createElement('option');
          const defaultOption2 = document.createElement('option');
          defaultOption.value = '';
          defaultOption2.value = '';
          defaultOption.textContent = 'Default Camera (Rear)';
          defaultOption2.textContent = 'Default Camera (Rear)';
          cameraSelect.appendChild(defaultOption);
          cameraSelectMobile2.appendChild(defaultOption2);
        }
      }
    }

    // Detect Android and mobile browsers
    function isAndroid() {
      return /Android/i.test(navigator.userAgent);
    }

    function isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function isOldAndroid() {
      const match = navigator.userAgent.match(/Android ([0-9]+)/);
      return match && parseInt(match[1]) < 10;
    }

    function isiOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    // New function to switch cameras without stopping the scanner
    async function switchCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.warn('getUserMedia not available for camera switching');
        return;
      }

      // Show loading indicator
      cameraLoading.classList.add('show');

      // Get the selected camera
      const selectedCamera = cameraSelect.value || cameraSelectMobile2.value;
      if (!selectedCamera) {
        console.warn('No camera selected for switching');
        cameraLoading.classList.remove('show');
        return;
      }

      // Android-specific optimizations
      const isAndroidDevice = isAndroid();
      const isOldAndroidDevice = isOldAndroid();

      // Build constraints for the new camera
      const constraints = {
        video: {
          deviceId: { exact: selectedCamera },
          // Lower resolution for older Android devices
          width: { ideal: isOldAndroidDevice ? 640 : 1280 },
          height: { ideal: isOldAndroidDevice ? 480 : 720 },
          // Frame rate optimization for Android
          frameRate: { ideal: isAndroidDevice ? 15 : 30, max: 30 }
        },
        audio: false
      };

      try {
        // Get the new camera stream
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Verify stream is valid
        if (!newStream || !newStream.getVideoTracks().length) {
          throw new Error('No video tracks in new stream');
        }

        // Stop the current stream
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        // Set the new stream
        stream = newStream;
        video.srcObject = stream;

        // Android-specific video setup
        if (isAndroidDevice) {
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
        }

        await video.play();

        // Verify video is actually playing
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video play timeout')), 5000);
          const checkVideo = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(checkVideo, 100);
            }
          };
          checkVideo();
        });

        // Hide loading indicator
        cameraLoading.classList.remove('show');

        const selectedText = cameraSelect.options[cameraSelect.selectedIndex]?.text ||
                           cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text;
        console.log('📹 Camera switched successfully to:', selectedText);
        console.log('📹 New video dimensions:', video.videoWidth, 'x', video.videoHeight);

      } catch (err) {
        console.error('❌ Camera switching failed:', err);
        cameraLoading.classList.remove('show');

        // Show user-friendly error message
        const selectedText = cameraSelect.options[cameraSelect.selectedIndex]?.text ||
                           cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text || 'selected camera';
        alert(`Failed to switch to ${selectedText}. The camera might be in use by another application.`);
      }
    }

    async function startScanner() {
      if (!navigator.mediaDevices?.getUserMedia) {
        const message = isAndroid() ?
          'Camera access not supported. Please use Chrome or Firefox on Android.' :
          'Your browser does not support camera access. Try a modern browser.';
        alert(message);
        return;
      }
      stopScanner();

      // Show loading indicator
      cameraLoading.classList.add('show');

      // Android-specific optimizations
      const isAndroidDevice = isAndroid();
      const isMobileDevice = isMobile();
      const isOldAndroidDevice = isOldAndroid();

      console.log('📱 Device info:', { isAndroidDevice, isMobileDevice, isOldAndroidDevice });

      // Build Android-optimized constraints
      const constraints = {
        video: {
          // Lower resolution for older Android devices
          width: { ideal: isOldAndroidDevice ? 640 : 1280 },
          height: { ideal: isOldAndroidDevice ? 480 : 720 },
          // Frame rate optimization for Android
          frameRate: { ideal: isAndroidDevice ? 15 : 30, max: 30 }
        },
        audio: false
      };

      // Check both desktop and mobile camera selects
      const selectedCamera = cameraSelect.value || cameraSelectMobile2.value;
      if (selectedCamera) {
        constraints.video.deviceId = { exact: selectedCamera };
        const selectedText = cameraSelect.options[cameraSelect.selectedIndex]?.text ||
                           cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text;
        console.log('📹 Using selected camera:', selectedText);
      } else {
        // Android-specific camera selection
        if (isAndroidDevice) {
          // Use ideal instead of exact for better Android compatibility
          constraints.video.facingMode = { ideal: 'environment' };
        } else {
          constraints.video.facingMode = { exact: 'environment' };
        }
        console.log('📹 Requesting rear camera for', isAndroidDevice ? 'Android' : 'other device');
      }

      console.log('📹 Camera constraints:', constraints);

      // Try multiple camera access strategies with Android-specific fallbacks
      const strategies = [
        // Strategy 1: Try with specified constraints
        async () => {
          console.log('🔄 Strategy 1: Using specified constraints');
          return await navigator.mediaDevices.getUserMedia(constraints);
        },

        // Strategy 2: Android fallback with simplified constraints
        async () => {
          console.log('🔄 Strategy 2: Android simplified constraints');
          const fallbackConstraints = {
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: { ideal: 'environment' }
            },
            audio: false
          };
          if (selectedCamera) {
            fallbackConstraints.video.deviceId = { ideal: selectedCamera };
          }
          return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        },

        // Strategy 3: Try without facingMode (for problematic Android devices)
        async () => {
          console.log('🔄 Strategy 3: No facingMode constraint');
          const basicConstraints = {
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 }
            },
            audio: false
          };
          if (selectedCamera) {
            basicConstraints.video.deviceId = { ideal: selectedCamera };
          }
          return await navigator.mediaDevices.getUserMedia(basicConstraints);
        },

        // Strategy 4: Minimal constraints (last resort)
        async () => {
          console.log('🔄 Strategy 4: Minimal constraints');
          return await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      ];

      // Try each strategy
      for (let i = 0; i < strategies.length; i++) {
        try {
          console.log(`📹 Attempting camera access strategy ${i + 1}/${strategies.length}`);
          stream = await strategies[i]();

          // Verify stream is valid
          if (!stream || !stream.getVideoTracks().length) {
            throw new Error('No video tracks in stream');
          }

          video.srcObject = stream;

          // Android-specific video setup
          if (isAndroidDevice) {
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            video.muted = true;
          }

          await video.play();

          // Verify video is actually playing
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Video play timeout')), 5000);
            const checkVideo = () => {
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                clearTimeout(timeout);
                resolve();
              } else {
                setTimeout(checkVideo, 100);
              }
            };
            checkVideo();
          });

          // Success!
          stopBtn.disabled = false;
          startBtn.disabled = true;
          mobileStopBtn.disabled = false;
          mobileStartBtn.disabled = true;
          // scanningIndicator.classList.add('active'); // REMOVED - no longer showing indicator
          cameraLoading.classList.remove('show');

          console.log(`✅ Camera started successfully with strategy ${i + 1}`);
          console.log('📹 Video dimensions:', video.videoWidth, 'x', video.videoHeight);

          scanLoop();
          return;

        } catch (err) {
          console.error(`❌ Strategy ${i + 1} failed:`, err);

          // Clean up failed stream
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
          }

          // Continue to next strategy unless this was the last one
          if (i === strategies.length - 1) {
            // This was the last strategy, show error
            cameraLoading.classList.remove('show');

            let errorMessage = 'Unable to access camera. ';

            if (isAndroidDevice) {
              errorMessage += [
                'Android troubleshooting:',
                '• Allow camera permission when prompted',
                '• Try Chrome or Firefox browser',
                '• Check if other apps are using the camera',
                ''
              ].join(String.fromCharCode(10));
              errorMessage += '• Try restarting your browser';
            } else {
              errorMessage += 'Please allow camera permission and try again.';
            }

            console.error('🚨 All camera strategies failed. Final error:', err);
            alert(errorMessage);
          }
        }
      }
    }

    function stopScanner() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      stopBtn.disabled = true;
      startBtn.disabled = false;
      mobileStopBtn.disabled = true;
      mobileStartBtn.disabled = false;
      // scanningIndicator.classList.remove('active'); // REMOVED - no longer using indicator
      cameraLoading.classList.remove('show');
    }

    function scanLoop() {
      if (!video.videoWidth) {
        rafId = requestAnimationFrame(scanLoop);
        return;
      }

      const w = video.videoWidth, h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;

      // Android optimization: Use lower frame rate for scanning
      const frameSkip = isAndroid() ? 3 : 1; // Scan every 3rd frame on Android
      if (!window.frameCounter) window.frameCounter = 0;
      window.frameCounter++;

      ctx.drawImage(video, 0, 0, w, h);

      if (window.frameCounter % frameSkip === 0) {
        try {
          decodeFrame();
        } catch (e) {
          /* ignore transient errors */
        }
      }

      rafId = requestAnimationFrame(scanLoop);
    }

    function decodeFrame() {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (typeof jsQR !== 'function') {
        console.log('❌ jsQR is not available');
        return;
      }

      // Android optimization: Use different scanning options
      const scanOptions = isAndroid() ?
        {
          inversionAttempts: 'dontInvert',
          // Reduce scan region for better performance on Android
          canOverwriteImage: true
        } :
        {
          inversionAttempts: 'attemptBoth',
          canOverwriteImage: true
        };

      const code = jsQR(imgData.data, canvas.width, canvas.height, scanOptions);
      if (code && code.data && code.data !== lastDecoded) {
        console.log('📱 QR detected on', isAndroid() ? 'Android' : 'other device', '!');
        lastDecoded = code.data;
        handleDecoded(code.data);
      }
    }

    function normalizeWeddingWinVendorUrl(value) {
      try {
        const url = new URL(String(value || '').trim());
        const host = url.hostname.toLowerCase().replace(/^www[.]/, '');
        if ((url.protocol !== 'https:' && url.protocol !== 'http:') || host !== 'weddingwin.ca') return '';
        url.search = '';
        url.hash = '';
        while (url.pathname.length > 1 && url.pathname.endsWith('/')) {
          url.pathname = url.pathname.slice(0, -1);
        }
        return `https://www.weddingwin.ca${url.pathname}`;
      } catch (error) {
        return '';
      }
    }

    async function handleDecoded(data) {
      const prefix = 'nws://vendor/';
      const raw = data.trim();
      const normalizedUrl = normalizeWeddingWinVendorUrl(raw);
      console.log('🔍 QR Decoded:', raw);
      let matched = null;

      // 1) Canonical WeddingWin URLs ignore query strings, fragments and trailing slashes.
      if (normalizedUrl) {
        matched = VENDORS.find(v => normalizeWeddingWinVendorUrl(v.full_filename) === normalizedUrl);
      }
      console.log('🎯 URL Match:', matched ? `Found ${matched.name}` : 'No direct URL match');

      // Legacy printed event codes are compatibility-only. Persist the matched
      // vendor's stable BD user ID, never this old sequence number.
      if (!matched) {
        const legacyMatch = raw.match(/^NWS25-([0-9]{3})$/i);
        if (legacyMatch) matched = VENDORS.find(v => v.legacy_id === legacyMatch[1]);
      }

      // 2) ID formats: nws://vendor/<id> or raw numeric id
      if (!matched) {
        let id = null;
        if (raw.toLowerCase().startsWith(prefix)) id = raw.slice(prefix.length).trim();
        else if (/^[0-9]+$/.test(raw)) id = raw;
        console.log('🔢 ID parsed:', id);
        if (id) {
          // Match the stable Brilliant Directories vendor ID
          matched = VENDORS.find(v => v.id === id);

          // Retain the explicit user_id comparison for older payloads
          if (!matched) {
            matched = VENDORS.find(v => v.user_id && v.user_id.toString() === id);
          }
        }
        console.log('🎯 ID Match:', matched ? `Found ${matched.name}` : 'No ID match');
      }

      // 3) Try to match by user_id directly (for QR codes that contain user_id)
      if (!matched && /^[0-9]+$/.test(raw)) {
        matched = VENDORS.find(v => v.user_id && v.user_id.toString() === raw);
        console.log('🎯 User ID Match:', matched ? `Found ${matched.name}` : 'No User ID match');
      }

      if (matched) {
        const ok = await markScanned(matched.id);
        if (ok) {
          lastScanEl.textContent = `Scanned: ${matched.name}`;
          // Show success animation
          showSuccessAnimation();
        }
        console.log('✅ Successfully marked vendor:', matched.name);
      } else {
        lastScanEl.textContent = 'Unrecognized QR';
        console.log('❌ No vendor matched for:', raw);
      }
    }

    // Event listeners for desktop controls
    startBtn.addEventListener('click', startScanner);
    stopBtn.addEventListener('click', stopScanner);

    // Event listeners for mobile controls
    mobileStartBtn.addEventListener('click', startScanner);
    mobileStopBtn.addEventListener('click', stopScanner);

    // Enhanced mobile settings toggle with visual feedback
    mobileSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = cameraSelectMobile.classList.contains('show');

      if (isOpen) {
        // Close dropdown
        cameraSelectMobile.classList.remove('show');
        mobileSettingsBtn.classList.remove('active');
      } else {
        // Open dropdown
        cameraSelectMobile.classList.add('show');
        mobileSettingsBtn.classList.add('active');

        // Focus the select element for better accessibility
        setTimeout(() => {
          const selectElement = cameraSelectMobile.querySelector('select');
          if (selectElement) {
            selectElement.focus();
          }
        }, 100);
      }
    });

    // Enhanced click outside handler with better touch support
    document.addEventListener('click', (e) => {
      if (!mobileSettingsBtn.contains(e.target) && !cameraSelectMobile.contains(e.target)) {
        cameraSelectMobile.classList.remove('show');
        mobileSettingsBtn.classList.remove('active');
      }
    });

    // Handle escape key to close dropdown
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cameraSelectMobile.classList.contains('show')) {
        cameraSelectMobile.classList.remove('show');
        mobileSettingsBtn.classList.remove('active');
        mobileSettingsBtn.focus();
      }
    });

    // Sync camera selection between desktop and mobile, and switch camera if scanner is running
    cameraSelect.addEventListener('change', () => {
      cameraSelectMobile2.value = cameraSelect.value;

      // If scanner is running (start button is disabled), switch camera without stopping
      if (stream && startBtn.disabled) {
        switchCamera();
      }
    });

    cameraSelectMobile2.addEventListener('change', () => {
      cameraSelect.value = cameraSelectMobile2.value;

      // Close dropdown and remove active state with animation
      cameraSelectMobile.classList.remove('show');
      mobileSettingsBtn.classList.remove('active');

      // Show visual feedback for camera switch
      const selectedText = cameraSelectMobile2.options[cameraSelectMobile2.selectedIndex]?.text;
      console.log('📹 User selected camera:', selectedText);

      // If scanner is running (mobile start button is disabled), switch camera without stopping
      if (stream && mobileStartBtn.disabled) {
        // Provide immediate visual feedback
        cameraLoading.classList.add('show');
        switchCamera();
      }
    });


    // Initialize with auto-start functionality
    function initApp() {
      // Android-specific initialization logging
      if (isAndroid()) {
        console.log('📱 Android device detected');
        console.log('📱 User Agent:', navigator.userAgent);
        console.log('📱 Android Version:', navigator.userAgent.match(/Android ([0-9]+)/)?.[1] || 'unknown');
        console.log('📱 Browser:', navigator.userAgent.includes('Chrome') ? 'Chrome' :
                                    navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other');

        // Check for known Android camera issues
        if (isOldAndroid()) {
          console.log('⚠️ Old Android version detected - using compatibility mode');
        }
      }

      renderGrid();
      hydrateTiles();

      // Auto-start camera initialization and scanning
      (async function() {
        let cameraPermissionGranted = false;

        // Show initial loading state
        cameraLoading.classList.add('show');

        try {
          // Try to get camera permission and enumerate cameras
          if (isAndroid()) {
            console.log('📱 Requesting camera permission for Android auto-start...');
          } else {
            console.log('📹 Requesting camera permission for auto-start...');
          }

          const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          tmp.getTracks().forEach(t => t.stop());
          console.log('✅ Camera permission granted - proceeding with auto-start');
          cameraPermissionGranted = true;

        } catch (permError) {
          console.log('⚠️ Camera permission denied or failed:', permError);
          console.log('🔴 Auto-start disabled - user will need to click start button');

          // Hide loading indicator
          cameraLoading.classList.remove('show');

          // Show a user-friendly message about camera permission
          const permissionMessage = isAndroid() ?
            'Camera access is required for QR scanning. Please allow camera access and click the Start button.' :
            'Camera access is required for QR scanning. Please allow camera access and click the Start button.';

          // You could show this message in a toast or alert if desired
          console.log('📝 Permission message:', permissionMessage);
        }

        // Always enumerate cameras (even if permission failed, for UI purposes)
        await enumerateCameras();

        // Auto-start scanner if permission was granted
        if (cameraPermissionGranted) {
          console.log('🚀 Auto-starting QR scanner...');

          // Small delay to ensure UI is ready
          setTimeout(async () => {
            try {
              await startScanner();
              console.log('✅ QR scanner auto-started successfully');
            } catch (startError) {
              console.error('❌ Auto-start failed:', startError);
              console.log('🔄 User will need to manually start the scanner');

              // Reset button states to allow manual start
              startBtn.disabled = false;
              startBtn.textContent = 'Start Scanner';
              mobileStartBtn.disabled = false;
              mobileStartBtn.title = 'Start Scanner';
            }
          }, 500);
        } else {
          // Camera permission was denied, enable manual start
          console.log('🔄 Enabling manual start buttons due to permission denial');
          startBtn.disabled = false;
          startBtn.textContent = 'Start Scanner';
          mobileStartBtn.disabled = false;
          mobileStartBtn.title = 'Start Scanner';

          // Hide loading indicator
          cameraLoading.classList.remove('show');
        }
      })();

      console.log('🎉 QR Bingo initialized successfully');
    }

    // Ensure DOM is ready before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  </script>
</body>
</html>

<?php
    } else {
        // User doesn't have the required subscription
        echo "<div style='padding: 20px; text-align: center;'>";
        echo "<h2>Premium Feature</h2>";
        echo "<p>The QR Bingo Scanner is available for premium members only.</p>";
        echo "<p>Please upgrade your subscription to access this feature.</p>";
        echo "</div>";
    }
} else {
    // User is not logged in
    echo "<div style='padding: 20px; text-align: center;'>";
    echo "<h2>Please Log In</h2>";
    echo "<p>You need to be logged in to access the QR Bingo Scanner.</p>";
    echo "<a href='/login'>Log In</a>";
    echo "</div>";
}
?>
