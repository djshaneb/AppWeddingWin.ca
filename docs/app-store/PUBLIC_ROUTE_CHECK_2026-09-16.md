# Public support and purchase routes — September 16, 2026

These were read-only checks. Only the privacy-request, contact and draw-rules pages were fetched anonymously without account cookies; the join and show pages were inspected in the existing signed-in Chrome vendor session. They establish reachability and displayed routes within those scopes, not successful staff handling, payment, deletion or complete provider/privacy behavior.

| Route | Observed evidence | Limit |
| --- | --- | --- |
| [Privacy request](https://www.weddingwin.ca/privacy-request) | HTTP 200; the public `info@weddingwin.ca` contact route and About → Delete Account instructions were visible | No request was sent and no deletion or staff fulfilment was tested |
| [Contact](https://www.weddingwin.ca/about/contact) | HTTP 200; public support page reachable | No message was submitted and response handling is unverified |
| [Draw rules](https://www.weddingwin.ca/qr-bingo-vendor-draw-rules) | HTTP 200; rules reachable | This does not confirm the actual sponsorship arrangement or legal compliance |
| [Join](https://www.weddingwin.ca/join) | Advertises free vendor profiles with no credit card and links to [checkout plan 17](https://www.weddingwin.ca/checkout/17) | This is one advertised path, not an audit of all plans, upgrades or checkout collection |
| [Niagara Wedding Show](https://www.weddingwin.ca/niagara-wedding-show) | Get Tickets links to [Eventbrite event 1999224267602](https://www.eventbrite.ca/e/niagara-wedding-show-2026-fall-edition-tickets-1999224267602), for the physical Niagara wedding show | No checkout or purchase was completed |

The native top-frame URL policy in `lib/webview_url_policy.ts` routes third-party HTTPS URLs to `system-browser`. The main WebView handlers in `app/(tabs)/index.tsx` use `Linking.openURL` for that action. Applied to the observed Eventbrite link, the inspected source routes it to the external browser. This source/page comparison is not a physical-device tap verification and does not classify every reachable payment or upgrade path.

Separately from these route checks, the owner confirms independent vendor draw operation and general show sponsors' wedding-service emails/calls using shared couples' contact information, without advertising-audience uploads for that workflow. The business facts are now known; reconciliation with Apple 5.3.1, shared-message retention, staff privacy/report procedures, full provider collection/retention, App Privacy purposes/linkage/tracking, and complete native/payment-route coverage remain open. The direct-contact clarification does not establish global tracking No. No policy, Apple privacy answer or app code was changed by these checks.
