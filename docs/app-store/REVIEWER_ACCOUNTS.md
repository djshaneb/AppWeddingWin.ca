# App Review account preparation

Status: **CODE-OWNED CHECKLIST FINAL — credentials and exact-build operational verification remain private release tasks.**

WeddingWin has different couple and vendor paths. Use one fictional account for each role. No username, password, token, phone number, or private reset procedure belongs in this file or Git.

## Credential routing

- Primary couple account, member `38971`: enter its username and password only in App Store Connect's dedicated sign-in fields.
- Additional vendor account, member `38970`: replace the single `[[PRIVATE_VENDOR_CREDENTIALS]]` insertion in `APP_REVIEW_NOTES.md` only in App Store Connect immediately before submission. Never save the completed notes in the repository.
- Review contact: enter a monitored person's name, email, and international-format phone number in App Store Connect's Review Contact fields.
- Source of truth: team password manager. `docs/app-store/private-reviewer-credentials.md` is local-only, ignored, and must remain untracked.

## Prepared isolated fixture

Vendor `38970` and couple `38971` are assigned to `app-review-weddingwin-2026-38970`. Couple `38971` displays the fictional first name `App Review`. The event has isolated fictional prize, scan, entry, and draw state. Reviewer-fixture email is suppressed.

Use only `assets/app-store/sample-qr-review-vendor-38970.png`, payload `https://www.weddingwin.ca/qr?vendor_id=38970`. Do not send the legacy `23608` QR to App Review because it points at a production-side vendor.

The vendor is intentionally private/nonpublic. Pair-scoped chat access is service-managed and currently expiry-gated. Because Apple requires working review access that does not expire, submission is blocked until operations extends or replaces that grant so every documented feature remains available throughout review, monitors it daily, and retains a manual post-review revocation plan. Do not solve this by publishing the vendor.

## Exact-build account gate

- [ ] Both credentials work from a clean install of the processed TestFlight build with no one-time code, CAPTCHA, owner device approval, expired consent, or manual activation step.
- [ ] Neither account is scheduled for inactivity cleanup, password rotation, membership expiry, or pair-access expiry during review.
- [ ] Both profiles contain fictional/test-safe names, email, phone, images, business details, and a future test wedding date; no real person's data appears.
- [ ] Couple uses the normal couple plan (`18` in the audited backend). Vendor uses the actual release vendor plan selected by the owner from the supported plan set (`17`, `27`, or `28`).
- [ ] Signed-out private-browser checks show vendor `38970` absent from directory/search, direct public profile browsing, sitemap, featured content, event rosters, search-engine surfaces, and marketing feeds.
- [ ] Private status does not prevent vendor login, dashboard, text chat, or any draw screen described to Apple.
- [ ] Login and native session creation pass on physical iPhone and iPad for both roles.

## Controlled messaging state

- [ ] Start with one open, unreported fictional text conversation between the two accounts.
- [ ] App→website text and the supported active-couple-website→private-vendor-app reply pass on the exact TestFlight build and persist after reload/sync.
- [ ] Native chat exposes no image-send control; do not ask the reviewer to attach a photo.
- [ ] Seed a separate disposable thread for Report because reporting closes the current conversation and removes the composer.
- [ ] Describe the moderation boundary accurately: the current thread closes, the app suppresses the reported member, and a thread created through an external website entry point may exist until synchronization discovers and closes it.
- [ ] Staff can see/respond to a report, reset the disposable state, and monitor the published safety contact during review.

Current evidence: a controlled Simulator/live-backend text round trip passed, including active couple website→private vendor app. The inactive vendor's website send was correctly rejected. Treat this as preparation evidence, not a substitute for the exact physical TestFlight pass.

## QR Bingo and draw state

- [ ] Reset couple `38971` so vendor `38970` is unscanned and no prior entry/selection affects the walkthrough.
- [ ] Printed QR permission allow/deny/re-enable, successful scan, duplicate handling, isolated progress, and wrong/invalid-code behavior pass on a physical iPhone.
- [ ] A scan does not enter the user in a draw. Separate entry displays the named vendor/prize, fields disclosed, current rules, no-purchase method, and no-marketing purpose before consent.
- [ ] Only fictional records are present. The vendor cannot access or export an entrant list; only selected-potential-winner information can be disclosed for verification/fulfilment.
- [ ] Reviewer-fixture email remains suppressed. Production draw email remains fail-closed unless a separately approved fulfilment path has passed controlled-recipient testing.
- [ ] Owner/legal approvals cover the developer/sponsor identity, vendor role/agreement, prize, rules, territory, age, dates, alternate free entry, skill question where required, and Apple non-involvement language.

Current evidence: backend replay for the prepared QR is idempotent. This does not replace printed-camera, exact-build, full draw, or legal verification.

## Push and deletion state

- [ ] Couple account registers a TestFlight push token and receives one generic notification without message text in foreground, background, and terminated states.
- [ ] Sign-out unregisters the device token; reinstall/rotation and invalid-token handling pass.
- [ ] Do not invite Apple to delete either standing account. Maintain a fresh disposable email account and, if needed, a separate Apple-linked disposable account through the private reset process.
- [ ] Exact-build deletion removes login/account-owned data, closes related conversations, rejects new sends, and leaves only the surviving participant's read-only shared history and approved moderation/legal records under the published retention schedule.
- [ ] Physical Apple reauthentication/revocation, provider stores, backups, errors, and the public signed-out request path pass.

Current evidence: disposable email members `38978`/`38979` passed the deployed two-party deletion-preservation design. Their credentials no longer work. This does not complete the physical Apple/provider/backup/TestFlight gate.

## Review-window operations

- [ ] Recheck both credentials, membership, pair authorization, isolated event, QR reset, normal chat, and backend availability immediately before submission and daily while in review.
- [ ] Monitor the Review Contact and `info@weddingwin.ca`; document who can reset messages, scans, entries, report/block state, and disposable accounts without touching production users.
- [ ] Do not subscribe either account to newsletters or promotional campaigns.
- [ ] Do not exempt review accounts from authentication, authorization, moderation, privacy, or raffle data-use controls.
- [ ] After review ends, revoke the special pair grant and rotate/remove credentials under the private operational procedure.
