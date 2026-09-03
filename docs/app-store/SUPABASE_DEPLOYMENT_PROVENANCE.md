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
| `20260901075000` | `allow_legacy_in_person_rules_reacceptance` |
| `20260902063000` | `bound_chat_message_reads` |
| `20260902064500` | `exact_chat_unread_counts` |
| `20260902065000` | `fair_app_chat_delivery_batch` |

The connected inventory returned 60 migrations total, with zero local-only and zero remote-only versions. Its final version was `20260902065000`.

## Active Edge Function versions

The connected function inventory reported these QR Bingo functions active immediately after the in-person-entry deployment:

| Function | Version | Status | Observed update time (UTC) | Deployment archive SHA-256 |
| --- | ---: | --- | --- | --- |
| `bd-qr-bingo-sync` | 47 | `ACTIVE` | `2026-09-02T05:08:50Z` | `f095831181f20271306152745f5ff6530035e9cab0f5a105fc04d4a3b595b079` |
| `bd-qr-bingo-vendor-sync` | 48 | `ACTIVE` | `2026-09-02T05:08:58Z` | `1a03593331ce2692dcb8ff801b09087da560c37102cfb311df1002dd93eee844` |
| `bd-qr-bingo-admin` | 9 | `ACTIVE` | `2026-09-02T02:22:50Z` | `114492655bbbe302627d38f1e1919ad915b48d55074715401a84985ebc45154b` |
| `bd-chat-sync` | 51 | `ACTIVE` | `2026-09-02T06:47:46.403Z` | `44116093dabc4787f65f9e7c68be6172f273280f18f23dafb30ffab00877150b` |
| `bd-chat-status` | 34 | `ACTIVE` | `2026-09-02T06:44:57.541Z` | `2fe8e6076e34328c5cef7c2ef9056c121b19402d9d44b1e9b67cfb3491b5b177` |

## Verified backend controls

- The current source passes **195/195** shared Deno regressions, including private-chat photo transport validation, bounded/fair payload and exact-unread coverage, rollout-gate decisions, and the paused-photo/later-text delivery order as well as the in-person show window, fresh current-rules acceptance, server-attested exact-vendor QR entry proof, historical-contact versus winner-pool separation, retired off-site entry boundaries, QR replay idempotency, vendor controls, and release security regressions. Earlier function versions and probes remain historical evidence from their recorded deployment dates rather than proof of the current deployment.
- Browser-bound OAuth attempts are live. Controlled tests exercised host-only binding cookies, provider matching, missing/mismatched browser binding, atomic redemption, expiry, and replay rejection. This is backend security evidence, not proof of a real Apple or Google identity-provider login on the submitted app.
- One-time native/website login exchanges, exchange cleanup, Google PKCE binding, email-consistency checks, and the corrected first-attempt login throttle are deployed.
- Durable push retry remains live in the currently active `bd-push-sweep` v11 with migration `20260828214927`: retryable Expo/network outcomes persist bounded backoff and `Retry-After`, accepted tickets are reconciled, and missing receipts expire. APNs signing and foreground/background/terminated delivery still require a physical TestFlight build.
- The account-deletion preservation/redaction flow remains live through the currently active `bd-delete-account` v12 and the deletion migrations above. The disposable two-participant email-account test passed, but physical Apple revocation, provider/backup behavior, and owner/legal retention approval remain open.
- Private App Review chat access remains live through migrations `20260828221025`, `20260828221307`, bounded-read migration `20260902063000`, exact-unread migration `20260902064500`, and fair delivery-batch migration `20260902065000`, with `bd-chat-sync` v51 and `bd-chat-status` v34 active. The allowlist is service-role-only, expiry-gated, and restricted to the exact prepared vendor/couple reviewer pair so the vendor's Brilliant Directories listing can remain nonpublic. A fresh v45 Simulator test sent a resized/re-encoded JPEG with a caption and a separate photo-only message; both reached Brilliant Directories `Delivered` state and remained visible after native refresh. A follow-up clean-permission-state Simulator check confirmed iOS presented the selected-item system picker without a broad library prompt. v51/v34 include smaller bounded JPEGs, fair per-thread payload limits, content-free exact unread counts, client-error validation responses, and a database-ranked delivery batch so any number of waiting photos cannot hide later text messages. The earlier authenticated website round trip remains valid text-flow evidence: the exact website reply appeared after native refresh, while Brilliant Directories correctly blocked the inactive vendor's rejected send. Actual photo visibility in the authenticated website UI and the full physical-picker matrix still require exact-build TestFlight verification.
- Historical 2026-08-29 evidence: vendor-specific QR draws were restored live through migration `20260829164200`, `bd-qr-bingo-sync` v18, and `bd-qr-bingo-vendor-sync` v19, all with JWT verification enabled. A booth scan records visit progress only; the couple separately reviews the offer and rules and confirms eligibility before entry. A repeat scan or a tap on the visited-booth card reopens the optional offer without duplicating the visit. The controlled live fixture finished with exactly one scan, one vendor-draw entry, and one potential-winner selection; replay did not duplicate state, contact sharing remained selected-potential-winner-only, and outbound review-fixture email remained suppressed. Printed-camera behavior remains a physical-device gate.

## Current in-person-entry deployment

The live connected inventory includes migrations through `20260902065000`, active QR Edge Functions `bd-qr-bingo-sync` v47, `bd-qr-bingo-vendor-sync` v48, and `bd-qr-bingo-admin` v9, plus private-chat functions `bd-chat-sync` v51 and `bd-chat-status` v34. A live unauthenticated request to the retired off-site-offer action returned HTTP `410`, code `offsite_entry_retired`, and the deployed in-show-only direction. This proves the retired route behavior at the observed deployment; it does not replace authenticated end-to-end or physical-camera evidence.

The deployed contract uses Official Rules version `2026-09-01-in-person-entry`: a scan remains a booth visit only, while an explicit named-vendor draw entry includes contact sharing and consent for that named vendor's wedding-related offers or promotions. New production entries require a saved scan for the exact named vendor plus server-stamped `in_show_scan_verified` state/time inside the published event window. New off-site entries are rejected while historical rows remain intact and available in the named vendor's contact history/CSV; only fresh current-version, verified in-show QR entries enter production winner counts or selection. The preceding `2026-09-01-vendor-marketing` version remains historical consent provenance and is not active for new entries. Migration `20260901074000` published the target rules version with `history_starts_at` `2026-10-18T15:00:00Z` through the same immutable revision and audit controls used by normal publication.

This source is recorded by release-candidate tag `v1.0.0-rc.4` on `codex-fix-native-google-oauth`; build-number-3 evidence is captured by follow-up tag `v1.0.0-rc.5`. EAS build `f3077d9c-f813-4f4d-8e66-6284d9f7b7dc` finished and submission `0d94bee8-3058-4401-a5f2-1075f570abe3` reports success. Record Apple processing and exact-build physical results in the private release ticket before treating the connected backend inventory as complete App Store release provenance. Historical v18/v19, 2026-08-29 build, commit and tag evidence predates this deployment and must not be represented as proof of the current source/build.

## Remaining release and security gaps

- Historical build-2 source commit `f7f4c90` and follow-up evidence commit `cbdf47b`, tagged `v1.0.0-rc.3`, remain recorded without moving the older `v1.0.0-rc.2` tag. They do not include the `2026-09-01-in-person-entry` delta and cannot serve as its release provenance.
- Current source retains the Expo/App Store project linkage and required-reason privacy-manifest declarations, and EAS retains the required signing/submission/APNs credentials. Build `1.0.0 (3)` passed ZIP, signature, profile, entitlements, icon, and privacy-manifest inspection; IPA SHA-256 is `8c118af36aac0a2f5ddc23299c994ebec764e0feef3662e53930101c40331df6`. EAS submission reports success, while Apple processing and physical iPhone/iPad evidence remain pending.
- Real Apple/Google login, printed-camera QR, push delivery/token lifecycle, network interruption, and Apple-linked deletion remain physical-device gates.
- The controlled reviewer-pair text round trip is recorded locally/live, including website reload persistence and native incoming visibility. Repeat it on the exact processed TestFlight build, keep the expiring pair authorization active for the review window, and document that inactive-vendor website sending is intentionally unavailable rather than presenting that rejected direction as a failure.
- After Apple processes build 3, repeat the app, website, backend, printed-QR, exact-vendor/event export, cross-vendor denial, legacy fresh-consent and included-marketing-marker checks on that exact TestFlight build before final submission. Prove production entry requires an accepted scan for the exact in-show vendor, while the isolated fictional App Review fixture only emulates that scan; prove production verified-winner notices use the configured vendor/couple channels without fixture suppression, while the review fixture still suppresses outbound email. Prior public-page, Chrome-flow, and Simulator evidence does not replace exact-build physical testing.
- App Privacy answers, the public policy, deletion retention, the free-app/paid-admission and ticket/payment-data boundary, in-show attendance/booth-scan/optional-entry boundary, digital-paper-ballot description, accurate admission/no-extra-chance language, one-valid-entry-per-eligible-couple/vendor limit, the narrow Wedding Win platform-sponsor/named-vendor responsibility allocation and Apple Guideline 5.3.1 approval, exact named-vendor draw-administration and wedding-related-marketing contact-sharing boundary, vendor verification/prize responsibility, production WebView tracking inventory, and other owner/legal decisions remain blockers.
- The coordinated `APP_EMAIL_CHANGE_SECRET` rotation remains incomplete. Keep the exact live location/state and both values in the private security ticket, rotate Supabase and the website atomically during an explicitly approved sensitive-value update, and never copy a secret value into this repository or release evidence.
