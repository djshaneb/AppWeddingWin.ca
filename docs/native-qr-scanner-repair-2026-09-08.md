# Native QR scanner repair — September 8, 2026

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Reproduced failure

- Connected iPhone showed: “Saving this booth visit took too long. Check your connection and scan again.” Camera was active; progress was 0/14.
- A real native-API request with the existing QA couple [redacted member M] reproduced `502 scan_failed`: “Refresh QR Bingo before continuing.” This did not create a visit.
- A read-only probe executing the actual bridge helpers also reproduced website `403`, despite exact member, Origin, event revision and extracted CSRF matching.
- Token login sets BD login cookies but no PHP security-session cookie. Standalone GET `/qr` returns a CSRF value without a session cookie; its subsequent POST creates `__Secure-sessionID5` and rejects the earlier CSRF. This explains why an established browser session can work while the fresh app bridge fails.

## Scoped repair

- Initialize the website's authenticated PHP session using a read-only, same-origin `scanner_session` POST before reading `/qr`. Verify the exact couple and matching CSRF across both responses. All scan, contact and draw security checks remain enforced.
- Avoid the redundant redirected QR page and pre-save history fetch. Keep the authoritative post-save history read and in-show proof requirements.
- Give QR requests a bounded 30-second budget instead of 12 seconds; use uncertainty-safe timeout wording.
- Always rearm the camera after scan errors; preserve useful errors and known settings; retry failed settings refreshes while keeping scanning disabled until reverified.

## Verification

- Native recovery: 19/19 passed, including rapid duplicate frames, stale requests, body-read aborts, 15-second success and 30-second timeout.
- Native scanner scheduling: 17/17 passed.
- Native contact-profile handling: 16/16 passed.
- Website opening/scheduling: 11/11 passed.
- Existing website transport: 10/10 passed.
- All 14 current vendor QR images decode to the same stable app/website vendor IDs.
- TypeScript passed. Release build installed and launched on the connected iPhone in place; no uninstall, logout or profile reset.
- PHP session bootstrap: 6/6 actual PHP 7.4 tests passed, including secure cookie reuse and rejected invalid authentication/origins. The live server also returned success and retained the exact CSRF on repeated reads.
- Both Edge transport mirrors: 18/18 focused tests and typechecks passed.
- Published widget 258 PHP only; exact round-trip verified, CSS/JavaScript untouched. Published `bd-qr-bingo-sync` v69 and `bd-qr-bingo-vendor-sync` v70; exact entrypoints and unchanged shared-file content verified.
- Live native API after deployment: QA couple [redacted member M] scanned QA vendor [redacted member L] on the real event path (not an isolated fixture). List 200 (0 visits), scan 200 (7.617 seconds, 1 visit), fresh-session list 200 (1 visit). In-show proof remained false, correctly: early testing cannot enter a draw.
- A second live scan of that same QA vendor returned 200 (7.130 seconds) and kept the total at 1 visit; no duplicate progress or in-show proof was created.
- One pre-existing unrelated assertion in the wider contact-gate suite still expects older fallback-name copy; focused scanner/contact/schedule suites above pass. Do not describe the entire repository test suite as passing.

No contact, draw-entry, winner, account or email data was deleted. No test email or draw opt-in is part of this repair.

## Completion-message follow-up

The app and website completion message now reads: “Congratulations! You’ve completed Vendor Bingo. You’re now entered in the grand prize draw.” It does not mention individual vendor draws. The website also avoids displaying completion for an empty roster. No prize-entry or database logic changed.

Verified 22 native recovery/completion tests, 4 website completion tests, 11 website scanner-opening tests, and TypeScript. The iPhone Release build succeeded and was installed/launched in place. Tests exercised completed, incomplete, failed, pending and empty-roster states without creating live completed Bingo cards.
