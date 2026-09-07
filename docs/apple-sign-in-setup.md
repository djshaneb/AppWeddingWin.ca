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

The direct bridge is used when `BD_API_KEY` and `APP_LOGIN_SECRET` are configured;
`BD_APPLE_LOGIN_URL` is not required in that configuration. Without either bridge,
Apple sign-in shows a setup-needed message instead of silently creating a
Supabase-only session that does not log into BD.

## Website agreement and account creation

The website's Apple buttons lead to `/auth/apple-start` (BD page 4300). This page
shows one unchecked agreement with links to `/about/terms` and `/about/privacy`.
These are the account policies; `/terms-of-service` is the separate event-ticket
terms page.

The form posts explicit acceptance and the displayed policy versions to
`apple-oauth-start`. The server validates the request, records the acceptance
time, and signs it into the short-lived OAuth state. After Apple verifies the
account, `apple-oauth-callback` passes that signed acceptance to the BD bridge.
New accounts retain the policy versions and acceptance time; the bridge does
not remove or bypass the new-account consent requirement.

Existing members are found before new-account creation. Apple-authenticated
sign-in does not send a separate email-verification message. Do not mistake this
for permission to reactivate a suspended account or change its membership plan.

### Preserve the website signup plan

Checkout Apple buttons must carry `signup_role` through the agreement form and
signed OAuth state (`s`). The callback maps only these named public signup
choices to the exact Brilliant Directories membership, never an arbitrary plan
ID supplied by a browser:

| Checkout | Signed signup role | BD plan |
| --- | --- | --- |
| `/checkout/17` and `/checkout/pro-members-copy-11-copy-17` | `vendor` | 17 |
| `/checkout/23` | `vendor_venue` | 23 |
| `/checkout/33` | `vendor_multi` | 33 |
| `/checkout/basic` and `/checkout/35` | `vendor_basic` | 35 |
| `/checkout/37` | `vendor_venue_multi` | 37 |
| `/checkout/niagara-wedding-show` and `/checkout/38` | `vendor_show` | 38 |
| `/checkout/10` and `/checkout/18` | `couple` | 18 |

Normal `/login` Apple sign-in omits the role and opens the existing membership.
Explicit checkout intent does not convert an existing account: a different
membership returns a friendly message linking to normal login. Unknown,
duplicate, paid, claim and administrative signup choices are not allowed to
fall back to a Couples signup. Native signup uses the separate intent described
below. Do not remove the consent, nonce, browser binding or one-use
callback protections when changing signup routing.

### Native app signup and membership routing

The app's explicit Apple and Google signup actions send `signup_role` (`vendor`
or `couple`) alongside the accepted account policies. Ordinary **Sign In**
actions omit this field: the role picker is not permission to change an
existing account. The backend must reject a signup for a different account
type before issuing a member session, including the duplicate-email race path.
It never converts an existing membership to satisfy a picker selection.

New native Vendor and Couples signups use plans 17 and 18 respectively. Website
checkout supports the additional named vendor plans in the table above; do not
replace those exact website choices with the native two-option picker.

The native menu recognizes the audited vendor membership plans, including
Niagara Wedding Show (38), Basic (35), venue (23), and multi-listing plans (33,
37). A known membership plan wins over a previously cached `account_role` so
an older app session cannot keep a vendor on the Couples menu. This controls
navigation only; vendor draw access is still checked separately by the backend.

Run `npm run test:apple-native`, `npm run test:google-login`, and
`npm run test:member-role` for isolated client regression coverage. These tests
do not create real members or complete an Apple/Google authentication. A native
build and a real-provider sign-in are separate verification steps.

### Apple account cleanup from Brilliant Directories

The existing admin **Delete Member** action is the integration point. Do not
add a browser-only reset toggle or claim the hosted BD dialog performs Apple
revocation itself. BD's `admin_members` webhook sends a `member_deleted` event
to `apple-member-deleted`; the authenticated receiver queues account cleanup
and `apple-revocation-worker` retries it. Other events from this shared webhook
are acknowledged and ignored. The admin dialog does not need another step.

Apple website and updated native sign-ins securely enroll an encrypted Apple
refresh token, bound to the verified Apple identity, exact issuing client and
BD member. Tokens are server-only: never add them to public profiles, member
metadata, frontend storage, logs, or source control. The native app sends its
one-time authorization code with a fresh nonce; the server exchanges it and
checks the returned identity before enrollment.

Older accounts have no saved revocation token. They need a fresh Apple sign-in
through an updated flow before automatic permission cleanup can work. Without
that credential the receipt is marked `no_credential`, not successful. A
previously deleted member's missing Apple token cannot be reconstructed from
an email address or `apple_sub`; manual **Stop Using Sign in with Apple** may
be needed. Do not backfill unknown grants or sweep old missing-member profiles.

Cleanup checks the exact BD member is absent, serializes sign-in and revocation
across the Apple team/subject, and acts only on the immutable deletion snapshot.
An outage is not evidence of deletion. Only Apple's HTTP 200 confirms
revocation, after which the encrypted credential is removed. Interrupted jobs
retry; an old receipt cannot capture a new account's grants.
If a future deletion receipt is missed, an Apple sign-in can also queue cleanup
for its exact, previously server-enrolled owner after a successful BD lookup
confirms that owner is gone. This is not a scan of legacy profiles. Native,
current website and legacy website Apple login endpoints share the barrier.

Enrollment coverage starts after a successful updated Apple sign-in. If an
administrator deletes an account while its first enrollment is still in
flight, sign-in fails closed and the deletion can remain `no_credential`.
Never present that overlap as confirmed permission removal or expand an old
immutable deletion job to capture a newly created account.

For newly queued deletions of server-enrolled Apple accounts, the
full-cleanup job also removes the exact linked Supabase Auth user and app
profile, authentication exchanges, push registration, and account-owned app
data. One immutable profile UUID and BD member ID are captured when the job is
created; retries never rediscover a deletion target by email. Apple sign-in and
profile rebinding remain fenced until the complete cleanup succeeds. The worker
stages hash-only chat redaction before GoTrue deletion can cascade the profile,
then reuses the app's transactional purge and shared-history protections.

Deploy the updated worker first, then
`20260906210000_complete_website_apple_account_deletion.sql`, then the receiver.
New server-authorized enqueues default to full cleanup, including recovery after
an exact enrolled member is found missing and native deletion's idempotent final
cleanup. Explicit `fullCleanup:false` remains available for permission-only jobs.
This closes the race where an older deployed sign-in handler queues before the
website receipt. This is prospective: existing permission-only jobs,
including completed deletions, are not upgraded or swept. Accounts without a
server-enrolled Apple grant still require the legacy/manual process described
above; do not report missing credentials as successful Apple revocation. This
change is Apple-account scoped, not a generic deletion sweep for all providers.

Shared message history, moderation evidence, minimal deletion receipts and
one-way deleted-identity hashes may remain. Neither this flow nor a reset of a
WeddingWin test account deletes the person's Apple Account, device Apple login,
or password-manager entry. Do not promise deletion from every system or immediate
expiry of backups.

The app's `bd-delete-account` flow verifies the member session, requests fresh
Apple confirmation when linked, revokes Apple authorization, removes the BD
member and metadata, deletes Supabase Auth, and purges the linked app profile.
Use that supported flow for a complete linked-account deletion, and verify its
success response rather than assuming every step completed. It preserves
shared data and required one-way audit records according to the purge logic.

After enrolled Apple permission cleanup completes, a new explicit signup with
current policy acceptance can create a fresh BD member. While cleanup is
pending, the same enrolled Apple identity must wait rather than rebind old
credentials to a newly created account. Apple documents that authorization
must also be revoked to show its initial name/email authorization flow again:
[Handling account deletions and revoking tokens](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).

Deployment requires the single `20260906190000_apple_permission_revocation.sql`
migration, the receiver and worker, updated Apple sign-in handlers, and a
Vault-backed authenticated webhook URL. Keep BD's webhook disabled until the
receiver is deployed and its authentication and ignored-event probes pass.
`node scripts/configure-apple-deletion-webhook.mjs inspect` prints only safe
configuration status. Its explicit `enable` action obtains the existing
connector credential and Vault secret in memory, probes the receiver, then
updates and verifies the exact staged webhook row. `disable` turns off only
that row. Never paste the credential-bearing destination into a report.

Run `npm run test:edge` and `npm run test:apple-native` for offline regressions.
The PostgreSQL fixture in `scripts/test-apple-grant-database.sql` is intended
for an enclosing rollback test before production enrollment. It does not
revoke an Apple grant or delete a member. A real-provider deletion/re-signup
test is separate and needs an explicitly chosen disposable account.
`node scripts/check-apple-deletion-live.mjs` checks the deployed receipt's
authentication, malformed-event rejection and ignored updates. It does not
create deletion jobs. Its empty-worker probe first checks that no pending jobs
exist; normal queued deletions continue to be handled by the scheduled worker.

The login bridge is widget 321 (`321-apple-login-bridge.js`). The active global
checkout bridge lives in the **Design Settings footer-code field**
(`website_footer`, textarea `#footer`). That footer also includes widget 189
(`Custom - Jonny - Review Helper Text`), which contains another copy of the
checkout bridge. Updating widget 189 alone is not sufficient: the live footer
has its own Apple IIFE following the widget include.

The file `189-checkout-apple-bridge.js` mirrors **only the shared Apple IIFE**,
not either complete container. Publish that scoped block to both the active
`website_footer` code and widget 189's `widget_javascript`, preserving all other
footer/widget scripts, including the signup risk guard, Google claim bridge,
login icon/placement fixes, and all HTML/CSS. Re-read each saved target and
verify the rendered checkout's actual Apple link carries the correct
`signup_role`; a successful widget save/cache refresh does not prove that the
active Design Settings footer changed.
Plan 28 is a dedicated listing-claim plan and is intentionally unsupported,
as are URLs or nonempty form fields containing `claim` or `claim_listing`.
Paid plans retain their regular checkout flow. The Design Settings footer
renderer strips backslashes, so its shared Apple fragment uses literal path
segments rather than escaped regular expressions. Test both serialized public
source and rendered links after a footer save.

The page mirrors are `brilliant-directories/pages/apple-sign-in.html`, `.css`,
and `.js`. Store their content in BD page 4300's `content`, `content_css`, and
`content_footer_html` fields, respectively. Remove the old immediate redirect
script. Supabase does not serve GET HTML pages, so the agreement remains on
WeddingWin.ca and the Edge Function handles only the OAuth API/redirect work.

Regression checks: `node --test scripts/test-website-apple-sign-in.mjs` and the
Apple OAuth/policy tests under `supabase/functions/_shared`.

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

The Apple-branded buttons appear on iOS and open the secure system
authentication browser directly. They do not first attempt the direct-native
credential flow. The duplicate **Use Apple in browser** links have been removed.

### Primary iOS system-browser sign-in

The main **Sign up with Apple** and **Sign in with Apple** buttons use the system
authentication browser and returns to the app; it is not a WebView password
form and does not use unsigned client email as identity proof.

- `apple-native-oauth-start` preserves explicit signup role and current
  agreement acceptance. Ordinary login carries no signup role, so an existing
  vendor stays a vendor regardless of the selected login path.
- `apple-oauth-callback` verifies Apple state, browser binding, nonce and email,
  then returns only a short-lived exchange code to
  `weddingwin://bd-apple-return`.
- `apple-native-exchange` requires the in-memory PKCE verifier, consumes the
  code once and revalidates the current Auth/profile/member/session binding.
  No session token is placed in the callback URL.
- Definitive session expiry clears the exact rejected local session and
  opens login. Temporary website/API failures do not sign the user out.

Real-provider testing on September 6, 2026 passed fresh vendor signup and
returning login through this browser flow, plus website signup and exact
website-triggered deletion cleanup. Direct native Apple authentication still
returned missing-email responses in the investigated case; the browser flow
is the verified working path, not evidence that Apple's native claim delivery
has been corrected. The unbound direct-native handler remains only as a
controlled diagnostic target. Test the newly wired main buttons on the current
simulator build separately before treating that UI change as verified.

Checks: `npm run test:apple-native`, `npm run test:session-expiry`,
`npm run test:edge`, and `npm run typecheck`. Test account deletion through the
website separately from offline fixtures, and verify the exact cleanup job.
