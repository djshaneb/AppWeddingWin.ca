# Unlisted Vendor Bingo QR directory

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

Published: https://www.weddingwin.ca/vendor-bingo-qr-codes

Latest follow-up: [logo-free cards and horizontal orientation](vendor-qr-horizontal-no-logo-2026-09-09.md). That update removes the card logo and adds a separate horizontal option; the branded-layout notes below are historical.

- Brilliant Directories page SEO ID **4343**, widget **381** (`WeddingWin Vendor Bingo QR Codes`).
- Public for everyone with the link; no account or organizer session required.
- Native `show_form=1` is BD's **Apply NoIndex, NoFollow** option. HTTP `X-Robots-Tag: noindex, nofollow` also present. No public menu link was created. Anonymous homepage HTML and the currently published static-page sitemap do not contain this route. Search-engine directives are not access control.
- BD's API did not persist the legacy `hide_from_menu` field, and no corresponding control exists in this page editor. Do not rely on that field. Public menu links are left unchanged; the supported native no-index control was verified in the editor and live HTML.
- No Supabase function deployment or migration was needed. No GitHub push performed.

## Automatic source

The PHP widget gets the existing read-only `bd-qr-bingo-admin?action=public_config` endpoint, then selects distinct BD member IDs where the member is active (`active=2`) and in the published `vendor_tag_id` group (`rel_tags.tag_type_id=1`). It does not filter by prize setup or draw availability.

At verification: Niagara Wedding Show, Sunday October 18, 2026, Americana Resort, configuration revision 12 / tag 30, **14 vendors**. This intentionally includes the currently active test vendor **[redacted member L]**, matching the existing app roster; no vendor account, tag, or test fixture was altered.

New active members added to that group appear on the next page load, manual Refresh, or automatic visible-page refresh (every 60 seconds). The next published event/group is followed automatically. The page emits only vendor name, stable ID and canonical QR URL, plus public event metadata. Contacts, scans, entries, winners and consent are neither read nor changed.

## Implementation and deployment

- PHP, shell, CSS and JS: `brilliant-directories/widgets/ww-vendor-bingo-qr-codes.*`.
- Page shortcode and supported settings: `brilliant-directories/pages/vendor-bingo-qr-codes*`.
- Pinned local encoder: `brilliant-directories/assets/qrcode-generator-1.4.4.js` (MIT); no external QR-image service.
- `node scripts/build-vendor-bingo-qr-widget.mjs --check` verifies shell synchronization, BD-safe PHP and the assembled script; without `--check`, it emits the widget payload for the CMS connector. PHP belongs in `widget_data`, raw CSS in `widget_style`, and encoder+UI inside the `widget_javascript` script wrapper.
- Read the exact live widget before updating it; round-trip all changed fields afterward.
- BD adds internal `$_GET` routing fields. The new handler validates the original `REQUEST_URI` instead; bare URL serves HTML, `?format=json` serves clean JSON, other external query parameters are rejected.
- Both responses are no-store. Invalid upstream configuration or roster data fails closed; a refresh error preserves previously verified codes with an outdated warning. Nothing follows or prefetches the scan URLs.

## Verification

The initial verification below describes the original compact card layout. The later branded 4×6 update and its current print pagination are recorded at the end of this document.

- 9 PHP regression tests passed, including complete handlers, injected BD routing, malformed inputs, output allowlist, duplicates and the 5,000/5,001 limit.
- 13 frontend tests passed, including actual QR decode, additions/removals and event-change refresh, hidden-tab refresh, rapid taps/no overlap, retained DOM for unchanged data, stale/error handling, search and print-all.
- 14 independent current-roster tests passed: 42 actual SVG decodes at 189/240/378 pixels; every URL accepted by both actual app and website scanner parsers.
- Anonymous live HTML and JSON each returned 200, no-store, noindex/nofollow; feed contained exactly 14 canonical vendor rows, no private fields. Final widget HTML/CSS/JS matched local source.
- Chrome desktop 1728px and phone-sized 390px tested. No mobile horizontal overflow. Removed BD's residual 50px mobile-header offset, scoped only to this new page.
- Search matched ordinary and long names. Refresh succeeded. Print All, with only one vendor visible in search, opened a 3-page preview containing all 14 vendors; preview was cancelled without saving or printing. Temporary browser emulation was reset.
- The wider existing `scripts/check-bd-widgets.mjs` remains blocked by a pre-existing backslash assertion in widget 258, unrelated to these new files; no unrelated changes were made.

Commands (install the pinned decoder in a temporary directory if not already present):

```sh
node scripts/test-vendor-bingo-qr-codes-php.mjs
VENDOR_QR_JSQR=/absolute/path/to/jsqr/dist/jsQR.js node scripts/test-public-vendor-qr-codes.mjs
QR_DECODER_MODULE=/absolute/path/to/jsqr node scripts/test-vendor-bingo-qr-codes-decode.mjs
node scripts/build-vendor-bingo-qr-widget.mjs --check
npm exec --offline --package=@php-wasm/cli -- php-wasm-cli -l brilliant-directories/widgets/ww-vendor-bingo-qr-codes.php
```

## Branded 4×6 cards — September 8 follow-up

- Published the supplied WeddingWin vector logo above every QR and moved each full business name below it. Removed the visible "Scan for Vendor Bingo" caption and vendor number. Stable IDs remain in the existing canonical QR URLs and internal search only.
- `brilliant-directories/assets/weddingwin-vendor-qr-logo.svg` preserves the supplied artwork and gradients, removes export metadata/DTD, and trims empty canvas. The exact sanitized SVG is embedded in the widget, so printing has no external logo dependency.
- Default print layout: four true 4×6-inch cards per 11×17-inch portrait sheet. Alternative: two true 4×6-inch cards per Letter landscape sheet. The page explains that four full-size cards cannot fit Letter paper and asks for 100% / Actual size with browser headers and footers off.
- Chrome's actual PDF generation exposed an extra leading/trailing page caused by named-page transitions. Applying the selected named page at document level fixed it; the regression is covered in the frontend test.
- Actual final Chrome print PDFs verified: **4 Tabloid pages** containing 4/4/4/2 cards and **7 Letter-landscape pages** containing two cards each. All 14 unique business names and QRs are present, with no blank pages or visible clipping. Card geometry is 288×432 points (4×6 inches), and the QR area is 216×216 points (3×3 inches). First/last pages and the longest current business name were visually inspected.
- Chrome desktop and 390×844 mobile layout checked. All 14 logos load; mobile document width equals viewport width; each card contains only logo, QR and name. Search, 4-up/2-up switching and Refresh work, preserve the full roster, and produce no browser errors. Temporary viewport/print emulation was reset.
- Final checks: 17/17 frontend regressions (including actual QR decoding), 9/9 PHP tests, and widget build check pass. Widget 381's three code fields round-trip exactly; automatic CMS cache refresh succeeded. No roster, tag, account, draw or Supabase changes and no GitHub push.
- QA-only PDFs and page renders are under `tmp/pdfs/vendor-qr-2026-09-08/`. The live page remains the automatically updated source, not these fixed snapshots.

## Letter-only layout choices — September 8 follow-up

Supersedes the Tabloid/Letter choices above. All current options use ordinary 8.5 x 11 inch Letter paper, 0.25-inch margins, and 100% / Actual size with browser headers/footers off:

| Menu value | Card size (inches) | Cards/sheet | Orientation |
| --- | --- | --- | --- |
| `letter-eight` (default) | 3.74 x 2.56 | 8 (2 x 4) | Portrait |
| `letter-six` | 3 x 4 | 6 (3 x 2) | Landscape |
| `letter-four` | 3.5 x 5 | 4 (2 x 2) | Portrait |
| `letter-two` | 4 x 6 | 2 (2 x 1) | Landscape |

- Only widget 381's print controls, grouping, and print CSS changed. Logo, canonical QR URLs, public roster logic, and automatic refresh are unchanged. No Supabase, account, draw, page-access, or GitHub changes.
- Print still includes every vendor when the on-screen search is filtered. Switching layouts reuses the same card and QR nodes. Invalid or stale layout values safely fall back to `letter-eight`.
- Live Chrome proofs contain all 14 complete vendor names, with page counts 2/3/4/7 and per-page card counts 8+6 / 6+6+2 / 4+4+4+2 / seven pairs. PDF pages are exactly 612 x 792 or 792 x 612 points. No blank pages or visible clipping; first and last pages of each layout visually inspected. Border painting rounds by less than 0.01 inch; CSS card dimensions are exact.
- Live print-media tests with 70, 71, 140, 141 and 200 consecutive wide letters pass in every layout. The initial 140-character stress test exposed overlap in the 3 x 4 and 3.5 x 5 layouts; reduced long-name sizes fixed it. Temporary fixture text was removed by reloading; nothing was saved to vendor records.
- All 17 frontend tests, 9 PHP tests, 16 decoder tests, and the widget assembly check pass. Decoder coverage includes 80 SVG decodes at 120/189/240/375/378 pixels, including 18-digit vendor IDs and both app/website QR parsers. The smallest printed QR is 1.25 inches square.
- Chrome desktop and 390 x 844 mobile checks pass: no horizontal overflow, all 14 logos loaded, rapid layout switching/search preserves all cards, Refresh works, and no browser errors. Temporary print/viewport emulation and QA download links were removed.
- Final CMS HTML/CSS/JS round-trip exactly. No physical printer job was submitted. QA-only PDFs and renders are under `tmp/pdfs/letter-layout-review.fPjAwB/`; use the live page for the current roster.

## Matching 11 x 17 options — September 8 follow-up

The four Letter choices and Letter eight-up default above remain unchanged. A second dropdown group adds Tabloid (11 x 17 inch) paper for the same exact card sizes and artwork:

| Menu value | Card size (inches) | Cards/sheet | Orientation |
| --- | --- | --- | --- |
| `tabloid-sixteen` | 3.74 x 2.56 | 16 (4 x 4) | Landscape |
| `tabloid-twelve` | 3 x 4 | 12 (3 x 4) | Portrait |
| `tabloid-nine` | 3.5 x 5 | 9 (3 x 3) | Portrait |
| `tabloid-four` | 4 x 6 | 4 (2 x 2) | Portrait |

- Both paper groups retain 0.25-inch margins and 100% / Actual size. The nine-up sheet uses the full 10.5-inch printable width. Root and sheet named pages match to avoid leading/trailing blank pages.
- Print-only card styling is shared between corresponding Letter and Tabloid sizes, preserving fonts, logo, QR dimensions, and long-name fitting. Only sheet grouping, page size, and orientation differ.
- Updated frontend regressions pass 17/17, including 17-vendor grouping across all eight choices, invalid-layout fallback, unchanged QR/card identity, search retention, and actual SVG decoding. PHP tests pass 9/9 and the widget assembly check passes.
- Live Chrome desktop and 390 x 844 mobile verify all eight options, full labels without horizontal overflow, exact print-media card dimensions, and all 14 vendors remaining printable while search shows one. Switching paper sizes works and browser logs show no errors. Temporary print/mobile emulation and QA controls are removed afterward.
- Published only widget 381's HTML/CSS/JS, with exact round-trip verification. Server roster logic, logo, QR targets, accounts, draws, Supabase and GitHub remain unchanged.
- Final Chrome PDF proofs pass: 17 x 11 inches for sixteen-up and 11 x 17 for the others; 14 vendors produce page/card counts 14 / 12+2 / 9+5 / 4+4+4+2. Every complete business name appears exactly once, no blank pages or visible clipping, and no temporary QA links. Nine-up ink sits exactly 0.25 inches from both page sides. Final QA PDFs are in `tmp/pdfs/tabloid-layout-review.7ftNCY/` with `final-proof` in their filenames; reviewed first/last-page PNGs are in `tmp/pdfs/tabloid-final-review.4YZaNo/`. No physical printer job was sent.
