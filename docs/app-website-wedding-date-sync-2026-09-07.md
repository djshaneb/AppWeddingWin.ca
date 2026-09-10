# App-to-website wedding-date sync review

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

Read-only live CMS inspection: September 7, 2026. This investigation did not
change any live widget, member, account, email or production function.

## Current authoritative field

The current Couples dashboard countdown directly reads **`users_data.wedding_date`**,
and the contact form names the same field. However, the later live QR clear test
revealed an existing **`users_meta` row named `wedding_date`** on the exact test
member. The installed MCP connector treats `wedding_date` as an EAV-routed user
field, not a native column in its fixed allowlist. Therefore the earlier claim
that no second metadata field was involved was incorrect: API GET readback alone
does not establish equality with the physical countdown column. Both sources
must be compared and synchronized in the final implementation.

### Live clear investigation and existing-shadow repair

During the later authorized QR-contact test, the parent verified the exact
couple dashboard after a clear: its date input and `storedWeddingDate` were
empty and the countdown showed **Select your date / Start Timer**. The raw
parent API clear therefore worked. The merged API still returned the previous
date because one pre-existing `users_meta` date row had not changed. The
sanitized Edge diagnostic was `bd_date_readback_mismatch`, not an HTTP error.

The connector implementation explains the discrepancy: its fixed native-user
column allowlist omits the site's custom physical wedding-date column. Normal
connector date writes are routed to metadata, while `_clear_fields` is stripped
before that routing and sent only to the parent endpoint. Neither path by itself
guarantees both copies match.

The new shared `bd_wedding_date.ts` helper is used after a successful canonical
date write by QR contact sync and both profile-save branches. It lists only
existing metadata using the exact compound scope
`database=users_data + database_id=authenticated member + key=wedding_date`,
validates every returned compound identity, and refuses an incomplete or
over-25-row result. It updates only those confirmed existing metadata IDs;
it never creates or deletes metadata. A clear uses
`value=&__clear_fields=value` on `/api/v2/users_meta/update`. Scoped metadata
readback and the existing fresh merged member readback must both agree before
success. Errors remain retriable, and a pending QR GET still returns the saved
editable QR profile instead of trapping the user.

This is consistent with the connector's `users_meta writes` rule, which allows
updates of list-confirmed existing `users_data` metadata. Missing API permission
fails closed; there is no alternate write route. Login email, verification,
session ownership, and all unrelated member metadata remain untouched.

Local tests cover explicit set/clear, existing duplicate shadows, no-row and
already-matching no-ops, cross-resource identity rejection, bounded pagination,
permission/outage failures, ignored writes, readback identity, and sanitized
transport errors. Live validation of the metadata clear is performed separately
by the parent through the normal authorized test-account UI; no direct member
mutation was performed by this investigation.

| Live item | Exact source / binding |
| --- | --- |
| Membership plan 18, `Couples` | `contact_details_form = CouplesSignUpForm_member_contact_details` |
| Form 328, `CouplesSignUpForm_member_contact_details` | `form_table = users_data`, default form action |
| Form field 835 | `field_name = wedding_date`; optional (`field_required = 0`), visible input |
| Widget 295, `New Couples Dashboard` | Includes `Michael Wedding Date` by name |
| Widget 156, `Michael Wedding Date` | Directly reads and writes `users_data.wedding_date` for authenticated member ID |
| App backend `bd-complete-profile` | PUT `/api/v2/user/update`, field `wedding_date`, then GET exact member through `fetchFullBdUserById` |
| Shared `sanitizeBdUser` | `SAFE_BD_USER_FIELDS` explicitly includes `wedding_date` |

Exact relevant live widget 295 source:

```php
<?php echo widget("Couples Listing Search Enhanced"); ?>
<?php echo widget("Michael Wedding Date"); ?>
<?php echo widget("Website builder link"); ?>
<?php echo widget("Couples Wedding Photo Share Offer"); ?>
```

Exact relevant live widget 156 source (revision timestamp
`2026-05-14 13:37:48`):

```php
$loggedInUser = getUser($_COOKIE['userid'], $w);
$userId = intval($loggedInUser['user_id']);
// ...
mysql($w['database'], "UPDATE users_data SET wedding_date = '$weddingDateSql' WHERE user_id = '$userId'");
// ...
$result = mysql($w['database'], "SELECT wedding_date FROM users_data WHERE user_id = '$userId'");
$userSetting = mysql_fetch_assoc($result);
$storedWeddingDate = wwNormalizeWeddingDate($userSetting['wedding_date']);
$hasWeddingDate = ($storedWeddingDate !== '');
```

The countdown passes the normalized stored date to its input, `storedWeddingDate`
JavaScript value, and timer. Its normalizer maps an empty value or `0000-00-00`
to no date. It accepts canonical `YYYY-MM-DD` values produced by the app.
Its date picker is configured with `dateFormat: "Y-m-d"`.

Other relevant findings:

- Generic form field 837 has the same `wedding_date` key, but its input is hidden
  and plan 18 uses the custom form above instead.
- Field 835 currently says `Wedding Date (DD/MM/YYYY)` even though app and
  countdown save ISO dates. This is a misleading hint, not a separate storage
  field. No live form configuration was changed in this patch.
- Older widget 155, `Shane Wedding Countdown Timer`, is a separate client-only
  timer with no member persistence. Current dashboard 295 does not include it.
- The live countdown save handler itself currently ignores a blank submission.
  An app-side clear still reaches its display correctly after a fresh dashboard
  load because its SELECT reads the shared blank column. This patch does not add
  a website clear button or alter countdown behavior.

## Defect and scoped fix

The app used truthiness when serializing `wedding_date`, so an explicit empty
date was omitted. Backend `bd-complete-profile` also removed empty fields. The
app's response fallback could subsequently revive its cached prior date.

BD's installed MCP implementation documents the raw API requirement: both an
empty value and the server clear directive must be present on the wire:

```text
wedding_date=&__clear_fields=wedding_date
```

The connector-facing `_clear_fields: ["wedding_date"]` is translated to the
double-underscore wire field above; it must not be copied literally into the
raw Edge Function request.

Backend changes in `supabase/functions/bd-complete-profile/index.ts`:

1. Omitted `profile.wedding_date` leaves the date unchanged.
2. Explicit empty string requests clearing only `wedding_date` using both
   documented wire fields. This request/readback behavior was mocked, not proven
   against both physical and EAV date storage. Client-supplied arbitrary clear
   lists are never used.
3. Nonempty dates must be string-valued, real calendar dates in `YYYY-MM-DD`
   format, year 1900 or later, matching the app validator.
4. Both ordinary-save and email-change branches verify the fresh BD readback
   before reporting success or sending an email-change confirmation. Missing,
   stale, or conflicting readback is not reported as a successful save.
5. A confirmed empty/null/zero-date clear is returned as an explicit empty date
   so the app can retain the clear instead of restoring its cached value.

Existing email ownership, native-session validation, and linked-Auth proof
checks were preserved. Native UI payload/response fixes belong to the parent
task. No separate countdown synchronization job or Supabase date column is
required for these website sections.

## Verification

New test file: `supabase/functions/_shared/profile_wedding_date_sync_test.ts`.
It executes the real endpoint source with only I/O dependencies mocked; it does
not access live accounts, credentials, network or database state.

```sh
deno test --allow-read \
  supabase/functions/_shared/profile_wedding_date_sync_test.ts \
  supabase/functions/_shared/qr_bingo_contact_profile_gate_test.ts \
  supabase/functions/_shared/member_email_verification_test.ts
deno check supabase/functions/bd-complete-profile/index.ts
```

Result: **43 passed, 0 failed** (15 new date tests, 10 QR/profile regressions,
18 email-verification regressions). Endpoint type check passed.

Remaining live acceptance belongs to the parent task: save a date in the app,
load `/account/home` and the contact-details form in the same authorized test
account, verify both show it, clear it in the app, reload both, and restore the
test account's intended date. No claim of that live test is made here.

## Parent implementation and physical-device verification

Completed September 7, 2026:

- Native contact details now have a real, independently focused wedding-date
  text input and a separate calendar button. Typing is unmasked while editing;
  complete dates normalize on blur/save. The calendar blurs both inputs and
  dismisses the keyboard before opening. Invalid dates do not submit.
- Native profile requests retain an explicit empty wedding date; response merging
  preserves an authoritative empty date instead of reviving a cached value.
- Native date, keyboard, contact-email, and request-race tests: **45 passed**.
  Backend date/profile/email-proof tests: **43 passed**. TypeScript and endpoint
  type checks passed. Physical-test harness guard tests: **8 passed**.
- Deployed only the reviewed `bd-complete-profile` entrypoint against unchanged
  live dependency files, from version 26 to **27**. JWT verification remains on.
  Round-trip function download exactly matched the deployment payload. An
  unauthenticated date-update request returned **401** and made no member change.
- Built the `WeddingWin` workspace/scheme in **Release**, installed and launched
  `ca.weddingwin.app` on the connected **[redacted device name]** using XcodeBuildMCP.
  Build log: `build_run_device_2026-09-07T12-57-03-072Z_pid24165_c1828ae3.log`.
- Physical test `testOpenCoupleQrContactFormWithoutSavingOrConsent` passed.
  It reopened the current signed-in couple's contact form through the normal QR
  contact gate, without accepting terms or submitting a form.
- Physical test `testPhoneToWeddingDateDigitsAndCalendarWithoutSaving` passed.
  App-level keyboard input after phone-to-date taps landed in the date field,
  retained raw `20301018` while focused, normalized to `2030-10-18` on blur, and
  left the phone field unchanged. The calendar opened with the keyboard hidden
  and closed without a date selection. The original unsaved date was restored.

Physical result bundles (workspace-relative):

```text
harness/iphone-smoke/results/2026-09-07-wedding-date-contact-reopen-01.xcresult
harness/iphone-smoke/results/2026-09-07-wedding-date-focus-fixed-01.xcresult
```

Two earlier inspection runs skipped because their header matcher did not allow
the app's uppercase heading; an inspection after install skipped because the
app restarted at the main menu. These were not functional passes. The final
navigation and focus tests each passed with **zero skips and zero failures**.

No test contact values were saved and no email/account changes were made. The
website field linkage was verified from live CMS source and the real profile
handler was tested with mocked I/O; an authenticated end-to-end date save and
browser countdown-render cycle was not performed in this task.

## Calendar popup and close control follow-up

User requested an obvious calendar picker with an X to leave it. The date row
now has a labeled **Calendar** button alongside the editable date. On iPhone it
opens the existing native month calendar in a centered popup with a fixed
**Wedding date** header and a 44-point accessible X button. Closing only hides
the popup; it does not select, clear, or save a date. System/accessibility close
uses the same handler. Android retains its native calendar/cancel path.

- Updated Release installed on the same physical iPhone; build succeeded.
  Build log: `build_run_device_2026-09-07T13-11-15-505Z_pid24165_ed9e9024.log`.
- Visually inspected the on-device popup: complete month grid and visible X,
  no keyboard covering the calendar.
- Final physical suite **2 passed, 0 failed, 0 skipped**: two phone-keyboard →
  Calendar → X cycles preserved both values; manual phone-to-date focus still
  worked and its original unsaved value was restored.
- Result bundle:
  `harness/iphone-smoke/results/2026-09-07-calendar-x-final-01.xcresult`.
- A first harness run stopped before tapping X because Fabric puts the picker
  testID on an `Other` wrapper, not on its `DatePicker` child. Read-only device
  inspection confirmed both controls; the harness now checks the exact wrapper
  plus the actual picker. A separate guarded X-close test passed before the
  final suite. No app workaround was needed for that test-identification issue.
- Native date/auth/contact regression tests: **48 passed**. Harness guards:
  **12 passed**. TypeScript and whitespace checks passed. No backend changes,
  emails, profile saves, or account changes were made for this follow-up.
