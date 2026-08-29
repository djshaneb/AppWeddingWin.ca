# WeddingWin App Store submission package

Status: **NO-GO — code-owned submission copy is prepared, but no complete App Store submission is recorded.**

Prepared: 2026-08-29
App: WeddingWin `1.0.0`
Bundle ID: `ca.weddingwin.app`

Nothing in this folder has been submitted to App Store Connect. Do not treat Simulator/backend evidence as a signed build, processed TestFlight pass, physical-device pass, legal approval, or live App Store configuration.

## Package map

- `APP_REVIEW_NOTES.md` — one App Store Connect paste block under 4,000 bytes, with one clearly isolated private vendor-credential insertion and a preflight gate.
- `REVIEWER_ACCOUNTS.md` — credential routing, isolated fixture, non-expiring-access requirement, reset plan, and exact-build checks.
- `APP_PRIVACY_ANSWERS.md` — code-backed App Privacy selections separated from tracking, payment, diagnostics, provider, and other owner/live-inventory decisions.
- `PRIVACY_POLICY_REPLACEMENT_DRAFT.md` — code-owned publication candidate; unresolved entity, territory, tracking/provider, retention, and legal facts are isolated in four schedules.
- `PRIVACY_POLICY_AMENDMENTS.md` — publication and consistency checklist.
- `SCREENSHOT_SHOT_LIST.md` — measured screenshot/icon inventory, explicit exclusions, and recapture plan.
- `METADATA_COMPLIANCE_CHECKLIST.md` — App Store fields, age rating, export, payments/IAP, raffle, content, and review compliance.
- `SIGNING_TESTFLIGHT_RUNBOOK.md` — build/sign/upload procedure.
- `RELEASE_TEST_MATRIX.md` — authoritative release gates and evidence status.
- `SUPABASE_DEPLOYMENT_PROVENANCE.md` — backend versions, controls, and provenance gaps.
- `DEPENDENCY_AUDIT.md` — dependency/reproducibility evidence for the release owner to refresh on the final tag.

Reviewer attachment:

- `assets/app-store/sample-qr-review-vendor-38970.png`
- Payload: `https://www.weddingwin.ca/qr?vendor_id=38970`

Never attach the legacy `sample-qr-vendor-23608.*` assets; they refer to a production-side vendor.

## Code-owned items prepared

- Review fixture IDs are fixed and non-secret: couple `38971`, private vendor `38970`, isolated event `app-review-weddingwin-2026-38970`.
- Review fixture email is suppressed; draw state is isolated from production event data.
- The App Review paste block is within Apple's byte limit and contains no stored password.
- The privacy guide describes the actual account, chat, QR, draw, push, WebView, and deletion data flows found in source/backend evidence.
- The publication candidate describes current deletion accurately: account-owned data is removed, related conversations close, and shared history/moderation evidence may remain read-only for the surviving participant under an approved finite retention schedule.
- Native chat image sending is disabled. Camera use is limited to QR decoding in the audited source; photo-library, microphone, and background-location access are not enabled for the documented release flow.
- `assets/images/app-icon.png` is a `1024×1024` opaque RGB PNG referenced by `app.json`; signed-archive/App Store rendering still needs inspection.
- `app.json` now links the Expo project `@blair.shane/weddingwin-app` through `extra.eas.projectId` and declares required-reason API entries for UserDefaults, file timestamps, system boot time, and disk space. The generated signed archive and merged dependency manifests still require inspection.
- Focused source/backend/Simulator evidence exists for authentication hardening, controlled text chat, account deletion preservation, idempotent QR replay, push reliability logic, and WebView routing. See the matrix; none replaces TestFlight/physical evidence.
- The pushed source accepts Apple `@privaterelay.appleid.com` addresses without requiring a personal email, opts actual app-created chat messages into Brilliant Directories transactional reply email while keeping empty thread opens silent, and resolves recipient permissions from the explicit current receive flag, then the active direct-message flag, with the legacy receive field as a final fallback. The shared Deno suite passes **71/71**. The related source is live as `bd-complete-profile` v18, `bd-couple-signup` v12, `bd-vendor-signup` v9, and `bd-chat-sync` v39; JWT rejection remained `401` for all four and a fresh v39 app↔website text round trip passed. Relay delivery and signing still require TestFlight/physical evidence.

## External release blockers

- No signed App Store archive, uploaded/processed build, App Store Connect build selection, or physical TestFlight acceptance record is present in this package.
- EAS project linkage and `submit.production.ios.ascAppId` are configured. The exact `ca.weddingwin.app` App Store record exists as `WeddingWin Canada`; EAS holds an active App Store provisioning profile, the matching Apple Distribution certificate, an App Store Connect API key, and a sandbox-and-production APNs key. The signed production artifact, actual auto-incremented build number, App Store processing, and physical TestFlight evidence remain pending.
- Real Sign in with Apple and Google, printed-camera QR, push foreground/background/terminated delivery and token lifecycle, physical Apple-linked deletion, full physical iPad, interruption/recovery, and accessibility remain incomplete.
- Before the relay-safe email behavior is release-ready, register every outbound account/vendor-contact sender with Apple Private Email Relay, verify SPF/DKIM and bounce handling, and prove required delivery with Hide My Email on physical TestFlight without demanding a personal address. The four relevant functions are deployed and recorded in `SUPABASE_DEPLOYMENT_PROVENANCE.md`.
- The updated Apple Developer Program agreement is accepted. Push Notifications and Sign in with Apple are enabled on the explicit App ID; the new App Store profile was decoded and verified to contain the exact application identifier, production APNs, Sign in with Apple, and the matching distribution certificate. The next release gate is a successful EAS production build and signed-artifact inspection.
- Reviewer credentials must be entered from the password manager and verified immediately before submission. The special pair grant is expiry-gated and must be extended/replaced so documented access cannot lapse during review.
- The live privacy page is generic/website-oriented, and the current signed-out deletion URL redirects to login. A completed publication policy and public mobile privacy-request URL are required.
- The live site currently requests Meta Pixel. A tracking=No answer requires server-side suppression for the `WeddingWinApp/1.0` app user agent and exact-TestFlight network proof. Otherwise the release needs accurate tracking disclosures plus any required consent/ATT before transmission.
- Owner/legal must supply controller/developer identity, contact/address, launch territories, minimum age, payment/provider facts, retention criteria, international processing, and privacy rights details.
- Promotions counsel/owner/operations must approve the draw sponsor/developer identity, rules, no-purchase method, age/territory/dates, skill question where required, vendor agreement, selected-potential-winner-only sharing, fulfilment-only use, no-marketing posture, and email operations.
- Current screenshot files do not form a complete upload-ready set: two 6.9-inch iPhone files are candidates only, the 6.3-inch set is QA, and the sole iPad capture must be replaced because of layout/artifact issues.
- App Store Connect business choices remain external: SKU, categories, price, countries/regions, copyright entity, age-rating answers, content rights, export classification, IAP treatment, release method, review contact, and final privacy answers.

## Secret handling

Reviewer passwords and deployment secrets stay in secure systems. `docs/app-store/private-reviewer-credentials.md` is ignored/local-only and must remain untracked. Do not paste credentials into issues, Git, screenshots, attachments, logs, or this package. The second account is inserted only into App Store Connect's Notes field immediately before submission; the primary account uses the dedicated sign-in fields.

## Submission rule

Submit only when every required `RELEASE_TEST_MATRIX.md` row is `Pass`, the exact processed build is selected, the completed public URLs are live, reviewer access is stable, screenshots are approved in App Store Connect preview, and owner/legal/operations decisions are recorded outside Git. Do not submit while a required row is Blocked, Pending, Partial, or based only on working-tree evidence.

Authoritative references:

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Review information fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
