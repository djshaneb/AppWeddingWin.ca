# WeddingWin App Store submission package

Status: **NO-GO FOR APP REVIEW — production build `1.0.0 (2)` is validated in TestFlight, but physical-device, privacy, screenshot, and owner/legal gates remain open.**

Prepared: 2026-08-30
App: WeddingWin `1.0.0`
Bundle ID: `ca.weddingwin.app`

Production build `1.0.0 (2)` was uploaded to App Store Connect and Apple marked its binary `Validated`; the version is `Ready to Submit`. It is assigned to the manual `WeddingWin Internal QA` group and the account-holder tester is invited. It predates the current `2026-09-01-vendor-marketing` role/rules/vendor-verification/named-vendor contact-sharing-and-marketing delta and is therefore historical evidence, not the current submission candidate. No App Review submission or public release has occurred.

## Package map

- `APP_REVIEW_NOTES.md` — one App Store Connect paste block under 4,000 bytes, with one clearly isolated private vendor-credential insertion and a preflight gate.
- `REVIEWER_ACCOUNTS.md` — credential routing, isolated fixture, non-expiring-access requirement, reset plan, and exact-build checks.
- `APP_PRIVACY_ANSWERS.md` — code-backed App Privacy selections plus the free-app/paid-admission and ticket/payment-data boundary, separated from tracking, diagnostics, provider, and other owner/live-inventory decisions.
- `PRIVACY_POLICY_REPLACEMENT_DRAFT.md` — code-owned publication candidate; unresolved entity, territory, tracking/provider, retention, and legal facts are isolated in four schedules.
- `PRIVACY_POLICY_AMENDMENTS.md` — publication and consistency checklist.
- `SCREENSHOT_SHOT_LIST.md` — measured screenshot/icon inventory, explicit exclusions, and recapture plan.
- `METADATA_COMPLIANCE_CHECKLIST.md` — App Store fields, age rating, export, free/no-IAP posture, QR promotion boundary, content, and review compliance.
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
- The reviewer QR fixture is isolated from production event data and may demonstrate the restored optional vendor-draw flow with fictional data only. The vendor must accept Official Rules version `2026-09-01-vendor-marketing` before enabling it; every exported contact/profile value is fictional, no real prize is awarded, and outbound email remains suppressed.
- The App Review paste block is within Apple's byte limit and contains no stored password.
- The privacy guide describes the actual account, chat, QR booth-visit, push, WebView, and deletion data flows found in source/backend evidence.
- The publication candidate describes current deletion accurately: account-owned data is removed, related conversations close, and shared history/moderation evidence may remain read-only for the surviving participant under an approved finite retention schedule.
- Native chat image sending is disabled. Camera use is limited to QR decoding in the audited source; photo-library, microphone, and background-location access are not enabled for the documented release flow.
- `assets/images/app-icon.png` is a `1024×1024` opaque RGB PNG referenced by `app.json`. The signed IPA's iPhone `120×120` and iPad `152×152` icons were inspected as opaque and visually match the intended pink WeddingWin mark on black.
- `app.json` links the Expo project `@blair.shane/weddingwin-app` through `extra.eas.projectId` and declares required-reason API entries for UserDefaults, file timestamps, system boot time, and disk space. The signed IPA contains the project link and packaged required-reason privacy manifest, and Apple accepted the upload without a manifest/signature validation error.
- Focused 2026-08-29 source/backend/Simulator evidence exists for authentication hardening, controlled text chat, account deletion preservation, idempotent QR replay, push reliability logic, and WebView routing. See the matrix; it does not prove the `2026-09-01-vendor-marketing` delta and never replaces TestFlight/physical evidence.
- The pushed source accepts Apple `@privaterelay.appleid.com` addresses without requiring a personal email, opts actual app-created chat messages into Brilliant Directories transactional reply email while keeping empty thread opens silent, and resolves recipient permissions from the explicit current receive flag, then the active direct-message flag, with the legacy receive field as a final fallback. The shared Deno suite passes **71/71**. The related source is live as `bd-complete-profile` v18, `bd-couple-signup` v12, `bd-vendor-signup` v9, and `bd-chat-sync` v39; JWT rejection remained `401` for all four and a fresh v39 app↔website text round trip passed. Apple relay delivery still requires physical TestFlight evidence.

## External release blockers

- EAS build `ed4826b7-3fcb-43c8-93cf-480cd7057739` succeeded as signed App Store IPA `1.0.0 (2)` and passed the recorded artifact checks. Apple processed it as `Validated`, but it predates the `2026-09-01-vendor-marketing` delta. Create and validate a replacement signed build from the final immutable source.
- EAS project linkage and `submit.production.ios.ascAppId` are configured. The exact `ca.weddingwin.app` App Store record exists as `WeddingWin Canada`; EAS holds the required distribution, submission, and APNs credentials. Build 2 remains in the internal group as historical evidence; replacement-build install and end-to-end physical evidence are pending.
- Real Sign in with Apple and Google, printed-camera QR, push foreground/background/terminated delivery and token lifecycle, physical Apple-linked deletion, full physical iPad, interruption/recovery, and accessibility remain incomplete.
- Before the relay-safe email behavior is release-ready, register every outbound account/vendor-contact sender with Apple Private Email Relay, verify SPF/DKIM and bounce handling, and prove required delivery with Hide My Email on physical TestFlight without demanding a personal address. The four relevant functions are deployed and recorded in `SUPABASE_DEPLOYMENT_PROVENANCE.md`.
- The updated Apple Developer Program agreement is accepted. Push Notifications and Sign in with Apple are enabled on the explicit App ID; build 2's profile and signed IPA had the expected application identifier, production APNs, Sign in with Apple, and distribution certificate. No new signing setup is expected, but the next release gates are a replacement signed build containing the `2026-09-01-vendor-marketing` delta and then the complete physical TestFlight matrix.
- Reviewer credentials must be entered from the password manager and verified immediately before submission. The special pair grant is expiry-gated and must be extended/replaced so documented access cannot lapse during review.
- The live privacy page is generic/website-oriented, and the current signed-out deletion URL redirects to login. A completed publication policy and public mobile privacy-request URL are required.
- A Tracking = No answer requires Meta Pixel and every other tracker to be fully removed from all in-app reachable pages/subresources plus exact-TestFlight network proof. Otherwise the release needs accurate tracking disclosures plus any required consent/ATT before transmission.
- Owner/legal must supply controller/developer identity, contact/address, launch territories, minimum age, provider facts, retention criteria, international processing, and privacy rights details. The final build must verify the boundary between free account/app features and paid VIP or door admission, including any reachable ticket/payment-provider data flow.
- A QR scan must remain a booth-visit/progress record only and must never enter a draw automatically. An enabled vendor draw is a separate optional rules-and-eligibility opt-in. General admission is free when obtained in advance while the free allocation remains; VIP admission is paid; and anyone without an advance general-admission ticket must purchase admission at the door. No purchase, ticket, admission, VIP status, attendance, booth visit, or scan is required through the equal alternate method; none creates another entry or improves odds. Each eligible couple may receive only one valid entry per named vendor draw regardless of method, and alternate entry is draw-only and never advances QR Bingo. For an entry made or explicitly re-consented under `2026-09-01-vendor-marketing`, the entrant agrees that Wedding Win may give the specific named vendor the entrant's name, email address, phone number if provided, wedding date if provided, and entry/consent evidence for draw administration and that vendor's wedding-related offers or promotions. The authenticated export is exact-vendor/event scoped, marks that named-vendor marketing consent as included, prevents cross-vendor access, and excludes legacy entries until fresh current-version consent. A percentage-off prize must state the qualifying service or package, discount rate, maximum dollar savings, expiry, booking requirements, exclusions, and approximate maximum CAD value. The named vendor is the vendor-promotion sponsor, contest operator, and prize provider solely responsible for lawful terms, eligibility and winner-release decisions, the skill-testing question, prize restrictions, taxes, claims, disputes, and fulfilment. Wedding Win Inc. is the app developer, limited platform sponsor of the in-app workflow, and technical administrator; it is not the named vendor-promotion sponsor/operator/prize provider, does not supply or fulfil that vendor prize, and remains responsible for its own technology, privacy, security, administrative conduct, and non-waivable duties. Apple is not involved. Owner/legal must confirm this narrow platform-sponsor role reflects actual operations and satisfies Apple Guideline 5.3.1.
- The `2026-09-01-vendor-marketing` role disclosure, current acceptance, named-vendor contact export with included marketing-consent marker and legacy fresh-consent boundary, and vendor-verification UI are current-source requirements. The earlier validated TestFlight build and 2026-08-29 evidence do not prove this delta; commit/deploy/build and repeat the app, website, backend, production winner-notice, fictional App Review suppression, and physical TestFlight checks before submission.
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
