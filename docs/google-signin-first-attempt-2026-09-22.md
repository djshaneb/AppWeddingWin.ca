# Google sign-in first-attempt investigation

## Status

The app is reinstalled and the user is signed in. Google start v17 / callback v27 are active; a fresh-cookie signup and repeat ordinary login passed at 19:11–19:12 UTC. The earlier v26 mitigation was incomplete: binding_missing recurred after reinstallation at 18:56 UTC. Callback v27 adds a bounded recovery path, but neither latest successful physical attempt needed that path (callback_check=0), so its effectiveness against the intermittent cookie loss is not yet established. CMS and App Store configuration remain unchanged.

- Released baseline: `20cde6c09195f2f8d19c7e9d816dde156593c9cb`, App Store build 8.
- Isolated branch: `codex/fix-google-signin-first-attempt`.
- Release checkout remains on `codex/app-store-preparation`, clean.
- Existing native Google suite: 33/33 passed on September 22. Browser and HTTP dependencies are mocked; this does not reproduce a physical first-attempt failure.

## Reported symptom

The first Google attempt fails and a second attempt succeeds. Exact supplied message:

> Google sign-in failed. Your Google sign-in was interrupted or expired. Please close this window and tap Sign in with Google again.

The original report was followed by an ordinary couple-login test on a physical iPhone. The requested Google identity was not yet a WeddingWin member; that exposed a separate post-authentication error described below.

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

## Google browser-cookie change

- When no valid Google browser cookie exists, set the existing secure HttpOnly cookie and make one same-origin request to confirm that the browser returns it before creating an OAuth attempt or navigating to Google.
- Bind the continuation to the cookie hash and original query with a signed, purpose-specific marker expiring after 60 seconds. No raw cookie is placed in the URL. Invalid, changed, expired, duplicated, or cookie-less continuations stop without another redirect or cookie rotation.
- Keep the existing-cookie path, signed OAuth state, consent, native PKCE, nonce verification, atomic attempt redemption, and existing native callback behavior.
- Add fixed callback failure reasons to distinguish missing cookie, rejected attempt, validation unavailable, and missing authorization code. Do not log inputs or exception messages.

The additional round trip proves initial cookie storage and return. It cannot by itself prove delivery through the later Google → WeddingWin → Supabase redirect chain. The physical fresh-cookie check below passed through that complete chain. This is evidence for the tested device and account, not a guarantee about every Safari configuration.

## Validation

- 90 targeted Deno tests passed with zero failures: fresh-cookie confirmation and bounded failure, Google native login/signup and callback diagnostics, browser binding, safe errors, Apple web/native compatibility, and signed state.
- Both modified Google handlers passed `deno check`.
- `git diff --check` passed.
- Released checkout rechecked: clean on `codex/app-store-preparation` at `20cde6c09195f2f8d19c7e9d816dde156593c9cb`.
- Existing native Google UI suite previously passed 33/33 against the unchanged app source. No new native code or build-number change is included.
- Physical fresh-cookie and repeat login verification passed. The mocked unit tests alone do not certify Safari behavior; the device result and server logs provide the end-to-end evidence.
- After correcting the existing stale assertion, the complete local Deno backend suite passed 1,071/1,071.
- Initial GitHub CI passed 1,070 Deno cases and failed one obsolete account-deletion source assertion, reproduced on the untouched released baseline. Only that test was corrected to check the existing storage reread and identity/generation guard; app deletion behavior is unchanged. Its focused suite passed 3/3.

## Physical iPhone investigation (September 22)

- Connected to Shane's iPhone 16 Pro, iOS 26.7, and launched the existing `ca.weddingwin.app` without replacing it.
- The user's latest 17:21:42 start inserted an attempt; the 17:21:46 callback included Google's code but again made no redemption RPC. Production remains start v16 / callback v25.
- A separate manual-redirect server probe at 17:26:20 confirmed that the start endpoint actually returns the browser-binding cookie with Secure, HttpOnly, Path=/, Max-Age=600 and SameSite=None. It did not follow the Google redirect or authenticate an account.
- The first UI inspection timed out while enabling automation. After the user accepted the iPhone automation prompt, inspection passed. This is a test-control issue, separate from the sign-in failure.
- Using a standalone XCTest helper outside the app repository, opened the observed couple login action, Google button and Apple's normal sign-in confirmation. Google's account chooser displayed correctly.
- The user selected a different Google identity after the first chooser reached a password screen. No password was read or entered by the helper.
- At 17:34:40–45 UTC, ordinary couple login authenticated with Google, redeemed the browser-bound attempt (HTTP 200), then returned a native error requiring explicit Terms/Privacy acceptance. A read-only exact-email membership lookup returned success with zero members. The callback had attempted member creation even though the action was ordinary login without signup consent.
- The user authorized creating a couple account and explicitly accepted the Terms/Privacy step. At approximately 17:46 UTC, the existing production signup flow completed and the device showed the signed-in account dashboard. This confirms signup using that identity, not the undeployed cookie candidate. The notification-permission prompt remained open.
- Private device logs/screenshots and the standalone helper are under the sibling `google-signin-diagnostics-sept22` directory. Do not include these private artifacts in a public PR or app package.

## Missing-member login correction

- Ordinary Google login with no WeddingWin member and no signup consent now returns: “No WeddingWin account uses this Google email yet. Please create an account, then sign in with Google.”
- An unsuccessful, malformed, or inconsistent directory lookup stops with a fixed temporary message. It cannot be mistaken for a missing member and cannot trigger member or session creation.
- Existing-member login, valid-consent legacy signup, explicit signup roles, and policy-consent requirements remain intact.
- Regression cases cover real no-consent ordinary login, missing members, directory HTTP/API/network/shape errors and full-member mismatches.
- Independent review found no material actionable issues.

## Access

Dashboard logs and source downloads were used first. Supabase MCP became available after session recovery and read-only access to the correct project was verified. Immediately before deployment, start v16 and callback v25 were fetched again and exactly matched the rollback copies. Deployment replaced only each Google handler and its oauth_attempt dependency, preserving all other deployed files. No authentication tokens were extracted.

## Deployment and live checks (September 22, UTC)

- User approval received before live deployment.
- At approximately 17:50 UTC, callback v26 was deployed first, followed by start v17. Both report ACTIVE. JWT gateway settings remain unchanged; signed OAuth state and browser binding remain required by the handlers.
- Round-trip source reads matched every deployed file against the prepared payload; eight unrelated callback dependencies were preserved exactly.
- Live endpoint checks passed for: fresh-cookie same-origin confirmation; missing-cookie bounded failure without another redirect or cookie rotation; tampered-query rejection; confirmed-cookie navigation to Google; and the unchanged existing-cookie fast path. These checks stopped before Google and did not create member accounts.
- Rollback bundles and exact deployed payloads are saved privately in the sibling diagnostics directory. They contain function source, not environment credentials.
- Before physical verification, the previous browser cookie expired naturally (600 seconds); no Safari data was cleared. The user-authorized couple account was used for ordinary login.

## Physical verification after deployment

- **Fresh login, 17:57:02–09 UTC:** the first start request reached v17 without a continuation marker; a second request had `cookie_check=1`. The browser-bound attempt was then created and redeemed (HTTP 200), callback v26 returned to the app, and native exchange v7 returned HTTP 200. The iPhone showed its signed-in dashboard with no error or manual retry.
- **Repeat login, 17:57:50–55 UTC:** after signing out, the existing-cookie start used the direct path (`cookie_check=0`, no confirmation request). Attempt redemption and native exchange both returned HTTP 200. The dashboard opened again without an error.
- Both standalone XCTest checks explicitly asserted the signed-in dashboard and absence of an app error alert, rather than treating successful tapping as login success. The final screen was visually inspected.
- The device is left signed in to the user-authorized couple account. Its existing notification prompt was allowed under the user's prior notification-testing authorization.
- No app source, build number, App Store listing, CMS bridge or unrelated deployed helper was changed. The separate GitHub fix branch contains the backend changes and test evidence; the released checkout remains clean.

## Documentation reviewed

- https://supabase.com/changelog.md
- https://supabase.com/docs/guides/monitoring-and-debugging
- https://supabase.com/docs/guides/observability/advanced-log-filtering
- https://supabase.com/docs/guides/functions/http-methods

The log API uses ClickHouse `logs`, explicit bounds of 24 hours or less, and selected fields. The older `logs.all` endpoint is scheduled for removal September 23. Supabase GET `text/html` responses are rewritten to plain text, so a proposed HTML interstitial on that endpoint is not a valid fix.

## Reinstallation recurrence, September 22

- The user restarted the iPhone after a separate App Store download-service failure. Re-Download then completed and the app launched; no new app build was used.
- At 18:56:31–36 UTC, the first Google login ran start v17 with cookie_check=0 followed by cookie_check=1 and an attempt insertion. Callback v26 included the authorization code but made no redemption RPC; its fixed diagnostic reason was binding_missing. The device showed the original interrupted-or-expired alert. This disproves a complete fix from start-side cookie confirmation alone.
- A second login at approximately 19:01 UTC returned the no-WeddingWin-account message after Google authentication. The user confirmed they had used Delete account inside the app before reinstalling. That missing-account result is expected and distinct from browser-cookie loss. No replacement account has been created.
- Standalone device artifacts iphone-reinstall-21.xcresult and iphone-reinstall-23.xcresult retain the two different failures privately.

## Callback recovery candidate

A narrowly scoped candidate adds one signed same-origin callback continuation after valid OAuth state when the browser-binding cookie is missing. The marker binds the original query, has a separate purpose and expires within 60 seconds or the original state expiry, whichever comes first. The destination is the configured backend callback, never the incoming Host. The response sets no cookie and creates no attempt. A second missing cookie or an invalid marker fails closed; a returning cookie must still pass the original browser-bound atomic redemption, Google verification and native PKCE.

- Focused checks: 98 passed.
- Complete backend suite: 1,079 passed, zero failed.
- Exact candidate deployment bundle passed type checking; nine unrelated deployed dependencies are preserved byte-for-byte.
- Pending physical confirmation. A self-redirect may inherit Safari cookie blocking, so this candidate is not yet described as a verified fix.

### Candidate deployment

At 19:06 UTC, callback v27 was deployed after an independent security review found no blocking issue. A fresh preflight read verified callback v26 still matched the rollback bundle. Only the callback entrypoint changed and the new recovery helper was added; nine other deployed dependencies remain identical. Post-deploy source reads matched all eleven files exactly. Start remains v17 and the app/CMS are unchanged. Physical fresh-cookie verification is still pending; do not describe this candidate as proven.

### Physical result and remaining limit

- After the user explicitly approved accepting Terms/Privacy and replacing the deleted couple account, signup ran at 19:11:43–50 UTC. The previous binding had expired naturally. Start v17 used cookie_check=1; callback v27 redeemed the attempt and native exchange v7 returned HTTP 200. The device reached the signed-in dashboard on the first attempt.
- After allowing the existing notification prompt under prior authorization, a sign-out and ordinary Google login at 19:12:39–44 UTC also returned native exchange HTTP 200 and the dashboard. Both XCTest checks assert the signed-in name, sign-out control and absence of an app error; the final screen was visually verified.
- The device is left signed in to the newly authorized replacement account. Deleted account data is not restored.
- Both successful callbacks had callback_check=0. The physical phone did not exercise v27's new missing-cookie continuation. These passes confirm current access and no observed regression; they do not prove the intermittent first-attempt problem permanently resolved.
- If binding_missing recurs, correlate the new continuation flag and fixed reason before changing anything. A possible next bounded experiment is a nonempty HTTP 200 text/plain response with Refresh pointing to the same signed fixed-origin continuation, because WebKit processes Refresh after document commit. This is not implemented or device-verified. Primary sources: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/FrameLoader.cpp ; https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/NavigationScheduler.cpp ; https://webkit.org/tracking-prevention/ .
