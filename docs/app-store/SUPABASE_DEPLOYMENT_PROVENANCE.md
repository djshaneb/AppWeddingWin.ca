# Supabase deployment provenance

Status: **LIVE REVIEW-BACKEND INVENTORY — record immutable source checksums in the private release ticket before submission.**

Observed: 2026-08-28 through the connected Supabase project's live migration and Edge Function inventory. This file records versions and migration identifiers, not credentials or secret values. A Supabase deployment version is not a substitute for an immutable Git commit/checksum, a processed TestFlight build, or end-to-end physical-device evidence.

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

## Active Edge Function versions

| Function | Version | Function | Version |
| --- | ---: | --- | ---: |
| `app-debug-log` | 4 | `apple-native-login` | 14 |
| `apple-oauth-callback` | 12 | `apple-oauth-start` | 10 |
| `apple-web-login` | 8 | `bd-api-probe` | 3 |
| `bd-app-login-exchange` | 2 | `bd-chat-report` | 3 |
| `bd-chat-status` | 26 | `bd-chat-sync` | 38 |
| `bd-complete-profile` | 17 | `bd-confirm-profile-email` | 10 |
| `bd-couple-signup` | 11 | `bd-dashboard` | 2 |
| `bd-delete-account` | 7 | `bd-email-login` | 34 |
| `bd-push-sweep` | 8 | `bd-qr-bingo-sync` | 13 |
| `bd-qr-bingo-vendor-sync` | 14 | `bd-register-push-token` | 3 |
| `bd-vendor-signup` | 8 | `google-native-exchange` | 2 |
| `google-oauth-callback` | 14 | `google-oauth-start` | 9 |

## Verified backend controls

- The deployed/tagged snapshot's complete shared Deno regression suite passed **60/60**. The current untagged working tree passes **71/71** after adding Apple private-relay, transactional chat-email, and current/legacy chat-membership regressions, but the corresponding `bd-complete-profile`, `bd-couple-signup`, `bd-vendor-signup`, and `bd-chat-sync` source changes are not deployed. Do not attribute the new relay-safe, app-originated chat-email, or recipient-plan compatibility behavior to the live function versions listed above until deployment provenance and physical TestFlight evidence are recorded.
- Browser-bound OAuth attempts are live. Controlled tests exercised host-only binding cookies, provider matching, missing/mismatched browser binding, atomic redemption, expiry, and replay rejection. This is backend security evidence, not proof of a real Apple or Google identity-provider login on the submitted app.
- One-time native/website login exchanges, exchange cleanup, Google PKCE binding, email-consistency checks, and the corrected first-attempt login throttle are deployed.
- Durable push retry is live in `bd-push-sweep` v8 with migration `20260828214927`: retryable Expo/network outcomes persist bounded backoff and `Retry-After`, accepted tickets are reconciled, and missing receipts expire. APNs signing and foreground/background/terminated delivery still require a physical TestFlight build.
- The account-deletion preservation/redaction flow is live through `bd-delete-account` v7 and the deletion migrations above. The disposable two-participant email-account test passed, but physical Apple revocation, provider/backup behavior, and owner/legal retention approval remain open.
- Private App Review chat access is live through migrations `20260828221025` and `20260828221307`, `bd-chat-sync` v38, and `bd-chat-status` v26. The allowlist is service-role-only, expiry-gated, and restricted to the exact prepared vendor/couple reviewer pair so the vendor's Brilliant Directories listing can remain nonpublic. A controlled round trip now passes: app→website text was visible in the authenticated Chrome thread; the supported website→app direction—active couple website to private/nonpublic vendor app—persisted after website reload, appeared in the database/API mirror, and rendered as an incoming native Simulator bubble. Brilliant Directories correctly blocked an attempted send from the inactive vendor's website account; that rejected attempt was not counted as delivered.
- Controlled QR replay idempotency is live in `bd-qr-bingo-sync` v13 with JWT verification enabled. The prepared fixture insert ignores conflicts and does not supply a replacement `scanned_at`; a controlled live replay returned 200 with `fixture: true`, kept the card/database count at 1→1, and preserved the original scan timestamp. The dedicated regression is included in the full suite, and the QR/policy-focused subset passes **8/8**. Printed-camera behavior remains a physical-device gate.

## Remaining release and security gaps

- This tested source is recorded by local release-candidate tag `v1.0.0-rc.2`. Nothing has been pushed, associated with a signed archive, or represented in TestFlight. Record the source/deployment checksums privately before push and submission.
- Current source links `@blair.shane/weddingwin-app` through `extra.eas.projectId` and includes required-reason privacy-manifest declarations. No processed EAS/TestFlight build or App Store distribution archive is recorded; App Store Connect app linkage, merged signed-archive manifest validation, Apple signing, APNs credentials, and physical iPhone/iPad evidence remain pending.
- Real Apple/Google login, printed-camera QR, push delivery/token lifecycle, network interruption, and Apple-linked deletion remain physical-device gates.
- The controlled reviewer-pair text round trip is recorded locally/live, including website reload persistence and native incoming visibility. Repeat it on the exact processed TestFlight build, keep the expiring pair authorization active for the review window, and document that inactive-vendor website sending is intentionally unavailable rather than presenting that rejected direction as a failure.
- App Privacy answers, the public policy, deletion retention, raffle sponsor/rules/vendor terms, production WebView tracking inventory, and other owner/legal decisions remain blockers.
- `APP_EMAIL_CHANGE_SECRET` rotation is incomplete: the live Supabase environment does not yet have the replacement secret, while Brilliant Directories widget `329` still contains the prior hardcoded email-confirmation secret. Rotate both sides together only during an explicitly approved sensitive-value update; never copy the value into this repository or release evidence.
