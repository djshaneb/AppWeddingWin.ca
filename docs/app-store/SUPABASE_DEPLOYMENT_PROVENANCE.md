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
| `bd-push-sweep` | 8 | `bd-qr-bingo-sync` | 13 |
| `bd-qr-bingo-vendor-sync` | 14 | `bd-register-push-token` | 3 |
| `bd-vendor-signup` | 9 | `google-native-exchange` | 2 |
| `google-oauth-callback` | 14 | `google-oauth-start` | 9 |

## Verified backend controls

- The release-hardening source passes **71/71** shared Deno regressions, including Apple private-relay, transactional chat-email, and current/direct/legacy chat-membership precedence. `bd-complete-profile` v18, `bd-couple-signup` v12, `bd-vendor-signup` v9, and `bd-chat-sync` v39 were deployed together on 2026-08-29 with JWT verification retained. All four unauthenticated endpoint probes returned `401` after deployment.
- Browser-bound OAuth attempts are live. Controlled tests exercised host-only binding cookies, provider matching, missing/mismatched browser binding, atomic redemption, expiry, and replay rejection. This is backend security evidence, not proof of a real Apple or Google identity-provider login on the submitted app.
- One-time native/website login exchanges, exchange cleanup, Google PKCE binding, email-consistency checks, and the corrected first-attempt login throttle are deployed.
- Durable push retry is live in `bd-push-sweep` v8 with migration `20260828214927`: retryable Expo/network outcomes persist bounded backoff and `Retry-After`, accepted tickets are reconciled, and missing receipts expire. APNs signing and foreground/background/terminated delivery still require a physical TestFlight build.
- The account-deletion preservation/redaction flow is live through `bd-delete-account` v7 and the deletion migrations above. The disposable two-participant email-account test passed, but physical Apple revocation, provider/backup behavior, and owner/legal retention approval remain open.
- Private App Review chat access is live through migrations `20260828221025` and `20260828221307`, `bd-chat-sync` v39, and `bd-chat-status` v26. The allowlist is service-role-only, expiry-gated, and restricted to the exact prepared vendor/couple reviewer pair so the vendor's Brilliant Directories listing can remain nonpublic. A fresh post-deployment controlled round trip passed: the exact app message reached `Delivered` and appeared in the authenticated website thread; the exact website reply appeared after native refresh in the Release Simulator. The website briefly rendered its generic missing-page placeholder after sending, but the message persisted and reloading the same conversation restored the normal thread. Brilliant Directories correctly blocked the earlier attempted send from the inactive vendor's website account; that rejected attempt was not counted as delivered.
- Controlled QR replay idempotency is live in `bd-qr-bingo-sync` v13 with JWT verification enabled. The prepared fixture insert ignores conflicts and does not supply a replacement `scanned_at`; a controlled live replay returned 200 with `fixture: true`, kept the card/database count at 1→1, and preserved the original scan timestamp. The dedicated regression is included in the full suite, and the QR/policy-focused subset passes **8/8**. Printed-camera behavior remains a physical-device gate.

## Remaining release and security gaps

- Production-build source commit `f7f4c90` is pushed to `origin/codex-fix-native-google-oauth`; EAS applied the recorded build-number increment to `2`. The resulting evidence/build-number state is committed and tagged as `v1.0.0-rc.3`; the earlier `v1.0.0-rc.2` tag remains on its original commit and was not moved.
- Current source links `@blair.shane/weddingwin-app` through `extra.eas.projectId`, points the production submit profile to the exact `WeddingWin Canada` App Store record for `ca.weddingwin.app`, and includes required-reason privacy-manifest declarations. EAS holds the matching distribution certificate, active App Store profile, App Store Connect API key, and sandbox-and-production APNs key. EAS build `ed4826b7-3fcb-43c8-93cf-480cd7057739` produced signed IPA `1.0.0 (2)`; signature/profile/entitlements/icon/privacy-manifest checks passed and Apple processed the upload as `Validated`/`Ready to Submit`. Physical iPhone/iPad evidence remains pending.
- Real Apple/Google login, printed-camera QR, push delivery/token lifecycle, network interruption, and Apple-linked deletion remain physical-device gates.
- The controlled reviewer-pair text round trip is recorded locally/live, including website reload persistence and native incoming visibility. Repeat it on the exact processed TestFlight build, keep the expiring pair authorization active for the review window, and document that inactive-vendor website sending is intentionally unavailable rather than presenting that rejected direction as a failure.
- App Privacy answers, the public policy, deletion retention, raffle sponsor/rules/vendor terms, production WebView tracking inventory, and other owner/legal decisions remain blockers.
- The coordinated `APP_EMAIL_CHANGE_SECRET` rotation remains incomplete. Keep the exact live location/state and both values in the private security ticket, rotate Supabase and the website atomically during an explicitly approved sensitive-value update, and never copy a secret value into this repository or release evidence.
