# Brilliant Directories integration source

These files mirror the custom WeddingWin.ca widgets used by the native app.
They make live integration changes reviewable alongside the Expo and Supabase
code. Deploy widget changes through the Brilliant Directories API and verify the
result by fetching the widget source again after its automatic cache refresh.

| Source file | Live widget | Page / purpose |
|---|---:|---|
| `widgets/258-julian-qr-code-bingo.php` | 258 | `/qr`; October 18, 2026 vendor list and scan persistence |
| `widgets/336-qr-bingo-draw-email-sender.php` | 336 | `/qr-bingo-draw-email-send`; verifies and sends draw emails |
| `pages/qr-bingo-official-rules.html` | custom page content | `/qr-bingo-vendor-draw-rules`; vendor and grand-prize official rules disclosures |

## Identifier contract

`vendor_bingo_id` and every `VENDORS[].id` value are the canonical Brilliant
Directories `users_data.user_id` converted to a string. They must never be an
array position or event-list sequence number. The matching Supabase migration
rewrites existing raffle rows from their recorded `vendor_bd_user_id` before
the updated widget/functions are deployed.

## Event contract

The current event vendor tag is 30 (`Oct 18 2026 NWS paid Vendors`). All scan,
progress, initial-state, and displayed-vendor queries must use the same tag.
Scan/reset POST actions remain limited to couple plans 4 and 18.

Completing the scan card is progress only and must never be described as
automatic prize entry. The app creates a grand-prize entry only after the
promotion is explicitly configured and the couple opens and accepts the
current official rules.

Before a vendor draw can open, the native app requires a prize description and
positive approximate retail value in CAD, then shows the eligible region,
entry close/draw times, odds basis, no-purchase disclosure, and
skill-testing-question condition. Grand-prize entry fails closed unless the
same material facts are configured, including
`QR_BINGO_GRAND_PRIZE_APPROX_VALUE_CAD`. Every promotion also fails closed until
`QR_BINGO_ALTERNATE_FREE_ENTRY_URL` is a live HTTPS route that accepts entries
without a purchase, event attendance, or QR scan.

There is no production reviewer/test-vendor allowlist, early-draw bypass,
outbound test email path, or multi-winner privilege. Migration `20260828162602`
creates a separate, expiring `app-review-*` event for exact couple `38971` and
private vendor `38970`. Only service-role code can read its fixture/scan rows;
the inactive-vendor exception and early draw apply only inside that event, and
outbound email is always suppressed. It never changes the Brilliant Directories
member's active/public status or exposes the listing in the production roster.

Vendor dashboards expose only the entrant count and selected potential-winner
record; entrant exports are prohibited. Prize terms lock after the first entry.
A random selection remains `potential` until service-role RPC
`review_qr_bingo_potential_winner` verifies both eligibility and the
skill-testing answer. Fulfillment email remains blocked until then.

Outbound potential-winner fulfillment email also fails closed unless the Edge
environment explicitly sets `QR_BINGO_DRAW_EMAIL_DELIVERY_MODE` to
`production_verified_fulfillment`. The signed payload and widget 336 both
enforce that mode; widget 336 additionally suppresses every `app-review-*`
event even if a caller is misconfigured.

## Draw-email authentication

Widget 336 contains only an RSA public key and verifies short-lived SHA-256
signatures. Its private key is stored in Supabase Vault under
`qr_draw_email_rsa_private_key` and is available only through the service-role
RPC `get_qr_draw_email_private_key`. Never add a shared HMAC secret or private
key to this repository or to a Brilliant Directories widget.
