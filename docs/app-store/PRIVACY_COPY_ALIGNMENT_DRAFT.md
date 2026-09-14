# Public privacy wording alignment — draft only

Prepared September 14, 2026. **Not published.** This proposes a narrow correction to the existing public policy at https://www.weddingwin.ca/about/privacy. Keep unrelated account, message, vendor responsibility, admission, retention and support text unchanged. The live page must be freshly read before the scoped content edit.

The current page is publicly reachable and app-specific. Its QR section still restricts entry to physically being at the show, while the released scanning policy allows organiser-authorised early access. Some other paragraphs also imply a separate acknowledgement form when entering each vendor draw. The actual app records the agreement before scanning and uses a simple named-vendor Yes/No prompt.

## Additional rules-consistency issue — unresolved

The September 14 release audit confirmed that the public [vendor-draw rules](https://www.weddingwin.ca/qr-bingo-vendor-draw-rules) return HTTP 200 and still describe vendor-specific prize, restrictions, value, dates, odds and related information being presented with the QR entry flow before acceptance. The current native prompt shows the vendor name, optional repeat/error text, and Yes/No; it does not display that list of details. The rules amendment and current app both describe accepting the agreement before scanning.

This is a factual content/behavior mismatch, not a legal conclusion. The wording proposal below does not resolve every rules-alignment issue. Preserve the user's simple Yes/No requirement. Do not silently remove rule requirements or reintroduce an expanded popup. Record the chosen resolution before submission; any app or configuration change requires separate explicit code approval.

## Proposed replacement for the first paragraph of section 3

A QR scan records QR Bingo progress and does not enter a vendor draw automatically. Couples provide the required contact details and accept the QR Bingo agreement before scanning. When WeddingWin has opened scanning for the event, including authorised early access, scanning an enabled vendor's QR code may offer that vendor's draw. The prompt identifies the vendor and asks whether to enter. Choosing Yes submits the entry under the previously accepted agreement and the applicable Official Rules. Choosing No keeps the scan progress without entering the draw.

## Proposed clarification beside the named-vendor sharing paragraphs

The agreement is presented before QR scanning. The later named-vendor Yes/No choice records whether the couple wants to enter that specific draw; it does not present a second agreement form. Contact sharing for a vendor entry remains limited to the named vendor and the uses described in the accepted agreement and Official Rules. A scan or a No response does not authorise that vendor to receive an entrant record.

## Review and publication checks

- Confirm the wording matches both app and website, the September 11 rules amendment and the recorded agreement.
- Remove only contradictory show-only/second-form language; do not change eligibility, prize dates, sharing purposes or responsibilities through this edit.
- Review whether the policy should describe protected administrative participation exports and temporary snapshot retention more specifically. This is a review item, not a new marketing permission.
- Confirm update/effective date and whether any notice is needed before publication.
- As release preparation proceeds, publish the reviewed content, read back the exact page and check mobile rendering. No publication occurred in this documentation task.

Canonical package source: [privacy-copy-alignment-draft.md](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/privacy-copy-alignment-draft.md). Repository links above are adapted for this location.
