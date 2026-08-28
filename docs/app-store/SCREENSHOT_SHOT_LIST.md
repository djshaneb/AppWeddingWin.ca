# App Store screenshot shot list

Status: **DRAFT — working QA captures exist; final App Store Connect sets are not complete.**

Because `supportsTablet` is enabled, prepare both iPhone and iPad sets. Apple accepts one to ten images per device class and can scale down from the highest-resolution set. Current accepted portrait sizes include:

- iPhone 6.9-inch: `1260×2736`, `1290×2796`, or `1320×2868` pixels.
- iPhone 6.3-inch: `1206×2622` pixels.
- iPad 13-inch: `2064×2752` or `2048×2732` pixels.
- PNG/JPEG only, no alpha/transparency.

Capture from the exact final Release/TestFlight build. Use portrait throughout because the app declares portrait orientation.

## Current working capture inventory

These files document the current working-tree Simulator run:

- Primary 6.9-inch iPhone 17 Pro Max marketing shots, `1320×2868`, RGB PNG without alpha: `pro-max-01-couple-menu.png` and `pro-max-02-about.png`. Both were visually checked and contain no credential or permission-prompt content.
- 6.3-inch iPhone QA set, `1206×2622`: `iphone-01-couple-menu.png`, `iphone-02-qr-bingo.png`, `iphone-03-chat-blocked-list.png`, `iphone-04-chat-blocked-thread.png`, `iphone-05-qr-url-emulation.png`, `iphone-06-vendor-menu.png`, `iphone-07-vendor-draw.png`, `iphone-08-account-deletion-confirm.png`, and `iphone-09-account-deleted.png`.
- Clean 13-inch iPad Pro (M5) candidate, `2064×2752`, RGB PNG without alpha: `ipad-01-couple-menu.png`.
- Additional `qa-website-chat-*.png` captures document the controlled app↔website chat round trip. They are internal QA evidence and may contain controlled test conversation/browser context; do not treat them as App Store marketing assets or publish them without a separate privacy/redaction review.
- Three additional `qa-final-release-vendor-dashboard-*.jpg` captures at `368×800` document the top-frame/subframe regression and the visibly embedded Vimeo player. They are internal QA evidence only, are not an accepted App Store screenshot size, and may include test/dashboard or browser context; do not use them as marketing assets.

All are under `assets/app-store/screenshots/`. The two Pro Max images are the only shots currently designated as clean, primary 6.9-inch marketing assets. The nine-file 6.3-inch set uses an accepted pixel size but remains QA evidence rather than an approved marketing set. The iPad image is clean and dimensionally eligible, but only one iPad scene exists; final set selection, exact-release consistency review, and App Store Connect upload/preview remain required.

## Recommended six-image sequence

| Order | Screen | State to prepare | Suggested caption | Privacy / QA notes |
| --- | --- | --- | --- | --- |
| 1 | Native couple home menu | Couple review account logged in; menu cards visible | `Plan your wedding in one place` | Lead with the product, not splash/login. Show Wedding Website Builder, Vendor Search, Private Messages and QR Bingo. |
| 2 | Vendor search/results | Useful Canadian vendor results in the embedded WeddingWin experience | `Find wedding vendors across Canada` | Use real public businesses only if marketing rights are confirmed; otherwise controlled fictional listings. No unrelated browser chrome/error/CAPTCHA. |
| 3 | Native private messages | Controlled couple↔vendor text conversation | `Keep conversations together` | Use fictional names/content/avatar. No real email, phone, member ID, token, wedding date or notification banner. Show the native UI, not an empty inbox. Native image sending is intentionally disabled for this release. |
| 4 | Native QR Bingo | Progress grid after a successful sample scan, with vendor tiles/progress | `Scan booths with QR Bingo` | Avoid a blank camera frame. A simulator/emulated result may be used only if it accurately matches production UI; final camera behavior still needs physical-device testing. |
| 5 | Vendor draw opt-in | Named test prize modal, rules link and data-sharing notice visible | `Choose the draws you enter` | Final official rules and Apple non-sponsor language must already be live. The notice must limit contact-data use to draw administration/prize fulfilment and must not imply marketing consent. Use a test prize, not an unverifiable marketing claim. |
| 6 | Vendor Draw Settings | Private vendor review account showing prize setup and fictional potential-winner workflow | `Run a booth draw without paper ballots` | Use only isolated event `app-review-weddingwin-2026-38970`. No entrant contact list, export, real entrant information, or production winner. Reviewer-fixture email is suppressed. Capture only after the vendor account passes dashboard/native-text-chat checks and remains nonpublic. |

Optional seventh image:

- About / Privacy / Delete Account, captioned `Privacy and account controls are easy to find`. Confirmation/cancel screenshots exist from the final Release Simulator and the deployed two-account deletion behavior passed live. Final marketing use remains Pending `DEV-10`, physical Apple/provider/backup and exact TestFlight testing, owner/legal approval of the finite retention duration/criterion, and capture at an accepted App Store size. The public request page is supplemental for users who cannot sign in; do not depict it as the app's only deletion method.

## iPhone capture checklist

- [x] Capture the two primary iPhone 17 Pro Max shots at an accepted 6.9-inch size (`1320×2868`).
- [ ] Add another 6.9-inch marketing scene only if it is genuinely useful and passes the same privacy/content review; do not promote all nine QA captures automatically.
- [ ] Confirm status bar time, carrier/simulator text and battery are consistent across shots.
- [ ] Hide debug overlays, test IDs, keyboard, loading spinners, alerts and permission prompts unless the prompt is the feature being shown.
- [ ] Verify text is not clipped at default and one larger Dynamic Type setting.
- [ ] Complete the separate VoiceOver/focus-order/accessibility pass; screenshots alone are not accessibility evidence.
- [ ] Verify light/dark appearance matches the product design; do not mix unintentionally.
- [ ] Capture clean source images before adding any text overlays.
- [ ] If adding captions/frames, keep screenshots truthful and avoid Apple hardware/logos that violate marketing rules.
- [ ] Export sRGB, opaque RGB, exact pixel dimensions.

## iPad capture checklist

- [ ] Use 13-inch iPad Pro/Air output at `2064×2752` or `2048×2732` portrait.
- [ ] Repeat the same six-story sequence where the screen exists.
- [ ] Do not merely stretch/crop iPhone screenshots; capture actual iPad layout.
- [ ] Inspect landscape even though the app declares portrait, including Stage Manager/window resizing if available; fix crashes or broken constraints before release.
- [ ] Check modal widths, multi-column whitespace, WebView desktop/tablet breakpoints, date picker, chat composer/keyboard, QR scanner frame and bottom navigation.

## Capture data setup

- Couple: `<APP_REVIEW_COUPLE_DISPLAY_NAME>` with future test wedding date.
- Current reviewer-couple first name: `App Review` (member `38971`); verify the final fictional display name and absence of private fields before capture.
- Vendor: `<APP_REVIEW_VENDOR_BUSINESS_NAME>` with nonpublic test listing.
- Conversation text examples:
  - Couple: `Hi! Are you available for our test wedding date?`
  - Vendor: `Yes — I’d be happy to share the details here.`
- Test prize: `<LEGAL-APPROVED TEST PRIZE TITLE>`.
- QR: `assets/app-store/sample-qr-review-vendor-38970.png` after resetting the controlled `38971` couple account's scan/entry/draw state. It targets the isolated event `app-review-weddingwin-2026-38970`.

Before using the `38970` fixture for screenshots, verify its exact-build scan/opt-in/draw behavior, signed-out listing privacy, and vendor dashboard/native text-chat authorization. Configuration alone is not screenshot evidence. Do not use the legacy `23608` assets for App Review.

## Final inspection

- [ ] Every screenshot shows the uploaded build’s actual UI and core experience.
- [ ] No screenshot is merely a splash screen, icon, or login screen.
- [ ] No real person’s private data appears.
- [ ] No old branding, Android UI, Expo dev menu, localhost/tunnel URL or test watermark appears.
- [ ] Captions make no unsupported “best,” “trusted,” membership-count, prize-value or availability claims.
- [ ] Screenshots align with App Store description, age rating, privacy answers and review notes.
- [ ] Upload at least one and no more than ten per required device class, then inspect App Store Connect’s scaled previews.

Reference: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
