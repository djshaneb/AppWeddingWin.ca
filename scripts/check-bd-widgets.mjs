import fs from 'node:fs';

const qrPath = 'brilliant-directories/widgets/258-julian-qr-code-bingo.php';
const emailPath = 'brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php';
const migrationPath = 'supabase/migrations/20260828031649_stabilize_qr_bingo_vendor_ids_and_draw_signing.sql';
const raffleAuditMigrationPath = 'supabase/migrations/20260828162602_add_qr_bingo_official_rules_audit.sql';
const qrSyncPath = 'supabase/functions/bd-qr-bingo-sync/index.ts';
const qrVendorSyncPath = 'supabase/functions/bd-qr-bingo-vendor-sync/index.ts';
const identityPath = 'supabase/functions/_shared/bd_identity.ts';
const appPath = 'app/(tabs)/index.tsx';
const appConfigPath = 'app.json';
const authCallbackPath = 'app/auth-callback.tsx';
const pushSweepPath = 'supabase/functions/bd-push-sweep/index.ts';
const chatStatusPath = 'supabase/functions/bd-chat-status/index.ts';
const qr = fs.readFileSync(qrPath, 'utf8');
const email = fs.readFileSync(emailPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const raffleAuditMigration = fs.readFileSync(raffleAuditMigrationPath, 'utf8');
const qrSync = fs.readFileSync(qrSyncPath, 'utf8');
const qrVendorSync = fs.readFileSync(qrVendorSyncPath, 'utf8');
const identity = fs.readFileSync(identityPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const appConfig = fs.readFileSync(appConfigPath, 'utf8');
const authCallback = fs.readFileSync(authCallbackPath, 'utf8');
const pushSweep = fs.readFileSync(pushSweepPath, 'utf8');
const chatStatus = fs.readFileSync(chatStatusPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(qr.includes('$eventTagId = 30;'), 'QR widget must use event tag 30');
assert(
  qr.includes("$eventHistoryStartsAt = '2026-08-01 00:00:00';"),
  'QR widget is missing the October event history cutoff'
);
assert(!/tag_id\s*=\s*27/.test(qr), 'QR widget still contains tag 27');
assert(!/targetTagId\s*=\s*27/.test(qr), 'QR widget still targets tag 27');
assert(qr.includes('"id" => (string)$userId'), 'QR widget ID is not the stable BD user ID');
assert(!qr.includes('$vendorUserIdToIndex'), 'QR widget still maps visits to array positions');
assert(qr.includes('GROUP BY u.user_id'), 'QR widget vendor query does not deduplicate BD users');
assert(
  (qr.match(/vv\.scan_date\s*>=\s*'\$eventHistoryStartsAt'/g) || []).length >= 4,
  'QR widget does not scope every visit query to the October event cutoff'
);
assert(
  qr.includes("bingo_completion_date >= '$eventHistoryStartsAt'"),
  'QR widget reset can clear a prior-event completion marker'
);
const expectedLegacyMap = {
  '002': '16849',
  '009': '27768',
  '010': '29211',
  '011': '29215',
  '013': '31521',
  '026': '38085',
  '030': '38117',
  '031': '38118',
  '032': '38140',
  '039': '38290',
  '066': '38519',
};
for (const [ordinal, userId] of Object.entries(expectedLegacyMap)) {
  assert(
    qr.includes(`'${userId}' => '${ordinal}'`),
    `QR widget is missing immutable NWS25-${ordinal} -> ${userId}`
  );
  assert(
    app.includes(`'NWS25-${ordinal}': '${userId}'`),
    `Native scanner is missing immutable NWS25-${ordinal} -> ${userId}`
  );
}
assert(!qr.includes('$vendorLegacyIndex'), 'QR widget still derives legacy IDs from current array order');
assert(!app.includes('legacyQrVendorPosition'), 'Native scanner still derives legacy IDs from current array order');
assert(!app.includes('vendors[legacyPosition]'), 'Native scanner still indexes the current vendor array for NWS25');
assert(!app.includes("'NWS25-001':"), 'Inactive NWS25-001 must not map into the October roster');
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
  pushSweep.includes('badge: unreadCount') && chatStatus.includes('badge: unreadCount'),
  'Chat push payloads do not synchronize the iOS badge count'
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
const vendorEligibilityGate = app.match(
  /\{vendorRaffle\?\.vendor \? \(\s*<>([\s\S]*?)<\/>(?:\s*)\) : null\}/
)?.[1];
assert(
  vendorEligibilityGate?.includes('accessibilityLabel="Accept prize entries"') &&
    vendorEligibilityGate?.includes("'Select potential winner'"),
  'Vendor draw setup and potential-winner controls are not gated on an eligible vendor response'
);
assert(
  /disabled=\{\s*emailLoginLoading \|\|\s*signupLoading \|\|\s*\(authMode === 'signup' && !signupConsentAccepted\)\s*\}/.test(app),
  'Signup action is visually disabled for missing consent but remains interactable'
);
assert(qr.includes('normalizeWeddingWinVendorUrl'), 'QR widget is missing URL normalization');
assert(!qr.includes('tile.innerHTML'), 'QR widget renders vendor data through innerHTML');
assert(qr.includes('if (!saved) return false;'), 'QR widget marks a scan before the server confirms it');
assert(!qr.includes('\\'), 'QR widget contains backslashes that the BD widget_data API strips');

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
    email.includes("$deliveryMode !== 'production_verified_fulfillment'") &&
    email.includes("$verificationState !== 'verified_potential_winner'"),
  'Email widget does not suppress App Review events or fail closed on delivery/verification mode'
);
assert(!email.includes('\\'), 'Email widget contains backslashes that the BD widget_data API strips');

for (const [label, source] of [['couple QR function', qrSync], ['vendor QR function', qrVendorSync]]) {
  assert(source.includes('const MAX_RAFFLE_DRAWS_PER_VENDOR = 1;'), `${label} permits multiple active selections`);
  assert(!/REVIEW_VENDOR|EARLY_DRAW|PRIVILEGED|38970/.test(source), `${label} contains a production reviewer or early-draw bypass`);
  assert(source.includes('contact_share_scope: "selected_potential_winner_only"'), `${label} does not purpose-limit entrant contact sharing`);
  assert(source.includes('entries: []'), `${label} still exposes the entrant list`);
  assert(source.includes('selection_status: "potential"'), `${label} does not create a potential-winner record`);
  assert(source.includes('draw.selection_status !== "verified"'), `${label} can send final notices before verification`);
  assert(
    source.includes('draw.selection_status === "potential" || draw.selection_status === "verified"') &&
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
  assert(source.includes('new Date(String(settings.entry_closes_at') &&
    source.includes('new Date(String(settings.draw_at') &&
    source.includes('new Date(String(settings.draw_opens_at'), `${label} does not gate selection on all closing/draw timestamps`);
}
assert(
  raffleAuditMigration.includes('review_qr_bingo_potential_winner') &&
    raffleAuditMigration.includes('Service-role authorization is required.') &&
    raffleAuditMigration.includes('lock_entered_qr_bingo_material_terms') &&
    raffleAuditMigration.includes("contact_share_scope <> 'selected_potential_winner_only'"),
  'Raffle migration is missing service-only verification, material-term locking, or purpose limitation'
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
  'Release migration does not replace the legacy test-vendor draw bypass with a concurrency-safe single-active-selection boundary'
);
assert(
  app.includes('Constants.expoConfig?.extra?.simulatorQrTestPayload') &&
    app.includes('accessibilityLabel="Simulate QR scan"') &&
    app.includes('handleBarcodeScanned({ data: simulatorQrTestPayload } as BarcodeScanningResult)'),
  'Native scanner opt-in Simulator hook is missing or bypasses the real scan handler'
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
  .replace(/const VENDORS = <\?php[\s\S]*?\?>;/, 'const VENDORS = [];')
  .replace(/const INITIAL_SCANNED = <\?php[\s\S]*?\?>;/, 'const INITIAL_SCANNED = [];');

const scripts = [...scriptSource.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim() && !source.includes('<?php'));

for (const source of scripts) {
  // Syntax compilation only; browser APIs intentionally are not executed.
  new Function(source);
}

console.log(JSON.stringify({
  ok: true,
  qrScriptBlocksCompiled: scripts.length,
  stableVendorIds: true,
  eventTag: 30,
  legacyMappings: Object.keys(expectedLegacyMap).length,
  rsaPublicKeyOnly: true,
  migrationPreflight: true,
  identityCacheFailClosed: true,
}));
