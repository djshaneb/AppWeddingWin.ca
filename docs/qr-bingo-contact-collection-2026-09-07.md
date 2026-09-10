# QR Bingo contact collection — 2026-09-07

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Scope

- App and `/qr`: event contact details are separate from account/login email.
- A couple reviews name, contact email, phone and wedding date, then
  uses **Save & Continue to QR Bingo**. No verification email is sent here.
- The date stays optional without a visible “optional” label. A large calendar
  button sits beside **Not sure yet**. That button clears the unsaved date and
  venue; it does not save or submit anything by itself.
- Choosing a date reveals **Wedding venue**, also optional, limited to 200
  characters. With no date, the venue is hidden and saved as blank.
- Apple private relay addresses are not used as vendor contact addresses.
  Apple sign-in, account email changes, and chat verification are unchanged.
- Wedding date uses a large calendar button, a cancellable picker, and a clear
  action. The canonical BD `users_data.wedding_date` powers the website
  dashboard countdown. Existing `users_meta.wedding_date` shadows are also
  synchronized because the BD API merges those values over physical columns.
  Only existing, exactly member/key/table-scoped metadata is updated; no
  metadata is created or deleted. Readback must match before reporting success.
- Saving contacts does not accept terms, scan a booth, or enter a draw. The
  existing pre-camera agreement and named-vendor opt-in remain separate.
- Contact updates refresh existing eligible, explicitly opted-in entries for
  the same couple and event without changing their original consent evidence.

## Backend contract

`bd-qr-bingo-sync` and `bd-qr-bingo-vendor-sync` share the same implementation.

- `contact_profile_get`: resolves the authenticated couple and current event;
  returns saved contact details or a prefill with `version: 0` and `saved: false`.
- `contact_profile_save`: accepts `contact_profile` containing `name`, `email`,
  `phone`, `wedding_date`, `wedding_venue`, `expected_version`, plus `expected_event_key`.
- A successful contact response includes `event_key`, `couple_id`, `name`,
  `email`, `phone`, `wedding_date`, `wedding_venue`, `version`, `saved`, `complete`, and
  `missing_fields`. The app verifies account/event binding before using it.
- Conflicting versions return 409; clients reload before another save.
- A partial wedding-date sync returns `contact_date_sync_pending`. The contact
  save remains durable; reloading contact details retries date synchronization.
  If retry still fails, GET returns the saved editable profile with a fixed-stage
  diagnostic and warning; it never loses the successfully saved contact data.
- Website requests retain server-signed, action-bound authentication and CSRF.
  No signing keys or native login tokens are exposed by the contact form.

New contact and audit tables have RLS enabled with service-role-only access.
Admin exports use the existing signed admin boundary, selected filters,
bounded rows and formula-safe CSV; downloads create an audit record.

## Administration

Existing plugin: **Plugins → QR Bingo Settings**

`/admin/go.php?widget=ww_qr_bingo_settings` (widget 361)

The data section contains contacts, booth scans, draw entries and winners,
with event/vendor/search filters and CSV downloads. Scan reports use BD's
existing last-scan records for the current published event; they are not a
complete historical scan-event ledger. Private auth/Apple records are excluded.

## Source packaging

- Widget 258: `258-julian-qr-code-bingo.php`,
  `258-qr-bingo-contact-form.css`, `258-qr-bingo-contact-form.js`.
- Widget 361: `ww-qr-bingo-settings.php`,
  `ww-qr-bingo-settings-data.css`, `ww-qr-bingo-settings-data.js`.
- New CSS goes in `widget_style`; new JavaScript goes in
  `widget_javascript` with its required script wrapper. Preserve existing
  widget 361 CSS when appending the new data styles.
- `/qr` copyright now uses PHP `date('Y')`, verified live as 2026.
- Authenticated `/qr` renders standalone: its PHP emits only widget 258's own
  validated stored companion script. Both initialization paths are idempotent.
  POST responses clean removable template/CSS output buffers before JSON.
- Vendor contact cards/search include venue in the app and widget 328. Privacy,
  Terms and Draw Rules pages disclose venue sharing when provided; all three
  were narrowly updated and round-trip verified.

## Live publication

- Both contact-profile migrations applied, including conditional venue storage.
- `bd-qr-bingo-sync` v63; `bd-qr-bingo-vendor-sync` v64;
  `bd-qr-bingo-admin` v13; `bd-complete-profile` v29.
- QR functions retain existing custom authentication; normal profile updates
  retain JWT verification. Every deployment preserved unrelated live dependencies.
- Widgets 258, 328 and 361 published and cache-refreshed.
- Updated Release app built and installed on the connected physical iPhone.

## Verification

- App TypeScript: passed.
- QR regression suite: 218 passed at initial integration.
- App + website contact/calendar/admin focused suite: **56 passed**. Includes
  duplicate taps, stale replies, privacy separation, picker cancellation,
  conditional venue, bounded downloads, PHP parsing and CSV safety.
- Both actual migrations: **17 PostgreSQL tests passed**. Scoped date-shadow,
  QR contact and real profile-handler tests: **63 passed**.
- Complete shared Edge suite after the venue disclosure regression update:
  **697 passed, zero failures**, including final pagination hardening.
- SQL migration preflight uses an isolated pinned PGlite/PostgreSQL runtime,
  not a production database connection. See `scripts/test-qr-contact-migration.mjs`.
- Physical iPhone: three focused tests passed: open contact form without
  consent/save, phone-keyboard/calendar X cancellation twice, and venue draft
  plus Not sure yet clearing. No phone account data was saved. Test result
  bundles are in `harness/iphone-smoke/results/qr-venue-*.xcresult` in the parent
  workspace. The app was restarted afterward to discard the test-only draft.
- Chrome isolated couple [redacted member A]: saved contact email separately from login email;
  selected date plus venue, then saved Not sure yet, then restored the original
  2027-06-12 date plus WeddingWin Test Venue. Each final save completed with
  `date_sync_pending=false`; physical dashboard and merged API date both cleared.
  Login email and pre-existing pending account-email verification stayed unchanged.
  A final unchanged save after pagination hardening succeeded as version 5,
  with the restored date/venue intact and no pending synchronization.
- Chrome desktop and 390×844 mobile emulation: clean form, no horizontal overflow,
  adjacent date/TBD buttons, conditional venue, and X preserves the draft date.
  Temporary emulation was removed; mobile drafts were not saved.
- Admin single-test-contact list includes date/venue. CSV generation returned
  one filtered record and wrote its audit. Offline tests validate actual CSV
  content/BOM/formula protection. Browser download event did not confirm the
  saved file, so filesystem download completion is not claimed.
- Admin draw-entry and winner tabs returned no matching test-account records;
  scans rejected an isolated event with a helpful current-event-only message,
  then returned no matches for that couple in the published event.

No real draw entries were deleted or created for this change. No test emails
are required for the new Bingo contact flow.
