# Verified contact email: website deployment

The QR Bingo contact gate requires a non-Apple-relay contact address. Apple login
identity stays connected. An email-change request keeps the old email until the
new address is confirmed. Pending and expired requests continue to block QR Bingo
and message sending; expiration does not clear the requirement.

## CMS files

- Widget 320 (`/verify-email-change`): `320-email-change-verification.php`, `.js`, `.css`.
- Widget 329 (`/verify-email-change-app`): `329-app-email-change-verification.php`, `.js`, `.css`.
- Widget 258 (`/qr`): `258-julian-qr-code-bingo.php`.
- Add `pages/email-verification-head.html` to both verification pages' head configuration.

HTML confirmation pages use `Referrer-Policy: strict-origin` in the response and
meta/head configuration. This removes all paths and tokens from referrers while
preserving the same-origin `Origin` header for normal form POSTs. Do not switch
these HTML pages to `no-referrer`: browsers then serialize non-CORS POST Origin
as `null`, which the unchanged first-party CSRF check correctly rejects. JSON
status responses can still use `no-referrer` because they do not host forms.

The standalone PHP widgets embed `email-verification-core.php` unchanged. Widgets
320/329 also embed `email-verification-page.php`. Their repository copies contain
an intentionally empty `ww_aecv_secrets()` function. Publishing requires secure
substitution of the current private signing configuration; never commit it.
The same signing secret must match the backend `APP_EMAIL_CHANGE_SECRET`.

`scripts/deploy-website-email-verification.mjs` defaults to read-only `inspect`.
Its explicitly authorized `deploy` mode reads the private CMS function only in
memory, preserves concurrent unrelated changes, verifies round-trips, and rejects
unsigned probe requests without sending mail. Never print its raw MCP payloads.

`scripts/rotate-contact-email-signing-secret.mjs` defaults to read-only `inspect`.
An authorized `rotate` temporarily overlaps old/new CMS keys, updates the single
backend secret through a mode0600 FIFO inside a mode0700 temporary directory, then
removes every old key after verification. FIFO data is held only in kernel memory;
the pipe is removed in cleanup. `resume` continues a partially completed overlap
using the existing first CMS key, not a newly generated key. Do not blindly rerun
a rotation after failure. Inspect the saved state and reported phase first.

Provision `sql/email-verification-state.sql` once through authenticated database
administration, before publishing dependent widgets. Do not expose this table as
an editable BD/API resource. The widgets do not provision tables. Missing private
state storage fails closed. Legacy pending metadata can only require a fresh link;
it is never accepted as ownership proof.

The separate website chat guards and private-message database triggers must also
be deployed to enforce the message gate outside the normal composer UI. Audit
other generic profile/admin email-edit routes separately; this dedicated pipeline
does not itself intercept unrelated writes to `users_data.email`.

## Server contracts

- Existing `request_app`: HMAC over `memberId|lowercaseEmail|expires`, up to 600 seconds.
- New `status_app`: HMAC over `status_app|memberId|expires`, up to 300 seconds.
- Post-confirmation callback: JSON POST to `bd-sync-confirmed-profile-email`, HMAC
  over `sync_verified_email|memberId|expires`, up to 300 seconds. It syncs only the
  already linked app profile and Auth identity, not a new account.

Status reads never acquire the PHP mutation lock. Confirmation commits proof and
releases the lock before calling the backend, which reads that same status. One
global named mutation lock serializes competing members and target addresses.
Only SHA-256 token hashes are stored. GET links render a confirmation form; only
first-party POST consumes a valid, current, single-use token.

Account-deletion cleanup should remove this member's private verification row
alongside the account. Do not clear a pending row as a workaround to verification.

## Offline tests

Run `node --test scripts/test-website-email-verification.mjs` for embedded-source
integrity and browser form/rapid-tap tests. The PHP integration harness executes
the actual shared core with only MySQL and email transport mocked:

```sh
php scripts/test-website-email-verification.php brilliant-directories/widgets/email-verification-core.php
```

When PHP is unavailable, the pinned official `@php-wasm/cli@3.1.52` can be installed
in a temporary directory outside the repository and invoked with the same script
arguments. Lint all published PHP widgets with `-l` before deployment. Offline
tests do not prove actual email delivery or live database-trigger behavior; test
those separately using an approved account and recipient.

For the form-origin browser regression, install pinned `playwright-core@1.63.0`
in a temporary directory outside the repo, then run:

```sh
node scripts/test-email-referrer-policy-browser.mjs /absolute/path/to/node_modules/playwright-core
```

It launches installed Chrome headlessly with an isolated profile and localhost
fixture only. It reproduces the old `Origin: null` failure, verifies the fixed
same-origin POST header, and checks that no token/path appears in the referrer.
