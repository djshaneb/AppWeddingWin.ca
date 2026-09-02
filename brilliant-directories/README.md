# Brilliant Directories integration source

These files mirror the custom WeddingWin.ca widgets used by the native app.
They make live integration changes reviewable alongside the Expo and Supabase
code. Deploy widget changes through the Brilliant Directories API and verify the
result by fetching the widget source again after its automatic cache refresh.

| Source file | Live widget | Page / purpose |
|---|---:|---|
| `widgets/258-julian-qr-code-bingo.php` | 258 | `/qr`; October 18, 2026 vendor list and scan persistence |
| `widgets/262-qr-bingo-results.php` + `.css` + `.js` | 262 | `/qr_results`; anonymized current-event progress scoreboard |
| `widgets/328-qr-bingo-vendor-draw-dashboard.php` + `.css` + `.js` | 328 | `/qr-bingo-vendor-draw`; vendor prize settings, entry count, potential-winner selection, and verified-fulfillment controls |
| `widgets/336-qr-bingo-draw-email-sender.php` | 336 | `/qr-bingo-draw-email-send`; verifies and sends draw emails |
| `widgets/ww-qr-bingo-settings.php` | 361 | `/admin/go.php?widget=ww_qr_bingo_settings`; QR Bingo Settings in the BD admin Plugins section |
| `pages/qr-bingo-official-rules.html` | custom page content | `/qr-bingo-vendor-draw-rules`; vendor prize-draw rules and App Store sponsor-role disclosures |
| `pages/qr-bingo-free-entry.html` | custom page content | `/qr-bingo-free-entry`; public no-purchase/no-attendance/no-scan entry route |
| `pages/about-terms.html` | custom page content | `/about/terms`; WeddingWin Terms of Use |
| `pages/about-privacy.html` | custom page content | `/about/privacy`; WeddingWin Privacy Policy |
| `pages/event-ticket-terms.html` | page 86 content | `/terms-of-service`; event admission and ticket terms, including free advance general admission, paid VIP, paid door admission, and the separate vendor-draw boundary |
| `forms/qr-bingo-free-entry.json` | form 354 | `qr_bingo_free_entry`; stores alternate entry requests in the BD forms inbox and emails operations |

## Live QR Bingo architecture

The published Supabase event configuration is the canonical source for the
event key, vendor tag, scan and vendor-draw switches, email mode and channels,
email subjects, rules version and URLs, eligibility region, and schedule.
Widget 258, the native couple flow, the native vendor flow, and widget 361 all
consume that same published revision instead of maintaining independent event
constants.

Widget 262 uses the same published tag, event revision, and history cutoff for
the public results page. It exposes only temporary participant numbers that are
freshly reshuffled for each response, current-event booth counts, and status. It
never returns member names, emails, companies, phone numbers, or raw
member/vendor IDs.
Brilliant Directories does not emit widget 262's `widget_javascript` field on
this custom page, so deployment must append the mirrored `.js` file to
`widget_data` while keeping the files separate here for review and syntax
checking. The `.js` source intentionally contains no backslashes because the
widget API strips them from `widget_data`.

| Component | Live responsibility |
|---|---|
| BD widget 361 (`ww_qr_bingo_settings`) | Admin-only settings and Form 354 operations form. It loads the published revision, shows operational counts, publishes revision-checked settings, and reconciles a validated alternate-entry inquiry using its separately recorded event revision, exact vendor offer version, and immutable vendor ID. |
| `bd-qr-bingo-admin` Edge Function | Serves the read-only `public_config` DTO to widget 258 and handles signed `admin_get`, `publish`, and alternate-entry reconciliation requests from widget 361. |
| `bd-qr-bingo-sync` Edge Function | Native couple QR roster, scan/progress, vendor-offer, and optional vendor-draw entry flow. |
| BD widget 328 | Website vendor settings and draw controls. It uses the same Edge contract as the native app, shows `entry_count`, and downloads an authenticated, audited contact CSV containing only entrants who accepted the current named-vendor draw-administration disclosure. |
| `bd-qr-bingo-vendor-sync` Edge Function | Shared website/native vendor settings, entrant-count, vendor-scoped contact export, potential-winner selection, and verified fulfillment flow. |
| `qr_bingo_event_configs` | Private, RLS-enabled immutable event revisions. Exactly one revision is published. Operational clients read it only through service-role Edge code. |
| `qr_bingo_event_config_audit` | Immutable seed/publish history, including actor, expected revision, previous revision, and the full configuration snapshot. |
| `qr_bingo_draw_email_deliveries` | Service-only, per-draw/per-channel delivery ledger used to claim and finalize vendor and couple fulfillment notices safely. |
| `qr_bingo_raffle_entry_identities` | Service-only keyed identity registry. It stores no email and prevents the same normalized email from receiving another chance for the same event/vendor through a different entry method. |

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
Both the shared Edge parser and the database restrict official-rules and
alternate-entry links to HTTPS URLs on `weddingwin.ca` or
`www.weddingwin.ca`. The database remains authoritative for field, schedule,
and plain-text constraints even if a caller bypasses the admin form.

## Configuration migrations

These forward migrations define the live administration and delivery model:

| Migration | Purpose |
|---|---|
| `20260829180000_create_qr_bingo_event_configuration.sql` | Creates immutable event revisions, the audit and nonce tables, the Vault-backed HMAC loader, and the transactional publish RPC. Seeds `niagara-wedding-show-2026` with scans and vendor draws enabled. It does not bulk-change vendor prize settings or legal-acceptance history. |
| `20260829194500_harden_qr_bingo_transactions.sql` | Requires a new rules version for material legal changes, adds atomic vendor-setting compare-and-update, and creates the token-fenced draw-email delivery ledger with claim, finalize, and operator-reconcile RPCs. |
| `20260829201500_return_qr_bingo_publish_conflicts.sql` | Converts expected publish conflicts and validation failures into a completed JSON result so the admin request can return a clean conflict without leaving an aborted transaction. |
| `20260830110000_add_qr_bingo_alternate_entry_reconciliation.sql` | Adds entry-method/source/responsibility audit fields, a Vault-keyed normalized-email identity registry, current vendor responsibility acceptance, and the service-only atomic Form 354 reconciliation RPC. Historical entries are retained. |
| `20260830140000_enable_named_vendor_contact_exports.sql` | Historical foundation: adds explicit named-vendor draw-administration scope, false-by-default marketing-consent evidence, contact-export indexes, and metadata-only report-audit fields. It predates the current combined-consent contract and does not broaden historical entries. |
| `20260901070000_enable_named_vendor_marketing_consent.sql` | Defines current contract `2026-09-01-vendor-marketing`: an explicit named-vendor draw entry includes contact sharing and that named vendor's wedding-related marketing consent; exact-vendor/event reports mark consent included; legacy entries remain excluded until fresh current-version consent. |

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
entry close/draw times, odds basis, no-purchase disclosure, and
skill-testing-question condition. A vendor draw also fails closed until
`QR_BINGO_ALTERNATE_FREE_ENTRY_URL` is a live HTTPS route that accepts entries
without a purchase, ticket, admission, VIP status, event attendance, booth
visit, or QR scan.

The live alternate route is `https://www.weddingwin.ca/qr-bingo-free-entry`.
Submissions enter the Brilliant Directories forms inbox for validation against
the named vendor's current settings, entry period, and
one-valid-entry-per-eligible-couple limit regardless of method. This operations
queue must be reconciled with app entries before selection; a repeat submission
or use of both methods never creates an additional chance.

The public page accepts only trusted offers with a positive event revision and
an ISO/RFC 3339 `vendor_offer_version`. Form 354 stores the selected immutable
vendor ID, event key, submitted event revision, rules version, and exact vendor
offer version in required hidden fields. Those browser values are audit and
routing inputs, not a trust boundary; signed service reconciliation verifies
them against the authoritative event and vendor-offer records.

The canonical admission and odds disclosure is: general admission is free when
obtained in advance while the free allocation remains; VIP admission is paid;
anyone without an advance general-admission ticket must purchase admission at
the door; and no purchase, ticket, admission, VIP status, show attendance, booth
visit, or QR scan is required through the equal alternate free method or creates
an extra entry or improves vendor-draw odds.

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

The public Terms, Privacy Policy, Vendor Prize-Draw Official Rules, and alternate
free-entry page are required legal and operational surfaces and must remain
published, versioned, linked, and synchronized. The `/qr` scanner and vendor
dashboard are core operational pages. `/qr_results` is an intended public
product feature with privacy limits, not a substitute for any required legal
page. No public page in this directory is currently marked obsolete; do not
delete one without a replacement-flow and legal review.

Form 354's vendor and event names remain reference-only. Its required hidden
fields preserve the selected vendor ID, event key, submitted event revision,
rules version, and exact vendor offer version shown to the participant, but an
authenticated administrator must still open the inquiry in the BD forms inbox
and use widget 361 to copy its immutable inquiry ID and verify every value.
Widget 361 keeps the current admin `expected_revision` separate from the
inquiry's `submitted_event_revision` and `vendor_offer_version`; the signed Edge
action passes all three without silently substituting the current revision for
the participant's snapshot. The service-role RPC then locks and rechecks the published
configuration, currently enabled vendor setting, schedule, current rules,
vendor responsibility acceptance, participant eligibility attestations, and
Apple acknowledgement before inserting anything. Unknown, disabled, closed,
stale-event, stale-offer, repeated-source, and repeated-email requests fail
without an entry. A stale vendor offer returns HTTP 409
`stale_vendor_offer`; POST/Redirect/GET reloads current admin data and does not
retain the stale submission.

The reconciliation stores `entry_method = alternate_free_entry`, a unique
`bd-form-354:<inquiry-id>` source, and the applicable participant/vendor
responsibility snapshots. Duplicate checking uses a dedicated Vault-keyed HMAC
of the normalized email; the raw email is never stored in the identity registry
or returned by the admin endpoint. Reconciliation writes only the vendor-draw
entry table—it never writes a booth visit, scan, card-completion, or Bingo-credit
record. The BD inbox remains the source of pending inquiries, so widget 361
reports reconciled totals and explicit manual guidance rather than claiming it
can calculate the number still pending in BD.

There is no production reviewer/test-vendor allowlist, early-draw bypass,
outbound test email path, or multi-winner privilege. Migration `20260828162602`
creates a separate, expiring `app-review-*` event for exact couple `38971` and
private vendor `38970`. Only service-role code can read its fixture/scan rows;
the inactive-vendor exception and early draw apply only inside that event, and
outbound email is always suppressed. It never changes the Brilliant Directories
member's active/public status or exposes the listing in the production roster.

Vendor dashboards expose the entrant count, selected potential-winner record,
and an authenticated, event/vendor-scoped contact CSV. For entries accepted or
explicitly re-consented under `2026-09-01-vendor-marketing`, the entrant expressly
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
