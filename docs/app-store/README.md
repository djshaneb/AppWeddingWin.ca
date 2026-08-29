# WeddingWin App Store submission package

Status: **NO-GO FOR APP REVIEW — production build `1.0.0 (2)` is validated in TestFlight, but physical-device, privacy, screenshot, and owner/legal gates remain open.**

Prepared: 2026-08-29
App: WeddingWin `1.0.0`
Bundle ID: `ca.weddingwin.app`

Production build `1.0.0 (2)` was uploaded to App Store Connect and Apple marked its binary `Validated`; the version is `Ready to Submit`. It is assigned to the manual `WeddingWin Internal QA` group and the account-holder tester is invited. No App Review submission or public release has occurred, and this evidence is not a physical-device, privacy/legal, or final-screenshot pass.

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
- `assets/images/app-icon.png` is a `1024×1024` opaque RGB PNG referenced by `app.json`. The signed IPA's iPhone `120×120` and iPad `152×152` icons were inspected as opaque and visually match the intended pink WeddingWin mark on black.
- `app.json` links the Expo project `@blair.shane/weddingwin-app` through `extra.eas.projectId` and declares required-reason API entries for UserDefaults, file timestamps, system boot time, and disk space. The signed IPA contains the project link and packaged required-reason privacy manifest, and Apple accepted the upload without a manifest/signature validation error.
- Focused source/backend/Simulator evidence exists for authentication hardening, controlled text chat, account deletion preservation, idempotent QR replay, push reliability logic, and WebView routing. See the matrix; none replaces TestFlight/physical evidence.
- The pushed source accepts Apple `@privaterelay.appleid.com` addresses without requiring a personal email, opts actual app-created chat messages into Brilliant Directories transactional reply email while keeping empty thread opens silent, and resolves recipient permissions from the explicit current receive flag, then the active direct-message flag, with the legacy receive field as a final fallback. The shared Deno suite passes **71/71**. The related source is live as `bd-complete-profile` v18, `bd-couple-signup` v12, `bd-vendor-signup` v9, and `bd-chat-sync` v39; JWT rejection remained `401` for all four and a fresh v39 app↔website text round trip passed. Apple relay delivery still requires physical TestFlight evidence.

## External release blockers

- EAS build `ed4826b7-3fcb-43c8-93cf-480cd7057739` succeeded as signed App Store IPA `1.0.0 (2)`. Its signature, bundle/version/build, production APNs and Sign in with Apple entitlements, icon opacity, encryption declaration, packaged privacy manifest, camera-only purpose posture, and absence of background modes were inspected. Apple processed the upload as `Validated`; no physical TestFlight acceptance record exists yet.
- EAS project linkage and `submit.production.ios.ascAppId` are configured. The exact `ca.weddingwin.app` App Store record exists as `WeddingWin Canada`; EAS holds an active App Store provisioning profile, the matching Apple Distribution certificate, an App Store Connect API key, and a sandbox-and-production APNs key. Build 2 is in a manual internal group with the account-holder tester invited; install and end-to-end physical evidence remain pending.
- Real Sign in with Apple and Google, printed-camera QR, push foreground/background/terminated delivery and token lifecycle, physical Apple-linked deletion, full physical iPad, interruption/recovery, and accessibility remain incomplete.
- Before the relay-safe email behavior is release-ready, register every outbound account/vendor-contact sender with Apple Private Email Relay, verify SPF/DKIM and bounce handling, and prove required delivery with Hide My Email on physical TestFlight without demanding a personal address. The four relevant functions are deployed and recorded in `SUPABASE_DEPLOYMENT_PROVENANCE.md`.
- The updated Apple Developer Program agreement is accepted. Push Notifications and Sign in with Apple are enabled on the explicit App ID; the App Store profile and signed IPA were verified to contain the exact application identifier, production APNs, Sign in with Apple, and matching distribution certificate. The next Apple gate is the complete physical TestFlight matrix, not another signing setup pass.
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
