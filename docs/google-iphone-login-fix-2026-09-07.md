# Google sign-in: connected iPhone fix — 2026-09-07

## Reported failure and diagnosis

The connected physical iPhone showed the callback's HTML as text, containing:

> OAuth sign-in must be completed in the same browser where it was started.

The original live flow logged start 302 at 16:27:37 UTC and callback 400 at
16:27:42 UTC. The corresponding login attempt was not redeemed. A controlled
anonymous callback probe reproduced the message without the browser cookie;
the same signed state with the matching cookie passed binding validation.

The Google binding cookie used SameSite=Lax across the website / Supabase /
Google redirect chain. Its absence on the phone callback caused the rejection.
The matching-cookie probe also confirmed that single-use replay prevention worked.

## Scoped changes

- Google browser binding now uses SameSite=None; Secure, retaining the __Host-
  cookie name, HttpOnly, Path=/, host-only scope and 10-minute lifetime.
- Signed state, provider isolation, hashed cookie binding, atomic single-use
  redemption, Google ID-token verification, nonce and PKCE checks remain required.
- Failures after successful signed-state verification can return a friendly error
  to the exact `weddingwin://bd-login` callback. They do not create sessions or
  exchange codes. Invalid/unverified targets never redirect.
- Other early failures return readable plain text, without raw HTML or internal
  provider/database diagnostics. The app already handles native error callbacks.
- The physical-device harness gained bounded Google-error observation/retry and
  couple-login support. Its changing accessibility-snapshot read was corrected;
  that diagnostic test failure was not an app crash.

Only Google start (version 16) and Google callback (version 24) were deployed.
Existing verify_jwt=false settings were preserved: these public OAuth endpoints
authenticate using signed state and browser binding, not a pre-login user JWT.
Live dependency bundles were read first; unrelated deployed files were preserved,
including the live oauth_state.ts version. No Apple functions, database schema,
CMS pages, accounts, passwords, memberships or consent records were edited.
No app binary update was necessary. No GitHub push was performed during the
initial fix and verification; the user subsequently requested publication.

## Verification

- 28 backend tests passed, including actual callback handlers for missing cookies,
  valid retry, cancellation, successful exchange, replay and state tampering.
- 33 native Google flow tests passed, including rapid taps, failures, cancellation,
  incomplete sessions, callback validation and stale asynchronous results.
- Deno callback typecheck and Git whitespace checks passed.
- Live anonymous probes confirmed the updated secure cookie, native missing-cookie
  error, cancellation, replay rejection and non-redirecting invalid-state fallback.
- Both deployed function bundles were read back and confirmed active.

The user completed Google account selection on the connected iPhone. Production
logs then showed start 302 at 16:48:41 UTC, callback 302 at 16:48:49 UTC, and
google-native-exchange 200 at 16:48:50 UTC. A read-only native check confirmed the
signed-in vendor main menu with no auth alert/browser/credential fields.

The device test then restarted WeddingWin without clearing storage: the native
session persisted without reauthentication. Opening the dashboard and returning
via Back to App worked. Website authentication was **not independently asserted**
by that harness's limited safe dashboard markers; this is not a full website audit.

Physical evidence is under `harness/iphone-smoke/results` in the parent workspace:
`google-error-20260907-raw.xcresult`, `google-user-completed-20260907.xcresult`,
and `google-persistence-20260907.xcresult`. No credentials were included in this report.

## References

- [Supabase HTTP routing: GET HTML is rewritten to plain text](https://supabase.com/docs/guides/functions/http-methods)
- [WebKit historical Google OAuth Lax-cookie redirect report](https://bugs.webkit.org/show_bug.cgi?id=219650)

The WebKit report is background, not proof about the current iOS release. The
observed phone error, controlled binding probes and successful physical retry
provide the task-specific evidence.
