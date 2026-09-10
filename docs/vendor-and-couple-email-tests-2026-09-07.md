# Vendor and couple winner-email verification

## Scope

Test the actual app and website winner-email buttons with a genuine couple test account and an isolated vendor draw. Both notification versions are restricted to the owner's explicitly approved test mailbox. No real-show entries, account identities, prizes, or historical delivery records are reset.

## Changes

- Private email fixtures can explicitly opt in to a vendor-version copy. This remains off by default; both copies use the same approved fixture recipient, never the vendor account's address.
- Test delivery claims retain event/member/consent/expiry checks, separate channel ledgers, duplicate protection, and the current-prize snapshot lock.
- The final website email formatter preserves full prize descriptions, current CAD values, and complete contact email addresses. Signed prize fields avoid parsing ambiguity; legacy payloads remain supported.
- PHP rendering is tested normally, after Brilliant Directories' backslash stripping, and with older PHP's rejection of NUL-containing regular expressions. Control bytes are removed directly so strict signed-prize validation works on older hosts.
- App test-mode copy no longer incorrectly promises that a vendor copy can never be sent.

## Verification

- PHP rendering and native-copy regressions: 19/19 passed in the final combined run.
- Backend SQL, recipient-allowlist and Edge Function checks: passed; detailed results are retained in the private test evidence.
- Native UI: private entry selected, then prize edited to the realistic $250 photography-credit example. Original entry/selection evidence remains unchanged.
- First actual native send: both channels failed definitively before mail transport because the host rejected a NUL-containing validation regex. No email was sent, and separate retryable-failure records were preserved. The narrowly scoped compatibility fix was published and verified; the same draw was retried through the native UI without resetting evidence.
- Actual native email delivery: passed. The native retry confirmed both notices, hid the send button, and locked the prize inputs. Both channel ledgers recorded exactly one successful send (after the preserved initial failure), using identical current $250 snapshots.
- Gmail receipt: both native messages were found in the Inbox and individually opened. Normal vendor/couple subjects, full current prize description, $250.00 CAD value and vendor-copy contact details were verified. The couple email's profile button opened the intended active WeddingWin vendor profile.
- Actual website email delivery: passed through Chrome's real wizard and Send button. A new isolated event started with a $100 prize; the selected couple remained unchanged while the vendor edited the prize to $250 before sending. Both channel ledgers recorded one successful attempt with the same current $250 snapshot, while original entry/selection evidence retained $100.
- Website Gmail receipt: both additional messages were found in the Inbox and individually opened. Their full website-test prize, $250.00 CAD value, vendor contact information and normal subjects were verified. Gmail grouped the four received messages into two conversations (one per email type).
- Post-send website UI: winner email marked sent; prize description and value disabled, with the explicit sent-email lock explanation. Native lock and duplicate-success protection also passed.
- Cleanup: both task-created fixtures disabled, with all test evidence preserved. Five scoped real-event data digests (settings, entries, selections, offers and contact profiles) were unchanged from the pre-test baseline.

The mouse-control skill was used for Chrome's native JavaScript confirmation popups when browser-level dialog control stalled. The actual website button actions and confirmation outcomes were verified; no backend helper was used to send either platform's notices.

Private fixture IDs, recipient details, screenshots, delivery timestamps and deployment provenance are recorded under `harness/iphone-smoke/results/2026-09-07-two-platform-winner-email-status.json` in the local workspace, not in this source report.
