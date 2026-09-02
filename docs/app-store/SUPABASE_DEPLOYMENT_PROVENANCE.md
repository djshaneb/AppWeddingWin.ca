# Supabase deployment provenance

Status: **LIVE REVIEW-BACKEND INVENTORY — record immutable source checksums in the private release ticket before submission.**

Observed: 2026-08-28 through 2026-08-29 through the connected Supabase project's live migration and Edge Function inventory. This file records versions and migration identifiers, not credentials or secret values. A Supabase deployment version is not a substitute for the recorded Git/build provenance or end-to-end physical-device evidence.

## Current release-hardening migrations

The following migration identifiers and names are live and match the filenames now present under `supabase/migrations/`:

| Version | Migration |
| --- | --- |
| `20260828031649` | `stabilize_qr_bingo_vendor_ids_and_draw_signing` |
| `20260828162556` | `add_app_chat_member_blocks` |
| `20260828162602` | `add_qr_bingo_official_rules_audit` |
| `20260828162608` | `add_account_data_purge` |
| `20260828162613` | `secure_push_sweep_cron` |
| `20260828163031` | `revoke_chat_report_trigger_rpc_execute` |
| `20260828163103` | `optimize_profiles_rls_auth_checks` |
| `20260828163834` | `fix_qr_bingo_rules_trigger_table_dispatch` |
| `20260828190233` | `add_one_time_auth_exchanges` |
| `20260828190234` | `track_expo_push_delivery` |
| `20260828190241` | `preserve_shared_data_on_account_deletion` |
| `20260828200918` | `harden_app_auth_exchange_retention` |
| `20260828201325` | `fix_app_login_rate_limit_first_attempt` |
| `20260828211753` | `harden_deleted_chat_identity_retention` |
| `20260828211801` | `harden_push_sweep_leasing_retry` |
| `20260828213136` | `stage_deleted_profile_identity_before_auth_purge` |
| `20260828214927` | `harden_expo_push_retry_backoff` |
| `20260828214932` | `bind_web_oauth_attempts` |
| `20260828221025` | `enable_private_app_reviewers` |
| `20260828221307` | `scope_private_app_reviewer_pairs` |
| `20260829123500` | `disable_platform_promotion_workflows` |
| `20260829164200` | `restore_vendor_draw_workflows` |

## Active Edge Function versions

| Function | Version | Function | Version |
| --- | ---: | --- | ---: |
| `app-debug-log` | 4 | `apple-native-login` | 14 |
| `apple-oauth-callback` | 12 | `apple-oauth-start` | 10 |
| `apple-web-login` | 8 | `bd-api-probe` | 3 |
| `bd-app-login-exchange` | 2 | `bd-chat-report` | 3 |
| `bd-chat-status` | 26 | `bd-chat-sync` | 39 |
| `bd-complete-profile` | 18 | `bd-confirm-profile-email` | 10 |
| `bd-couple-signup` | 12 | `bd-dashboard` | 2 |
| `bd-delete-account` | 7 | `bd-email-login` | 34 |
| `bd-push-sweep` | 8 | `bd-qr-bingo-sync` | 18 |
| `bd-qr-bingo-vendor-sync` | 19 | `bd-register-push-token` | 3 |
| `bd-vendor-signup` | 9 | `google-native-exchange` | 2 |
| `google-oauth-callback` | 14 | `google-oauth-start` | 9 |

## Verified backend controls

- The release-hardening source passes **80/80** shared Deno regressions, including Apple private-relay, transactional chat-email, chat-membership precedence, QR replay idempotency, and the vendor-draw restoration migration. `bd-complete-profile` v18, `bd-couple-signup` v12, `bd-vendor-signup` v9, and `bd-chat-sync` v39 were deployed together on 2026-08-29 with JWT verification retained. All four unauthenticated endpoint probes returned `401` after deployment.
- Browser-bound OAuth attempts are live. Controlled tests exercised host-only binding cookies, provider matching, missing/mismatched browser binding, atomic redemption, expiry, and replay rejection. This is backend security evidence, not proof of a real Apple or Google identity-provider login on the submitted app.
- One-time native/website login exchanges, exchange cleanup, Google PKCE binding, email-consistency checks, and the corrected first-attempt login throttle are deployed.
- Durable push retry is live in `bd-push-sweep` v8 with migration `20260828214927`: retryable Expo/network outcomes persist bounded backoff and `Retry-After`, accepted tickets are reconciled, and missing receipts expire. APNs signing and foreground/background/terminated delivery still require a physical TestFlight build.
- The account-deletion preservation/redaction flow is live through `bd-delete-account` v7 and the deletion migrations above. The disposable two-participant email-account test passed, but physical Apple revocation, provider/backup behavior, and owner/legal retention approval remain open.
- Private App Review chat access is live through migrations `20260828221025` and `20260828221307`, `bd-chat-sync` v39, and `bd-chat-status` v26. The allowlist is service-role-only, expiry-gated, and restricted to the exact prepared vendor/couple reviewer pair so the vendor's Brilliant Directories listing can remain nonpublic. A fresh post-deployment controlled round trip passed: the exact app message reached `Delivered` and appeared in the authenticated website thread; the exact website reply appeared after native refresh in the Release Simulator. The website briefly rendered its generic missing-page placeholder after sending, but the message persisted and reloading the same conversation restored the normal thread. Brilliant Directories correctly blocked the earlier attempted send from the inactive vendor's website account; that rejected attempt was not counted as delivered.
- Historical 2026-08-29 evidence: vendor-specific QR draws were restored live through migration `20260829164200`, `bd-qr-bingo-sync` v18, and `bd-qr-bingo-vendor-sync` v19, all with JWT verification enabled. A booth scan records visit progress only; the couple separately reviews the offer and rules and confirms eligibility before entry. A repeat scan or a tap on the visited-booth card reopens the optional offer without duplicating the visit. The controlled live fixture finished with exactly one scan, one vendor-draw entry, and one potential-winner selection; replay did not duplicate state, contact sharing remained selected-potential-winner-only, and outbound review-fixture email remained suppressed. Printed-camera behavior remains a physical-device gate.

## Current-source delta requiring deployment provenance

The working tree dated `2026-09-01` defines the named vendor as vendor-promotion sponsor, contest operator, and prize provider and Wedding Win Inc. as app developer, limited platform sponsor of the in-app workflow, and technical administrator—not the named vendor-promotion sponsor/operator/prize provider. Its current source contract is Official Rules version `2026-09-01-vendor-marketing`: a scan remains a booth visit only, while an explicit named-vendor draw entry includes contact sharing and consent for that named vendor's wedding-related offers or promotions. The authenticated participation report is restricted to the exact vendor and event, includes the entrant's provided name, email, phone and wedding date plus entry/consent evidence, and marks the named-vendor marketing consent included. Another vendor's entrants and legacy entries without fresh current-version consent remain excluded. The report-generation audit remains metadata-only and does not store CSV contents or entrant identifiers. Migrations `20260830050000` (`create_qr_bingo_participation_report_audit`), `20260830140000` (`enable_named_vendor_contact_exports`), and `20260901070000` (`enable_named_vendor_marketing_consent`), plus corresponding QR Edge Function revisions, are present in source. They are **not added to the live inventory above** until a fresh connected-project read proves the exact migrations and function versions are deployed. The earlier v18/v19, 2026-08-29 test, build, commit, and tag evidence predates this new delta and must not be represented as proof of it.

## Remaining release and security gaps

- Historical production-build source commit `f7f4c90`, build `1.0.0 (2)`, and tag `v1.0.0-rc.3` remain recorded without moving the older `v1.0.0-rc.2` tag. They do not include the `2026-09-01-vendor-marketing` delta and cannot serve as its release provenance.
- Current source retains the Expo/App Store project linkage and required-reason privacy-manifest declarations, and EAS retains the required signing/submission/APNs credentials. Build 2 passed its signature/profile/entitlements/icon/privacy-manifest checks and Apple processed it as `Validated`/`Ready to Submit`, but a replacement signed build from the final `2026-09-01-vendor-marketing` source plus physical iPhone/iPad evidence are pending.
- Real Apple/Google login, printed-camera QR, push delivery/token lifecycle, network interruption, and Apple-linked deletion remain physical-device gates.
- The controlled reviewer-pair text round trip is recorded locally/live, including website reload persistence and native incoming visibility. Repeat it on the exact processed TestFlight build, keep the expiring pair authorization active for the review window, and document that inactive-vendor website sending is intentionally unavailable rather than presenting that rejected direction as a failure.
- Deploy and inventory the `2026-09-01-vendor-marketing` role/rules/vendor-verification/named-vendor contact-sharing-and-marketing delta, then repeat the app, website, backend, printed-QR, exact-vendor/event export, cross-vendor denial, legacy fresh-consent and included-marketing-marker checks on the exact processed TestFlight build before final submission. Prove production verified-winner notices use the configured vendor/couple channels without fixture suppression, while the isolated fictional App Review fixture still suppresses outbound email. The prior live backend, public rules/free-entry pages, Chrome flow, and local Release Simulator pass remains historical evidence only; it does not prove the new delta.
- App Privacy answers, the public policy, deletion retention, the free-app/paid-admission and ticket/payment-data boundary, canonical admission/no-advantage language, the one-valid-entry-per-eligible-couple limit, QR scan/optional-entry/draw-only-AMOE boundary, the narrow Wedding Win platform-sponsor/named-vendor responsibility allocation and Apple Guideline 5.3.1 approval, exact named-vendor draw-administration and wedding-related-marketing contact-sharing boundary, vendor verification/prize responsibility, production WebView tracking inventory, and other owner/legal decisions remain blockers.
- The coordinated `APP_EMAIL_CHANGE_SECRET` rotation remains incomplete. Keep the exact live location/state and both values in the private security ticket, rotate Supabase and the website atomically during an explicitly approved sensitive-value update, and never copy a secret value into this repository or release evidence.
