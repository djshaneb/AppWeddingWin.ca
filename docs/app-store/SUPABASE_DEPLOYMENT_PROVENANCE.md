# Supabase deployment provenance

Status: **LIVE IN-PERSON QR BINGO BACKEND INVENTORY — record immutable source checksums in the private release ticket before submission.**

Observed: 2026-08-28 through 2026-09-01 PDT (2026-09-02 UTC) through the connected Supabase project's live migration and Edge Function inventory. This file records versions, deployment metadata and migration identifiers, not credentials or secret values. A Supabase deployment version is not a substitute for recorded Git/build provenance or end-to-end physical-device evidence.

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
| `20260829180000` | `create_qr_bingo_event_configuration` |
| `20260829194500` | `harden_qr_bingo_transactions` |
| `20260829201500` | `return_qr_bingo_publish_conflicts` |
| `20260830024500` | `create_isolated_qr_bingo_email_test_fixtures` |
| `20260830050000` | `create_qr_bingo_participation_report_audit` |
| `20260830100000` | `add_vendor_winner_verification` |
| `20260830110000` | `add_qr_bingo_alternate_entry_reconciliation` |
| `20260830120000` | `add_qr_bingo_vendor_offer_versions` |
| `20260830130000` | `fix_qr_bingo_rules_trigger_dispatch` |
| `20260830140000` | `enable_named_vendor_contact_exports` |
| `20260830150000` | `allow_isolated_fixture_offer_snapshots` |
| `20260830160000` | `stamp_isolated_fixture_early_draw_offers` |
| `20260830170000` | `add_qr_bingo_multi_winner_pool_controls` |
| `20260901070000` | `enable_named_vendor_marketing_consent` |
| `20260901071000` | `allow_vendor_marketing_rules_transition` |
| `20260901072000` | `disable_qr_bingo_alternate_free_entry` |
| `20260901073000` | `require_in_person_qr_bingo_rules` |
| `20260901074000` | `publish_in_person_qr_bingo_config` |

The connected inventory returned 56 migrations total, with zero local-only and zero remote-only versions. Its final version was `20260901074000`.

## Active Edge Function versions

The connected function inventory reported these QR Bingo functions active immediately after the in-person-entry deployment:

| Function | Version | Status | Observed update time (UTC) | Deployment archive SHA-256 |
| --- | ---: | --- | --- | --- |
| `bd-qr-bingo-sync` | 44 | `ACTIVE` | `2026-09-02T02:22:46Z` | `c476245d351c48ad3d379b98074ae25111259e1688e74a337a5b6b2e23e0f7d6` |
| `bd-qr-bingo-vendor-sync` | 45 | `ACTIVE` | `2026-09-02T02:22:48Z` | `63d1b47ec66a6e9bf625278c9c69774533f81473e3228b58522ccb5dcd5cc43a` |
| `bd-qr-bingo-admin` | 8 | `ACTIVE` | `2026-09-02T02:22:50Z` | `114492655bbbe302627d38f1e1919ad915b48d55074715401a84985ebc45154b` |

## Verified backend controls

- The current source passes **183/183** shared Deno regressions, including the in-person show window, fresh current-rules acceptance, server-attested exact-vendor QR entry proof, historical-contact versus winner-pool separation, retired off-site entry boundaries, QR replay idempotency, vendor controls, and release security regressions. Earlier non-QR function versions and probes remain historical evidence from their recorded deployment dates rather than the current QR Bingo deployment inventory above.
- Browser-bound OAuth attempts are live. Controlled tests exercised host-only binding cookies, provider matching, missing/mismatched browser binding, atomic redemption, expiry, and replay rejection. This is backend security evidence, not proof of a real Apple or Google identity-provider login on the submitted app.
- One-time native/website login exchanges, exchange cleanup, Google PKCE binding, email-consistency checks, and the corrected first-attempt login throttle are deployed.
- Durable push retry remains live in the currently active `bd-push-sweep` v11 with migration `20260828214927`: retryable Expo/network outcomes persist bounded backoff and `Retry-After`, accepted tickets are reconciled, and missing receipts expire. APNs signing and foreground/background/terminated delivery still require a physical TestFlight build.
- The account-deletion preservation/redaction flow remains live through the currently active `bd-delete-account` v12 and the deletion migrations above. The disposable two-participant email-account test passed, but physical Apple revocation, provider/backup behavior, and owner/legal retention approval remain open.
- Private App Review chat access remains live through migrations `20260828221025` and `20260828221307`, the currently active `bd-chat-sync` v42, and `bd-chat-status` v29. The allowlist is service-role-only, expiry-gated, and restricted to the exact prepared vendor/couple reviewer pair so the vendor's Brilliant Directories listing can remain nonpublic. A fresh post-deployment controlled round trip passed: the exact app message reached `Delivered` and appeared in the authenticated website thread; the exact website reply appeared after native refresh in the Release Simulator. The website briefly rendered its generic missing-page placeholder after sending, but the message persisted and reloading the same conversation restored the normal thread. Brilliant Directories correctly blocked the earlier attempted send from the inactive vendor's website account; that rejected attempt was not counted as delivered.
- Historical 2026-08-29 evidence: vendor-specific QR draws were restored live through migration `20260829164200`, `bd-qr-bingo-sync` v18, and `bd-qr-bingo-vendor-sync` v19, all with JWT verification enabled. A booth scan records visit progress only; the couple separately reviews the offer and rules and confirms eligibility before entry. A repeat scan or a tap on the visited-booth card reopens the optional offer without duplicating the visit. The controlled live fixture finished with exactly one scan, one vendor-draw entry, and one potential-winner selection; replay did not duplicate state, contact sharing remained selected-potential-winner-only, and outbound review-fixture email remained suppressed. Printed-camera behavior remains a physical-device gate.

## Current in-person-entry deployment

The live connected inventory includes the in-person-entry migrations through `20260901074000` and active QR Edge Functions `bd-qr-bingo-sync` v44, `bd-qr-bingo-vendor-sync` v45, and `bd-qr-bingo-admin` v8. A live unauthenticated request to the retired off-site-offer action returned HTTP `410`, code `offsite_entry_retired`, and the deployed in-show-only direction. This proves the retired route behavior at the observed deployment; it does not replace authenticated end-to-end or physical-camera evidence.

The deployed contract uses Official Rules version `2026-09-01-in-person-entry`: a scan remains a booth visit only, while an explicit named-vendor draw entry includes contact sharing and consent for that named vendor's wedding-related offers or promotions. New production entries require a saved scan for the exact named vendor plus server-stamped `in_show_scan_verified` state/time inside the published event window. New off-site entries are rejected while historical rows remain intact and available in the named vendor's contact history/CSV; only fresh current-version, verified in-show QR entries enter production winner counts or selection. The preceding `2026-09-01-vendor-marketing` version remains historical consent provenance and is not active for new entries. Migration `20260901074000` published the target rules version with `history_starts_at` `2026-10-18T15:00:00Z` through the same immutable revision and audit controls used by normal publication.

This source is recorded by release-candidate tag `v1.0.0-rc.4` on `codex-fix-native-google-oauth`. Record the immutable source checksum and replacement signed-build identifiers in the private release ticket before treating the connected backend inventory as complete App Store release provenance. Historical v18/v19, 2026-08-29 build, commit and tag evidence predates this deployment and must not be represented as proof of the current source/build.

## Remaining release and security gaps

- Historical production-build source commit `f7f4c90`, build `1.0.0 (2)`, and tag `v1.0.0-rc.3` remain recorded without moving the older `v1.0.0-rc.2` tag. They do not include the `2026-09-01-in-person-entry` delta and cannot serve as its release provenance.
- Current source retains the Expo/App Store project linkage and required-reason privacy-manifest declarations, and EAS retains the required signing/submission/APNs credentials. Build 2 passed its signature/profile/entitlements/icon/privacy-manifest checks and Apple processed it as `Validated`/`Ready to Submit`, but a replacement signed build from the final `2026-09-01-in-person-entry` source plus physical iPhone/iPad evidence are pending.
- Real Apple/Google login, printed-camera QR, push delivery/token lifecycle, network interruption, and Apple-linked deletion remain physical-device gates.
- The controlled reviewer-pair text round trip is recorded locally/live, including website reload persistence and native incoming visibility. Repeat it on the exact processed TestFlight build, keep the expiring pair authorization active for the review window, and document that inactive-vendor website sending is intentionally unavailable rather than presenting that rejected direction as a failure.
- Record the deployed `2026-09-01-in-person-entry` source in an immutable Git commit/tag and replacement signed build, then repeat the app, website, backend, printed-QR, exact-vendor/event export, cross-vendor denial, legacy fresh-consent and included-marketing-marker checks on that exact processed TestFlight build before final submission. Prove production entry requires an accepted scan for the exact in-show vendor, while the isolated fictional App Review fixture only emulates that scan; prove production verified-winner notices use the configured vendor/couple channels without fixture suppression, while the review fixture still suppresses outbound email. Prior public-page, Chrome-flow, and local Release Simulator evidence remains historical unless repeated against the final build and deployed backend.
- App Privacy answers, the public policy, deletion retention, the free-app/paid-admission and ticket/payment-data boundary, in-show attendance/booth-scan/optional-entry boundary, digital-paper-ballot description, accurate admission/no-extra-chance language, one-valid-entry-per-eligible-couple/vendor limit, the narrow Wedding Win platform-sponsor/named-vendor responsibility allocation and Apple Guideline 5.3.1 approval, exact named-vendor draw-administration and wedding-related-marketing contact-sharing boundary, vendor verification/prize responsibility, production WebView tracking inventory, and other owner/legal decisions remain blockers.
- The coordinated `APP_EMAIL_CHANGE_SECRET` rotation remains incomplete. Keep the exact live location/state and both values in the private security ticket, rotate Supabase and the website atomically during an explicitly approved sensitive-value update, and never copy a secret value into this repository or release evidence.
