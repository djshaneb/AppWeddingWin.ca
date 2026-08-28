# WeddingWin release test matrix

Status: **OPEN — this matrix is the submission gate, not a record of a completed App Store release.**

Prepared: 2026-08-28
Target: WeddingWin `1.0.0`, bundle ID `ca.weddingwin.app`

Use this matrix against one immutable release commit/tag, one deployed backend revision, and the processed TestFlight build created from them. For every passing row, record the tester, UTC date, device/OS, build number, backend revision, and evidence path or App Store/EAS build URL in the release ticket. Never put passwords, tokens, Apple keys, service-role keys, certificates, or provisioning profiles in this file.

## Status meanings

| Status | Meaning |
| --- | --- |
| Configured | Present in source, but still requires release-build verification. |
| Working-tree pass | Passed against the current uncommitted local Release source/backend; repeat from the immutable release tag and TestFlight where required. |
| Working-tree partial | The stated subset passed locally; the remaining scope in the evidence column is still required. |
| Prior snapshot only | Observed on an earlier Simulator preparation build; not proof for the final tagged source. |
| Pending | Required test has not been recorded against the final release. |
| Blocked | Cannot run safely or truthfully until the named prerequisite is resolved. |
| Pass | Evidence has been recorded against the exact tagged/TestFlight release. |
| Fail | Defect found; fix, rebuild/redeploy, and repeat before submission. |

## Release evidence record

Final distribution and owner-approval fields remain pending until evidence is recorded in the private release ticket. Working-tree Simulator evidence is summarized below without credentials or private user data.

| Evidence | Current value |
| --- | --- |
| Release commit and tag | `<PENDING>` |
| Deployed Supabase/Brilliant Directories revision or checksums | `<LIVE MIGRATIONS/FUNCTIONS/WIDGETS/RULES DEPLOYED; IMMUTABLE RELEASE REVISION/CHECKSUMS PENDING>` |
| EAS build ID/URL and App Store Connect build number | `<PENDING>` |
| Processed TestFlight build install | `<PENDING>` |
| Physical iPhone tester/date/device/iOS | `<PENDING>` |
| Physical iPad tester/date/device/iPadOS | `<PENDING>` |
| Working-tree Simulator evidence | `iPhone 17 Pro deletion success; iPad Pro 13-inch (M5) reviewer login/menu; exact UTC/build provenance pending release ticket` |
| Disposable deletion test record | `Working-tree email member 38975 passed; physical Apple-linked account and exact uploaded-build repeat pending` |
| Working screenshot inventory | `2 clean primary Pro Max 1320×2868 + 9 iPhone 6.3-inch QA 1206×2622 + 1 clean iPad 2064×2752 under assets/app-store/screenshots` |
| Final policy version/effective date and public URLs | `<PENDING>` |
| Owner/legal approvals | `<PENDING>` |

## A. Configuration, signing, and backend gates

| ID | Gate / test | Environment | Current status | Required pass evidence |
| --- | --- | --- | --- | --- |
| CFG-01 | App identity and metadata | Source inspection | Configured | `app.json` shows name/slug, version `1.0.0`, iOS build number `1`, bundle ID `ca.weddingwin.app`, icon, portrait, iPad support, Sign in with Apple, camera/photo purpose strings, and `ITSAppUsesNonExemptEncryption: false`; owner/legal approves encryption answer. |
| CFG-02 | EAS release configuration | Source + Expo owner account | Blocked | Existing `eas.json` is linked to the organization-owned Expo project; `extra.eas.projectId` and `submit.production.ios.ascAppId` are set; the actual auto-incremented build number is recorded. |
| CFG-03 | Production Google OAuth | Server provider config + TestFlight | Blocked | The custom system-browser start/callback flow has approved server-held provider credentials and redirect allowlist; couple/vendor first/returning login and cancellation/error paths pass on a physical iPhone with no dev/tunnel redirect. The blank unused `extra.googleOAuth.iosClientId` is removed or documented; populating it is not the test. |
| CFG-04 | Apple distribution signing | Apple Developer + EAS/Xcode | Blocked | Owner authentication/2FA complete; explicit App ID has required capabilities; Apple Distribution certificate and App Store profile are valid; archive validation passes. No Apple credentials were available in this preparation environment. |
| CFG-05 | Production push signing/configuration | Apple Developer + EAS + Supabase | Blocked | App ID Push capability, distribution `aps-environment`, correct-team APNs key, Expo project linkage, production backend environment, and authorized token registration all verified. |
| CFG-06 | Exact backend deployment | Supabase + Brilliant Directories | Configured | Release migrations, Edge Functions, widgets, and official-rules page are live on the current review backend. Before Pass, record deployed revision/checksums, repeat schema/function/widget smoke tests against the immutable tag, and record rollback/recovery ownership. |
| CFG-07 | Dependency reproducibility | Clean release checkout | Pending | `npm ci`, `npx expo install --check`, `npx expo-doctor`, `npm audit --omit=dev`, typecheck/lint/tests, and release bundle complete; output matches `DEPENDENCY_AUDIT.md` or that document is updated. Working-tree doctor evidence is 18/18 and audit is 21 total (0 critical, 8 high, 13 moderate), but it must be repeated on the tag. No forced audit downgrade. |
| CFG-08 | Secrets and reviewer credentials | Git + release systems | Configured | `private-reviewer-credentials.md`, `.env*`, Apple/Expo/Supabase secrets, keys, certificates, and profiles are absent from tracked files and built JS; secret scan passes. |
| CFG-09 | Privacy/network inventory | Final TestFlight + production WebViews | Pending | Actual website scripts, cookies, analytics, ads, payment, captcha, CDN, email, logs, retention, and recipients match `APP_PRIVACY_ANSWERS.md` and the published policy. |
| CFG-10 | No-marketing raffle posture | Deployed app/backend + contracts | Blocked | Entry notice, official rules, vendor agreement, absence of entrant-list exports, selected-potential-winner disclosure, suppressed email, campaigns, and staff procedure limit data to named-draw administration and prize fulfilment. Entry does not subscribe entrants to marketing. |
| CFG-11 | WebView navigation/cookie hardening | Exact tagged TestFlight build + network log | Pending | Approved WeddingWin hosts work in-app; arbitrary/off-domain URLs and redirect/pop-up chains cannot remain browsable in-app; intended external links use the system browser or are blocked; third-party cookies are disabled unless a documented exception is approved; login/logout/session clearing still work. Source hardening alone is not pass evidence. |

## B. Reviewer accounts, QR, and controlled data

| ID | Gate / test | Environment | Current status | Required pass evidence |
| --- | --- | --- | --- | --- |
| FIX-01 | Private couple reviewer account `38971` | Clean TestFlight install + signed-out web | Configured / working-tree iPad login pass | Controlled couple account, displayed as `App Review`, is assigned to isolated event `app-review-weddingwin-2026-38970`; Release login/menu passed on a 13-inch iPad Pro (M5) Simulator. Before final Pass, verify normal-plan authentication, fictional data, non-expiring login, signed-out public privacy, native session creation, and reset inbox/QR state in the exact uploaded build. |
| FIX-02 | Private vendor reviewer account `38970` | Clean TestFlight install + signed-out web | Configured | Private/nonpublic vendor is assigned to the isolated review event and its login has been prepared. Before Pass, verify dashboard, native text chat, and draw settings while signed-out directory/profile/search/sitemap/public-event/marketing surfaces remain absent. |
| FIX-03 | Reviewer credentials handling | Password manager + App Store Connect | Pending | Passwords work immediately before submission, are pasted only into App Store Connect credential fields, and are not in Git, notes attachments, screenshots, email, or logs. |
| FIX-04 | Normal text-chat fixture | App + website | Pending | Controlled couple/vendor accounts have one open text conversation visible in both clients; only fictional content is present. Native image sending is intentionally disabled for this release. |
| FIX-05 | Disposable report/block fixture | App + website | Pending | Separate conversation can be reported without destroying the normal reviewer example; current website conversation closes and the app suppresses the blocked member; the known external-website fresh-thread limitation is documented; reset procedure and monitored safety contact are ready. |
| FIX-06 | Disposable deletion accounts | App + backend stores | Working-tree partial | Fresh disposable email member `38975` was created, deleted successfully, and verified absent from Brilliant Directories/login and all inspected Supabase stores. Abandoned fixture `38974` was purged. A physical Apple-linked disposable account, secure reset/replacement procedure, and exact uploaded-build repeat remain pending. |
| FIX-07 | Vendor `38970` sample QR | Isolated event + printed image + physical iPhone | Configured | `assets/app-store/sample-qr-review-vendor-38970.png` targets isolated event `app-review-weddingwin-2026-38970`. Before Pass, reset couple `38971`, verify printed scan, progress, duplicate handling, and absence of production-state changes. |
| FIX-08 | Review fixture isolation | Backend + signed-out web | Pending | Vendor `38970`, couple `38971`, scans, entries, selections, and prize state remain isolated; vendor remains nonpublic; no production entrant or event state is read or changed; review reset is repeatable. |
| FIX-09 | Isolated review draw | App + website + backend | Configured / legal approval pending | Test event/prize/rules and email suppression are deployed. Before Pass, verify eligibility, current-rules consent, alternate free-entry instructions, draw timing/selection limit, potential-winner verification, reset, and no-marketing controls with fictional records only. Production and reviewer-fixture email must remain suppressed. |

## C. Automated and Simulator regression

| ID | Flow | Environment | Current status | Required pass evidence |
| --- | --- | --- | --- | --- |
| SIM-01 | Clean iOS Release build and launch | iPhone/iPad Simulator | Working-tree pass | Current Release source built/launched for the iPhone 17 Pro deletion run and 13-inch iPad Pro (M5) reviewer-menu run. Rebuild the exact tag and record OS, build command, icon/cold launch, log review, and absence of dev/tunnel content before final Pass. |
| SIM-02 | Role selection and email auth | iPhone Simulator | Prior snapshot only | Couple/vendor success, wrong password, error/cancel, sign-out, relaunch, and session clearing pass against final backend. |
| SIM-03 | Couple and vendor navigation | iPhone Simulator | Prior snapshot only | Every tab/card, embedded page, back path, external link, loading/empty/error state, and accessibility label is inspected. Vendor portion depends on FIX-02. |
| SIM-04 | Chat app→website and website→app | Simulator + production-equivalent website | Prior snapshot only | Text sync in both directions; sender, ordering, read state, unread badge, reload, duplicate prevention, and logs pass. Native image sending is disabled and must not be presented as available. |
| SIM-05 | Report/member block | Simulator + website | Pending / known limitation | Verify durable report, current-thread closure, app suppression, unrelated-user isolation, and service-role reset. An external Brilliant Directories entry point can still create a fresh thread until synchronization discovers/closes it; Pass requires documenting this narrower behavior, or implementing and verifying a website-side creation block before claiming preventive member blocking. |
| SIM-06 | QR URL emulation | iPhone Simulator | Prior snapshot only | Valid `https://www.weddingwin.ca/qr?vendor_id=...`, duplicate, malformed, wrong-host, inactive/not-rostered, and unauthorized values produce correct UI and logs. This does not replace printed-camera testing. |
| SIM-07 | Raffle eligibility/consent/time logic | iPhone Simulator + backend clock fixtures | Pending | Open/closed/not-started deadlines, timezone boundaries, duplicate entry, missing contact fields, rules version, consent text, vendor isolation, selection maximum, signature/replay, selected-potential-winner disclosure, and no-marketing behavior pass. Use fictional isolated data only. |
| SIM-08 | Native email-account deletion | iPhone 17 Pro Simulator + live review backend | Working-tree pass | Fresh member `38975` passed confirmation UI, success alert, logout to role chooser, Brilliant Directories absence, rejected subsequent login, and zero inspected identity-cache/push/Edge-profile/chat/raffle rows. The first run exposed and led to fixes for stale legacy JWT handling and child-metadata deletion order; deployed `bd-delete-account` v3 has JWT verification enabled. Repeat from the immutable tag and separately verify cancel/error/fallback, physical Apple revocation, provider/backups, and the approved shared-conversation behavior. |
| SIM-09 | iPad layout smoke test | 13-inch iPad Pro (M5) Simulator | Working-tree partial | Release reviewer-couple login and portrait native menu passed; `ipad-01-couple-menu.png` is `2064×2752`. WebViews, keyboard/composer, modals, scanner, Dynamic Type, rotation/window behavior, VoiceOver, and full navigation remain pending. |
| SIM-10 | Logs and recovery | iPhone/iPad Simulator | Pending | Review app/Metro/Xcode/Simulator and backend logs for crashes, unhandled rejection, auth/entitlement/privacy errors, PII/token leakage, retry storms, API failure, offline/slow network, and recovery. |
| SIM-11 | Accessibility | iPhone/iPad Simulator + physical confirmation | Pending | Verify VoiceOver labels/hints, focus order, modal focus trapping/restoration, scanner and report/delete announcements, keyboard-only/switch paths where applicable, touch targets, contrast, Reduce Motion, and default/large accessibility Dynamic Type without clipping. Repeat critical flows on the exact uploaded build. |

## D. Physical iPhone and iPad TestFlight matrix

Do not replace these rows with Simulator or locally installed development-build results.

| ID | Flow | Required hardware/state | Current status | Required pass evidence |
| --- | --- | --- | --- | --- |
| DEV-01 | Fresh install, upgrade, reinstall | Supported iPhone / processed TestFlight build | Blocked | All three lifecycle paths preserve or clear state as designed; exact TestFlight build number recorded. |
| DEV-02 | Sign in with Apple | Physical iPhone, real Apple ID | Blocked | First login, Hide My Email, returning login, cancel/error, sign-out, relink, and account-deletion revocation pass. |
| DEV-03 | Google login | Physical iPhone, production OAuth | Blocked | First/returning login, cancel/error, redirect back to app, sign-out, and relink pass without dev credentials. |
| DEV-04 | Printed QR camera scan | Physical iPhone + printed `38970` review sample | Blocked | Permission allow/deny/re-enable, normal/low light, focus/distance, one-scan behavior, duplicate/invalid code, isolated-event progress, and privacy logs pass. |
| DEV-05 | Chat push: foreground | Physical iPhone + controlled sender | Blocked | One generic notification/no private message text, correct unread/badge behavior, tap route, and no duplicate. |
| DEV-06 | Chat push: background | Physical iPhone + controlled sender | Blocked | Same checks with app backgrounded. |
| DEV-07 | Chat push: terminated | Physical iPhone + controlled sender | Blocked | Same checks after force-quit/termination; cold tap route and session behavior pass. |
| DEV-08 | Notification token lifecycle | Physical iPhone + backend inspection | Blocked | Deny/allow, reinstall/token rotation, multiple devices if supported, sign-out unregister, account-deletion purge, invalid-token cleanup, and authorization controls pass. |
| DEV-09 | Disabled photo attachment | Physical iPhone | Pending | No native image-send control or media permission prompt is exposed in the release build; existing/historical message media does not bypass the disabled gate. If image sending is re-enabled later, add a full photo-library permission/upload/deletion matrix before release. |
| DEV-10 | End-to-end account deletion | Physical iPhone + all production-like stores | Blocked | The working-tree Simulator/live-backend email path passed, but this row still requires physical disposable email and Apple accounts, Apple revocation, documented provider/backups and retained legal/safety records, and proof that deleted login cannot return on the uploaded build. Explicitly inspect the counterpart's shared conversation before/after deletion and obtain owner/legal/product approval for deleting that counterpart copy. |
| DEV-11 | Network and interruption recovery | Physical iPhone | Blocked | Airplane mode, slow/lost network, app background during request, duplicate tap, API timeout/rate limit, and recovery do not duplicate messages/entries/draw/deletion or expose secrets. |
| DEV-12 | iPad final pass | Physical supported iPad / TestFlight | Blocked | Full critical flow, permissions, keyboard/modals/WebViews, portrait layout, rotation/window behavior, memory/crash logs, and screenshot dimensions pass. |

## E. Distribution, screenshots, and submission

| ID | Gate / test | Environment | Current status | Required pass evidence |
| --- | --- | --- | --- | --- |
| DIST-01 | Store archive/build | EAS production or local Xcode archive | Blocked | Signed App Store IPA/archive succeeds; bundle/version/build/entitlements/icon/privacy manifests are inspected; no debug/test secret. |
| DIST-02 | Upload and processing | App Store Connect | Blocked | Upload succeeds, no unresolved validation warning/error, export answer matches binary, and processed build is selectable. |
| DIST-03 | Internal TestFlight acceptance | Physical iPhone/iPad | Blocked | All applicable DEV rows pass on the processed build, not an ad-hoc or Simulator build. |
| DIST-04 | Final screenshots | Exact release source + App Store Connect | Pending / two primary iPhone shots ready | Two visually verified credential-free iPhone 17 Pro Max RGB PNGs at `1320×2868` are designated as the primary 6.9-inch marketing shots. Nine accepted-size 6.3-inch files remain QA evidence, and one clean `2064×2752` iPad candidate exists. Final iPad/set selection, exact-release consistency review, upload, and App Store Connect preview inspection remain before Pass. |
| DIST-05 | App Privacy and public policy | App Store Connect + public website | Blocked | Published answers, policy, privacy choices, retention/deletion, no-marketing raffle posture, WebView inventory, and final binary privacy report agree. |
| DIST-06 | Reviewer notes/accounts/QR | App Store Connect + attachments | Blocked | Notes describe only verified behavior; private accounts `38971`/`38970` pass their documented flows; isolated `38970` sample QR is current; email suppression and reset are verified; support/reset contact is monitored. |
| DIST-07 | Commit, tag, and provenance | Git + release ticket | Pending | Clean reviewed release commit and signed/annotated release tag are recorded with backend revision, EAS/ASC build ID, build number, dependency output, and test evidence. |
| DIST-08 | Owner/legal approvals | Release ticket | Blocked | Privacy, retention, contest sponsor/rules/territory/age/skill question, vendor agreement, no-marketing posture, payments/IAP, content rights, and export classification are approved. |

## Final release decision

Submission is **NO-GO** while any required row is `Blocked`, `Pending`, `Fail`, `Prior snapshot only`, `Working-tree partial`, or only a `Working-tree pass`. A Simulator build passing is necessary local evidence but never satisfies signing, TestFlight, production push, real federated login, printed-camera, physical iPad, or the remaining physical/Apple/provider deletion rows.
