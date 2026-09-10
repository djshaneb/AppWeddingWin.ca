# Brilliant Directories integration source

These files mirror the custom WeddingWin.ca widgets used by the native app.
They make live integration changes reviewable alongside the Expo and Supabase
code. Deploy widget changes through the Brilliant Directories API and verify the
result by fetching the widget source again after its automatic cache refresh.

| Source file | Live widget | Page / purpose |
|---|---:|---|
| `widgets/220-vendor-dashboard-menu.php` + `.css` + `.js` | 220 | Vendor account dashboard; current-roster Vendor Bingo button uses the website URL, intercepted by the app to open its native wizard |
| `widgets/258-julian-qr-code-bingo.php` | 258 | `/qr`; October 18, 2026 vendor list and scan persistence |
| `widgets/262-qr-bingo-results.php` + `.css` + `.js` | 262 | `/qr_results`; password-protected progress and member contact list |
| `widgets/296-nws-sponsor-page.html` + `.css` | 296 | `/NWS-Sponsors`; October 18, 2026 Niagara Wedding Show sponsor landing page |
| `pages/nws-sponsors-head.html` + `nws-sponsors-metadata.json` | Web Page 117 | `/NWS-Sponsors`; canonical, search, and social-sharing metadata |
| `widgets/297-jan-2026-wedding-show-vendor-landing.html` + `.css` + `.js` | 297 | `/apply-for-nws`; Niagara Wedding Show exhibitor landing page |
| `widgets/298-model-call.html` + `.css` | 298 | `/Model-Call`; October 18, 2026 Niagara Wedding Show strolling-model call |
| `pages/model-call-head.html` + `model-call-metadata.json` | Web Page 118 | `/Model-Call`; canonical, search, and social-sharing metadata |
| `widgets/326-couples-listing-search-enhanced.html` + `.css` + `.js` | 326 | Couples account dashboard; inline category-and-location vendor search matching the public homepage search |
| `widgets/328-qr-bingo-vendor-draw-dashboard.php` + `.css` + `.js` | 328 | `/qr-bingo-vendor-draw`; vendor prize settings, entry count, potential-winner selection, and verified-fulfillment controls |
| `widgets/336-qr-bingo-draw-email-sender.php` | 336 | `/qr-bingo-draw-email-send`; verifies and sends draw emails |
| `widgets/ww-qr-bingo-settings.php` | 361 | `/admin/go.php?widget=ww_qr_bingo_settings`; QR Bingo Settings in the BD admin Plugins section |
| `pages/qr-bingo-official-rules.html` | custom page content | `/qr-bingo-vendor-draw-rules`; vendor prize-draw rules and App Store sponsor-role disclosures |
| `pages/qr-bingo-free-entry.html` | custom page content | `/qr-bingo-free-entry`; retired-route notice that directs couples to the in-show QR flow and contains no entry form |
| `pages/about-terms.html` | custom page content | `/about/terms`; WeddingWin Terms of Use |
| `pages/about-privacy.html` | custom page content | `/about/privacy`; WeddingWin Privacy Policy |
| `pages/event-ticket-terms.html` | page 86 content | `/terms-of-service`; event admission and ticket terms, including free advance general admission, paid VIP, paid door admission, and the separate vendor-draw boundary |
| `forms/qr-bingo-free-entry.json` | historical form 354 definition | `qr_bingo_free_entry`; retained for migration/audit provenance only and not a current entry route |

## Live QR Bingo architecture

The published Supabase event configuration is the canonical source for the
event key, vendor tag, scan and vendor-draw switches, email mode and channels,
email subjects, rules version and URLs, eligibility region, and schedule.
Widget 258, the native couple flow, the native vendor flow, and widget 361 all
consume that same published revision instead of maintaining independent event
constants.

Widget 262 uses the same published tag, event revision, retained
`scan_history_starts_at` (including authorized early scans), and exclusive
`entry_closes_at` cutoff as the scanner. As requested on September 8, results
now require the shared page password on both HTML and JSON routes and include
names, member IDs, email addresses and phone numbers. The current event's active
Bingo contacts (including admin corrections) take precedence over BD account
details. Read-only signed calls reuse the admin contact-list endpoint; no new
database permissions or public contact API were introduced.
GitHub pushes run checks only; they do not deploy widget 262. The live widget
already has its private password setup, and no server change is needed for a
repository push. The public source reads `WW_QR_RESULTS_PASSWORD_HASH` from the
PHP worker environment and blocks access if that value is missing or malformed.
Before a future explicit CMS deployment, either configure that private setting
or preserve the deployed `ww_qrr_password_hash()` helper in memory while preparing
the payload, following the private-helper pattern in
`scripts/deploy-website-email-verification.mjs`. A publisher for widget 262 has
not yet been added. Never paste the unconfigured public template directly over
the live widget, and never commit the deployed verifier to GitHub.
A one-hour Secure/HttpOnly/SameSite=Strict cookie is signed using the existing
server-side credential.
Wrong guesses are limited to five per 15 minutes per server-observed IP.
Responses are no-store and noindex; Lock page clears access.
Totals include all participating couples; at most 500 member progress rows
are displayed, with a notice when the list is capped. Refreshes are single-flight
and time out after 15 seconds without replacing existing counts with zeroes.
Brilliant Directories does not emit widget 262's `widget_javascript` field on
this custom page, so deployment must append the mirrored `.js` file to
`widget_data` while keeping the files separate here for review and syntax
checking. The `.js` source intentionally contains no backslashes because the
widget API strips them from `widget_data`.

| Component | Live responsibility |
|---|---|
| BD widget 361 (`ww_qr_bingo_settings`) | Admin-only event settings. It loads the published revision, shows operational counts, and publishes revision-checked settings. Legacy Form 354 code is retained but not rendered, and its server actions fail closed because off-site entry is retired. |
| `bd-qr-bingo-admin` Edge Function | Serves the read-only `public_config` DTO to widget 258 and handles signed `admin_get` and `publish` requests from widget 361. Former off-site-entry reconciliation actions return HTTP 410 `offsite_entry_retired`. |
| `bd-qr-bingo-sync` Edge Function | Native couple QR roster, scan/progress, vendor-offer, and optional vendor-draw entry flow. |
| BD widget 328 | Website vendor settings and draw controls. It uses the same Edge contract as the native app, shows `entry_count`, and downloads an authenticated, audited contact CSV containing only entrants who accepted the current named-vendor draw-administration disclosure. |
| `bd-qr-bingo-vendor-sync` Edge Function | Shared website/native vendor settings, entrant-count, vendor-scoped contact export, potential-winner selection, and verified fulfillment flow. |
| `qr_bingo_event_configs` | Private, RLS-enabled immutable event revisions. Exactly one revision is published. Operational clients read it only through service-role Edge code. |
| `qr_bingo_event_config_audit` | Immutable seed/publish history, including actor, expected revision, previous revision, and the full configuration snapshot. |
| `qr_bingo_draw_email_deliveries` | Service-only, per-draw/per-channel delivery ledger used to claim and finalize vendor and couple fulfillment notices safely. |
| `qr_bingo_raffle_entry_identities` | Service-only keyed identity registry. It stores no email and prevents the same normalized email from receiving another chance for the same event/vendor, including across retained historical entry-method records. |

Widget 361 is intentionally reachable only at
`/admin/go.php?widget=ww_qr_bingo_settings`. It accepts only GET and bounded
form POST requests, requires the BD admin session and a session CSRF token, and
uses POST/Redirect/GET after a publish attempt. The Edge signing secret remains
server-side in the private BD `ww_qr_bingo_admin_credentials` table. Each Edge
request is HMAC-SHA-256 signed over its timestamp, nonce, and exact body; Edge
accepts only a short clock window and atomically consumes the nonce through
`qr_bingo_admin_nonces`. Supabase holds the matching secret in Vault rather
than in source code.

The public configuration endpoint exposes only the published operational DTO.
Both the shared Edge parser and the database restrict official-rules URLs, and
the legacy compatibility field that formerly stored an alternate-entry URL, to
HTTPS URLs on `weddingwin.ca` or `www.weddingwin.ca`. The compatibility field
does not create an entry route. The database remains authoritative for field,
schedule, and plain-text constraints even if a caller bypasses the admin form.

## Admin Bingo contact list

In widget 361, open **QR Bingo data & downloads → Contacts**. **Add contact**
searches existing active Couples accounts (BD plan `18`, active `2`); it does
not create an account. Choose the couple, enter their event-specific contact
details and admin attribution, then save. A successful add shows page 1 of
Active contacts with vendor/search filters cleared; failures preserve the form
and filters.

**Remove** and **Restore** are in the first table column and require confirmation
of the exact couple and event. Removal is recoverable through the Removed
contacts filter, not account deletion. Active, Removed, and All filters also
apply to audited CSV downloads. These operations do not change accounts,
scans, existing draw entries, consent records, or winner history, and never
accept terms or send email. Version checks prevent stale changes; request IDs
make retries idempotent. Keep the existing admin-session, CSRF, origin, signed
request, and replay protections intact.

Deployment mapping as of September 8, 2026: BD widget **361**,
`bd-qr-bingo-admin` **v15**, and
`20260908173748_qr_bingo_admin_contact_list_management.sql`. Sources are
`widgets/ww-qr-bingo-settings.php`, its `ww-qr-bingo-settings-data.js` and `.css`
companions, and `supabase/functions/_shared/qr_bingo_admin_contacts.ts` plus
`qr_bingo_admin_data.ts` (backend paths are relative to the repository root).

Regression checks from the repository root:

```sh
node --test scripts/test-qr-contact-admin-ui.mjs scripts/test-qr-admin-contact-proxy.mjs
deno test --allow-read supabase/functions/_shared/qr_bingo_admin_contacts_test.ts
```

`scripts/test-qr-admin-contact-migration.mjs` additionally rehearses the schema
and mutations in an isolated local database; set `QR_CONTACT_PGLITE` to the
installed pinned PGlite module path before running it. None of these checks
requires production contact changes.

## Configuration migrations

These forward migrations define the live administration and delivery model:

| Migration | Purpose |
|---|---|
| `20260829180000_create_qr_bingo_event_configuration.sql` | Creates immutable event revisions, the audit and nonce tables, the Vault-backed HMAC loader, and the transactional publish RPC. Seeds `niagara-wedding-show-2026` with scans and vendor draws enabled. It does not bulk-change vendor prize settings or legal-acceptance history. |
| `20260829194500_harden_qr_bingo_transactions.sql` | Requires a new rules version for material legal changes, adds atomic vendor-setting compare-and-update, and creates the token-fenced draw-email delivery ledger with claim, finalize, and operator-reconcile RPCs. |
| `20260829201500_return_qr_bingo_publish_conflicts.sql` | Converts expected publish conflicts and validation failures into a completed JSON result so the admin request can return a clean conflict without leaving an aborted transaction. |
| `20260830110000_add_qr_bingo_alternate_entry_reconciliation.sql` | Historical migration: added entry-method/source/responsibility audit fields, a Vault-keyed normalized-email identity registry, vendor responsibility acceptance, and a service-only Form 354 reconciliation RPC. Retained historical entries and schema fields remain audit provenance; the current server rejects new off-site entries. |
| `20260830140000_enable_named_vendor_contact_exports.sql` | Historical foundation: adds explicit named-vendor draw-administration scope, false-by-default marketing-consent evidence, contact-export indexes, and metadata-only report-audit fields. It predates the current combined-consent contract and does not broaden historical entries. |
| `20260901070000_enable_named_vendor_marketing_consent.sql` | Historical consent foundation for version `2026-09-01-vendor-marketing`: an explicit named-vendor draw entry includes contact sharing and that named vendor's wedding-related marketing consent; exact-vendor/event reports mark consent included; legacy entries remain excluded until fresh current-version consent. |
| `20260901072000_disable_qr_bingo_alternate_free_entry.sql` | Retires new off-site entries while preserving historical rows and RPC/schema provenance. New QR opt-ins require server-stamped `in_show_scan_verified = true` and `in_show_scan_verified_at`; the former reconciliation RPC is a compatibility tombstone and selection no longer waits on a Form 354 queue. The active in-show rules and consent contract is version `2026-09-01-in-person-entry`. |

Publishing is append-only. `publish_qr_bingo_event_config` serializes
publishers, compares `p_expected_revision` with the current published revision,
demotes the previous published row, and creates the next revision and audit
record in one transaction. A stale widget 361 form therefore receives an HTTP 409
and must reload before it can publish; it cannot silently overwrite a newer
administrator's change. Changing material event/legal fields also requires a
previously unused `rules_version`.

Vendor-specific prize terms and acceptance remain in
`qr_bingo_raffle_settings`. Their stable identity is not editable, and
`compare_and_update_qr_bingo_vendor_settings` locks the row and compares the
caller's expected `updated_at` before applying an allowlisted patch. Existing
database triggers continue to lock entered-promotion terms. Widget 328 sends
that `updated_at` value and requires a reload after an HTTP 409, so an app and
website tab cannot silently overwrite one another. It also requires the prize
description, positive approximate retail value, current rules view/acceptance,
and Apple non-sponsor acknowledgement before opening entries. Widget 258 posts
the event key and configuration revision it rendered, so a scan or progress
request fails with `stale_event_config` after an administrator publishes a
different event revision. Its optional draw flow also validates the trusted
offer DTO's RFC 3339 `vendor_offer_version` and sends that exact value on opt-in.
An HTTP 409 `stale_vendor_offer` response clears every acknowledgement, reloads
the current offer, and requires the participant to review and confirm it again.
Widget 258 has no public progress-reset action.

The seeded email mode is deliberately `disabled`. The vendor and couple
channel toggles are both retained as the intended recipients, but neither
causes an outbound message while the mode is disabled. Verified fulfillment
must be explicitly published as `production_verified_fulfillment` before a
service-role worker can claim either channel.

When enabled, Supabase creates the stable delivery key
`<draw UUID>:<channel>`, grants one time-limited claim token, and accepts a
final result only from that token's owner. A timed-out or otherwise uncertain
external result becomes `ambiguous` and is never retried automatically; an
operator must resolve it through `reconcile_qr_bingo_draw_email_delivery`.
Widget 336 keeps a second BD-side `ww_qr_bingo_email_delivery_keys` ledger and
binds each signed delivery key to the payload hash before calling the website
mail transport. Together these controls prevent concurrent or replayed app and
website requests from sending the same channel twice.

## Identifier contract

`vendor_bingo_id` and every `VENDORS[].id` value are the canonical Brilliant
Directories `users_data.user_id` converted to a string. They must never be an
array position or event-list sequence number. The matching Supabase migration
rewrites existing raffle rows from their recorded `vendor_bd_user_id` before
the updated widget/functions are deployed.

## Event contract

The current event vendor tag is 30 (`Oct 18 2026 NWS paid Vendors`). All scan,
progress, initial-state, and displayed-vendor queries must use the same tag.
Scan and progress POST actions remain limited to couple plans 4 and 18.

Completing the scan card is progress only and must never be described as
automatic prize entry. The current Official Rules govern vendor prize draws
only. No other prize workflow may reuse those rules or consent; a different or
future promotion requires separate configuration, disclosures, rules, consent,
and entry confirmation.

Before a vendor draw can open, the native app requires a prize description and
positive approximate retail value in CAD, then shows the eligible region,
entry close/draw times, odds basis, the fact that no purchase from the named
vendor is required, and the skill-testing-question condition.

Vendor draws are available only to eligible couples attending the wedding show
in person. The couple visits the participating vendor's booth, scans that
vendor's QR code while signed in, reviews the separate draw offer and current
rules, completes the eligibility and consent checks, and affirmatively chooses
whether to enter. The QR entry is the digital replacement for a paper ballot.
Scanning alone records only the booth visit and QR Bingo progress; it never
enters the couple automatically. Each eligible couple may receive only one
valid entry per named vendor draw.

The canonical admission and odds disclosure is: advance general admission is
free while the free allocation remains; VIP admission is paid; anyone without
an advance general-admission ticket must purchase admission at the door; no
purchase from the named vendor is required to enter that vendor's draw; and
paid admission never creates an extra entry or improves the odds.

For every vendor draw, the named vendor is the promotion sponsor, operator, and
prize provider and is solely responsible for lawful and accurate terms,
eligibility and winner-release decisions, the mathematical skill-testing
question, prize restrictions, taxes, claims, disputes, delivery, and fulfilment.
Wedding Win Inc. is the app developer, a limited platform sponsor of the in-app
workflow, and the technical administrator. It is not the named vendor-promotion
sponsor, operator, or prize provider and does not supply, guarantee, insure, or
fulfil the vendor's prize. It remains responsible for its own technology,
privacy, security, representations, administrative conduct, and non-waivable
duties and does not claim blanket immunity.

The public Terms, Privacy Policy, and Vendor Prize-Draw Official Rules are
required legal surfaces and must remain published, versioned, linked, and
synchronized. The `/qr` scanner and vendor dashboard are core operational
pages. `/qr_results` is a password-protected results/contact page,
not a substitute for any required legal page. `/qr-bingo-free-entry` is retained
only as a clear retired-route notice; it contains no entry form and directs
couples to the in-show QR flow.

### Historical off-site-entry provenance

Migration `20260830110000_add_qr_bingo_alternate_entry_reconciliation.sql`,
Form 354, the `alternate_free_entry` entry-method value, and related audit
fields document an earlier architecture. Under that architecture, Form 354
captured a selected vendor ID, event key, event revision, rules version, and
vendor-offer version, and the service reconciled a validated inquiry without
writing booth-visit or QR Bingo progress. Historical rows are retained for
audit, retention, and migration integrity.

That architecture is not a current way to enter. The public compatibility page
contains no form, the public offer endpoint returns that in-show attendance and
a booth QR scan are required, and both former signed admin reconciliation
actions return HTTP 410 `offsite_entry_retired`. Do not process a new Form 354
submission or describe the legacy compatibility field as an active entry URL.

There is no production reviewer/test-vendor allowlist, early-draw bypass,
outbound test email path, or multi-winner privilege. Migration `20260828162602`
creates a separate, expiring `app-review-*` event for exact couple `38971` and
private vendor `38970`. Only service-role code can read its fixture/scan rows;
the inactive-vendor exception and early draw apply only inside that event, and
outbound email is always suppressed. It never changes the Brilliant Directories
member's active/public status or exposes the listing in the production roster.

Vendor dashboards expose the entrant count, selected potential-winner record,
and an authenticated, event/vendor-scoped contact CSV. For entries accepted or
explicitly re-consented under `2026-09-01-in-person-entry`, the entrant expressly
allows the exact named vendor to receive the provided contact details for draw
administration and that vendor's wedding-related offers or promotions. The CSV
contains the entrant name, email, phone and wedding date when provided, entry
time/method, rules version, eligibility attestation, selection status, and a
marker confirming that this named-vendor marketing consent is included. It never
includes another vendor's entrants or raw member/database IDs. Legacy and
historical entries remain excluded until the entrant gives fresh consent under
the current version. Prize terms lock after the first current entry. A
percentage-off prize must identify the qualifying service or package, discount
rate, maximum dollar savings, expiry, booking requirements, exclusions, and
approximate maximum CAD value.
A random selection remains `potential` until service-role RPC
`review_qr_bingo_potential_winner` verifies both eligibility and the
skill-testing answer. Fulfillment email remains blocked until then.

Outbound potential-winner fulfillment email also fails closed unless the
published event configuration explicitly sets `email_delivery_mode` to
`production_verified_fulfillment`. The service-only claim RPC, signed payload,
and widget 336 all enforce that mode; widget 336 additionally suppresses every
`app-review-*` event even if a caller is misconfigured.

## Draw-email authentication

Widget 336 contains only an RSA public key and verifies short-lived SHA-256
signatures. Its private key is stored in Supabase Vault under
`qr_draw_email_rsa_private_key` and is available only through the service-role
RPC `get_qr_draw_email_private_key`. Never add a shared HMAC secret or private
key to this repository or to a Brilliant Directories widget.
