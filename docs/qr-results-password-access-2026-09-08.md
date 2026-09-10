# Password-protected QR results — September 8, 2026

At the user's explicit request, `/qr_results` now requires the chosen shared
password rather than a BD administrator login. This supersedes the previous
public anonymous scoreboard design. The short password remains guessable;
the user was advised of that limitation. Do not describe an unlisted URL or
noindex as a security control, or describe a shared password as admin identity.

## Implementation

September 10 clarification: the existing live password setup needs no action
after a GitHub push. GitHub runs checks and does not publish widget 262. The
environment lookup below belongs to the sanitized public source. For a future
explicit CMS deployment, preserve the deployed private password helper in memory
using the existing email-verification publisher pattern, or configure the PHP
worker variable before publishing. No widget-262 publisher currently implements
that preservation step. The live helper was confirmed still present on September
10; the environment-based public template was not deployed.

- Both HTML and JSON require a signed, one-hour Secure/HttpOnly/SameSite=Strict
  cookie scoped to `/qr_results`. Cookie signatures are bound to the password
  verifier and use the existing server-side BD credential, never a browser key.
- Repository source reads the bcrypt verifier from the private PHP worker
  environment variable `WW_QR_RESULTS_PASSWORD_HASH`. No password verifier,
  plaintext password, or server signing credential is included in this source.
  Missing or malformed configuration blocks existing cookies and password unlock.
- Five failed password attempts per 15 minutes per server-observed IP, using a
  locked server-side temporary-file counter. Missing storage fails closed.
- Same-origin POST checks, no-store/noindex/nofollow/noarchive headers,
  no-referrer, and frame denial. These are supplementary protections.
- AJAX login avoids the observed browser failure during form-POST navigation.
  Cookie issuance uses compatible headers rather than PHP's newer options-array
  API, which the live BD host did not accept.
- Lock page removes the access cookie. Expired requests clear displayed rows.
  Page-exit/back-cache handling clears the private table and reloads on restore.
- Name, membership ID, email, phone, progress and status columns. Name/ID/email/
  phone search. Text-only DOM rendering and wrapping contact cells on mobile.
- Prefer the current event's active Bingo contact list (including admin
  corrections); use BD account details only where no active Bingo contact exists.
  The existing signed, read-only admin `data_list` contact endpoint is reused;
  no Edge deployment, database permission expansion, or public contact endpoint
  was added. Matching scanner member IDs are enforced server-side. Pagination
  is bounded to 5,000 examined contacts and a short time budget; service failure
  fails the results request instead of silently presenting stale account data.
- Existing inclusive early-scan floor, exclusive closing boundary, accurate
  aggregate counts and 500 displayed-row cap remain intact.

## Source publication update — September 10, 2026

Before deploying this repository version, configure `WW_QR_RESULTS_PASSWORD_HASH`
in the PHP worker's server environment with the intended bcrypt verifier. Keep
that configuration outside public repository files and browser responses. The
widget accepts bcrypt `$2a$`, `$2b$`, or `$2y$` form with a valid cost from 04 to 31;
it fails closed until a valid verifier is configured. Replacing the verifier
also invalidates previously issued access-cookie signatures.

This is a source-only preparation for GitHub publication. The currently deployed
widget and live server configuration were not changed. The original widget was
retained only in an ignored local backup with restrictive file permissions.
Offline tests now generate a synthetic verifier and cover configured, missing,
and malformed environments, existing-cookie rejection, and blocked unlock.
All 25 targeted PHP/SQL and JavaScript refresh tests pass for this source version.

## Historical live verification — September 8, 2026

- 23 targeted PHP/SQL and JavaScript tests pass. These include unauthenticated,
  expired, tampered and cross-origin access; secure cookie issuance/clearing;
  password rate limiting; contact overrides; service-failure handling; date
  boundaries; counting; search; rapid refresh; and timeout recovery.
- Live unauthenticated GET shows only the password form and no results root.
  Direct unauthenticated results POST returns HTTP 401 with no contact fields.
- Successful live login issues the protected cookie and loads the list.
  Stored Bingo phone numbers are present; a member without saved contact phone
  data correctly shows a dash rather than a fabricated number.
- Chrome and Codex in-app browser login worked. Chrome 390px layout had no
  horizontal/cell overflow. Membership-ID filtering worked. Lock page removed
  the private table and returned to the password form. Wrong-password handling
  kept the page locked with an inline error.
- Published only BD widget 262's source/CSS. Full source readback was verified
  and cache refresh succeeded. All existing unrelated repo edits were preserved.
- No couple account/contact/scan/draw records were changed and no email sent.
  No app rebuild or GitHub push was performed.

Run targeted tests with:

```
QR_PHP_WASM_ROOT=/Users/shane/.npm/_npx/98db5c2db358871c/node_modules/@php-wasm node --test scripts/test-qr-bingo-results.mjs scripts/test-qr-bingo-results-refresh.mjs
```

The broad legacy widget source checker has unrelated stale widget-258 assertions
and is not represented as passing.
