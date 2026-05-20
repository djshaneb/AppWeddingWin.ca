# Sign in with Apple Setup

This repo now has the code paths for shared Apple login across:

- Native iOS app: `expo-apple-authentication`
- Browser/web: Supabase Edge Functions `apple-oauth-start` and `apple-oauth-callback`
- Shared identity mapping: `profiles.apple_sub`
- Brilliant Directories handoff: a configurable BD Apple login bridge that returns
  the same `/login/fromsignup/{token}` URL the Google login uses

## Apple Developer Values Needed

Create/configure these in Apple Developer:

1. App ID
   - Bundle ID: `ca.weddingwin.app`
   - Enable **Sign in with Apple**

2. Services ID
   - Suggested ID: `ca.weddingwin.web`
   - Enable **Sign in with Apple**
   - Domain: `www.weddingwin.ca`
   - Return URL:
     `https://www.weddingwin.ca/auth/apple-callback`

3. Sign in with Apple private key
   - Save the Key ID
   - Save the Team ID
   - Save the `.p8` private key contents

## Supabase Apple Secrets

Set these as Supabase Edge Function secrets. The functions also still support
the older `admin_config` rows as a fallback.

```text
APPLE_SERVICE_ID      = ca.weddingwin.web
APPLE_IOS_BUNDLE_ID   = ca.weddingwin.app
APPLE_TEAM_ID         = <Apple Team ID>
APPLE_KEY_ID          = <Apple Sign in with Apple Key ID>
APPLE_PRIVATE_KEY     = <contents of AuthKey_XXXX.p8, with newlines escaped as \n>
APPLE_RETURN_URL      = https://www.weddingwin.ca/auth/apple-callback
```

## Brilliant Directories Bridge

Apple can verify the person, but WeddingWin still needs a BD member session.
When `BD_API_KEY` and `APP_LOGIN_SECRET` are configured, the edge functions
directly find or create the BD member by email and return the same `/app-login`
handoff used by native email login.

```text
BD_API_KEY                    = <BD API key>
APP_LOGIN_SECRET              = <shared HMAC secret used by the BD app-login widget>
BD_DEFAULT_SUBSCRIPTION_ID    = 18
```

Optionally, `BD_APPLE_LOGIN_URL` can point to a custom BD endpoint instead.
That endpoint should accept JSON:

```json
{
  "provider": "apple",
  "apple_sub": "Apple stable subject",
  "email": "member@example.com",
  "full_name": "Member Name",
  "final_redirect": "https://www.weddingwin.ca/"
}
```

It should return one of:

```json
{ "token": "BD_FROM_SIGNUP_TOKEN" }
```

or:

```json
{ "login_url": "https://www.weddingwin.ca/login/fromsignup/BD_FROM_SIGNUP_TOKEN" }
```

Until `BD_APPLE_LOGIN_URL` is configured, Apple sign-in will show a setup-needed
message instead of creating a Supabase-only session that does not log into BD.

## Edge Functions Added

- `apple-native-login`
  - Accepts native iOS Apple identity token.
  - Verifies token against Apple.
  - Links/creates Supabase user for identity mapping.
  - Stores `profiles.apple_sub`.
  - Calls the BD Apple login bridge and returns the BD login URL.

- `apple-oauth-start`
  - Starts browser Sign in with Apple.
  - Sends Apple to the verified WeddingWin.ca callback URL first. Apple rejects
    `supabase.co` as a web redirect domain for this Services ID, so the BD
    callback page forwards the POST body to Supabase.

- `apple-oauth-callback`
  - Handles Apple browser callback.
  - Verifies Apple token.
  - Links/creates the same Supabase user via `apple_sub`.
  - Redirects through the BD Apple login bridge.

## App Behavior

The native Apple button appears on iOS. If Apple config is missing on Supabase,
or the BD login bridge is not configured yet, the app shows a setup-needed alert
instead of failing silently.
