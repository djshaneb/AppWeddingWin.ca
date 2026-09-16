# App Privacy decisions — September 16, 2026

**Published in App Store Connect on September 16, 2026.** The saved answers were verified for all seventeen completed categories after reload, with all data linked, no Set Up items and no Tracking/Not Linked preview section. Device ID's purpose was App Functionality only. After the owner approved the final publication agreement, Publish completed and Apple displayed “Published a few seconds ago by Shane Blair.” The privacy form is complete; Add for Review passed and Apple accepted build 7 for review on September 16 at 2:28 p.m. Pacific. This record explains the seventeen-category matrix in [APP_PRIVACY_ANSWERS.md](APP_PRIVACY_ANSWERS.md). No app code, configuration, backend or manifest changed, and no new app tests were run for this decision pass.

## Published answers

All seventeen categories use **Linked Yes / Tracking No**.

| Purposes | Categories |
|---|---|
| App Functionality + Third-Party Advertising | Name, Email Address, Phone Number |
| App Functionality + Analytics | Product Interaction, Search History |
| App Functionality | Physical Address, Contacts, Other Financial Info, Purchase History, Emails or Text Messages, Photos or Videos, Gameplay Content, Other User Content, User ID, Device ID, Customer Support, Other Diagnostic Data |

The owner confirms sponsor wedding-service emails/calls without advertising-audience uploads. The sponsor-purpose classification reflects promotion of outside businesses, while its direct outreach does not itself establish Apple's cross-company tracking definition. No separate WeddingWin marketing purpose is inferred. [Apple purposes and tracking](https://developer.apple.com/app-store/app-privacy-details/)

## Evidence for the three additions

- **Physical Address:** the embedded builder explicitly requests vendor addresses in [VendorForm.tsx](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/src/components/vendors/VendorForm.tsx:146) and [VendorFormModal.tsx](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/src/components/vendorPayments/VendorFormModal.tsx:151). [vendorService.ts](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/src/services/vendorService.ts:121) and [vendorPaymentsService.ts](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/src/services/vendorPaymentsService.ts:145) persist the address with the owning user ID. This is saved contact-address collection, not evidence of precise device location.
- **Customer Support:** [recordThreadReport](../../supabase/functions/bd-chat-sync/index.ts:529) retains conversation/reporting-member IDs, status and time in `app_chat_thread_reports`. The observed request is sufficient for a support-data classification; a mailto link alone was not the basis.
- **Search History:** earlier native captures observed Google location-autocomplete requests. Google documents retention of API request URLs/parameters, IP addresses, timestamps and web headers, with product improvement and operational uses. [Maps Platform data practices](https://developers.google.com/maps/security/compliance/security-compliance#data_collection_usage_and_retention)

Product Interaction/Search History include Analytics for provider request/usage statistics used to improve products; Device ID remains App Functionality for the evidenced push/operational use. That distinction does not turn routine delivery diagnostics into Analytics automatically.

## Tracking decision and limits

First-party accounts, messages, QR/draw state, review fixtures, notification routing and support records have demonstrated functional uses. The native WebView uses a private session, disables shared/third-party cookies, routes external top-level links to the system browser, and suppresses WeddingWin-host Meta scripts. Three earlier native captures showed no Meta requests. HTTPS subframes remain allowed, and the Meta protection is host-specific.

Google Maps' stated purposes cover product/service improvement, support, monitoring, security and capacity; they do not list advertising or measurement. Its broader terms incorporate Google's privacy policy, so this is not an independently verified categorical promise covering every possible provider use. **Tracking No is the classification of the observed flows and documented purposes**, not a claim of exhaustive provider verification. Neither generic Google Cloud no-ad-targeting commitments nor native Maps iOS SDK disclosures are treated as proof for the JavaScript API. [Maps purposes](https://developers.google.com/maps/security/compliance/security-compliance#data_usage), [Maps terms §4.4](https://cloud.google.com/maps-platform/terms)

Crash Data, Performance Data and Browsing History are not selected because this review found no affirmative retained collection for them. Existing error/delivery records fit Other Diagnostic Data. This does not promise that all provider infrastructure retains nothing, and it does not request further device tests.

## Separate manifest and release status

The app-level empty collected-data manifest list remains an authoring gap under [TN3184](https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest). Apple instructs collecting apps to describe their data in that file. The earlier Add for Review gate identified App Privacy; after publication the submission passed, and no manifest rejection is established. Correcting a bundled manifest is separate from completing the questionnaire, whose answers can be updated without an app update. No rebuild is initiated here. [Apple privacy-answer updates](https://developer.apple.com/app-store/app-privacy-details/)

Build 7 now runs through TestFlight on the iPhone; the user confirmed a visible/audible message alert. Existing test limits remain in the [physical report](IPHONE_TESTFLIGHT_BUILD7_REPORT_2026-09-16.md). Independent-vendor contest policy remains a separate App Review issue; completing a privacy label does not settle it. Apple now shows Waiting for Review for build 7. See the [submission receipt](SUBMISSION_RECEIPT_2026-09-16.md). The app is not approved or publicly released.
