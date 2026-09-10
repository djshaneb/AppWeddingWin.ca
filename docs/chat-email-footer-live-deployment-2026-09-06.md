# Website chat email-confirmation footer: live deployment

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

Status: **LIVE**, published and browser-tested by the root agent on September 6,
2026. This note records root-supplied live observations; the implementation agent
did not operate the admin editor or submit the live test messages.

## Published artifact and location

- Source: `brilliant-directories/widgets/chat-email-footer-guard.js`.
- Published artifact: `brilliant-directories/widgets/chat-email-footer-guard.min.html`.
- Admin location: Design Settings → Custom CSS / HEAD, the existing
  `website_footer` field / `#footer` textarea.
- Block markers: `WeddingWin chat email footer guard v1 BEGIN` and matching `END`.
- Local artifact: 4,311 characters, with zero backslashes. The CMS trims one final
  newline; otherwise the fresh readback matched exactly.
- The entire original 9,848-byte footer prefix was preserved unchanged. Existing
  authentication, checkout, and other footer integrations were not rewritten.

The active `/connect` renderer does not include custom widget 357, even though
that widget is enabled. This separately scoped footer block supplies the live
notice on the actual renderer; no widget was disabled or toggled as a workaround.

## Behavior

The hook runs only on member `/connect` and `/account/chat_messages` routes and
only after an actual message composer is present. A same-origin authenticated
POST to `/verify-email-change` with `ww_email_change_action=status` obtains the
authoritative pending/confirmed state. Unknown, pending, expired, malformed,
failed, and timed-out checks block outgoing compose actions and show a clean
retry notice. Conversation history and unrelated page controls remain intact.

The click guard explicitly includes `#bd-chat-pmb-sm-sm`: the proprietary template
spells its Send element `<buton>`, so a normal `button` selector alone is
insufficient. Nested icon clicks are covered too. An AJAX prefilter also blocks
only the proprietary `init-pmb-thread` and `add-thread-message` writes while the
status is not allowed. No message is automatically replayed after confirmation.
Server-side verification and database guards remain the security boundary.

## Verification completed

- Human-readable source: **8/8 Node VM tests passed**.
- The actual minified publication artifact: **8/8 tests passed**.
- Tests cover route/DOM scope, first-load and rapid taps, the misspelled Send
  element, pending/expired/error states, bounded retry, exact AJAX-write scope,
  unchanged typing/history, repeated initialization, and mutation-loop safety.
- `git diff --check` passed.
- Root's fresh admin readback matched the publication artifact, except the
  terminal newline, and retained the entire previous footer prefix.
- The live `/connect` page contained the compiled hook. For the already-confirmed
  private test account, its notice was hidden.
- Root then submitted a genuine website email-change request for approved test
  couple member **[redacted member I]** to the approved `qr-verify-web` alias. The live page
  displayed “Confirm your new email before sending messages.”
- Two fast clicks on the actual Send control were blocked, with no success
  notice. This is browser-behavior evidence, not a substitute for database counts.

- The database count for that exact pending-attempt marker was **zero**.
- The latest website confirmation email arrived at the approved inbox. Its
  explicit confirmation POST succeeded, and “I have confirmed my email” hid the
  same live chat notice. The unsent test draft was cleared and was not replayed.
- The final verified contact email remained on the same member and linked Auth
  identity after a subsequent successful Apple Hide My Email login in the app.

This footer note does not claim a separate message-notification email test.

For presentation-only rollback, remove only this exact marked footer block after
rereading the latest footer. Preserve all other footer bytes and keep server-side
verification enforcement and private evidence intact.
