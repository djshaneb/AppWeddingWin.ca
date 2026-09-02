# App Store screenshot and icon inventory

Status: **CODE-OWNED INVENTORY FINAL — no complete upload-ready iPhone/iPad set is recorded.**

Because `supportsTablet` is enabled, supply both iPhone and iPad screenshots. Apple accepts one to ten images per required device class. Relevant portrait sizes are:

- iPhone 6.9-inch: `1260×2736`, `1290×2796`, or `1320×2868`.
- iPhone 6.3-inch: `1206×2622`.
- iPad 13-inch: `2064×2752` or `2048×2732`.
- PNG or JPEG, opaque/no alpha.

Dimensions make a file eligible, not approved. Final screenshots must show the exact release UI, contain no private/test/debug/stale content, and pass App Store Connect preview inspection.

## Current inventory

All screenshot files are under `assets/app-store/screenshots/`.

| Files | Technical result | Content/release result |
| --- | --- | --- |
| `pro-max-01-couple-menu.png`, `pro-max-02-about.png` | Both `1320×2868`, opaque RGB PNG; accepted 6.9-inch dimensions | **Candidates only.** No credentials or permission prompt were observed, but they use the fictional `App Review` fixture and are not captures from a processed TestFlight build. Recheck every visible string and recapture if the test identity makes them look like review/QA material. |
| `iphone-01-*` through `iphone-09-*` | Nine `1206×2622` opaque PNG files; accepted 6.3-inch dimensions | **Internal QA, not an approved marketing set.** See the exclusions below. |
| `ipad-01-couple-menu.png` | `2064×2752`, opaque RGB PNG; accepted 13-inch dimensions | **Do not upload.** The current capture shows a narrow phone-like centered layout and a partial gray spinner/overlay-like artifact near the lower-right edge. Capture a replacement after full iPad layout testing. |
| `qa-final-release-*.jpg` | Fifteen `368×800` opaque JPEGs | **Do not upload.** Dimensions are not accepted App Store screenshot sizes; files are QA evidence. |
| `qa-website-*.png` | Twenty-six website/browser QA captures at varied desktop/mobile sizes; several `.png` filenames contain JPEG-encoded data | **Do not upload.** They are browser/cross-client evidence, not iOS product-page assets, and may expose controlled conversation or browser context. |

## Explicit do-not-upload list

- `iphone-03-chat-blocked-list.png` and `iphone-04-chat-blocked-thread.png`: moderation/blocked QA state, not a normal marketing conversation.
- `iphone-05-qr-url-emulation.png`: visibly contains the removed **Simulate QR scan** QA control and does not represent production.
- `iphone-06-vendor-menu.png`: obvious review/test fixture state; recapture with a marketing-safe fictional fixture.
- `iphone-07-vendor-draw.png`: stale pre-restoration/disabled-state capture. Never upload it; recapture the truthful restored vendor-draw UI from the final build if that feature is shown in marketing.
- `iphone-08-account-deletion-confirm.png`: stale deletion text says entire conversations, including the other participant's messages, are deleted. Current behavior preserves the surviving participant's read-only shared history under the retention policy.
- `ipad-01-couple-menu.png`: dimensionally valid but visually not final, as described above.
- Every `qa-final-release-*` and `qa-website-*` file: internal evidence only.

`iphone-01-couple-menu.png`, `iphone-02-qr-bingo.png`, and `iphone-09-account-deleted.png` are not hard-excluded for a false/debug control, but they are still QA captures. Do not promote them without exact-TestFlight consistency, privacy, marketing, and visual review.

## Required final capture set

Use a short truthful sequence; four to six scenes per class is enough if each adds value:

| Order | Screen | Suggested message | Capture requirements |
| --- | --- | --- | --- |
| 1 | Native couple home | Plan your wedding in one place | Show core cards, not login/splash. Use neutral fictional data. |
| 2 | Vendor search/results | Find wedding vendors across Canada | Use content WeddingWin has marketing rights to show; no CAPTCHA, browser chrome, or loading/error state. |
| 3 | Native private text chat | Keep conversations together | Normal unreported conversation with fictional names/text; no real contact data, IDs, notification banner, or image-send control. |
| 4 | QR Bingo progress or optional draw offer | Visit the booth, scan, then choose whether to enter | Show truthful in-show post-scan progress and, if used, the separate optional offer with Official Rules version `2026-09-01-in-person-entry` and the clear named-vendor draw-and-wedding-related-marketing disclosure that must be affirmatively accepted before entry. Describe QR entry as the digital replacement for a paper ballot, never imply that scanning automatically enters, and state that one entry is allowed per eligible couple for that vendor draw. Do not show a blank camera or simulation control. Capture only after printed-camera and entry-flow testing. |
| 5 | Native About/privacy controls | Your privacy and account controls | Show privacy, support, notification settings, and Delete Account without opening a destructive confirmation. |
| 6 | Vendor dashboard or draw settings | Manage your free profile and booth draw | Use a marketing-safe fictional vendor; show no payment/upgrade flow, entrant identity/contact data, selected-winner personal data, test fixture label, or outbound-email result. If draw controls are shown, the prize/rules/consent state must match version `2026-09-01-in-person-entry` and public rules; a percentage-off example must show its maximum savings and material restrictions. A report scene may explain that current-version entrant details are shared only with the named vendor for draw administration and that vendor's wedding-related marketing, with consent marked included, but must never show the CSV contents or any real/fake person-level values. A verification scene must show the eligibility, math-answer, rules/release, and confirm/disqualify gate without personal data. |

An About/privacy/account-controls scene can replace a weaker scene. Use the current deletion wording: account-owned data is deleted, conversations close, and shared history may remain read-only for the other participant under the retention policy.

## Capture checklist

- [ ] Capture from the processed TestFlight build or an immutable release build proven identical to it; record build number and source revision.
- [ ] Capture actual iPhone and iPad layouts separately in portrait; do not stretch, crop, or frame an iPhone capture as iPad.
- [ ] Complete full iPad testing first: WebViews, keyboard/chat, modals, scanner, navigation, Dynamic Type, VoiceOver, rotation/window behavior, and overlay/spinner cleanup.
- [ ] Use consistent status bar, appearance, text size, and fixture names across each set.
- [ ] Remove debug overlays, test IDs, keyboards, loading spinners, alerts, permission prompts, simulator controls, and test/review wording unless the screen specifically requires it.
- [ ] Confirm no email, phone, member ID, token, browser account, real wedding date, message, entrant, or notification content is visible.
- [ ] Confirm product claims, rules, privacy wording, availability, and feature state match the submitted build and metadata.
- [ ] Export opaque sRGB at exact accepted dimensions; independently inspect format, pixel size, color space, and alpha.
- [ ] Upload at least one and no more than ten per required class, then inspect every scaled App Store Connect preview.

## App icon

`assets/images/app-icon.png` is a `1024×1024` opaque RGB PNG and is referenced by `app.json`. It is technically suitable as the source icon. Before upload, inspect the icon from the signed archive and App Store Connect rendering for unintended transparency, masking, clipping, debug branding, and consistency with screenshots.

Reference: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
