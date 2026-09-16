# Local release regression — September 16, 2026

Completed by 21:04 UTC in `work/app-store-release`, using Node 24.20.0, Deno 2.9.5 and the checkout's installed dependencies. **All executed checks passed.** These checks accompanied the user's report that TestFlight build 7 installed and opened; they do not independently verify the installed phone build.

| Check | Result | Log |
|---|---|---|
| Full Deno shared-function suite | 1,054 passed, 0 failed | `edge-tests.log` |
| Focused native auth, notification and review-draw suite | 176 passed, 0 failed, 0 skipped | `native-notification-auth.log` |
| Durable notification ledger SQL | 17 passed | `notification-ledger-sql.log` |
| Isolated review-draw SQL | 14 passed | `review-draw-sql.log` |
| Isolated review notification SQL | 14 passed | `review-notifications-sql.log` |
| Notification cron timeout SQL | 5 passed | `notification-cron-sql.log` |
| TypeScript | Exit 0, no diagnostics | `typecheck.log` |

All seven commands exited 0. Logs are outside the release checkout at `/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/release-regression-sept16/`.

## Commands

Run from the release checkout:

```sh
deno test --node-modules-dir=none --no-lock --allow-read --allow-env supabase/functions/_shared/*_test.ts

node --test scripts/test-native-notification-intents.mjs scripts/test-native-push-rollover.mjs scripts/test-notification-routing-endpoints.mjs scripts/test-notification-worker.mjs scripts/test-native-session-expiry.mjs scripts/test-native-google-login.mjs scripts/test-native-apple-login.mjs scripts/test-native-apple-browser-login.mjs scripts/test-native-review-draw.mjs

node scripts/test-notification-events-migration.mjs
node scripts/test-review-draw-mode-migration.mjs
node scripts/test-review-draw-notifications-migration.mjs
node scripts/test-notification-cron-timeout.mjs
node node_modules/typescript/bin/tsc --noEmit
```

## Relevant coverage

- New message identities can trigger notification eligibility when the unread total does not change. Proven mirrors, blocked senders, stale claims, account mismatches, changed registrations and ambiguous delivery outcomes retain their protective handling.
- Notification destinations remain validated and scoped to the authenticated recipient; push-token rollover and session-expiry behavior pass the existing regression tests.
- An unset vendor receive override uses the membership plan setting; explicit blocks and unknown overrides do not fall through to an enabled plan.
- Apple/Google native login and explicit signup retain account-role boundaries in the isolated tests.
- PostgreSQL/WASM tests exercise durable notification reservation, receipt reconciliation, duplicate prevention, authenticated draw results, reset generations, account-deletion cascades and isolated reviewer flows. The review suites confirm that their synthetic actions do not change production entry, winner, consent or email-delivery fixtures.

## Limits

These are local source, unit and synthetic database regressions. Deno ran without network permission; Node endpoint tests use isolated dependencies, and SQL suites use local PGlite/PostgreSQL WASM with synthetic rows. No live database queries, backend deployments, app builds, device actions or messages were performed by this regression run. No app code or configuration changed.

Passing these checks does not establish physical TestFlight behavior, production APNs delivery/sound/badge/tap handling, actual Apple/Google provider sign-in, accessibility or visual acceptance, production migration state, privacy declarations, or App Review compliance. Those require their separate evidence. This report is not approval to submit or publicly release the app.
