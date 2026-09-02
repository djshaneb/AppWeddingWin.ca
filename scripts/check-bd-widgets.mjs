import fs from 'node:fs';

const qrPath = 'brilliant-directories/widgets/258-julian-qr-code-bingo.php';
const qrResultsPath = 'brilliant-directories/widgets/262-qr-bingo-results.php';
const qrResultsScriptPath = 'brilliant-directories/widgets/262-qr-bingo-results.js';
const qrResultsStylePath = 'brilliant-directories/widgets/262-qr-bingo-results.css';
const vendorDrawPath = 'brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.php';
const vendorDrawScriptPath = 'brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js';
const vendorDrawStylePath = 'brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.css';
const emailPath = 'brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php';
const qrAdminSettingsPath = 'brilliant-directories/widgets/ww-qr-bingo-settings.php';
const alternateEntryFormPath = 'brilliant-directories/forms/qr-bingo-free-entry.json';
const alternateEntryPagePath = 'brilliant-directories/pages/qr-bingo-free-entry.html';
const officialRulesPath = 'brilliant-directories/pages/qr-bingo-official-rules.html';
const migrationPath = 'supabase/migrations/20260828031649_stabilize_qr_bingo_vendor_ids_and_draw_signing.sql';
const raffleAuditMigrationPath = 'supabase/migrations/20260828162602_add_qr_bingo_official_rules_audit.sql';
const multiWinnerMigrationPath = 'supabase/migrations/20260830170000_add_qr_bingo_multi_winner_pool_controls.sql';
const inPersonEntryMigrationPath = 'supabase/migrations/20260901072000_disable_qr_bingo_alternate_free_entry.sql';
const inPersonRulesMigrationPath = 'supabase/migrations/20260901073000_require_in_person_qr_bingo_rules.sql';
const qrAdminEdgePath = 'supabase/functions/bd-qr-bingo-admin/index.ts';
const qrSyncPath = 'supabase/functions/bd-qr-bingo-sync/index.ts';
const qrVendorSyncPath = 'supabase/functions/bd-qr-bingo-vendor-sync/index.ts';
const qrUrlPolicyPath = 'lib/webview_url_policy.ts';
const identityPath = 'supabase/functions/_shared/bd_identity.ts';
const appPath = 'app/(tabs)/index.tsx';
const appConfigPath = 'app.json';
const authCallbackPath = 'app/auth-callback.tsx';
const pushSweepPath = 'supabase/functions/bd-push-sweep/index.ts';
const chatStatusPath = 'supabase/functions/bd-chat-status/index.ts';
const qr = fs.readFileSync(qrPath, 'utf8');
const qrResults = fs.readFileSync(qrResultsPath, 'utf8');
const qrResultsScript = fs.readFileSync(qrResultsScriptPath, 'utf8');
const qrResultsStyle = fs.readFileSync(qrResultsStylePath, 'utf8');
const vendorDraw = fs.readFileSync(vendorDrawPath, 'utf8');
const vendorDrawScript = fs.readFileSync(vendorDrawScriptPath, 'utf8');
const vendorDrawStyle = fs.readFileSync(vendorDrawStylePath, 'utf8');
const email = fs.readFileSync(emailPath, 'utf8');
const qrAdminSettings = fs.readFileSync(qrAdminSettingsPath, 'utf8');
const alternateEntryForm = JSON.parse(fs.readFileSync(alternateEntryFormPath, 'utf8'));
const alternateEntryPage = fs.readFileSync(alternateEntryPagePath, 'utf8');
const officialRules = fs.readFileSync(officialRulesPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const raffleAuditMigration = fs.readFileSync(raffleAuditMigrationPath, 'utf8');
const multiWinnerMigration = fs.readFileSync(multiWinnerMigrationPath, 'utf8');
const inPersonEntryMigration = fs.readFileSync(inPersonEntryMigrationPath, 'utf8');
const inPersonRulesMigration = fs.readFileSync(inPersonRulesMigrationPath, 'utf8');
const qrAdminEdge = fs.readFileSync(qrAdminEdgePath, 'utf8');
const qrSync = fs.readFileSync(qrSyncPath, 'utf8');
const qrVendorSync = fs.readFileSync(qrVendorSyncPath, 'utf8');
const qrUrlPolicy = fs.readFileSync(qrUrlPolicyPath, 'utf8');
const identity = fs.readFileSync(identityPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const appConfig = fs.readFileSync(appConfigPath, 'utf8');
const authCallback = fs.readFileSync(authCallbackPath, 'utf8');
const pushSweep = fs.readFileSync(pushSweepPath, 'utf8');
const chatStatus = fs.readFileSync(chatStatusPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const currentInPersonRulesVersion = '2026-09-01-in-person-entry';

function normalizeQrEdgeCopy(source) {
  return source
    .replace(
      'const action = String(body?.action || "vendor_raffle_get");',
      'const action = String(body?.action || "list");'
    )
    .replace(
      'console.error("bd-qr-bingo-vendor-sync request failed", failure);',
      'console.error("bd-qr-bingo-sync request failed", failure);'
    )
    .replace(
      'error: "QR Bingo vendor sync unavailable",',
      'error: "QR Bingo sync unavailable",'
    );
}

assert(
  normalizeQrEdgeCopy(qrVendorSync) === normalizeQrEdgeCopy(qrSync),
  'Couple and vendor QR Edge copies differ outside their three intentional endpoint labels'
);

assert(
  qr.includes('bd-qr-bingo-admin?action=public_config') &&
    qr.includes("$eventTagId = intval($eventConfig['vendor_tag_id']);") &&
    qr.includes("$config['history_starts_at_unix'] = $historyTimestamp;") &&
    qr.includes("$config['entry_closes_at_unix'] = $entryClosesTimestamp;") &&
    qr.includes("intval($eventConfig['history_starts_at_unix'])") &&
    qr.includes("intval($eventConfig['entry_closes_at_unix'])") &&
    !qr.includes('- (4 * 60 * 60)'),
  'QR widget does not consume the canonical published event configuration'
);
assert(
    qr.includes('ww_qr_bingo_is_positive_json_integer') &&
    qr.includes('ww_qr_bingo_is_event_key') &&
    qr.includes('ww_qr_bingo_is_weddingwin_https_url') &&
    qr.includes('ww_qr_bingo_is_rfc3339_timestamp') &&
    qr.includes("is_bool($config['scan_enabled'])") &&
    qr.includes("is_bool($config['vendor_draws_enabled'])"),
  'QR widget does not strictly validate the public event configuration'
);
assert(
  qr.includes("$_POST['expected_event_key']") &&
    qr.includes("$_POST['expected_config_revision']") &&
    qr.includes("'code' => 'stale_event_config'") &&
    qr.includes('expected_event_key=${encodeURIComponent(EVENT_CONFIG.event_key)}') &&
    qr.includes('expected_config_revision=${encodeURIComponent(EVENT_CONFIG.revision)}'),
  'QR website actions are not protected against a stale rendered event revision'
);
assert(!/tag_id\s*=\s*27/.test(qr), 'QR widget still contains tag 27');
assert(!/targetTagId\s*=\s*27/.test(qr), 'QR widget still targets tag 27');
assert(qr.includes('"id" => (string)$vendorUserId'), 'QR widget ID is not the stable BD user ID');
assert(!qr.includes('$vendorUserIdToIndex'), 'QR widget still maps visits to array positions');
assert(qr.includes('GROUP BY u.user_id'), 'QR widget vendor query does not deduplicate BD users');
assert(
  (qr.match(/vv\.scan_date\s*>=\s*'\$eventHistoryStartsAt'/g) || []).length >= 3 &&
    (qr.match(/vv\.scan_date\s*<\s*'\$eventScanClosesAt'/g) || []).length >= 3 &&
    qr.includes("$scanWindowOpensAt = isset($eventConfig['history_starts_at_unix'])") &&
    qr.includes("$scanWindowClosesAt = isset($eventConfig['entry_closes_at_unix'])") &&
    qr.includes('time() < $scanWindowOpensAt || time() >= $scanWindowClosesAt') &&
    qr.includes("'code' => 'show_scan_window_closed'") &&
    qr.indexOf("'code' => 'show_scan_window_closed'") < qr.indexOf('INSERT INTO vendor_visits'),
  'QR widget does not fail closed outside the exact show window before recording a visit'
);
assert(!qr.includes('reset_progress'), 'QR widget exposes the undocumented progress-reset action');
assert(
  qr.includes('function ww_qr_bingo_fixture_context($response)') &&
    qr.includes("$appReviewFixture === $emailTestFixture") &&
    qr.includes("count($body['vendors']) !== 1") &&
    qr.includes('!hash_equals($vendorId, $vendorUserId)') &&
    qr.includes('!hash_equals($vendorId, $scannedVendorId)') &&
    qr.includes("$body['total_count'] !== 1") &&
    qr.includes("$body['scanned_count'] !== $scannedCount") &&
    qr.includes("$body['completed'] !== ($scannedCount === 1)") &&
    qr.includes("$fixtureProbeResponse = ww_qr_bingo_vendor_draw_request(") &&
    qr.includes("'fixture_context',") &&
    qr.includes("$fixtureVendorId = (string)$fixtureContext['vendor']['id'];") &&
    qr.includes("'vendor_id' => $fixtureVendorId") &&
    qr.includes("'participation_notice_version' => $participationNoticeVersion") &&
    qr.includes("$freshFixtureContext = ww_qr_bingo_fixture_context($fixtureScanResponse);") &&
    qr.includes("$scannedVendors = $fixtureContext['scanned'];") &&
    qr.includes("$fixtureVendor = $fixtureContext['vendor'];") &&
    qr.includes('$totalVendorCount = 1;') &&
    (qr.match(/AND u\.active = 2/g) || []).length >= 8 &&
    !qr.includes('39001'),
  'QR website fixture access must require a strict authenticated one-vendor Edge proof while preserving the production active-tag path'
);
assert(
  qrUrlPolicy.includes('queryEntries.length === 1') &&
    qrUrlPolicy.includes('queryEntries[0][0] === "vendor_id"') &&
    qrUrlPolicy.includes('(qrHost === "weddingwin.ca" || qrHost === "www.weddingwin.ca")') &&
    qrUrlPolicy.includes('normalizedPath === "/qr"') &&
    qrUrlPolicy.includes('/^[1-9][0-9]{0,19}$/.test(vendorIds[0])') &&
    app.includes('if (!qrPayloadUrlAllowed(raw)) return null;') &&
    app.includes('data: `https://www.weddingwin.ca/qr?vendor_id=${encodeURIComponent(vendors[0].id)}`'),
  'Native production scanning does not require one canonical WeddingWin /qr?vendor_id payload while preserving the isolated fixture emulator'
);
assert(
  app.includes('history_starts_at: string;') &&
    app.includes('const historyStartsAt = normalizedText(payload.history_starts_at, 80);') &&
    app.includes('historyStartsAtMs >= entryClosesAtMs') &&
    app.includes("new Date(String(eventConfig?.history_starts_at || '')).getTime()") &&
    app.includes("new Date(String(eventConfig?.entry_closes_at || '')).getTime()") &&
    app.includes('scanWindowNow >= scanOpensAt') &&
    app.includes('scanWindowNow < scanClosesAt') &&
    !app.includes('scanClosesAt - (4 * 60 * 60 * 1000)'),
  'Native scanner does not validate and enforce both published show-window boundaries'
);
const unmatchedQrBranch = app.match(
  /if \(!matched\) \{([\s\S]*?)\n\s*\}\n\s*\n\s*if \(scannedVendorIds\.has/
)?.[1];
assert(unmatchedQrBranch, 'Native scanner unrecognized-QR branch could not be located');
assert(
  !unmatchedQrBranch.includes('onScan('),
  'Native scanner plays the success feedback callback for an unrecognized QR'
);
assert(
  /const saved = await saveBingoScan\(matched\);\s*if \(saved\) \{\s*onScan\(value\);\s*\}/.test(app),
  'Native scanner no longer plays success feedback after a saved QR scan'
);
assert(
  app.includes('Notifications.useLastNotificationResponse()') &&
    app.includes('nativeSessionHydrated') &&
    app.includes('Notifications.clearLastNotificationResponse()'),
  'Native chat does not recover notification taps received during cold start'
);
assert(
  app.includes("AppState.addEventListener('change'") &&
    app.includes('Notifications.setBadgeCountAsync(normalizedCount)') &&
    app.includes('updateAppBadge(0)'),
  'Native app does not synchronize or clear notification badges'
);
assert(
  pushSweep.includes('badge: unreadCount') && chatStatus.includes('unread_count: unreadCount'),
  'Chat push payloads and the native status response do not use the same unread count'
);
assert(
  authCallback.includes("router.replace('/(tabs)')"),
  'Native auth-callback homepage button does not return to the app'
);
assert(
  authCallback.includes('accessibilityRole="button"') &&
    authCallback.includes('accessibilityLabel="Go to homepage"'),
  'Native auth-callback homepage control is not exposed as an accessible button'
);
const vendorRaffleFetch = app.match(
  /const fetchVendorRaffle = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);\n\n  const openVendorRaffle/
)?.[1];
assert(vendorRaffleFetch, 'Vendor draw fetch block could not be located');
assert(
  vendorRaffleFetch.includes('setVendorRaffle(null)') &&
    vendorRaffleFetch.includes('if (!data?.vendor)') &&
    vendorRaffleFetch.match(/setVendorRaffle\(null\)/g)?.length >= 2,
  'Vendor draw fetch does not clear stale data and fail closed when eligibility cannot be verified'
);
const vendorEligibilityGateStart = app.indexOf('{vendorRaffle?.vendor ? (');
const vendorEligibilityGateEnd = app.indexOf(
  '\n                  </>\n                ) : null}\n              </ScrollView>',
  vendorEligibilityGateStart
);
const vendorEligibilityGate = vendorEligibilityGateStart >= 0 && vendorEligibilityGateEnd > vendorEligibilityGateStart
  ? app.slice(vendorEligibilityGateStart, vendorEligibilityGateEnd)
  : '';
assert(
  vendorEligibilityGate.includes('testID="vendor-draw-step-prize"') &&
    vendorEligibilityGate.includes('accessibilityLabel="Open your prize draw"') &&
    vendorEligibilityGate.includes("'Select potential winner'"),
  'Vendor draw setup and potential-winner controls are not gated on an eligible vendor response'
);
assert(
  /disabled=\{\s*emailLoginLoading \|\|\s*signupLoading \|\|\s*\(authMode === 'signup' && !signupConsentAccepted\)\s*\}/.test(app),
  'Signup action is visually disabled for missing consent but remains interactable'
);
assert(
  qr.includes('const vendorId = extractWeddingWinQrVendorId(raw);') &&
    qr.includes("entries.length !== 1 || entries[0][0] !== 'vendor_id'") &&
    qr.includes("/^[1-9][0-9]{0,19}$/.test(vendorId)"),
  'QR website scanner does not require one canonical numeric vendor_id query'
);
const queryParserStart = qr.indexOf('function extractWeddingWinQrVendorId');
const queryParserEnd = qr.indexOf('\n\n    function resetLastDecodedForRetry', queryParserStart);
assert(queryParserStart >= 0 && queryParserEnd > queryParserStart, 'QR query-token parser could not be isolated');
const extractWeddingWinQrVendorId = new Function(
  `${qr.slice(queryParserStart, queryParserEnd)}; return extractWeddingWinQrVendorId;`
)();
assert(
  extractWeddingWinQrVendorId('https://www.weddingwin.ca/qr?vendor_id=16849') === '16849' &&
    extractWeddingWinQrVendorId('https://weddingwin.ca/qr/?vendor_id=38970') === '38970',
  'QR widget rejects a canonical WeddingWin booth URL'
);
for (const rejected of [
  '16849',
  'NWS25-002',
  'nws://vendor/16849',
  'http://www.weddingwin.ca/qr?vendor_id=16849',
  'https://evil.weddingwin.ca/qr?vendor_id=16849',
  'https://attacker.example/qr?vendor_id=16849',
  'https://www.weddingwin.ca/vendor?vendor_id=16849',
  'https://www.weddingwin.ca/qr?vendor=16849',
  'https://www.weddingwin.ca/qr?vendor_id=999&vendor=16849',
  'https://www.weddingwin.ca/qr?vendor_id=16849&vendor_id=38970',
  'https://www.weddingwin.ca:444/qr?vendor_id=16849',
  'https://user:password@www.weddingwin.ca/qr?vendor_id=16849',
  'https://www.weddingwin.ca/qr?vendor_id=16849#fragment',
]) {
  assert(extractWeddingWinQrVendorId(rejected) === '', `QR widget accepts unsafe or non-canonical payload: ${rejected}`);
}
const retryHelperStart = qr.indexOf('function resetLastDecodedForRetry');
const retryHelperEnd = qr.indexOf('\n\n    async function handleDecoded', retryHelperStart);
assert(retryHelperStart >= 0 && retryHelperEnd > retryHelperStart, 'QR retry helper could not be isolated');
const retryHarness = new Function(`
  let lastDecoded = 'failed-payload';
  let pending = null;
  const window = { setTimeout: (callback, delay) => { pending = { callback, delay }; } };
  ${qr.slice(retryHelperStart, retryHelperEnd)};
  resetLastDecodedForRetry('failed-payload');
  return {
    delay: pending && pending.delay,
    run: () => pending.callback(),
    value: () => lastDecoded,
    replace: (value) => { lastDecoded = value; }
  };
`)();
assert(retryHarness.delay === 1000, 'QR retry helper does not debounce repeated camera frames');
retryHarness.run();
assert(retryHarness.value() === '', 'QR retry helper does not release the failed payload');
const retryGuardHarness = new Function(`
  let lastDecoded = 'failed-payload';
  let pending = null;
  const window = { setTimeout: (callback, delay) => { pending = { callback, delay }; } };
  ${qr.slice(retryHelperStart, retryHelperEnd)};
  resetLastDecodedForRetry('failed-payload');
  lastDecoded = 'new-payload';
  pending.callback();
  return lastDecoded;
`)();
assert(retryGuardHarness === 'new-payload', 'A delayed QR retry can clear a newer decoded payload');
const handleDecodedStart = qr.indexOf('async function handleDecoded');
const handleDecodedEnd = qr.indexOf('\n\n    // Event listeners for desktop controls', handleDecodedStart);
const handleDecodedSource = qr.slice(handleDecodedStart, handleDecodedEnd);
assert(handleDecodedStart >= 0 && handleDecodedEnd > handleDecodedStart, 'QR decoded handler could not be isolated');
assert(
  (handleDecodedSource.match(/resetLastDecodedForRetry\(raw\);/g) || []).length === 2,
  'QR decoded handler must release only failed-save and unrecognized payloads'
);
const successfulSaveStart = handleDecodedSource.indexOf('if (ok) {');
const successfulSaveEnd = handleDecodedSource.indexOf('} else {', successfulSaveStart);
assert(
  successfulSaveStart >= 0 &&
    successfulSaveEnd > successfulSaveStart &&
    !handleDecodedSource.slice(successfulSaveStart, successfulSaveEnd).includes('resetLastDecodedForRetry'),
  'QR decoded handler releases a successfully saved payload and can submit duplicates'
);
assert(!qr.includes('tile.innerHTML'), 'QR widget renders vendor data through innerHTML');
assert(qr.includes('if (!saved) return false;'), 'QR widget marks a scan before the server confirms it');
assert(
  qr.includes("requestVendorDraw('raffle_offer'") &&
    qr.includes("requestVendorDraw('raffle_opt_in'") &&
    qr.includes('function ww_qr_bingo_vendor_draw_request') &&
    !qr.includes('const WEBSITE_SESSION') &&
    qr.includes('id="vendorDrawResponsibility"') &&
    qr.includes('promotion_responsibility_acknowledged: Boolean(vendorDrawResponsibility.checked)') &&
    qr.includes('draw_administration_contact_share_acknowledged: Boolean(vendorDrawResponsibility.checked)') &&
    qr.includes('vendor_marketing_consent_acknowledged: Boolean(vendorDrawResponsibility.checked)') &&
    app.includes('draw_administration_contact_share_acknowledged: promotionResponsibilityAccepted') &&
    app.includes('vendor_marketing_consent_acknowledged: promotionResponsibilityAccepted') &&
    qr.includes('await openVendorDrawOffer(matched);') &&
    qr.includes("drawButton.textContent = 'Review optional prize draw';") &&
    qr.includes('drawButton.hidden = !scanned.has(v.id);') &&
    qr.includes('openVendorDrawOffer(v);') &&
    qr.includes('$scanned[] = $scannedVendorId;') &&
    !qr.includes('$scanned[$scannedVendorId] = true;'),
  'QR website and native flows do not keep vendor draw entry optional with explicit participant responsibility and contact-sharing acceptance'
);
assert(
  qr.includes('Number of winners and prizes: ${offeredWinnerCount}') &&
    qr.includes("typeof offer.exclude_previous_winners !== 'boolean'") &&
    qr.includes('A couple who is confirmed as a winner is excluded only from later selections') &&
    qr.includes("It does not affect another vendor's draw") &&
    qr.includes('A confirmed winner remains eligible for another selection') &&
    qr.includes('aria-describedby="vendorDrawDescription vendorDrawPrivacy vendorDrawStatus"') &&
    qr.includes('vendorDrawReturnFocus') &&
    qr.includes("event.key !== 'Tab'") &&
    qr.includes('vendorDrawDialog.contains(document.activeElement)'),
  'QR website opt-in does not disclose winner count and repeat policy or preserve accessible modal focus'
);
assert(
  qr.includes('function trustedVendorOfferVersion') &&
    qr.includes('const offerVersion = trustedVendorOfferVersion(offer && offer.vendor_offer_version);') &&
    qr.includes("$drawPayload['vendor_offer_version'] = $vendorOfferVersion;") &&
    qr.includes('vendor_offer_version: trustedVendorOfferVersion(currentVendorDrawOffer.vendor_offer_version)') &&
    qr.includes("error.httpStatus === 409 && error.code === 'stale_vendor_offer'") &&
    qr.includes('await refreshVendorDrawAfterStale(currentVendorDrawVendor);'),
  'QR website opt-in does not preserve the trusted vendor offer version or refresh and fail closed after a stale offer'
);
const websiteRaffleOptInProxy = qr.match(
  /\$drawPayload = array\('vendor_id' => \$drawVendorId\);\s*if \(\$_POST\['action'\] === 'raffle_opt_in'\) \{([\s\S]*?)\n\s*\}\n\s*\$drawResponse =/
)?.[1];
assert(websiteRaffleOptInProxy, 'QR website raffle opt-in proxy could not be isolated');
assert(
  websiteRaffleOptInProxy.includes("isset($_POST['participant_responsibility_disclosure'])") &&
    websiteRaffleOptInProxy.includes("is_string($_POST['participant_responsibility_disclosure'])") &&
    websiteRaffleOptInProxy.includes("? $_POST['participant_responsibility_disclosure']") &&
    !websiteRaffleOptInProxy.includes("trim($_POST['participant_responsibility_disclosure'])") &&
    websiteRaffleOptInProxy.includes('strlen($participantResponsibilityDisclosure) > 2000') &&
    websiteRaffleOptInProxy.includes('trim($participantResponsibilityDisclosure) !== $participantResponsibilityDisclosure') &&
    websiteRaffleOptInProxy.includes("strpos($participantResponsibilityDisclosure, '<') !== false") &&
    websiteRaffleOptInProxy.includes("strpos($participantResponsibilityDisclosure, '>') !== false") &&
    websiteRaffleOptInProxy.includes("preg_match(\n                        '/[[:cntrl:]]/u'") &&
    websiteRaffleOptInProxy.includes("'code' => 'invalid_participant_responsibility_disclosure'") &&
    websiteRaffleOptInProxy.includes("$drawPayload['draw_administration_contact_share_acknowledged']") &&
    websiteRaffleOptInProxy.includes("isset($_POST['draw_administration_contact_share_acknowledged'])") &&
    websiteRaffleOptInProxy.includes("$drawPayload['vendor_marketing_consent_acknowledged']") &&
    websiteRaffleOptInProxy.includes("isset($_POST['vendor_marketing_consent_acknowledged'])") &&
    websiteRaffleOptInProxy.includes("$drawPayload['participant_responsibility_disclosure'] = $participantResponsibilityDisclosure;"),
  'QR website opt-in does not validate and forward the exact disclosure and named-vendor marketing acknowledgement'
);
assert(
  qr.includes("$config['rules_version'] = $rulesVersion;") &&
    qr.includes("'couple|' . (string)$userId . '|' . $eventConfig['event_key'] . '|' . $participationNoticeVersion") &&
    qr.includes('id="qrRulesNoticeAcknowledged"') &&
    qr.includes('I agree to the QR Bingo Terms.') &&
    qr.includes('href="/about/terms"') &&
    qr.includes('href="/about/privacy"') &&
    !qr.includes('If I choose to enter a named vendor\'s draw, Wedding Win Inc. will share my name') &&
    app.includes('testID="qr-bingo-terms-acknowledgement"') &&
    app.includes('I agree to the QR Bingo Terms.') &&
    app.includes('Read QR Bingo Terms') &&
    app.includes('View Privacy Policy') &&
    qr.includes('window.localStorage.getItem(storageKey)') &&
    qr.includes("window.localStorage.setItem(storageKey, '1')") &&
    qr.includes('qrRulesNotice.hidden = true;'),
  'QR website notice is not a compact, per-couple, event-and-rules-version acknowledgement that stays dismissed'
);
const appNoticeVersion = app.match(/const QR_BINGO_PARTICIPATION_NOTICE_VERSION = '([^']+)'/)?.[1];
const websiteNoticeVersion = qr.match(/\$participationNoticeVersion = \(string\)\$eventConfig\['rules_version'\] \. '\|([^']+)'/)?.[1];
for (const [label, source] of [['couple QR function', qrSync], ['vendor QR function', qrVendorSync]]) {
  const edgeNoticeVersion = source.match(/const QR_PARTICIPATION_NOTICE_VERSION = "([^"]+)"/)?.[1];
  assert(
    appNoticeVersion === currentInPersonRulesVersion &&
      websiteNoticeVersion === currentInPersonRulesVersion &&
      edgeNoticeVersion === currentInPersonRulesVersion,
    `${label} notice version is not aligned with native and website QR Bingo`
  );
  const productionScanStart = source.indexOf('if (action === "scan")');
  const productionScanEnd = source.indexOf('if (action === "raffle_offer")', productionScanStart);
  const productionScan = productionScanStart >= 0 && productionScanEnd > productionScanStart
    ? source.slice(productionScanStart, productionScanEnd)
    : '';
  assert(
    productionScan.includes('const scanResult = await postQrAction(') &&
      productionScan.includes('action: "scan_vendor"') &&
      productionScan.includes('participation_notice_version: qrParticipationNoticeVersion()') &&
      productionScan.includes('const safeStatus = [409, 422, 428].includes(upstreamStatus)'),
    `${label} production scan does not forward the notice version or preserve safe website rejection statuses`
  );
}
assert(
  alternateEntryPage.includes('cannot be used to submit a new entry') &&
    alternateEntryPage.includes('href="/qr"') &&
    !alternateEntryPage.includes('[form=qr_bingo_free_entry]') &&
    !alternateEntryPage.includes('alternate_free_entry_offers') &&
    !/<form\b/i.test(alternateEntryPage) &&
    !/<script\b/i.test(alternateEntryPage) &&
    !qr.includes('vendorDrawFreeEntry') &&
    !vendorDraw.includes('data-role="free-entry-link"') &&
    !vendorDrawScript.includes('freeEntryLink'),
  'Retired off-site entry is still linked, rendered, loaded, or referenced by live couple/vendor UI'
);
const adminGetStart = qrAdminEdge.indexOf('if (action === "admin_get")');
const retiredAdminStart = qrAdminEdge.indexOf(
  'action === "declare_alternate_entry_reconciliation_complete" ||'
);
const legacyAdminStart = qrAdminEdge.indexOf(
  'if (action === "declare_alternate_entry_reconciliation_complete")',
  retiredAdminStart + 1
);
assert(
  adminGetStart >= 0 && retiredAdminStart > adminGetStart && legacyAdminStart > retiredAdminStart &&
    !qrAdminEdge.slice(adminGetStart, retiredAdminStart).includes('alternate_entry_operations') &&
    qrAdminEdge.slice(retiredAdminStart, legacyAdminStart).includes('code: "offsite_entry_retired"') &&
    qrAdminEdge.slice(retiredAdminStart, legacyAdminStart).includes('}, 410);'),
  'Admin alternate-entry actions do not fail closed with HTTP 410 before historical code'
);
for (const [label, source] of [['couple QR function', qrSync], ['vendor QR function', qrVendorSync]]) {
  const retiredOfferStart = source.indexOf('if (action === "alternate_free_entry_offers")');
  const retiredOfferEnd = source.indexOf('if (!runtimeConfig.scan_enabled', retiredOfferStart);
  const retiredOffer = source.slice(retiredOfferStart, retiredOfferEnd);
  const enterableStart = source.indexOf('function isSettingsEnterable(');
  const enterableEnd = source.indexOf('\nasync function ', enterableStart);
  const enterable = source.slice(enterableStart, enterableEnd);
  assert(
    retiredOfferStart >= 0 && retiredOfferEnd > retiredOfferStart &&
      retiredOffer.includes('code: "offsite_entry_retired"') &&
      /\},\s*410,\s*false,?\s*\);/.test(retiredOffer) &&
      !retiredOffer.includes('publicAlternateFreeEntryOffers()') &&
      !retiredOffer.includes('offers:'),
    `${label} still exposes public off-site vendor offers instead of HTTP 410`
  );
  assert(
    source.includes('function productionShowScanWindowOpen()') &&
      source.includes('const opensAt = new Date(qrBingoConfig().history_starts_at).getTime();') &&
      source.includes('const closesAt = new Date(qrBingoConfig().entry_closes_at).getTime();') &&
      source.includes('Number.isFinite(opensAt)') &&
      source.includes('Number.isFinite(closesAt)') &&
      source.includes('opensAt < closesAt') &&
      source.includes('Date.now() >= opensAt') &&
      source.includes('Date.now() < closesAt') &&
      !source.includes('PRODUCTION_SHOW_DURATION_MS') &&
      (source.match(/!productionShowScanWindowOpen\(\)/g) || []).length >= 3 &&
      (source.match(/code: "show_entry_window_closed"/g) || []).length >= 2 &&
      source.includes('code: "show_scan_window_closed"'),
    `${label} does not enforce the exact show window for scan, offer review, and opt-in`
  );
  assert(
    enterableStart >= 0 && enterableEnd > enterableStart &&
      !enterable.includes('alternateFreeEntryUrl') &&
      !enterable.includes('alternate_free_entry_url') &&
      !enterable.includes('validHttpsUrl'),
    `${label} still gates vendor activation on the retired off-site URL`
  );
}
assert(
  !app.includes('Equal alternate entry required') &&
    !app.includes('View equal alternate entry route') &&
    !app.includes('View equal alternate method of entry'),
  'Native vendor activation or draw review still requires or links the retired off-site route'
);
assert(
  inPersonEntryMigration.includes('function public.reject_new_qr_bingo_alternate_free_entry') &&
    inPersonEntryMigration.includes('create trigger a00_reject_new_qr_bingo_alternate_entry') &&
    inPersonEntryMigration.includes("message = 'alternate_entry_disabled'") &&
    inPersonEntryMigration.includes('create trigger a01_require_new_qr_bingo_in_show_scan_proof') &&
    inPersonEntryMigration.includes("message = 'in_show_scan_verification_required'") &&
    inPersonEntryMigration.includes('entry.in_show_scan_verified is true') &&
    inPersonEntryMigration.includes('drop trigger if exists require_qr_bingo_alternate_entry_closure_for_draw') &&
    !/delete\s+from\s+public[.]qr_bingo_raffle_entries/i.test(inPersonEntryMigration) &&
    !/update\s+public[.]qr_bingo_raffle_entries/i.test(inPersonEntryMigration),
  'In-person cutover does not preserve historical rows, reject new alternate entries, require scan proof, or retire the obsolete closure gate'
);
assert(
  inPersonRulesMigration.includes("previous_config.rules_version = '2026-09-01-vendor-marketing'") &&
    inPersonRulesMigration.includes("new.rules_version = '2026-09-01-in-person-entry'") &&
    inPersonRulesMigration.includes("timestamptz '2026-10-18 15:00:00+00'") &&
    inPersonRulesMigration.includes("applicable_rules_version <> '2026-09-01-in-person-entry'") &&
    inPersonRulesMigration.includes('new.in_show_scan_verified_at < current_config.history_starts_at') &&
    inPersonRulesMigration.includes('new.in_show_scan_verified_at >= current_config.entry_closes_at') &&
    inPersonRulesMigration.includes('visited this vendor booth in person') &&
    !/delete\s+from\s+public[.]qr_bingo_raffle_entries/i.test(inPersonRulesMigration) &&
    !/update\s+public[.]qr_bingo_raffle_entries/i.test(inPersonRulesMigration),
  'Current in-person rules migration does not force fresh acceptance and published-window proof while preserving historical entries'
);
assert(!qr.includes('\\'), 'QR widget contains backslashes that the BD widget_data API strips');

assert(
  qrResults.includes('bd-qr-bingo-admin?action=public_config') &&
    qrResults.includes("$tagId = (int)$config['vendor_tag_id'];") &&
    qrResults.includes("$historyStartsAt = mysql_real_escape_string((string)$config['history_starts_at_sql']);"),
  'QR results widget does not consume the canonical event tag and history cutoff'
);
assert(
  qrResults.includes("$_POST['expected_event_key']") &&
    qrResults.includes("$_POST['expected_config_revision']") &&
    qrResults.includes("'code' => 'stale_event_config'"),
  'QR results actions are not protected against a stale rendered event revision'
);
assert(!/tag_id\s*=\s*['\"]?27/.test(qrResults), 'QR results widget still contains legacy tag 27');
assert(
  qrResults.includes('COUNT(DISTINCT vv.vendor_id) AS scanned_count') &&
    qrResults.includes("participant.subscription_id IN (4, 18)") &&
    qrResults.includes("vv.scan_date >= '$historyStartsAt'") &&
    qrResults.includes('min(100, (int)round('),
  'QR results widget does not constrain and cap current-event couple progress'
);
const scoreboardFunction = qrResults.match(
  /function ww_qrr_scoreboard\(\$config\) \{([\s\S]*?)\n    \}\n\s*\}/
)?.[1];
assert(scoreboardFunction, 'QR results scoreboard function could not be located');
assert(
  scoreboardFunction.includes("'label' => 'Participant '") &&
    scoreboardFunction.includes('shuffle($progressRows)') &&
    !scoreboardFunction.includes("'participant_key' =>") &&
    !scoreboardFunction.includes("'last_activity' =>") &&
    !scoreboardFunction.includes("'email' =>") &&
    !scoreboardFunction.includes("'company' =>") &&
    !scoreboardFunction.includes("'user_id' =>"),
  'QR results scoreboard does not use fresh temporary aliases or exposes an identity/activity field'
);
assert(
  !qrResults.includes('ww_qrr_participant_details') &&
    !qrResults.includes("$action === 'get_participant_details'") &&
    !qrResults.includes('participant_key') &&
    !qrResults.includes('Last activity') &&
    !qrResults.includes('View booths'),
  'Public QR results still exposes stable aliases, booth history, or activity timestamps'
);
assert(
  qrResultsScript.includes('document.createElement') &&
    qrResultsScript.includes('.textContent =') &&
    !qrResultsScript.includes('innerHTML') &&
    !/\b(email|first_name|last_name|company|user_id)\b/.test(qrResultsScript),
  'QR results browser rendering can expose or inject member fields'
);
assert(
  qrResultsStyle.includes('@media (max-width: 760px)') &&
    qrResults.includes('aria-live="polite"'),
  'QR results widget is missing its mobile or accessible status behavior'
);
assert(!qrResults.includes('\\'), 'QR results widget contains backslashes that the BD widget_data API strips');
assert(!qrResultsScript.includes('\\'), 'QR results script contains backslashes that the BD widget_data API strips');

assert(
  vendorDraw.includes('data-field="prize_approx_value_cad"') &&
    vendorDraw.includes('data-field="max_winners"') &&
    (vendorDraw.match(/<option value="[1-3]">/g) || []).length === 3 &&
    vendorDraw.includes('data-field="exclude_previous_winners" checked') &&
    vendorDraw.includes('Do not select the same couple twice for this draw') &&
    vendorDraw.includes('applies only to this vendor’s current prize offer') &&
    vendorDraw.includes('data-field="legal_terms_accepted"') &&
    vendorDraw.includes('View the current Official Rules'),
  'Vendor dashboard omits prize value, winner count, repeat policy, or current-rules acceptance controls'
);
const vendorWizardUniqueSelectors = [
  'data-role="status"',
  'data-role="workspace"',
  'data-role="vendor-responsibility-disclosure"',
  'data-field="enabled"',
  'data-field="prize_description"',
  'data-field="prize_approx_value_cad"',
  'data-field="max_winners"',
  'data-field="exclude_previous_winners"',
  'data-field="legal_terms_accepted"',
  'data-action="save"',
  'data-action="reload"',
  'data-action="participation-report"',
  'data-action="entries-reload"',
  'data-role="entrants"',
  'data-action="draw"',
  'data-action="review-confirm"',
  'data-action="review-disqualify"',
];
assert(
  vendorWizardUniqueSelectors.every((selector) => vendorDraw.split(selector).length === 2),
  'Vendor wizard duplicates or omits a stateful control required by its event handlers'
);
assert(
  (vendorDraw.match(/data-wizard-step="[1-4]"/g) || []).length === 4 &&
    (vendorDraw.match(/data-wizard-panel="[1-4]"/g) || []).length === 4 &&
    vendorDraw.includes('data-wizard-next="2"') &&
    vendorDraw.includes('data-wizard-back="3"') &&
    vendorDrawScript.includes('function showWizardStep(step, options)') &&
    vendorDrawScript.includes('function recommendedWizardStep(data)') &&
    vendorDrawScript.includes("legalAccepted.addEventListener('change'") &&
    vendorDrawScript.includes('state.rulesViewedVersion = version;') &&
    vendorDrawScript.includes('state.responsibilityViewedVersion = version;') &&
    !vendorDrawScript.includes("vendorResponsibilityDetails.addEventListener('toggle'") &&
    vendorDrawStyle.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'),
  'Vendor dashboard is missing the four-step wizard, mobile step layout, or current-rules gating'
);
assert(
  vendorDraw.includes('One confirmation') &&
    vendorDraw.includes('I confirm I have read and accept the current Official Rules and vendor responsibilities') &&
    !vendorDraw.includes('Complete these 3 quick checks') &&
    !vendorDraw.includes('data-role="rules-review-item"') &&
    !vendorDraw.includes('data-role="responsibility-state"') &&
    vendorDraw.includes('data-role="acceptance-state"') &&
    vendorDraw.includes('aria-describedby="ww-qrvd-acceptance-state"') &&
    vendorDrawScript.includes('function updateRulesReviewProgress()') &&
    vendorDrawScript.includes('const combinedAccepted = Boolean(') &&
    vendorDrawScript.includes("acceptanceState.textContent = !rulesUrlAvailable || !disclosureAvailable") &&
    vendorDrawScript.includes('legalAccepted.disabled = !exactResponsibilityDisclosure || !rulesUrl;') &&
    vendorDrawScript.includes("setStatus('The current Official Rules or vendor responsibilities are unavailable.") &&
    vendorDrawStyle.includes('.ww-qrvd-check:hover'),
  'Vendor rules acceptance must use one clear checkbox that records both current documents'
);
assert(
    vendorDrawScript.includes("request(root, 'vendor_raffle_update'") &&
    vendorDrawScript.includes('prize_approx_value_cad: requestPrizeValue') &&
    vendorDrawScript.includes('max_winners: requestMaxWinners') &&
    vendorDrawScript.includes('exclude_previous_winners: requestExcludePreviousWinners') &&
    vendorDrawScript.includes('consent_version: rulesVersion') &&
    vendorDrawScript.includes('const combinedAcceptance = Boolean(requestLegalAccepted && rulesReviewed);') &&
    vendorDrawScript.includes('legal_terms_accepted: combinedAcceptance') &&
    vendorDrawScript.includes('rules_viewed: combinedAcceptance') &&
    vendorDrawScript.includes('apple_non_sponsor_acknowledged: combinedAcceptance') &&
    vendorDrawScript.includes('vendor_responsibility_acknowledged: combinedAcceptance') &&
    vendorDrawScript.includes('vendor_responsibility_disclosure: text(state.data.vendor_responsibility_disclosure)') &&
    vendorDrawScript.includes("client_platform: 'website'") &&
    vendorDraw.includes('data-role="vendor-responsibility-disclosure"') &&
    vendorDrawScript.includes('settings_updated_at:') &&
    vendorDrawScript.includes('const materialTermsLocked = Boolean(state.data.material_terms_locked);') &&
    vendorDrawScript.includes('? text(settings.prize_title)') &&
    vendorDrawScript.includes('? text(settings.prize_description)') &&
    vendorDrawScript.includes('? number(settings.prize_approx_value_cad)'),
  'Vendor dashboard update payload does not satisfy the current Edge contract'
);
assert(
  app.includes('const combinedAcceptance = Boolean(requestLegalAccepted && draftRulesViewed);') &&
    app.includes('legal_terms_accepted: combinedAcceptance') &&
    app.includes('rules_viewed: combinedAcceptance') &&
    app.includes('apple_non_sponsor_acknowledged: combinedAcceptance') &&
    app.includes('vendor_responsibility_acknowledged: combinedAcceptance') &&
    app.includes('I confirm I have read and accept the current Official Rules and vendor responsibilities') &&
    app.includes("setVendorRaffleRulesViewedVersion(nextAccepted ? vendorRaffleRulesVersion : '');") &&
    !app.includes('setRaffleLegalAccepted((value) => {'),
  'Native vendor-draw acceptance must use one pure checkbox state and map that attestation consistently to the shared API contract'
);
assert(
  vendorDrawScript.includes('data.entry_count') &&
    vendorDraw.includes('Download contacts (CSV)') &&
    vendorDraw.includes('including anyone removed from winner selection.') &&
    vendorDraw.includes('data-role="entry-count"') &&
    vendorDraw.includes('data-role="selection-pool-count"') &&
    vendorDraw.includes('data-role="excluded-count"') &&
    vendorDrawScript.includes("request(root, 'vendor_raffle_entries_get'") &&
    vendorDrawScript.includes("request(root, 'vendor_raffle_entry_update'") &&
    vendorDrawScript.includes('participant_reference: participantReference') &&
    vendorDrawScript.includes('included: Boolean(included)') &&
    vendorDrawScript.includes("exclusion_reason: included ? '' : reason") &&
    vendorDrawScript.includes("['email', 'couple_email']") &&
    vendorDrawScript.includes("['phone', 'couple_phone']") &&
    vendorDrawScript.includes("['wedding_date', 'couple_wedding_date']") &&
    vendorDrawScript.includes("['participant_reference', 'reference']") &&
    vendorDrawScript.includes("entryValue(entry, ['pool_status'])") &&
    vendorDrawScript.includes("const disqualified = poolStatus === 'disqualified';") &&
    vendorDrawScript.includes('Disqualified — record kept') &&
    vendorDrawScript.includes('it cannot be restored to the winner pool') &&
    vendorDrawScript.includes('const selectionProtected = disqualified || alreadySelected') &&
    vendorDrawScript.includes('entry.can_update !== false') &&
    vendorDrawScript.includes('state.data.can_update_entries !== false') &&
    vendorDrawScript.includes("request(root, 'vendor_raffle_export'") &&
    vendorDrawScript.includes("client_platform: 'website'") &&
    vendorDrawScript.includes('data.report.contains_contact_data !== true') &&
    vendorDrawScript.includes("data.report.contact_share_scope !== 'named_vendor_draw_administration'") &&
    vendorDrawScript.includes('data.report.marketing_consent_included !== true') &&
    vendorDrawScript.includes("data.report.report_kind !== 'named_vendor_draw_contacts'") &&
    vendorDrawScript.includes("data.report.mime_type !== 'text/csv;charset=utf-8'") &&
    vendorDrawScript.includes('data.report.rules_version !== expectedRulesVersion') &&
    vendorDrawScript.includes('data.report.event_key !== expectedEventKey') &&
    vendorDrawScript.includes('data.report.event_revision !== expectedEventRevision') &&
    vendorDrawScript.includes('data.report.vendor_bingo_id !== expectedVendorBingoId') &&
    vendorDrawScript.includes('data.report.vendor_bd_user_id !== expectedVendorBdUserId') &&
    vendorDrawScript.includes('data.report.vendor_name !== expectedVendorName') &&
    vendorDrawScript.includes("typeof data.report.csv !== 'string'") &&
    vendorDrawScript.indexOf("data.report.report_kind !== 'named_vendor_draw_contacts'") <
      vendorDrawScript.indexOf('downloadCsv(data.report)') &&
    vendorDrawScript.includes('URL.createObjectURL(blob)') &&
    vendorDrawScript.includes('new Blob([csv]') &&
    vendorDraw.includes('data-action="participation-report"') &&
    !vendorDraw.includes('data-action="csv"') &&
    !vendorDraw.includes('data-action="txt"'),
  'Vendor dashboard must expose server-authorized entrant management and require scoped metadata before downloading the complete entrant CSV'
);
assert(
  vendorDraw.includes('data-role="entrant-search"') &&
    vendorDraw.includes('data-role="entrant-filter"') &&
    vendorDraw.includes('data-role="entrant-visible-count"') &&
    vendorDraw.includes('Find a couple') &&
    vendorDraw.includes('Complete contact list') &&
    vendorDrawScript.includes("const entrantSearch = find('[data-role=\"entrant-search\"]');") &&
    vendorDrawScript.includes("const entrantFilter = find('[data-role=\"entrant-filter\"]');") &&
    vendorDrawScript.includes('function entrantSelectionDetails(entry)') &&
    vendorDrawScript.includes('function appendContactItem(container, label, value, kind)') &&
    vendorDrawScript.includes("valueElement.href = `mailto:${cleanValue}`") &&
    vendorDrawScript.includes("valueElement.href = `tel:${dialValue}`") &&
    vendorDrawScript.includes("fields.includes(query)") &&
    vendorDrawScript.includes("state.entrantFilter === 'included'") &&
    vendorDrawScript.includes("state.entrantFilter === 'excluded'") &&
    vendorDrawScript.includes("makeElement('details', 'ww-qrvd-entry-admin')") &&
    vendorDrawStyle.includes('.ww-qrvd-contact-tools') &&
    vendorDrawStyle.includes('.ww-qrvd-contact-grid') &&
    vendorDrawStyle.includes('.ww-qrvd-entry-admin') &&
    vendorDrawStyle.includes('.ww-qrvd-entry-reason-field { flex: 0 0 auto; width: 100%; }') &&
    app.includes("const [vendorRaffleEntryQuery, setVendorRaffleEntryQuery] = useState('');") &&
    app.includes("const [vendorRaffleEntryFilter, setVendorRaffleEntryFilter] = useState<'all' | 'included' | 'excluded'>('all');") &&
    app.includes('const vendorRaffleVisibleEntries = useMemo(() => {') &&
    app.includes('Search name, email or phone') &&
    app.includes("Linking.openURL(`mailto:${entrantEmail}`)") &&
    app.includes("Linking.openURL(`tel:${dialValue}`)") &&
    app.includes('vendorRaffleExpandedEntryReference === participantReference') &&
    app.includes('This contact stays in the downloadable CSV whether included or excluded.'),
  'Vendor dashboard contact cards must stay searchable, filterable, actionable, and mobile friendly on website and iOS'
);
assert(
  vendorDrawScript.includes("draw.selection_status === 'potential'") &&
    vendorDrawScript.includes("draw.selection_status === 'verified'") &&
    vendorDrawScript.includes('Awaiting vendor verification') &&
    vendorDrawScript.includes("request(root, 'vendor_raffle_draw'") &&
    vendorDrawScript.includes("request(root, 'vendor_raffle_review'") &&
    vendorDrawScript.includes("request(root, 'vendor_raffle_send_notice'") &&
    vendorDrawScript.includes("sendButton.dataset.action = 'send-notice'") &&
    vendorDrawScript.includes('draw.can_send_notice === false') &&
    vendorDrawScript.includes('draw.notice_pending === true') &&
    vendorDrawScript.includes('draw.notice_complete === true') &&
    vendorDrawScript.includes('can_test_suppressed_notice') &&
    vendorDrawScript.includes('Test Send (email suppressed)') &&
    vendorDrawScript.includes('Email was suppressed for App Review and was not delivered.') &&
    vendorDraw.includes('Selecting a potential winner never sends an email') &&
    vendorDraw.includes('This button only performs random selection. It cannot send winner email.') &&
    vendorDrawScript.includes("decision: decision") &&
    vendorDrawScript.includes('skill_question_answer:') &&
    vendorDrawScript.includes('eligibility_confirmed:') &&
    vendorDrawScript.includes('rules_release_confirmed:'),
  'Vendor dashboard does not implement the potential-winner verification lifecycle'
);
const websiteWinnerSelectionStart = vendorDrawScript.indexOf('async function drawPotentialWinner()');
const websiteWinnerSelectionEnd = vendorDrawScript.indexOf('async function sendWinnerNotice', websiteWinnerSelectionStart);
assert(
  websiteWinnerSelectionStart >= 0 &&
    websiteWinnerSelectionEnd > websiteWinnerSelectionStart &&
    !vendorDrawScript.slice(websiteWinnerSelectionStart, websiteWinnerSelectionEnd).includes('vendor_raffle_send_notice'),
  'Vendor website winner-selection action also sends email instead of keeping the two actions separate'
);
assert(
  !/contact details withheld/i.test(vendorDrawScript + app) &&
    vendorDrawScript.includes("['Name', draw.winner_name]") &&
    vendorDrawScript.includes("['Email', draw.winner_email]") &&
    vendorDrawScript.includes("['Phone', draw.winner_phone]") &&
    vendorDrawScript.includes("['Wedding date', draw.winner_wedding_date]") &&
    vendorDrawScript.includes('accepted this vendor\\u2019s draw and wedding-related marketing terms') &&
    vendorDrawScript.includes('Honour unsubscribe requests') &&
    app.includes('winner_phone?: string') &&
    app.includes('winner_wedding_date?: string') &&
    app.includes('Email: {draw.winner_email}') &&
    app.includes('Phone: {draw.winner_phone}') &&
    app.includes('Wedding date: {draw.winner_wedding_date}') &&
    app.includes('accepted this vendor’s draw and wedding-related marketing terms') &&
    app.includes('Honour unsubscribe requests'),
  'Vendor-owned draw history must show all recorded selected-person contact fields on website and iOS'
);
assert(
  vendorDrawScript.includes('error.status === 409') &&
    vendorDrawScript.includes('state.conflict = true') &&
    vendorDrawScript.includes("request(root, 'vendor_raffle_get')") &&
    vendorDrawScript.includes('hydrateForm: false'),
  'Vendor dashboard cannot preserve a draft and require reload after a save conflict'
);
assert(
  vendorDrawScript.includes('document.createElement') &&
    vendorDrawScript.includes('.textContent =') &&
    !vendorDrawScript.includes('innerHTML'),
  'Vendor dashboard renders backend content through an unsafe HTML sink'
);
assert(
  !/will email you and the selected couple/i.test(vendorDraw + vendorDrawScript) &&
    vendorDraw.includes('<strong>Verification question:</strong>') &&
    vendorDrawScript.includes('Complete the required winner verification before sending the winner notice.') &&
    vendorDrawScript.includes('Enter the selected couple’s answer to the verification question before confirming.') &&
    officialRules.includes('<strong>Why the question is used:</strong>') &&
    officialRules.includes('The question is not part of entry and does') &&
    officialRules.includes('compares the answer recorded') &&
    !officialRules.includes('time-limited mathematical') &&
    !officialRules.includes('deadline in the notice') &&
    app.includes('Complete winner verification') &&
    app.includes('Enter the answer exactly as the selected couple provides it.') &&
    !app.includes('Couple answers the math question') &&
    !vendorDraw.includes('Why the question?'),
  'Vendor dashboard does not clearly assign verification and fulfilment responsibility to the vendor'
);
assert(
  vendorDrawStyle.includes('@media (max-width: 850px)') &&
    vendorDrawStyle.includes('@media (max-width: 640px)') &&
    vendorDrawStyle.includes('.ww-qrvd-stats { grid-template-columns: 1fr; }') &&
    vendorDraw.includes('data-role="entry-status" role="status" aria-live="polite"') &&
    vendorDraw.includes('data-role="entrants" aria-busy="false"') &&
    vendorDrawScript.includes("card.setAttribute('aria-labelledby', entrantHeading.id)") &&
    vendorDrawScript.includes("actionButton.setAttribute(") &&
    vendorDrawScript.includes("sendButton.setAttribute("),
  'Vendor dashboard is missing responsive entrant layouts or accessible status and control labels'
);
assert(!vendorDraw.includes('\\'), 'Vendor dashboard PHP contains backslashes that the BD widget_data API strips');

assert(email.includes('BEGIN PUBLIC KEY'), 'Email widget is missing its RSA public key');
assert(email.includes('openssl_verify'), 'Email widget is missing RSA signature verification');
assert(!email.includes('BEGIN PRIVATE KEY'), 'Email widget contains a private key');
assert(!email.includes('hash_hmac'), 'Email widget still uses a shared HMAC secret');
assert(!email.includes('ww-qr-bingo-draw-email-v1'), 'Email widget still contains the old shared secret');
assert(email.includes("ww_qbdes_flag($data, 'send_vendor'"), 'Email widget cannot skip an already-sent vendor email');
assert(email.includes("ww_qbdes_flag($data, 'send_couple'"), 'Email widget cannot skip an already-sent couple email');
assert(email.includes("ww_qbdes_line_after($vendorText, 'Name:')"), 'Email widget does not parse the winner name emitted by Edge');
assert(email.includes("$data['winner_verified']") && email.includes("!== '1'"), 'Email widget does not require verified-winner proof');
assert(
  email.includes("strpos($eventKey, 'app-review-') === 0") &&
    email.includes("$deliveryMode === 'production_verified_fulfillment'") &&
    email.includes("$deliveryMode === 'isolated_verified_email_test'") &&
    email.includes('if (!$validDeliveryMode') &&
    email.includes("$verificationState !== 'verified_potential_winner'"),
  'Email widget does not suppress App Review events or fail closed on delivery/verification mode'
);
assert(
  email.includes('ww_qr_bingo_email_delivery_keys') &&
    email.includes("$data['vendor_delivery_key']") &&
    email.includes("$data['couple_delivery_key']") &&
    email.includes("hash('sha256', (string)$eventKey . '|' . $channel . '|' . $deliveryKey)") &&
    email.includes("status = 'sent'") &&
    !email.includes('delivery_key VARCHAR'),
  'Email widget is missing hashed per-channel idempotency claims'
);
assert(!email.includes('\\'), 'Email widget contains backslashes that the BD widget_data API strips');
assert(
  qrAdminSettings.includes('$ww_qrbs_current_published = $ww_qrbs_get_ok && $ww_qrbs_revision_valid;') &&
    qrAdminSettings.includes("array_key_exists('published', $ww_qrbs_current_config)"),
  'QR admin settings misreports a valid authenticated current revision as unpublished'
);
assert(
  qrAdminSettings.includes('name="vendor_notice_title"') &&
    qrAdminSettings.includes('name="couple_notice_title"') &&
    !qrAdminSettings.includes('name="vendor_email_subject"') &&
    !qrAdminSettings.includes('name="couple_email_subject"'),
  'QR admin settings uses Brilliant Directories reserved email-subject form names'
);
assert(
  qrAdminSettings.includes('function ww_qrbs_local_vendor_tag_options') &&
    qrAdminSettings.includes('FROM tags t') &&
    qrAdminSettings.includes('name="vendor_tag_id" required') &&
    qrAdminSettings.includes('Choose a vendor group'),
  'QR admin settings does not provide a named vendor-tag dropdown'
);
assert(
  (qrAdminSettings.match(/type="datetime-local"/g) || []).length >= 5 &&
    qrAdminSettings.includes('function ww_qrbs_validate_admin_datetime') &&
    qrAdminSettings.includes('function ww_qrbs_toronto_datetime_input_value') &&
    qrAdminSettings.includes("new DateTimeZone('America/Toronto')"),
  'QR admin settings does not use Toronto date/time pickers with UTC normalization'
);
assert(
  qrAdminSettings.includes('How to use this page') &&
    qrAdminSettings.includes('Advanced: legal pages and eligibility') &&
    qrAdminSettings.includes('Save settings for the app and website') &&
    qrAdminSettings.includes('<?php if (false): /* Historical Form 354 tools are intentionally retired. */ ?>') &&
    qrAdminSettings.includes('class="ww-qrbs-form-token" name="alternate_free_entry_url" type="text" readonly') &&
    !qrAdminSettings.includes('name="alternate_free_entry_url" type="hidden"'),
  'QR admin settings does not keep retired Form 354 controls out of view while safely preserving the legacy config value'
);
assert(
  qrAdminSettings.includes("'ww_qrbs_csrf_token' => 'csrf_token'") &&
    qrAdminSettings.includes("'ww_qrbs_form_action' => 'action'") &&
    qrAdminSettings.includes("'ww_qrbs_expected_revision' => 'expected_revision'") &&
    qrAdminSettings.includes("'ww_qrbs_event_key' => 'event_key'") &&
    qrAdminSettings.includes('class="ww-qrbs-form-token"') &&
    !qrAdminSettings.includes('type="hidden"'),
  'QR admin settings uses hidden values that Brilliant Directories strips before form submission'
);
assert(!qrAdminSettings.includes('\\'), 'QR admin settings widget contains backslashes that the BD widget_data API strips');

assert(
  alternateEntryForm.form_id === 354 &&
    alternateEntryForm.status === 'retired' &&
    alternateEntryForm.form_email_on === false &&
    alternateEntryForm.public_page_contains_form === false &&
    alternateEntryForm.new_submissions_accepted === false &&
    (!Array.isArray(alternateEntryForm.fields) || alternateEntryForm.fields.length === 0) &&
    String(alternateEntryForm.historical_schema_and_submissions || '').includes('Preserved in Brilliant Directories'),
  'Form 354 source is not an explicit retired tombstone that preserves historical BD records'
);
assert(
  vendorDraw.includes('not currently selectable') &&
    vendorDraw.includes('including anyone removed from winner selection.') &&
    vendorDrawScript.includes('excludedCount.textContent = String(Math.max(0, entrantTotal - poolTotal));') &&
    vendorDrawScript.includes('excludedCount.textContent = String(Math.max(0, count - poolCount));') &&
    vendorDrawScript.includes('state.entries = [];') &&
    vendorDrawScript.includes('state.entriesLoaded = false;'),
  'Vendor dashboard does not reconcile cached entrant cards or explain all non-selectable opted-in couples'
);
assert(
  officialRules.includes('the configured number of winners and prizes (one, two, or three)') &&
    officialRules.includes('selects potential winners one at a time') &&
    officialRules.includes('Selection never sends a') &&
    officialRules.includes('confirmed as a winner is removed from later random selections') &&
    officialRules.includes("It never excludes the couple from another") &&
    officialRules.includes("vendor's draw") &&
    officialRules.includes("remains in the vendor's complete entrant CSV") &&
    /mark an\s+entry excluded from random selection/.test(officialRules) &&
    /Entry-list\s+changes are locked while a potential winner is pending/.test(officialRules),
  'Official Rules do not disclose the multi-winner, no-repeat, entrant-management, CSV-retention, and separate-email behavior'
);

for (const [label, source] of [['couple QR function', qrSync], ['vendor QR function', qrVendorSync]]) {
  const fixtureContextStart = source.indexOf('if (action === "fixture_context")');
  const fixtureContextEnd = source.indexOf('const isVendorRaffleAction', fixtureContextStart);
  const fixtureContextBranch = fixtureContextStart >= 0 && fixtureContextEnd > fixtureContextStart
    ? source.slice(fixtureContextStart, fixtureContextEnd)
    : '';
  assert(
    fixtureContextBranch.includes('fetchFullBdUserById(nativeSession.user_id)') &&
      fixtureContextBranch.includes('isolatedFixtureContext(') &&
      !fixtureContextBranch.includes('loginWebsiteSession') &&
      !fixtureContextBranch.includes('getQrPage'),
    `${label} fixture probe is missing exact authentication or can recurse through the website QR page`
  );
  assert(
    source.includes('const MAX_RAFFLE_WINNERS = 3;') &&
      source.includes('function raffleMaxWinners(value: unknown)'),
    `${label} does not bound configured winner counts to one through three`
  );
  assert(!/REVIEW_VENDOR|EARLY_DRAW|PRIVILEGED|38970/.test(source), `${label} contains a production reviewer or early-draw bypass`);
  assert(
    source.includes(`const CONTACT_SHARING_RULES_VERSION = "${currentInPersonRulesVersion}";`) &&
      source.includes('const PREVIOUS_CONTACT_SHARING_RULES_VERSION = "2026-09-01-vendor-marketing";') &&
      source.includes('const CONTACT_SHARE_SCOPE = "named_vendor_draw_administration";') &&
      source.includes('settings.legal_terms_version === config.rules_version') &&
      source.includes('entry?.consent_version === qrBingoConfig().rules_version') &&
      source.includes('entry.consent_version === CONTACT_SHARING_RULES_VERSION') &&
      source.includes('function isPermittedInPersonEntryRulesTransition(') &&
      source.includes('contact_share_scope: CONTACT_SHARE_SCOPE') &&
      source.includes('entry.vendor_marketing_consent === true') &&
      source.includes('entry.vendor_marketing_consented_at') &&
      source.includes('entry.vendor_marketing_consent_text') &&
      source.includes('.eq("vendor_marketing_consent", true)'),
    `${label} does not exclude legacy nonmarketing entries from current named-vendor contact access`
  );
  assert(
    source.includes('body.vendor_marketing_consent_acknowledged !== true') &&
      source.includes('vendor_marketing_consent: true') &&
      source.includes('vendor_marketing_consented_at: acceptedAt') &&
      source.includes('vendor_marketing_consent_text: vendorMarketingConsentText(currentSnapshot!)'),
    `${label} does not require and persist complete named-vendor marketing consent at opt-in`
  );
  assert(source.includes('entries: []'), `${label} still exposes the entrant list`);
  assert(
    source.includes('action === "vendor_raffle_export"') &&
      source.includes('buildVendorParticipationReport') &&
      source.includes('entryHasNamedVendorContactConsent(entry as RaffleEntry)') &&
      source.includes('.in("consent_version", NAMED_VENDOR_CONTACT_RULES_VERSIONS)') &&
      source.includes('function entryHasProductionInPersonProof(') &&
      source.includes('entry?.entry_method === "qr_scan_opt_in"') &&
      source.includes('entry.in_show_scan_verified === true') &&
      source.includes('Boolean(entry.in_show_scan_verified_at)') &&
      source.includes('const selectionEligible = currentConsent &&') &&
      source.includes('(controlledFixture || productionInPersonProof)') &&
      source.includes('? "reacceptance_required"') &&
      source.includes('? "in_person_scan_required"') &&
      source.includes('in_selection_pool: selectionEligible && poolStatus === "included"') &&
      source.includes('eligible_entry_count: rows.filter((row) => row.in_selection_pool).length') &&
      source.includes('historical_entry_count: rows.filter((row) => !row.selection_eligible)') &&
      source.includes('can_draw: entryPool.eligible_entry_count > 0') &&
      source.includes('contains_contact_data: true') &&
      source.includes('contact_share_scope: CONTACT_SHARE_SCOPE') &&
      source.includes('marketing_consent_included: true') &&
      source.includes('report_kind: "named_vendor_draw_contacts"') &&
      source.includes('rules_version: currentConfig.rules_version') &&
      source.includes('event_revision: currentConfig.revision') &&
      source.includes('vendor_bingo_id: vendor.id') &&
      source.includes('vendor_bd_user_id: vendorBdUserId') &&
      source.includes('vendor_name: vendor.name') &&
      source.includes('"Event"') &&
      source.includes('"Vendor"') &&
      source.includes('"Participant Reference"') &&
      source.includes('"Name"') &&
      source.includes('"Email"') &&
      source.includes('"Phone"') &&
      source.includes('"Wedding Date"') &&
      source.includes('"Entered At"') &&
      source.includes('"Entry Method"') &&
      source.includes('"Rules Version"') &&
      source.includes('"Entrant Eligibility Attested"') &&
      source.includes('"Selection Status"') &&
      source.includes('"Selection Pool Status"') &&
      source.includes('"Selection Pool Reason"') &&
      source.includes('"Marketing Consent"') &&
      source.includes('"Yes - named vendor draw entry and wedding-related marketing"') &&
      source.includes('qr_bingo_participation_report_audit') &&
      source.includes('participationReference') &&
      source.includes('const pool = await loadVendorEntryPool(') &&
      source.includes('const rows = pool.rows.map((entry) => [') &&
      source.includes('entry.rules_version,') &&
      source.includes('vendorVisibleDraw('),
    `${label} omits the authenticated named-vendor marketing-consented entrant report or server-side draw redaction`
  );
  assert(
      source.includes('select_qr_bingo_potential_winner') &&
      source.includes('p_event_key: eventKey') &&
      source.includes('p_vendor_bingo_id: vendor.id') &&
      source.includes('p_vendor_bd_user_id: String(vendor.user_id || vendor.id)') &&
      source.includes('p_drawn_by_bd_user_id: String(user?.user_id || "")'),
    `${label} does not delegate potential-winner creation to the atomic database selector`
  );
  assert(source.includes('draw.selection_status !== "verified"'), `${label} can send final notices before verification`);
  assert(
    /draw\.selection_status === "potential"\s*\|\|\s*draw\.selection_status === "verified"/.test(source) &&
      !source.includes('draw.selection_status !== "disqualified"'),
    `${label} incorrectly counts neutral legacy draw history as an active selection`
  );
  assert(
    source.includes('function entryHasCurrentConsent') &&
      source.includes('if (entryHasCurrentConsent(existing as RaffleEntry | null)) return null;') &&
      source.includes('.update(entryPayload)') &&
      source.includes('reconsented: true') &&
      source.includes('original entry/audit anchor survives explicit re-consent'),
    `${label} does not explicitly re-consent stale entries while preserving their audit anchor`
  );
  assert(source.includes('.from("app_review_raffle_fixtures")') &&
    source.includes('suppressOutboundEmail') &&
    source.includes('allowEarlyDraw'), `${label} is missing isolated review-event controls`);
  assert(
    source.includes('const entryClosesAt = String(settings?.entry_closes_at') &&
      source.includes('const drawOpensAt = String(settings?.draw_opens_at') &&
      source.includes('const drawAt = String(settings?.draw_at') &&
      source.includes('validPromotionTime(entryClosesAt)') &&
      source.includes('validPromotionTime(drawOpensAt)') &&
      source.includes('validPromotionTime(drawAt)') &&
      /new Date\(drawOpensAt\)\.getTime\(\) >=\s*new Date\(entryClosesAt\)\.getTime\(\)/.test(source) &&
      source.includes('fixtureTerms && isolatedFixture?.allow_early_draw === true') &&
      source.includes('new Date(drawAt).getTime() >= new Date(entryClosesAt).getTime()'),
    `${label} does not gate selection on all closing/draw timestamps`
  );
  assert(
    source.includes('function hasCurrentQrBingoVendorTag') &&
      source.includes('const user = await fetchFullBdUserById(nativeSession.user_id);') &&
      source.includes('async function resolveVendorForRaffleAction') &&
      source.includes('return hasCurrentQrBingoVendorTag(user)') &&
      (source.match(/const vendor = await resolveVendorForRaffleAction\(/g) || []).length >= 5 &&
      !source.includes('? ({ user_id: nativeSession.user_id } as BdRow)'),
    `${label} lets an untagged isolated vendor bypass the published QR Bingo roster`
  );
}
assert(
  raffleAuditMigration.includes('review_qr_bingo_potential_winner') &&
    raffleAuditMigration.includes('Service-role authorization is required.') &&
    raffleAuditMigration.includes('lock_entered_qr_bingo_material_terms'),
  'Raffle migration is missing service-only verification or material-term locking'
);
assert(
  raffleAuditMigration.includes('create table if not exists public.app_review_raffle_fixtures') &&
    raffleAuditMigration.includes("'app-review-weddingwin-2026-38970'") &&
    raffleAuditMigration.includes("'38971'") &&
    raffleAuditMigration.includes("'38970'") &&
    raffleAuditMigration.includes('check (suppress_outbound_email)') &&
    raffleAuditMigration.includes("event_key <> 'niagara-wedding-show-2026'"),
  'Raffle migration is missing the exact, expiring, email-suppressed App Review fixture isolation'
);
const replacementDrawLimit = raffleAuditMigration.match(
  /create or replace function public\.enforce_qr_bingo_raffle_draw_limit\(\)([\s\S]*?)drop trigger if exists qr_bingo_raffle_draw_limit/
)?.[1];
assert(
  replacementDrawLimit &&
    replacementDrawLimit.includes('pg_advisory_xact_lock') &&
    replacementDrawLimit.includes("selection_status in ('potential', 'verified')") &&
    replacementDrawLimit.includes('existing_active_selection_count > 0') &&
    !replacementDrawLimit.includes('23608') &&
    raffleAuditMigration.includes('qr_bingo_raffle_draws_one_active_selection_idx') &&
    raffleAuditMigration.includes("where selection_status in ('potential', 'verified')") &&
    raffleAuditMigration.includes("check (selection_status in ('legacy', 'potential', 'verified', 'disqualified'))") &&
    raffleAuditMigration.includes("set selection_status = 'legacy'") &&
    raffleAuditMigration.includes('Legacy draw records are immutable except for required operator-identity redaction.'),
  'Historical release migration no longer documents its concurrency-safe one-selection boundary before the multi-winner replacement'
);
assert(
  multiWinnerMigration.includes('drop index if exists public.qr_bingo_raffle_draws_one_active_selection_idx') &&
    multiWinnerMigration.includes('qr_bingo_raffle_draws_one_potential_selection_idx') &&
    multiWinnerMigration.includes('create or replace function public.enforce_qr_bingo_raffle_draw_limit()') &&
    multiWinnerMigration.includes('max_winners') &&
    multiWinnerMigration.includes('exclude_previous_winners') &&
    multiWinnerMigration.includes('qr_bingo_raffle_entry_selection_state'),
  'Multi-winner migration does not replace the old active-selection index or enforce winner-count, no-repeat, and manual-pool controls'
);
assert(
  !app.includes('simulatorQrTestPayload') &&
    !app.includes('accessibilityLabel="Simulate QR scan"'),
  'Production native scanner still exposes the removed Simulator-only QR injection hook'
);
assert(!appConfig.includes('simulatorQrTestPayload'), 'Production app config contains the Simulator QR test hook payload');

assert(
  (migration.match(/blank vendor_bd_user_id exists/g) || []).length === 3,
  'Stable-ID migration must preflight blank IDs in all three raffle tables'
);
assert(
  (migration.match(/group by event_key, trim\(vendor_bd_user_id\)/g) || []).length === 3,
  'Stable-ID migration must detect whitespace-normalized duplicate IDs in all three raffle tables'
);
assert(
  (migration.match(/vendor_bingo_id = trim\(vendor_bd_user_id\)/g) || []).length === 3,
  'Stable-ID migration must copy each normalized BD ID into vendor_bingo_id'
);
assert(
  (migration.match(/vendor_bingo_id = vendor_bd_user_id/g) || []).length === 3,
  'Stable-ID migration must enforce canonical IDs in all three raffle tables'
);

assert(
  identity.includes('resolution=ignore-duplicates'),
  'First-login identity creation is not concurrency-safe'
);
assert(
  identity.includes('if (!response.ok)') &&
    identity.includes('fillMissingCachedIdentityField') &&
    identity.includes('BD identity cache did not persist a complete identity.'),
  'BD identity cache writes do not fail closed'
);

let scriptSource = qr
  .replace(/const EVENT_CONFIG = <\?php[\s\S]*?\?>;/, 'const EVENT_CONFIG = {event_key:"test-event",revision:1,scan_enabled:true};')
  .replace(/const VENDORS = <\?php[\s\S]*?\?>;/, 'const VENDORS = [];')
  .replace(/const INITIAL_SCANNED = <\?php[\s\S]*?\?>;/, 'const INITIAL_SCANNED = [];');

const scripts = [...scriptSource.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim() && !source.includes('<?php'));

for (const source of scripts) {
  // Syntax compilation only; browser APIs intentionally are not executed.
  new Function(source);
}

const alternateEntryScripts = [...alternateEntryPage.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());
for (const source of alternateEntryScripts) {
  new Function(source);
  // Brilliant Directories renders page-content scripts with line breaks
  // collapsed. Compile that shape too so a future // comment cannot swallow
  // the remainder of the published script.
  new Function(source.replace(/\r?\n/g, ' '));
}

new Function(
  qrResultsScript
    .replace(/^<script>\s*/, '')
    .replace(/\s*<\/script>\s*$/, '')
);

new Function(
  vendorDrawScript
    .replace(/^<script>\s*/, '')
    .replace(/\s*<\/script>\s*$/, '')
);

console.log(JSON.stringify({
  ok: true,
  qrScriptBlocksCompiled: scripts.length,
  alternateEntryScriptBlocksCompiled: alternateEntryScripts.length,
  qrResultsScriptCompiled: true,
  vendorDrawScriptCompiled: true,
  trustedQrQueryPayloads: true,
  failedQrPayloadsRetryable: true,
  successfulQrPayloadsSuppressed: true,
  undocumentedResetRemoved: true,
  vendorEntrantManagementContract: true,
  vendorContactUiContract: true,
  vendorDrawConflictsFailClosed: true,
  stableVendorIds: true,
  eventConfig: 'published-revision',
  canonicalInShowQrOnly: true,
  offsiteEntryRetired: true,
  rsaPublicKeyOnly: true,
  migrationPreflight: true,
  identityCacheFailClosed: true,
}));
