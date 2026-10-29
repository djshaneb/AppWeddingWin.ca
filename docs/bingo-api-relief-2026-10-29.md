# Bingo API relief — 29 October 2026

## Change and scope

The installed app previously performed a quota-counted Brilliant Directories member lookup on every native Bingo request. With the latest written site limit of 250 requests per minute, 300 simultaneous players could exhaust that allowance before completing loading, scanning and draw entry.

Native couple requests now keep the existing canonical session check and obtain a fresh, signed member snapshot from WeddingWin's website database. This removes the directory API lookup from ordinary Bingo loading, scans, offers and entry. The proof is never cached and has exact member, purpose, nonce, expiry and response-shape validation. Inactive/deleted couples, malformed responses and verification outages fail closed. Current role and current account email remain authoritative; separate saved Bingo contact details and consent rules remain unchanged.

Vendors still require the full current directory member/tag lookup. An active-1 vendor proof only selects that existing path, preserving explicitly allowed private review vendors; it does not grant vendor access. Date/profile updates that genuinely write directory data still use their existing verified write/readback path.

The shared message mirror refresh now waits 60 seconds after a successful refresh when requested only by passive chat-status polls. Explicit inbox/conversation requests and status calls with an active conversation retain the existing 20-second server freshness. The installed app still sends a status request every 30 seconds, and refreshes an open Messages view every 30 seconds. Changing those client timers requires an app update; this change reduces the shared server work instead. Sending messages and the independent minute push worker retain their existing paths.

## Deployment safeguards

- Isolated branch from `26ec5e144b49eba73fe757b0e4447ad64b9d7b2e`.
- Only website widget 329's PHP field and the `bd-qr-bingo-sync`, `bd-chat-status`, and `bd-chat-sync` function bundles are deployment targets.
- Bundle construction overlays approved files on exact captured live sources, retaining all other dependency bytes and JWT settings. Vendor-sync 87, admin 20 and push-sweep 17 are not deployment targets.
- Widget private signing configuration is preserved in memory. Source is compared before writing and read back afterward. Widget CSS/JavaScript are preserved. The local shared-controller and widget 320 copies are kept consistent for future builds; widget 320 is not deployed in this change.
- No schema, RLS, grants, cron, API keys, billing, App Store binary or client configuration changes.
- Rollback payloads and sanitized manifests are saved in the operational evidence directory outside the repository.

## Capacity evidence and limits

The isolated actual-handler test exercises 300 simultaneous synthetic player journeys with a 250/minute directory API ceiling. All 900 loading, scanning and Yes-entry requests succeed with zero directory member API requests. It also exercises repeat scans, request authentication, malformed/stale proofs, role changes and failure responses. Website and database correctness are checked separately using the captured PHP route and current entry SQL.

This establishes removal of the observed directory-quota bottleneck for already signed-in players with completed contact setup. It is not a live 300-device load test or a measurement of hosting/database throughput. Website HTTP/SQL work remains, and sign-in, profile changes, vendor actions, messaging and other integrations still share the provider's allowance. The latest provider confirmation is 250/minute, not an unlimited-capacity guarantee. No traffic burst is sent to production for testing.

## Final verification

Deployed versions: `bd-qr-bingo-sync` 80, `bd-chat-status` 39 and `bd-chat-sync` 58. All 38 deployed source files exactly match the reviewed bundle payloads; the native handler and proof helper match the capacity-test hashes. The other 27 functions, cron jobs, database structure, RLS/ACL, policies, index/constraint health and advisor findings are unchanged.

Validation results:

- 36 actual native-handler scenarios, including 300 complete journeys: 900/900 successful actions, zero metered BD API calls, and no duplicate scan writes.
- Actual PHP member-proof tests: 60 assertions, including current role/status changes, nonce/purpose/expiry checks, private field exclusion, SQL outages and unchanged chat status behavior. Live proof endpoint: nine valid/invalid-request probes passed.
- Current draw-entry SQL: 11 checks, 1,500 synthetic entries and 900 duplicate submissions; exact captured website scanner: 19 scenarios and 1,358 requests. Both stayed offline with no real participants.
- Broad regressions: 1,231 Deno and 485 Node tests passed. Three failures also reproduce on baseline `26ec5e1`: an uninitialized vendor VM fixture variable, an outdated demo-copy assertion, and the website reset-display issue described below. The full suite is not reported as all green. All tests affected by this change and all three assembled function typechecks pass.
- Live demo canary: both roles signed in; native Bingo read-only review context returned 200; forged Bingo/chat sessions returned 401; lists/status/read/send succeeded. Test message 1892 was confirmed delivered in 4.193 seconds and read in a subsequent 1.757-second request. A same-ID replay left exactly one message and one sent outbox record, with zero retry attempts. These are explicit request timings, not guaranteed automatic-delivery latency.
- The first live canary stopped before any message because the old screenshot account's synthetic fixture is intentionally expired. Its failure checkpoint is retained. The successful canary used the read-only review-context action; no fixture was reactivated and no Bingo entry was created.
- Five natural minute push sweeps from 19:53–19:57 UTC returned 200, checking 52 registrations each with zero failed/deferred checks. The push worker and schedule are unchanged. This task did not repeat a physical-device sound test; the user had already confirmed seeing and hearing the alert earlier that day. One pre-deployment sweep at 19:41 returned `BOOT_ERROR`, followed by successful sweeps; it is not represented as a new change or as an error-free historical window.

## Existing website reset-display limitation

The broader tests confirmed an existing issue in the live website scanner: unchanged-event interval polling does not refresh the account's displayed scan history. An admin reset can therefore leave old checkmarks on an already-open website card until a manual reload, an event revision change, or a qualifying focus/visibility return after 60 seconds. Server-side reset-generation and entry guards still apply. The polling block matches the captured live widget and was not changed here. This is a display limitation, not merely a harmless test failure. Adding another recurring request per participant is deliberately outside this API-reduction patch.

Operational evidence: `work/bingo-api-relief-2026-10-29/` in the parent task workspace. It includes rollback bundles, before/after manifests, capacity/security results, live probes, and message canary checkpoints. No credentials or real participant contact data are included in the committed source.
