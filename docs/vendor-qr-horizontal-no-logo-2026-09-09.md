# Logo-free vendor QR cards and horizontal option

Updated https://www.weddingwin.ca/vendor-bingo-qr-codes, widget 381.

- Removed the embedded WeddingWin logo from every card, both on screen and in print. Each card now contains only the QR code and full business name. The original source artwork file is retained, not deleted.
- Added **Card orientation: Standard / Horizontal (wide)**. Standard retains the existing physical dimensions with QR above name. Horizontal makes tall cards wide, keeping the QR upright on the left and the name on the right; the compact 3.74 x 2.56 card is already wide and keeps those dimensions.
- All eight Letter/Tabloid choices and their per-sheet counts remain. Letter eight-up / Standard is still the initial default. The visible note reports actual horizontal dimensions and paper orientation. Page size follows both selected controls through `data-print-page`, applied at document and sheet levels.

| Nominal size | Horizontal size | Letter arrangement | 11 x 17 arrangement |
| --- | --- | --- | --- |
| 3.74 x 2.56 | 3.74 x 2.56 | 2 x 4, portrait | 4 x 4, landscape |
| 3 x 4 | 4 x 3 | 2 x 3, portrait | 4 x 3, landscape |
| 3.5 x 5 | 5 x 3.5 | 2 x 2, landscape | 3 x 3, landscape |
| 4 x 6 | 6 x 4 | 1 x 2, portrait | 2 x 2, landscape |

Print at 100% / Actual size, with 0.25-inch margins and browser headers/footers disabled. No QR URLs, vendor records, roster filtering, account access, scanner, draw, or Supabase behavior changed. No GitHub push.

## Verification

- 17/17 frontend regressions, 9/9 PHP tests, 16/16 QR decoder tests, and widget build check pass. Tests cover all 16 orientation/layout combinations, exact geometry, logo absence, invalid-option fallback, preserved QR/card identity, and retained search. Existing decoder tests include 18-digit vendor IDs, 120px minimum raster size, and both actual app/website scanner parsers.
- Live Chrome stress tests cover 70, 71, 140, 141 and 200 consecutive wide letters in every combination: all 80 names fit inside their cards without overlapping QR codes. Temporary name fixtures were removed by reload; vendor records were not edited.
- Current automatically loaded roster contains 33 vendors. Both desktop and 390 x 844 mobile show no logos and no horizontal document overflow. Expanded the desktop layout selector minimum width so its longest value remains readable alongside the new control; mobile retains full-width controls.
- Rapid orientation switching, layout switching, filtered print-all, and Refresh pass. Filtering to one visible vendor still prints all 33. No browser errors; temporary media/viewport overrides and QA links were removed.
- Published widget HTML/CSS/JS round-trip exactly. Only the page widget and its mirrored source/tests/documentation changed; no physical printer job was submitted.
- All 16 actual Chrome print PDFs pass: each contains all 33 complete vendor names once in roster order, with the correct paper orientation and exact-size cards. Page counts are 5/6/9/17/3/3/4/9 in each orientation. All 528 cards were checked for text placement inside cut borders and the intended QR/name arrangement; no logos, QA links, blank pages, or clipped names. First/last pages of every proof were visually reviewed. The tight horizontal Letter six-up and Tabloid nine-up layouts retain 0.25-inch margins on their limiting edges.
- QA-only PDF snapshots are under `tmp/pdfs/no-logo-horizontal.JnLZts/`. Standard renders and the review script are under `tmp/pdfs/no-logo-final-review.t0qvUx/`; horizontal renders are under `tmp/pdfs/horizontal-no-logo-review.nUHFEX/`. The live page remains the current, automatically updated roster.
