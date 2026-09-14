# Seven branded App Store screenshots

Updated September 14, 2026. **Fourteen branded drafts prepared; all seven planned scenes captured per device class.** The images remain preparation assets pending final submitted-build, rights and Store-preview approval.

## Deliverables

Create the same seven-scene story separately for iPhone and iPad: fourteen final images. Default portrait sizes: **1320×2868** for 6.9-inch iPhone and **2064×2752** for 13-inch iPad. Apple accepts 1–10 opaque PNG/JPEG images per required class. Both device families remain configured. Do not stretch an iPhone screen into an iPad image. [Apple specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

Use WeddingWin coral/pink, a light background, short headlines, consistent typography and a large readable actual app capture. Use approved artwork. Frames must not conceal errors or suggest unavailable features. This proposal does not authorize app changes to stage images.

| # | Headline draft | Actual screen | Requirements |
| --- | --- | --- | --- |
| 1 | Your wedding, together | Couple home | Current cards, approved fictional name, no App Review label. |
| 2 | Find your wedding team | Vendor search/results | Useful results and licensed images; no CAPTCHA, loading or browser account chrome. |
| 3 | Make your wedding website | Website builder | Finished-looking fictional example using current tools; no private details or upgrade screen. |
| 4 | Keep conversations close | Private Messages | Approved fictional conversation; no moderation test state. Text only unless final-build photo availability is verified. |
| 5 | Scan. Explore. Play. | QR Bingo progress | Several participating tiles and truthful progress; avoid a blank camera as the main image. No simulation or contact data. |
| 6 | Your choice to enter | Named vendor Yes/No | Actual named question from the approved nonbinding fixture; test labels remain. No only, zero entries. This image is not proof of a working App Review entry or winner flow. |
| 7 | Get ready for the wedding show | Vendor home | Cedar & Light Photography's actual vendor home with account, message and draw tools. This follows the original vendor-dashboard scene without claiming an enabled draw. |

About/privacy is a reserve scene. Unimplemented notification screens are excluded.

## Current material pass

Fourteen branded drafts are prepared and checked against raw-source hashes: iPhone and iPad scenes01–07. Scenes06 and07 use existing build3 simulator captures; scenes01–05 retain their build2 provenance. Scene07 shows Cedar & Light Photography's ordinary vendor home, without claiming an enabled draw. Corrected iPad03 shows the confirmed demo email. Final TestFlight and Store-preview acceptance remain pending.

Both scene06 slots are complete: John and Jane see the genuine named Willow & Bloom question, with existing test labels preserved. The [approved demo-only scope](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/screenshots/demo-draw-capture-scope.md) was implemented without changing native UI or rewriting old offers. Scene06 is a nonbinding, display/scan-only synthetic fixture: the actual named Yes/No question was captured on both devices, No was used, and live checks confirmed zero entries, draws and deliveries. It does not establish functional Yes/entry/winner acceptance for App Review. The fresh fixture expires 2026-09-21T20:47:37.829Z (at most seven days); verify or provision appropriately authorized review access for Apple's later review and follow-up. Native app code was unchanged for these captures. Eight photographer messages were saved through normal website forms and verified by native reading; iPad scene04 shows all eight and iPhone shows the latest five with canonical photos. Native SEND still returns HTTP403 and remains a separately scoped release blocker.

## Existing asset audit

All 53 files under `assets/app-store/screenshots` have August 28, 2026 filesystem dates:

| Files | Measured size | Decision |
| --- | --- | --- |
| Two `pro-max-*` PNGs | 1320×2868, opaque | Valid-size references; home visibly names a review fixture. |
| Nine `iphone-*` PNGs | 1206×2622, opaque | QA only; includes emulation, blocked chat, old deletion copy and review content. |
| `ipad-01-couple-menu.png` | 2064×2752, opaque | Replace: narrow centered layout and lower-right spinner artifact. |
| Fifteen `qa-final-release-*.jpg` | 368×800 | Internal QA only. |
| Twenty-six `qa-website-*.png` | Browser sizes | Internal QA; some filenames do not match encoded format. |

Six September 14 native-feedback images in the task workspace are also 368×800 QA JPEGs. Recent does not mean upload-ready. QR illustrations in `assets/images/qr-bingo` are not screenshots.

`assets/images/app-icon.png` is the configured 1024×1024 opaque PNG. Inspect its sharpness, masking and archive rendering before approval. No icon change is included.

## Checklist

- [ ] Record final source revision and processed build.
- [ ] Verify iPad layout, keyboards, modals, web views and overlay cleanup first.
- [ ] Use marketing-safe fictional content and establish rights for all visible images. Do not edit away review-fixture warnings.
- [ ] Verify the scenes reflect prior agreement, authorized early entry, simple Yes/No, named repeat scans and saved draw feedback.
- [ ] Capture full-resolution clean originals with consistent appearance, status bar and text size.
- [ ] Add approved branding; inspect readability at Store preview size.
- [x] Validate format, pixels, opacity, seven images per class and order against actual files and source provenance.
- [ ] Review the artwork, upload and inspect Store previews, and include the finished set in the completed package.

Canonical package source: [screenshot-shot-list.md](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/screenshot-shot-list.md). Repository links above are adapted for this location.
