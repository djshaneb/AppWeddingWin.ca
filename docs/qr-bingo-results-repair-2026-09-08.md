# QR results display repair — September 8, 2026

## Live issue and cause

`https://www.weddingwin.ca/qr_results` (BD widget 262, custom-widget page 96)
showed zero participants/completions and 14 vendors. Public event revision 15
allows early scans and retains a scan-history floor of September 8. The results
query still used the October 18 show opening as its lower bound, excluding
valid early scans. It also had no event-close upper bound.

The standalone page lacked a viewport meta tag. Chrome at a 320px mobile device
width therefore laid it out at 980px and shrank the desktop layout.

## Changes

- Use the scanner's retained `scan_history_starts_at` (inclusive) and
  `entry_closes_at` (exclusive), retaining early history when early access is
  turned off. Only an absent legacy scan-history field falls back to show start.
- Count distinct current-event vendors for eligible couple plans. Aggregate
  histogram totals cover everyone; at most 500 anonymous progress rows are
  shown, with an explicit notice if capped. Higher-progress rows are included
  first before their temporary participant numbers are reshuffled.
- Return HTTP 503 on a database failure rather than displaying false zeroes.
- Serialize refreshes, abort after 15 seconds, retain last successful results
  on failure, and bound stale-config cache-busting navigation.
- Add a mobile viewport and page title; fit the stats grid at narrow widths.
- Preserve the public privacy boundary: no member names, IDs, contact details,
  vendor IDs, individual booth histories, or per-scan timestamps returned.

## Verification

- `QR_PHP_WASM_ROOT=/absolute/path/to/node_modules/@php-wasm node --test scripts/test-qr-bingo-results.mjs`
  — 9 passed using real PHP 7.4 and isolated SQLite execution of the production
  SELECTs, including date boundaries, duplicate scans/tags, invalid settings,
  502 participants, database failures, revision checks, and GET/POST rendering.
- `node --test scripts/test-qr-bingo-results-refresh.mjs` — 8 passed, including
  rapid clicks/polls, timeout/retry, error preservation, filtering, capped-list
  totals, and bounded stale-config recovery.
- The broad pre-existing `node scripts/check-bd-widgets.mjs` still stops at its
  unrelated widget-258 canonical-config assertion (line 86). It is not reported
  as passing. The results-specific date-boundary assertion was updated.
- Published only widget 262's `widget_data` and `widget_style`. As required by
  this standalone BD route, mirrored JS remains appended to the PHP deployment
  payload. The separate live `widget_javascript` field was untouched.
- Automatic cache refresh succeeded. Full code and CSS readback exactly matched.
- Live POST at 20:18 UTC returned HTTP 200: 2 participants, 1 completed,
  14 vendors; progress rows were 14/14 (100%) and 1/14 (7%). Before repair both
  participant/completion totals were zero with the same event revision.
- Chrome verified 320px and 390px mobile widths and 1280px desktop width with
  no horizontal overflow. Search, empty search, clearing, and Refresh results
  passed. Console error log was empty. Temporary device overrides were cleared.
- Refreshed the user's already-open in-app results page.

No scan/contact/draw records were created, changed, or deleted, and no emails
were sent. This website-only repair does not require a new app installation.
No GitHub push was performed for this request.
