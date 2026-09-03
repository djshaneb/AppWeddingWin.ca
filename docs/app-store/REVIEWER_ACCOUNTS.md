# App Review account preparation

Status: **CODE-OWNED CHECKLIST FINAL — credentials and exact-build operational verification remain private release tasks.**

WeddingWin has different couple and vendor paths. Use one fictional account for each role. No username, password, token, phone number, or private reset procedure belongs in this file or Git.

## Credential routing

- Primary couple account, member `38971`: enter its username and password only in App Store Connect's dedicated sign-in fields.
- Additional vendor account, member `38970`: replace the single `[[PRIVATE_VENDOR_CREDENTIALS]]` insertion in `APP_REVIEW_NOTES.md` only in App Store Connect immediately before submission. Never save the completed notes in the repository.
- Review contact: enter a monitored person's name, email, and international-format phone number in App Store Connect's Review Contact fields.
- Source of truth: team password manager. `docs/app-store/private-reviewer-credentials.md` is local-only, ignored, and must remain untracked.

## Prepared isolated fixture

Vendor `38970` and couple `38971` are assigned to `app-review-weddingwin-2026-38970`. Couple `38971` displays the fictional first name `App Review`; every profile/contact value used in its draw entry must remain fictional. The event has isolated fictional QR scan/progress and optional vendor-draw state. The fixture demonstrates the workflow without a real prize or outbound email and cannot change production-event data. Vendor `38970` must review and accept Official Rules version `2026-09-01-in-person-entry`, including the named-vendor contact-use and marketing responsibilities, and enable the fixture before the reviewer walkthrough.

Use only `assets/app-store/sample-qr-review-vendor-38970.png`, payload `https://www.weddingwin.ca/qr?vendor_id=38970`. Do not send the legacy `23608` QR to App Review because it points at a production-side vendor.

The vendor is intentionally private/nonpublic. Pair-scoped chat access is service-managed and currently expiry-gated. Because Apple requires working review access that does not expire, submission is blocked until operations extends or replaces that grant so every documented feature remains available throughout review, monitors it daily, and retains a manual post-review revocation plan. Do not solve this by publishing the vendor.

## Exact-build account gate

- [ ] Both credentials work from a clean install of the processed TestFlight build with no one-time code, CAPTCHA, owner device approval, expired consent, or manual activation step.
- [ ] Neither account is scheduled for inactivity cleanup, password rotation, account-access expiry, or pair-access expiry during review.
- [ ] Both profiles contain fictional/test-safe names, email, phone, images, business details, and a future test wedding date; no real person's data appears.
- [ ] Couple uses the normal couple plan (`18` in the audited backend). Vendor uses the actual release vendor plan selected by the owner from the supported plan set (`17`, `27`, or `28`).
- [ ] Signed-out private-browser checks show vendor `38970` absent from directory/search, direct public profile browsing, sitemap, featured content, event rosters, search-engine surfaces, and marketing feeds.
- [ ] Private status does not prevent vendor login, dashboard, or text chat described to Apple.
- [ ] Login and native session creation pass on physical iPhone and iPad for both roles.

## Controlled messaging state

- [ ] Start with one open, unreported fictional text conversation between the two accounts.
- [ ] App→website text and the supported active-couple-website→private-vendor-app reply pass on the exact TestFlight build and persist after reload/sync.
- [ ] The Attach control appears only when the explicit backend rollout gate is enabled. On a physical iPhone, tap Attach, confirm the iOS system picker supports cancel and selection without a broad photo-library permission prompt, choose a fictional non-sensitive photo, and verify the app resizes/re-encodes it as a bounded JPEG and the attachment persists in both app and website after reload/sync.
- [ ] Confirm the backend rejects invalid type/base64/full decode, decoded-size, image-dimension, and rollout-cutoff cases. Do not describe this technical validation as automated semantic image moderation.
- [ ] Seed a separate disposable thread for Report because reporting closes the current conversation and removes the composer.
- [ ] Describe the moderation boundary accurately for text and photos: the current thread closes, the app suppresses the reported member, retained conversation/media follows the approved finite schedule, and a thread created through an external website entry point may exist until synchronization discovers and closes it.
- [ ] Staff can see/respond to a report, reset the disposable state, and monitor the published safety contact during review.

Current evidence: a controlled Simulator/live-backend text round trip passed, including active couple website→private vendor app. The inactive vendor's website send was correctly rejected. Simulator testing also confirmed system-picker selection without a broad permission prompt plus captioned and photo-only delivery. The physical TestFlight/iPhone picker and attachment matrix remains pending; treat Simulator evidence as preparation only.

## QR Bingo booth-visit and vendor-draw state

- [ ] Reset couple `38971` so vendor `38970` is unscanned and has no current optional-draw entry/selection; reset the vendor fixture to a clean, enabled, rules-accepted state.
- [ ] Printed QR permission allow/deny/re-enable, successful scan, duplicate handling, isolated progress, and wrong/invalid-code behavior pass on a physical iPhone.
- [ ] The scan records booth-visit progress only and never creates a draw entry automatically. Declining the separate optional offer leaves no entry.
- [ ] The optional entry requires opening Official Rules version `2026-09-01-in-person-entry`, all eligibility confirmations, and explicit consent to share the entrant's name, email address, phone number if provided, wedding date if provided, and entry/consent evidence with vendor `38970` for this draw and that vendor's wedding-related offers or promotions. In production, the eligible couple must attend the wedding show, visit that vendor's booth, scan its QR code, and then separately choose whether to enter; the QR flow is the digital replacement for a paper ballot. Each eligible couple may receive only one valid entry per named vendor draw. General admission is free when obtained in advance while the free allocation remains; VIP admission is paid; anyone without an advance general ticket must purchase admission at the door; paid admission does not add a chance or improve odds; and no purchase from the named vendor is required. The isolated reviewer fixture emulates the in-show booth scan without changing production data.
- [ ] The vendor can view settings and entry count; accept version `2026-09-01-in-person-entry`; enable/disable the fixture; download the authenticated, exact-vendor/event entrant-administration CSV; and select only one potential winner after entries close/early-review permission applies. Confirm the CSV contains Event, Vendor, Participant Reference, Name, Email, Phone, Wedding Date, Entered At, Entry Method, Rules Version, Entrant Eligibility Attested, Selection Status, and Marketing Consent; Entry Method is `QR scan opt-in`; every identity/profile value is fictional; Marketing Consent says `Yes - named vendor draw entry and wedding-related marketing`; another vendor cannot obtain it; and a legacy entry is excluded until fresh consent under the current version.
- [ ] After selection, the UI shows Vendor verification required. Before confirm/disqualify, the vendor independently verifies eligibility, attests that it obtained the entrant declaration/release outside Wedding Win, enters the correct mathematical skill-testing answer, and records a nonblank evidence note stating date, method, and non-sensitive reference. Wedding Win records that vendor attestation only; it does not perform or certify the vendor's eligibility review, declaration/release, or prize-fulfilment work. Fulfilment notices and prize-claim controls remain blocked until verification completes. The isolated fictional App Review fixture suppresses outbound email and awards no prize. In a separate controlled production fixture, verify that a fully verified winner sends through each configured vendor/couple channel and is not unconditionally suppressed.
- [ ] Public rules identify the named vendor as vendor-promotion sponsor, contest operator, and prize provider solely responsible for lawful terms, eligibility and winner-release decisions, the skill-testing question, prize restrictions, taxes, claims, disputes, and fulfilment; Wedding Win Inc. as app developer, limited platform sponsor of the in-app workflow, and technical administrator that is not the named vendor-promotion sponsor/operator/prize provider and remains responsible for its own technology, privacy, security, administrative conduct, and non-waivable duties; and Apple as not a sponsor or participant.
- [ ] Owner/legal confirms the narrow Wedding Win platform-sponsor role reflects the actual workflow and satisfies Apple Guideline 5.3.1; it is not used to imply that Wedding Win supplies, guarantees, insures, or fulfils the named vendor's prize.

Current evidence: backend replay for the prepared QR is idempotent. This does not replace printed-camera, exact-build, optional-entry/vendor-draw, rules, selection/verification, or public-disclosure verification.

## Push and deletion state

- [ ] Couple account registers a TestFlight push token and receives one generic notification without message text in foreground, background, and terminated states.
- [ ] Sign-out unregisters the device token; reinstall/rotation and invalid-token handling pass.
- [ ] Do not invite Apple to delete either standing account. Maintain a fresh disposable email account and, if needed, a separate Apple-linked disposable account through the private reset process.
- [ ] Exact-build deletion removes login/account-owned data, closes related conversations, rejects new sends, and leaves only the surviving participant's read-only shared history and approved moderation/legal records under the published retention schedule.
- [ ] Physical Apple reauthentication/revocation, provider stores, backups, errors, and the public signed-out request path pass.

Current evidence: disposable email members `38978`/`38979` passed the deployed two-party deletion-preservation design. Their credentials no longer work. This does not complete the physical Apple/provider/backup/TestFlight gate.

## Review-window operations

- [ ] Recheck both credentials, account roles, pair authorization, isolated event, QR reset, normal chat, and backend availability immediately before submission and daily while in review.
- [ ] Monitor the Review Contact and `info@weddingwin.ca`; document who can reset messages, scans, report/block state, and disposable accounts without touching production users.
- [ ] Do not add either review account to newsletters or any real promotional campaign. A current-version fixture entry necessarily carries consent for vendor `38970` to use the fictional contact data for the draw and its wedding-related marketing; keep that data fictional and verify the consent marker without sending a campaign.
- [ ] Do not exempt review accounts from authentication, authorization, moderation, privacy, entry-consent, eligibility, draw-limit, winner-verification, or sponsor/rules controls. Only the isolated early-draw and outbound-email-suppression fixture behavior may differ from production.
- [ ] After review ends, revoke the special pair grant and rotate/remove credentials under the private operational procedure.
