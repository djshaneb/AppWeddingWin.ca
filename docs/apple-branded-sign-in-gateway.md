# Branded Apple app sign-in gateway

Verification checkpoint: September 6, 2026. This note records the scoped website
deployment and simulator verification; it is not an App Store release record.

## Purpose and flow

iOS displays the initial authentication website's domain in its system consent
prompt. The app now begins Apple browser sign-in at:

`https://www.weddingwin.ca/app-apple-sign-in`

The native return URL, PKCE challenge and any explicit signup consent travel in
the URL fragment, not the website request query. The first-party gateway validates
them, removes the fragment from its history entry, and navigates the browser to
the existing `apple-native-oauth-start` endpoint. That normal browser visit still
creates the backend's OAuth-binding cookie before Apple authorization begins.

The gateway does not create consent, add an agreement checkbox, prefetch an Apple
authorization URL, or store credentials. Backend policy freshness, signed state,
browser binding, account-role handling, and one-time PKCE exchange remain
authoritative and unchanged. Google sign-in is unchanged.

## Source and deployed records

- `app/(tabs)/index.tsx`: only `buildNativeAppleStartUrl` changes the Apple start
  location and fragment transport.
- `brilliant-directories/pages/app-apple-sign-in.html`: branded loading and fixed
  friendly error state.
- `brilliant-directories/pages/app-apple-sign-in.css`: scoped first-party styling.
- `brilliant-directories/pages/app-apple-sign-in.js`: wrapped widget JavaScript;
  strict validation, one-start guard, fragment cleanup and fixed navigation.
- `brilliant-directories/pages/app-apple-sign-in-head.html`: `noindex, nofollow,
  noarchive` and `no-referrer` metadata.
- `scripts/test-app-apple-sign-in-gateway.mjs`: 14 offline gateway and real-app
  builder integration tests.
- `scripts/test-native-apple-browser-login.mjs`: existing native flow tests with
  branded URL/fragment expectations.
- `package.json`: gateway suite is included in `verify`; Deno test commands use
  `--node-modules-dir=none` so clean CI resolves its pinned npm dependencies
  independently of the app's installed Node modules.

Brilliant Directories records:

- Widget **380**: WeddingWin App Apple Sign In Gateway.
- SEO page **4342**: exact path `/app-apple-sign-in`, with its header and footer
  hidden for the focused authentication handoff.
- [Edit the gateway page in the website admin](https://ww2.managemydirectory.com/admin/contentManage.php?template_type=&faction=edittemplate&seo_id=4342&newsite=29637).

No other website sign-in route or backend endpoint was replaced.

## Verified at this checkpoint

- Published widget HTML, CSS and JavaScript and page head were reread from the CMS
  and matched the local source after normalizing the CMS's terminal newline.
- The public exact path loaded, with `no-referrer` metadata present. Desktop and
  390px Chrome checks showed no horizontal overflow and a readable error state
  when no app sign-in fragment was supplied.
- A Release simulator build succeeded. The actual iOS system prompt displayed
  **“www.weddingwin.ca”** instead of the Supabase project hostname.
- `npm run verify` completed with exit code 0, including the 14-test gateway
  suite. The clean Deno dependency probe passed all **590** Deno tests.
- Focused offline coverage includes login, vendor and couple signup, unchanged
  consent values, duplicate/malformed/credential-bearing input, open redirects,
  history cleanup failures, repeated initialization, and fixed error messages.

- A complete ordinary Apple login passed through the published gateway in the
  simulator: Continue opened Apple, the approved test account authenticated, and
  the app returned to the correct signed-in vendor menu. Its password was pasted
  from the approved Keychain helper without displaying or logging it.

- The same Release update built successfully for iOS and was installed on the
  connected physical iPhone. Automatic launch was denied because the phone was
  locked; unlock it and open WeddingWin manually. No physical-phone Apple ID was
  used.

This checkpoint does not claim a new signup/deletion lifecycle test or a
physical-device Apple login.

No GitHub push or App Store/TestFlight publication is recorded by this note.

## Scoped rollback

1. Restore only `buildNativeAppleStartUrl` to its prior behavior: browser start at
   the existing backend `/functions/v1/apple-native-oauth-start` endpoint, with
   the same validated native return, PKCE and explicit consent in its query.
   Keep the current exchange, callback validation, and Google code unchanged.
2. Build and distribute/test that app rollback before disabling the gateway; an
   installed app that still uses the new URL needs the gateway to remain live.
3. When no active app version depends on it, disable only SEO page **4342** and
   its newly added widget **380** if required. Do not disable the existing
   website `/auth/apple-start` route, revoke Apple access, change provider callback
   registration, or delete accounts as part of this rollback.

Prefer disabling the newly added page over deleting the CMS records, so the
published source can be recovered. This note contains no passwords, tokens,
authorization links, or account identifiers.
