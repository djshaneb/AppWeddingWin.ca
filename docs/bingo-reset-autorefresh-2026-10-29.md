# Bingo reset refresh and account-isolation verification

The website Bingo card previously refreshed private progress only when event configuration changed or the page regained focus. An administrator resetting one couple does not change the public event revision. The open website card could therefore retain old checkmarks.

The visible website card now reads its own authenticated progress at most once every 60 seconds, alongside the existing 30-second public configuration check. Hidden pages and active scan/draw mutations skip the read. Skips do not spend the next refresh opportunity; actual attempts, including failures, do. Single-flight guards and scan revision checks prevent overlapping requests and late responses overwriting a newer scan. A successful empty card response clears marks and the previous scan label so the couple can scan again.

The minute is a minimum interval, not an instant-reset guarantee. The existing timer, network latency, or an in-flight scan can defer the visible update. The normal visible idle refresh is approximately 60–90 seconds. Public event identity, account authorization, participation requirements, and entry rules remain unchanged.

## Compatibility and request budget

- This refresh is served by website widget 258. It requires no App Store binary update. Pages already open before deployment need one reload to receive the new JavaScript.
- The installed build 8 native Bingo screen is a separate interface. It refreshes after the next successful scan or reopening the card. Its idle-screen polling behavior cannot be changed by this website deployment. There is no configured native OTA channel or reset notification handler; public event identifiers were not repurposed as account reset signals.
- The added ceiling is one private website progress request per visible, eligible card per minute: up to 300/minute for 300 visible cards. Existing public configuration polling remains two requests/minute per visible website card. Server config/contact checks still consume website/Supabase resources.
- Healthy private progress checks use authenticated website SQL snapshots, not quota-counted Brilliant Directories member API calls. This is not a claim of zero network/database traffic or proven production throughput at 300 concurrent users.
- Installed app message polling intervals were not modified. The previously deployed shared background refresh limit remains 60 seconds; active chat uses its existing shorter interval. Push worker and device registration code are unchanged.

## Chat issue found during the ten-account test

The actual deployed chat handler accepted a foreign selected conversation token through three synthetic list/read paths without checking membership before loading messages. The test used only locally fabricated accounts and messages, not real foreign conversations. The server correction checks explicit conversation selections against the authenticated account and keeps authorized older selections in the normal report/block-filtered message pipeline. Foreign selections return 404. Linked conversation aliases are also checked before use.

The alias check uses at most one bounded database metadata batch for unresolved inbox links, rather than one query per conversation. It adds no Brilliant Directories API calls. Corrupt foreign aliases cannot trigger read receipts, reports, closure, or forwarding to another account's thread.

## Verification scope

- Website scanner suite: 23/23 passing, including PHP parsing/helpers and actual JavaScript execution for timing, hidden/resume, overlap, failure backoff, and stale scan responses.
- Ten virtual phone identities ran actual native Bingo and chat handlers plus website functions with synthetic database/HTTP boundaries. All ten scenario groups passed. Twenty synthetic chat messages were retained; reset/rescan, duplicate scans, per-account isolation, hidden/resume, active draw deferral, failed progress reads, and delayed responses were checked.
- The ten-phone run made 49 private website progress reads over 451 virtual seconds; every account's attempts remained at least 60 seconds apart. Thirty-three native requests made zero modeled quota-counted BD API calls. One hundred chat requests made 71 modeled BD calls, including 60 deliberate send/replay authorization checks. These are instrumented test counts, not measured production SQL or throughput.
- Existing related regression suites: 168 Node and 318 Deno tests passed for authentication/session recovery, Bingo access/replay, chat refresh/membership/moderation, notification routing/identity/delivery, and push reliability.
- New complete-route authorization regressions: 33/33 passed, including 80 foreign/missing-token rejections, valid participants, linked aliases, report/block cutoffs, selected older conversations, self-threads, and deleted conversation/alias rejection. Final chat source SHA-256: `5cb8c34912b067981568430521dc28a20222e3e9d848ed87b5a58757ad709bef`.
- A silent temporary production couple account verified successful sign-in and the actual served `/qr` HTML. The deployed reset JavaScript and existing draw retry UI were present and the scanner script parsed. The account was deactivated after the check. No scans, consent, entries, or emails were created by that check.
- The simulation uses virtual JavaScript/DOM sessions. It is not ten physical iPhones, a camera-decoding test, a mobile rendering test, or a production load test. Push delivery to a physical device is not claimed for this run.

Operational evidence is in the sibling workspace directory `work/bingo-reset-autorefresh-2026-10-29`. Private HTML, credentials, raw provider bundles, and operational checkpoints are excluded from the repository.

## Deployment and rollback

Website widget 258 was compared with a fresh live capture before writing. Only `widget_data` changed; style and standalone JavaScript fields remained byte-identical. The live retry interface was preserved. Saved source was reread and matched SHA-256 `01c4ae3288ee70e2bbe7d637154c790f0ab780d43975999b31b0198611cb706d`.

The guarded operational deployment script retains the exact prior widget and refuses to overwrite unexpected drift. The chat deployment is assembled as a one-file overlay on its captured live eight-file bundle, leaving relative dependencies and authentication settings unchanged. No schema, cron, app binary, or paid capacity changes are included.

Chat function `bd-chat-sync` version 59 was deployed and reread: all eight bundle files exactly match the tested overlay, with only its entrypoint changed. The public URL and existing application-level authentication remain unchanged (`verify_jwt=false` was already configured). Status 39, Bingo 80, vendor Bingo 87, admin 20 and push worker 17 were retained.

Post-deployment catalog checks matched the pre-task snapshot for tables/RLS/ACLs, policies, cron schedules/commands, indexes, and constraints. The natural push sweeps at 20:19, 20:20 and 20:21 UTC each returned HTTP 200 with 52 devices checked and zero failed/deferred. No physical device alert was triggered by this check.

Existing platform advisories were inspected, not modified: leaked-password protection remains disabled ([Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); informational notices include service-only RLS tables without policies, five uncovered foreign keys, unused indexes, HTTP-response table bloat, and fixed Auth connection allocation. These predate this code-only change; no potentially disruptive maintenance was performed.

The post-deployment controlled live chat check passed on version 59: both demo accounts authenticated, their conversation loaded, forged sessions returned 401, one message delivered in 5.118 seconds, a deliberate same-ID replay produced no duplicate, and the recipient read response completed in 2.141 seconds. The API retained its normal latest-12-message window. Both test accounts had zero enabled push registrations, so no physical notification was generated.

A final read-only database ledger confirmed exactly one new message in the intended demo thread, one sent outbox record, the recipient read flag, zero retry attempts, and no notification events/deliveries for these device-free demo accounts.
