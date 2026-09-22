# Google sign-in first-attempt investigation

## Status

Proposed backend fix and regression tests are isolated on the fix branch. No production backend, CMS, or App Store configuration changes have been deployed.

- Released baseline: `20cde6c09195f2f8d19c7e9d816dde156593c9cb`, App Store build 8.
- Isolated branch: `codex/fix-google-signin-first-attempt`.
- Release checkout remains on `codex/app-store-preparation`, clean.
- Existing native Google suite: 33/33 passed on September 22. Browser and HTTP dependencies are mocked; this does not reproduce a physical first-attempt failure.

## Reported symptom

The first Google attempt fails and a second attempt succeeds. Exact supplied message:

> Google sign-in failed. Your Google sign-in was interrupted or expired. Please close this window and tap Sign in with Google again.

Ordinary login versus first-ever signup, account role, failed-attempt time, and whether the error appeared inside the authentication browser or as a native alert remain unconfirmed.

## Evidence

`supabase/functions/_shared/google_oauth_error.ts` maps browser-binding/state/authorization-code errors to this text. If it is a native alert returned through the verified app URL, signed-state verification has already succeeded. Remaining matching paths are:

1. Missing or malformed browser-binding cookie.
2. Atomic attempt redemption rejected an expired, used, or mismatched attempt.
3. Google returned no authorization code after successful attempt redemption.

This text does not identify which of those occurred. It does not support changing member creation or native-session exchange.

Read-only CMS inspection on September 22 found:

- Page 4299, `auth/google-start`: JavaScript navigation to the Supabase `google-oauth-start` endpoint, preserving the search string.
- Page 4297, `auth/google-callback`: JavaScript navigation to the Supabase callback, forwarding the returned search parameters.
- Both page revisions are May 15, 2026. No page edits were made.

The repository's start handler sets a secure HttpOnly host-only binding cookie with `SameSite=None` and immediately redirects to Google. Callback verification requires that cookie, signed state, atomic single-use redemption, ID-token signature/nonce validation, and native PKCE. The prior September 7 fix is already present; it must not simply be reapplied or weakened.

## Live evidence (September 22, UTC)

The user signed into the Supabase dashboard. Read-only log queries found:

| Time | Event | Result |
| --- | --- | --- |
| 15:17:53 | Google start v16 | Attempt inserted; HTTP 302 |
| 15:18:03 | Google callback v25 | Authorization code present; no provider error; HTTP 302; no attempt-redemption RPC |
| 15:18:11 | Google start v16 | New attempt inserted; HTTP 302 |
| 15:18:18–20 | Google callback v25 and native exchange v7 | Attempt-redemption RPC HTTP 200; native exchange HTTP 200 |
| 17:04:16–25 | Another start/callback pair | Code present; no provider error; no attempt-redemption RPC |
| 17:04:43–48 | Subsequent start/callback pair | Attempt-redemption RPC HTTP 200 |

These are temporally adjacent events, not an assertion about the identity of the accounts. The first pair and successful retry match the reported pattern. In the callback's verified-state error path, absence of the redemption RPC narrows the failure to a missing or malformed browser-binding cookie. Standard logs do not include that cookie, so they cannot show which browser behavior caused its absence. Existing callback console logs contain only boot/shutdown events.

Downloaded current function ZIPs were compared locally. Google start v16 is identical to the branch baseline. Callback v25 and all directly modified dependencies match the baseline. Its bundled `oauth_state.ts` is an older Apple helper; leave that unrelated deployed file unchanged when deploying the Google fix. Local rollback copies are in the sibling `google-signin-diagnostics-sept22/deployed-start-v16` and `deployed-callback-v25` folders.

No raw cookies, authorization codes, signed OAuth state, account identifiers, or session credentials were added to this report.

## Proposed change

- When no valid Google browser cookie exists, set the existing secure HttpOnly cookie and make one same-origin request to confirm that the browser returns it before creating an OAuth attempt or navigating to Google.
- Bind the continuation to the cookie hash and original query with a signed, purpose-specific marker expiring after 60 seconds. No raw cookie is placed in the URL. Invalid, changed, expired, duplicated, or cookie-less continuations stop without another redirect or cookie rotation.
- Keep the existing-cookie path, signed OAuth state, consent, native PKCE, nonce verification, atomic attempt redemption, and existing native callback behavior.
- Add fixed callback failure reasons to distinguish missing cookie, rejected attempt, validation unavailable, and missing authorization code. Do not log inputs or exception messages.

The additional round trip proves initial cookie storage and return. It cannot by itself prove delivery through the later Google → WeddingWin → Supabase redirect chain. Treat this as a targeted candidate fix until a fresh physical iPhone sign-in passes.

## Validation

- 86 targeted Deno tests passed with zero failures: fresh-cookie confirmation and bounded failure, Google native login/signup and callback diagnostics, browser binding, safe errors, Apple web/native compatibility, and signed state.
- Both modified Google handlers passed `deno check`.
- `git diff --check` passed.
- Released checkout rechecked: clean on `codex/app-store-preparation` at `20cde6c09195f2f8d19c7e9d816dde156593c9cb`.
- Existing native Google UI suite previously passed 33/33 against the unchanged app source. No new native code or build-number change is included.
- Physical first-attempt verification and deployment are pending. These automated tests mock cookie transport and do not certify Safari behavior.

## Access

Supabase MCP tools are unavailable and the existing CLI credential could not be retrieved. Dashboard access is now authenticated. Source downloads and log queries used the dashboard; no authentication tokens were extracted.

## Next diagnostic steps

1. Complete local regression and type checks; review only the isolated branch changes.
2. Apply only the Google start and callback changes to the shared backend, preserving the downloaded function bundles and keeping rollback copies.
3. Verify deployed source, a fresh-cookie continuation, a blocked-cookie bounded failure, and unchanged existing-cookie behavior.
4. Complete a fresh physical iPhone Google login and one repeat login; inspect the safe callback reason if it still fails. No new App Store binary is required for this server-only candidate.
5. If the callback still loses its cookie after a successful initial round trip, investigate a first-party start/callback bridge instead of removing the binding check.

## Documentation reviewed

- https://supabase.com/changelog.md
- https://supabase.com/docs/guides/monitoring-and-debugging
- https://supabase.com/docs/guides/observability/advanced-log-filtering
- https://supabase.com/docs/guides/functions/http-methods

The log API uses ClickHouse `logs`, explicit bounds of 24 hours or less, and selected fields. The older `logs.all` endpoint is scheduled for removal September 23. Supabase GET `text/html` responses are rewritten to plain text, so a proposed HTML interstitial on that endpoint is not a valid fix.
