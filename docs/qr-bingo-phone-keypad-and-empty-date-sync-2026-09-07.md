# QR Bingo phone keypad and date-sync repair — 2026-09-07

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Changes

- The native QR contact phone field has an iOS keyboard accessory **Done**
  button (44-point minimum target). Android uses its Done submit action.
  Dismissing the keypad only blurs the phone input; it does not submit,
  navigate, accept terms, or change any contact fields.
- Brilliant Directories can return a successful, empty metadata list using
  `current_page: 0`, `total_pages: 0`, `total: 0`, and `next_page: ""`.
  The date-sync completeness guard previously rejected that valid response.
  It now accepts only this exact empty envelope. Contradictory totals,
  partial pages, unexpected member/key/table scopes, and failed readback
  remain rejected.
- This shared backend repair applies to both the app and website. No new
  database migration or website markup change was needed for this repair.

## Deployment

Published through Supabase MCP after access was restored:

| Function | Version | JWT verification |
| --- | --- | --- |
| `bd-qr-bingo-sync` | 64 | Existing custom authentication retained |
| `bd-qr-bingo-vendor-sync` | 65 | Existing custom authentication retained |
| `bd-complete-profile` | 30 | Enabled, unchanged |

Each deployment changed only `_shared/bd_wedding_date.ts` relative to its
fresh live source. All bundled files were read back and matched exactly.
The updated Release app was built and installed on the connected physical
iPhone using `WeddingWin.xcworkspace`, scheme `WeddingWin`.

## Verification

- Shared Edge suite: **699 passed**; focused backend suite: **65 passed**.
  The date helper itself has **25 passing tests**, including the actual
  empty-list shape and contradictory-envelope regressions.
- App TypeScript and `git diff --check`: passed.
- Frontend contact/calendar and native harness guards: **48 passed**. The
  final timing-only harness guard update also passed all **15** guard cases.
- Physical iPhone: opening the existing contact editor passed. Focusing the
  phone field and tapping the new Done accessory passed: keypad closed,
  all original field values were preserved, and Save was visible.
  Evidence: parent workspace `harness/iphone-smoke/results/phone-done-keypad-20260907-1432.xcresult`.
- Chrome website, isolated couple [redacted member A]: an unchanged Save & Continue
  succeeded, retained the existing date and venue, and returned to Before
  you scan with no console errors. Contact profile reached version 6 with
  `date_sync_pending=false`.
- The affected phone profile [redacted member J] recovered its stored date on contact
  reload. BD's canonical date matched the saved QR date. Subsequent scoped
  database checks showed profile version 3, `date_sync_pending=false`.
- The separate automated physical-iPhone Save check remains to be completed;
  its initial attempts safely skipped when the current screen or foreground
  state did not match. Bounded foreground/loading waits did not reach the
  exact Before you scan state; no save was attempted. Skips are not counted
  as passes. The separately authorized fresh-couple simulator save test
  below was completed without signing out their physical phone; it does not
  substitute for the still-incomplete physical-iPhone Save check.
- The broader PHP-dependent contact suite could not run fully in the current
  offline npm environment because its PHP-WASM package was not cached. No PHP
  source changed in this repair; this is not claimed as a passing rerun.

## Fresh-couple app and website verification

With explicit user approval, a new normal couple account was created in the
current Release app on the **iPhone 17 Pro simulator**: member **[redacted member K]**, login
email `[redacted test email]`. The account remains available
for testing. This sequence is simulator and Chrome evidence, not an additional
physical-device pass.

- App signup reached the couple main menu. Opening Bingo prompted for the
  missing name and phone. The contact name was set to `QR Save Test Couple`
  with the approved test contact email and phone. The contact email is
  separate from the account's login email.
- The phone keypad's **Done** button closed the keyboard. Saving with no
  wedding date succeeded: contact profile version **1**,
  `date_sync_pending=false`.
- Selecting **March 20, 2027** and entering `WeddingWin QA Test Venue`, then
  saving, succeeded: version **2**, `date_sync_pending=false`. Reopening the
  app editor preserved all entered values.
- Chrome login with the same credentials succeeded after the approved
  reCAPTCHA checkbox. The dashboard identified member **[redacted member K]**, plan
  **Couples**, and displayed a **194-day** wedding countdown at the time of
  testing. A read-only BD member check confirmed canonical wedding date
  `2027-03-20` and unchanged login email.
- Website `/qr` displayed the app-saved name, contact email, phone, date and
  venue. Email and phone were verified visually in a screenshot because the
  browser DOM output redacts those fields.
- Choosing **Not sure yet** on the website and saving cleared both date and
  venue. Cancelling and reopening the app contact editor showed **Not
  selected**, no venue field, and the other contact values retained.
- The original date and venue were then restored in the app. The final save
  returned to **Before you scan**. Read-only SQL confirmed version **4**,
  `date_sync_pending=false`, wedding date `2027-03-20`, and venue
  `WeddingWin QA Test Venue`. BD again confirmed the same canonical date and
  unchanged login email.
- Chrome mobile at **390 × 844** was reloaded after that final save. The
  contact form showed the restored date and venue plus the correct name,
  email and phone. The Save control was visible; viewport and document
  scroll width both measured **390 pixels**. The screenshot was clean and
  no console errors were observed.

No Bingo agreement was accepted during this fresh-account sequence, and no
QR scan or draw entry was performed. One approved test account was created
and retained; no accounts, draw entries, winners, or scans were deleted. No
test emails were sent. No GitHub push was performed for this repair.
