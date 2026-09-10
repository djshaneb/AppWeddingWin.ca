# Contact-email verification: website chat deployment

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Confirmed deployment

WeddingWin production database: `launc29637_directory`.

Root verified MariaDB 10.11.19, InnoDB storage for the inspected member,
metadata, and private-chat tables, and no pre-existing triggers before installing
the scoped additions below. Root provisioned the private
`ww_email_verification_state` table before publishing the widget changes.

| Trigger | Table | Event | Purpose |
| --- | --- | --- | --- |
| `ww_chat_email_pending_bi` | `chat_message_items` | BEFORE INSERT | Block new messages from a pending-email sender |
| `ww_chat_email_pending_bu` | `chat_message_items` | BEFORE UPDATE | Check old/new owners for content or routing changes |
| `ww_chat_thread_email_pending_bi` | `chat_message_threads` | BEFORE INSERT | Block a pending-email sender from creating a thread |
| `ww_chat_thread_email_pending_bu` | `chat_message_threads` | BEFORE UPDATE | Check old/new owners for participant or routing changes |
| `ww_member_email_state_ad` | `users_data` | AFTER DELETE | Delete only that member's private email-verification state |

Root reread the live trigger inventory and verified the exact five names,
tables, and timings. The implementation does not replace Brilliant Directories'
sender authentication or existing Apple account-cleanup hooks.

Root also installed and verified the nonunique
`ww_users_data_chat_token` index on `users_data.token(64)`; the reported
online creation time was 0.12 seconds. The column is
`VARCHAR(255) COLLATE utf8mb4_unicode_ci`. Full binary equality in the
trigger remains authoritative; the prefix index only narrows candidate rows.
No existing index, member, or token was changed.

## Published website widgets

- Widget 356, **WeddingWin Chat New Thread Guard API**:
  only `widget_data` updated.
- Widget 357, **Bootstrap Theme - Member Profile - Contact Page**:
  only `widget_data`, `widget_style`, and `widget_javascript` updated.

Both widgets were reread through the authenticated MCP connector after saving.
All intended code fields matched local source after terminal-newline
normalization, and untouched code fields matched their pre-update values.
The new-thread guard checks authoritative state before writing abuse-guard
events. Widget 357's implementation preserves conversation history and includes
a friendly email-confirmation notice, but live testing found that the active
member `/connect` renderer does not include widget 357. A narrowly scoped footer
hook now provides the verified live notice on that renderer; see
`chat-email-footer-live-deployment-2026-09-06.md` for publication and test evidence.

Private pre-update widget backup:
`/var/folders/qt/pxw4tv5x33gcmd4g1l0qrkt40000gn/T/weddingwin-chat-widget-backup-t2arXG/widgets-before.json`.
It is outside Git in a private temporary directory and may not survive OS
temporary-file cleanup.

## Source and deployment tools

- `brilliant-directories/widgets/email-verification-core.php` is embedded
  unchanged in the two standalone PHP widgets.
- `brilliant-directories/widgets/356-chat-new-thread-guard.php`
- `brilliant-directories/widgets/357-member-profile-contact.php`
- `brilliant-directories/widgets/357-member-profile-contact.js`
- `brilliant-directories/widgets/357-member-profile-contact.css`
- Shared UI assets: `chat-email-pending-ui.js` and
  `chat-email-pending-ui.css` in the same directory.
- `brilliant-directories/sql/chat-email-confirmation-guards.sql`
- `brilliant-directories/sql/chat-email-confirmation-token-index.sql`
- `scripts/publish-website-chat-email-verification.mjs`

The publisher defaults to read-only preflight. Its write mode requires
`--apply --private-table-confirmed`, validates the existing secure-store MCP
launcher, checks reviewed content hashes, privately backs up both targets,
rechecks for concurrent changes, and verifies each save. It never reads or
prints connector credentials, source code, or arbitrary server errors.
No retry or rollback is automatic after an uncertain write.

## Verification completed

- 19 focused Node tests passed: 6 real-JavaScript UI cases, 4 integration/source
  consistency checks, and 9 SQL structural/contract checks.
- PHP-WASM syntax checks passed for widgets 356 and 357.
- Fresh widget rereads matched the intended code changes.
- Root confirmed live table, trigger, and index provisioning.
- Root verified the live token lookup uses `ww_users_data_chat_token`, with
  an `EXPLAIN` estimate of one candidate row.

### Controlled pending-email tests

The authenticated sender was the approved private couple member **[redacted member I]**.
The only recipient used was approved QA vendor **[redacted member B]**. Before each initial negative
probe, the normal website status endpoint confirmed that the sender's new
contact address was still pending; the existing Apple relay address remained
the current account address. No confirmation token was consumed by these tests.

| Test | Observed result |
| --- | --- |
| Native `bd-chat-sync`, `open_vendor_profile` | HTTP 428, `email_confirmation_required` |
| Native `bd-chat-sync`, `send` | HTTP 428, `email_confirmation_required` |
| Website widget 356 preflight | HTTP 403, `email_confirmation_required` |
| Raw proprietary website `init-pmb-thread` attempt | HTTP 200 with `result: error`; inconclusive because the first harness version supplied the page URL instead of the form's opaque `origin_url` value |
| Root's direct database insert test for the same pending sender | Error 1644, “Confirm your new email address before sending messages.”; explicit rollback and zero matching rows |

The initial raw website probe used the unique marker
`[redacted test message marker]`. It used the normal website
session bridge and the live form's recipient and security token, held only in
memory. After the probes, the sender still had **zero** native threads, native
messages, outbox rows, and mirrored BD threads in Supabase, unchanged from the
initial counts. The proprietary handler returned a generic error rather than
the database guard text. Later source inspection identified a harness defect:
the add-on expects its embedded opaque `origin_url` value, not the literal page
URL. The harness was corrected but this first result must **not** be presented
as proof that the proprietary endpoint reached the pending-email guard.
Root verified zero matching attempted messages and
zero sender threads in the live BD tables, and no messages to the exact QA
recipient alias in Gmail's one-day window.

Root completed the initial real-email confirmation afterward. The existing
member [redacted member I], existing Supabase Auth user/profile, and Apple identity remained
the same; BD/Auth/profile synchronized to the newly verified non-relay contact
address. Plan 18 and the phone number were preserved. These are root-supplied
live observations, not changes performed by the chat probe.

### Post-confirmation positive probe

The normal website status endpoint independently returned `confirmed`, no
pending email, and `email_confirmation_required: false`; the confirmed address
exactly matched the approved test address and the fresh BD member record.

- Native conversation open and send succeeded. The send returned HTTP 200,
  `ok: true`, and `send_delivery_state: stored`.
- Subsequent database checks found exactly one native thread between [redacted member I] and
  [redacted member B], exactly one message, and exactly one outbox row with `sent_at` populated.
  There was one mirrored BD thread. This confirms native-to-website persistence
  and delivery, separately from a recipient-notification check.
- Marker: `[redacted test message marker]`.
- A single raw proprietary website `init-pmb-thread` positive attempt returned
  the same generic `result: error` rather than success. The harness stopped and
  did not retry. This required the normal-browser composer check completed below: the generic raw
  error alone does not establish which proprietary form/context rule rejected
  the request. Subsequent read-only inspection found the same harness
  `origin_url` mismatch described above; it was not a confirmed website product
  defect. A corrected request has not been retried.
- Website marker attempted once:
  `[redacted test message marker]`.
- Root subsequently tested the normal Chrome composer on the current canonical
  QA profile route, `/qa-api-vendor-c/connect`. Clicking the actual
  `#bd-chat-pmb-sm-sm` control displayed **“Your message has been sent.”**
  Marker: `[redacted test message marker]`.
- An earlier Chrome click targeted the parent `div`, not its inner send control
  (the template spells that element `buton`). Its no-op was an automation target
  error, **not** a JavaScript-binding or website-send defect. No such product
  defect is claimed from that click.
- A subsequent read-only native API check (`action: list` only) returned both
  messages: one native marker and one Chrome marker, each with delivered state,
  in two QA-profile conversations. No pending or malformed-raw-attempt marker
  was present. The exact Chrome marker is also present once in the BD message
  mirror. No additional message was sent during these checks.
- The current profile's actual button identifies recipient [redacted member B]. The native
  thread uses its canonical token; the Chrome-created thread represents its
  responder as numeric member ID `[redacted member B]`. A boolean database check confirmed
  that exact ID. Its mirrored `responder_user_id` had not yet resolved at this
  observation, so a title-only native test initially overlooked that thread;
  including the verified QA profile path found the delivered Chrome message.
  No credential/token values were printed during the comparison.
- **Recipient-side native API verification passed.** An independent request
  authenticated as QA vendor **[redacted member B]**, using its existing private test session,
  listed only the two previously verified conversation references. Each marker
  appeared exactly once, with `is_mine: false` and `delivery_state: delivered`.
  This verifies actual recipient-view receipt, not just the sender's outbox.
  There were no pending/raw-attempt markers. Only `action: list` was used:
  zero sends and zero mark-read actions. This is native API evidence, not a
  claim of separately opening the vendor's UI on a physical device.

Both tests targeted only QA vendor [redacted member B]. No recipient outside that explicitly
approved account was contacted, and the test harness never printed or persisted
authentication cookies, native tokens, or signed form values.

Pending requests remain blocked even after their confirmation link expires.
Apple private-relay addresses alone do not block chat. The private state row
takes precedence over old user metadata; legacy metadata can only require
confirmation when no private row exists. Status/read-receipt and timestamp-only
updates are not blocked. A pending recipient may still receive messages.

## Still requiring live functional evidence

Email notification remains pending. Both sent markers are visible through
the native API with delivered state from the sender and the authenticated QA
recipient. The SQL structural tests are distinct from root's live rejected-insert
test above; they are not themselves database execution tests.

Initial inspection found that the active `/connect` renderer did not include
widget 357; a targeted widget cache refresh did not change that. Root verified
that widget 357 was enabled and did not toggle it. A scoped footer hook was then
published while preserving the entire original footer. On the current canonical
`/qa-api-vendor-c/connect` page, a second genuine email-change request displayed
the pending notice. Two fast Send clicks were blocked and the exact attempted
message marker had a database count of zero. Confirming the latest real email
and clicking the notice's confirmation-refresh control cleared the notice. The
unsent draft was cleared, not replayed. Subsequent Apple Hide My Email login in
the rebuilt app preserved the same member, Apple identity, and final confirmed
contact address. See `chat-email-footer-live-deployment-2026-09-06.md`.

The add-on handler's internal ordering is not available in this repository.
The BEFORE triggers reject the database write. Root's exact-row and Gmail
checks after the initial raw negative attempt found no created messages,
threads, or notification emails, but the malformed form context means this
does not prove proprietary handler ordering. The native post-confirmation send was delivered
to the website mirror, and the normal-browser send displayed success. Native API
visibility of both markers is verified; recipient notification remains a
separate positive check.

## Rollback

- `chat-email-confirmation-guards-rollback.sql` removes only the five new
  triggers. It retains the private table, members, messages, and history.
- `chat-email-confirmation-token-index-rollback.sql` removes only the new
  nonunique performance index.
- Restore exact code fields from the private widget backup only after rereading
  current widgets. Use the BD `_clear_fields` convention when restoring a
  previously empty style/JavaScript field; sending an empty string is a no-op.

Removing the database guards restores the prior write behavior, so retain
the application/UI checks while investigating. Do not delete private
verification evidence merely to roll back presentation changes.
