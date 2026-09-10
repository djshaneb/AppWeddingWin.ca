# Bingo to vendor contact display test — September 7, 2026 UTC

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Result

The normal verified-contact path passed a live app entry, website vendor display,
and downloaded CSV comparison. One long-email truncation defect was reproduced
in memory and is reported below; no product code was changed in this test turn.

## Scope

- Couple: approved private Apple test member [redacted member I], existing confirmed contact
  email `[redacted test email]`, name [redacted test name], phone
  `[redacted test phone]`, no wedding date.
- Vendor: existing private/inactive, tagged test member [redacted member C]. No activation,
  roster/tag, password, account, or production event changes were made.
- Isolated fixture: `[redacted record ID]`, event
  `[redacted test event key]`, expires 2026-09-07 05:24:49 UTC.
- The fixture was initially empty and assigned to QA [redacted member B]. The normal vendor
  authorization correctly denied that untagged account. Before any scan or
  entry, only this newly created empty fixture was reassigned to existing
  private, tagged QA [redacted member C]. No event tag was added to either account.
- Fictional prize created through the website wizard: TEST ONLY — Contact
  display check, $10 CAD, one winner, no real prize or purchase.
- The user had explicitly authorized test-account agreements. The vendor
  agreement and couple pre-scan agreement were accepted through their UIs.
- One test scan and one explicit test entry remain for review. No winner was
  selected, no draw/winner email was sent, and no existing records were deleted.

## Live verification

1. iPhone 17 Pro simulator, iOS 26.5, installed Release `ca.weddingwin.app`:
   the confirmed couple opened Bingo without a missing-email gate.
2. Website normal admin Login as Member established exact private vendor [redacted member C].
   Its isolated wizard saved and opened the fictional prize through the normal
   agreement and Save and continue controls. Contacts initially showed zero.
3. Website Login as Member switched to the exact approved couple [redacted member I]. The
   existing authenticated private-fixture Scan test booth control recorded one
   isolated scan, not a production show visit. Database entry count stayed zero.
4. The website optional prize offer was declined with No Thanks. Scan remained
   one and draw-entry count remained zero: scanning/declining did not share a
   draw contact.
5. Closing/reopening Bingo in the simulator imported 1/1 scanned and the exact
   private vendor card. Its optional draw opened. Enter Draw created exactly
   one entry; both buttons disabled during submission, and the app displayed
   Entered: TEST ONLY - WeddingWin Contact Display draw.
6. Stored entry `[redacted record ID]` matched current BD name,
   verified non-relay email and phone exactly, with empty wedding date, current
   consent version, explicit named-vendor contact/marketing consent, and isolated
   scan proof. Nothing was seeded directly into entry/consent tables.
7. Website [redacted member C] step3 showed one opted-in couple / one in the draw / zero out.
   The card showed [redacted test name], the exact confirmed email, phone [redacted test phone],
   and Wedding date: Not provided. The mailto target preserved the full address;
   the tel target was `tel:[redacted test phone]`.
8. Searching by email or phone found the card. An unmatched search showed zero
   matches without changing the one-contact total. In the draw displayed one;
   Out of the draw displayed zero. Rapid Refresh list clicks were exercised.
9. Desktop and 390×844 phone-width Chrome views were inspected. The private
   admin overlay was exited for the normal vendor view. The card had no
   horizontal content overflow (clientWidth=scrollWidth=324 at phone width).
   Email, phone, missing-date label and buttons were visible. Temporary viewport
   settings were reset afterward.
10. Download contacts produced one real CSV file in Downloads. A browser-tool
    download-event timeout was not a site failure: the UI said Downloaded 1
    contact, the file existed, and the server report audit recorded [redacted member C] as both
    owner/requester, website platform, one row, named_vendor_draw_contacts.
    Read-only Artifact Tool CSV import and eight assertions verified exact
    name/email/phone, blank date, isolated event, QR scan opt-in, consent and no
    second data row. The downloaded file was not changed or re-exported.

CSV: `[redacted local CSV path]`

## Local checks and limits

- Independent UI/export suite:88 existing tests passed, plus9 targeted missing
  date/alias assertions. Separate contact-flow audit:28 Deno and69 Node tests
  passed; these suites overlap, so do not add the totals as distinct coverage.
- Native vendor field mappings were source/test verified. Native vendor login
  and its actual Contacts screen were not run in this turn because the existing
  disposable vendor password was unavailable; no password reset or unsupported
  token import was used. The native couple flow and live website vendor screen
  were exercised as described above.
- Simulator camera scanning was not claimed. The website's built-in private
  scan emulator created the authorized test progress, which the app refreshed.
- Contacts are snapshots at explicit opt-in. Subsequent profile edits do not
  silently rewrite earlier vendor contact records. This is existing behavior,
  not a synchronization failure for the new entry tested here.
- No Git push, backend deployment, app rebuild or App Store submission occurred.

## Defect found: emails over160 characters

Both `bd-qr-bingo-sync/index.ts` and `bd-qr-bingo-vendor-sync/index.ts` use
`cleanText(user?.email, 160)` in the entry snapshot near line2364, although the
contact normalizer and QR profile gate accept up to254 characters. Recipient
handling near lines2889 and3044 also uses160.

Four in-memory production-expression cases reproduced this across the two
endpoints. A syntactically valid161-character synthetic address with local
part64 and domain labels no longer than63 was accepted, then truncated from
`.example.invalid` to `.example.invali`; the corrupted result still passed
syntax validation. A195-character address lost the suffix entirely. No such
address or record was created live and no email was sent. The normal test
address is unaffected. Fix and boundary regression coverage remained required
at the end of that test turn.

## Follow-up: cutoff fixed and delivery tested

The subsequent user-requested fix was deployed on September 7, 2026, around
11:08 UTC. Both QR endpoints now preserve validated addresses through 254
characters in the contact gate, entry snapshot, winner contact text and outgoing
recipients. Invalid/overlength input is rejected rather than truncated. Exact
test-fixture matching, consent, authentication and delivery-claim rules remain
in place. No stored contacts were rewritten: the database had no addresses at
the old 160-character boundary.

- `bd-qr-bingo-sync`: version 57; `bd-qr-bingo-vendor-sync`: version 58.
- All nine deployed source/dependency files per endpoint were reread and matched
  the local tested files exactly. Existing custom authentication and JWT settings
  were preserved. Unauthenticated live calls returned 401 as expected.
- 48 focused Deno tests passed, including 14 new runtime regression cases that
  execute the actual contact/opt-in/send functions with mocked I/O. Lengths 160,
  161, 195 and 254 are preserved; 255, control characters and recipient-list
  injection are rejected before writes or email claims. Root independently
  reran 19 boundary/fixture tests, and a separate review reran 18 overlapping
  checks. These overlapping counts must not be added together.
- Both Edge entrypoints typechecked; `git diff --check` passed.
- One clearly labelled message was sent using Brilliant Directories' supported
  admin **Send Test Email** option to exact `[redacted test email]`. Subject:
  `TEST ONLY - WeddingWin email cutoff check - 2026-09-07`.
- Gmail showed it in **Inbox**, sent from `noreply@weddingwin.ca` at 04:08 Pacific
  (11:08 UTC). Expanded headers confirmed the exact recipient, mailed-by
  `em5394.weddingwin.ca`, signed-by `weddingwin.ca`, and TLS. The complete message,
  including `[redacted end-of-message marker]`, was present.

The live send was a delivery-only test, not a winner notification. The existing
private entry uses a verified Gmail alias; the protected winner workflow
correctly requires account, fixture, entry and recipient to match exactly. No
alias entry was retargeted, no winner was selected, and no account or consent
record was changed to force a send. Long-recipient handling was verified by the
production-function regression harness, not by sending to synthetic addresses.

The private fixture had expired before the follow-up; its inactive vendor's
normal website dashboard correctly denied production Bingo access. No fixture
extension or vendor activation was performed. This follow-up does not claim a
new native vendor UI or full live winner-lifecycle test. No Git push, app rebuild
or App Store submission was performed.
