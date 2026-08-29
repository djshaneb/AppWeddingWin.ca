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

## Private Email Relay Delivery

WeddingWin accepts the Apple-provided email address as the member's contact
address, including addresses ending in `@privaterelay.appleid.com`. App access
must never depend on replacing that address with a personal email. Vendor-contact,
account, and other app email should be sent to the relay address Apple supplied.

Before enabling production Sign in with Apple:

1. In Apple Developer → Certificates, Identifiers & Profiles → Services, choose
   **Sign in with Apple for Email Communication** and register every outbound
   email domain, subdomain, or individual sender used by WeddingWin and its
   email providers.
2. Make each registered domain pass SPF validation. Configure DKIM as well;
   Apple recommends both, and DKIM is required when an email provider's domain
   is used as the envelope sender.
3. Verify the envelope sender, `From` domain, DKIM domain, bounce handling, and
   every transactional/vendor-contact sender. Unregistered sources can bounce
   instead of reaching the Apple relay address.
4. Route required vendor-contact email through a registered WeddingWin-controlled
   sender or mail provider. A participating vendor's unregistered domain cannot
   be assumed to reach the relay; use in-app messaging or a WeddingWin mail
   relay rather than requiring the user to disclose a personal address.
5. On the physical TestFlight build, create a disposable account with **Hide My
   Email**, confirm app access without entering a personal address, and prove
   delivery of each required email category through the relay.
6. If a user disables Apple's forwarding, explain how to re-enable it or choose
   another contact address, but do not block app access or demand a personal
   email.

Apple setup reference: [Configure private email relay service](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service)

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
