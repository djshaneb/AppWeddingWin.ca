# QR Bingo scanner opening control — September 8, 2026

## Delivered behavior

Admin → QR Bingo Settings → Choose what couples can do now includes **Open scanner early**. Save settings to apply it to the website and updated app. The existing scanner pause remains authoritative.

- Normal opening is midnight America/Toronto on the wedding show date: October 18, 2026 at 12:00 a.m. EDT (`2026-10-18T04:00:00Z`).
- The show/entry start remains 11:00 a.m. Toronto; closing and draw remain 3:00 p.m. Toronto. The early switch does not extend the closing time or open prize entries early.
- Accepted early Bingo progress is retained when the switch is disabled again. Server-generated first-enable time bounds the early scan history; it is not an editable client field.
- Draw offers and opt-in require a new scan during the actual show hours. Earlier Bingo scans cannot become draw proof merely because the clock reaches 11:00 a.m.
- Visible clients refresh operational settings automatically. Opening availability does not automatically accept agreements or launch the camera. Forms and existing progress are retained.

## Published

- Migration: `20260908182505_qr_bingo_early_scanner_control.sql` (columns/operational publisher extension only; existing locked publisher, RLS, immutable revisions and audits preserved).
- Edge functions: `bd-qr-bingo-admin` version 16; `bd-qr-bingo-sync` version 68; `bd-qr-bingo-vendor-sync` version 69. Existing custom authentication and JWT configuration preserved.
- Brilliant Directories widgets 258 and 361. Post-publish reads matched the local PHP exactly; existing CSS and separate JavaScript fields were unchanged. Automatic cache refresh succeeded.
- Updated Release build installed and launched in the existing iPhone simulator. This task did not install a build on the physical iPhone or push GitHub changes.

## Verification

- 13 actual PostgreSQL/PGlite tests: strict boolean validation, server-owned history floor, same-event inheritance, new-event isolation, pause/closing, compare-and-swap conflicts, immutable history, audit/RLS/privileges, unchanged draw terms, baseline drift guard.
- 29 Deno tests: config parsing, Toronto midnight and DST boundaries, early versus show-time proof, unchanged draw enforcement, admin UI/source regression, current client affordances. All three Edge entrypoints typecheck.
- 17 native behavioral tests: exact clock boundaries, public polling/races, pause, history/proof separation, duplicate camera rescans, preview and opt-in guards.
- 11 website tests: actual PHP gate/config/form handling, early history and rescan proof, already-open-page schedule transition, safe polling, invalid metadata, deduplication; full PHP and scanner JavaScript parsing.
- App TypeScript check and targeted diff whitespace checks passed.
- Live Chrome: checked **Open scanner early**, saved revision 13, reloaded and verified checked state. Saved it off again as revision 14. Public API confirmed only the toggle/revision changed between the on/off publications; all show/draw settings remained identical. The first-enable history timestamp was retained as designed.
- Live simulator: the same open scanner changed from the October 18 midnight schedule to open-scanning instructions and back after the two admin saves, without tapping/reopening. Existing agreement remained unchecked; camera capture and actual new booth scans were not exercised in this live test.
- Anonymous admin publication was rejected with HTTP 401.

Final state: revision **14**, early switch **off**, scanner master switch **on**, automatic October 18 midnight opening active. No emails, draw entries, winners, contacts, or scans were created/deleted by this test.

## Follow-up: physical iPhone installation

The user subsequently enabled early access (public revision 15, verified read-only) and authorized installing the updated app. On September 8 at approximately 19:06 UTC, XcodeBuildMCP built, installed, and launched the Release configuration of the same `WeddingWin` workspace/scheme and `ca.weddingwin.app` bundle on the connected physical iPhone (iOS 26.5.2). This was an in-place app update, not an uninstall or account/data reset. Device launch returned process 3446. The embedded device bundle includes `scan_open_early` and `in_show_scanned`; 17 scanner tests and TypeScript passed again before installation. Actual physical-camera scanning remains for the user's test; no consent, scan, or draw action was performed in this follow-up.

Device build log: `~/Library/Developer/XcodeBuildMCP/workspaces/AppWeddingWin.ca-update-test-d7514ed58378/logs/build_run_device_2026-09-08T19-04-12-988Z_pid98576_e0356c58.log`.
