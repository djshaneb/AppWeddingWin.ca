# Contact email confirmation test — September 6, 2026

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Intended behavior

- Apple private-relay addresses remain valid for Apple sign-in.
- QR Bingo asks for a non-relay contact email without changing Apple identity.
- A submitted address is pending until the recipient confirms ownership. The old account email is retained in both Brilliant Directories and linked app Auth until then.
- Pending/expired email changes block outgoing chat and QR Bingo server-side. They do not prevent signing in, viewing the main menu, or reading website message history.
- After confirmation, the dedicated website callback synchronizes the existing app identity. It must not create or merge an account by email.

## Current test identity and scope

- Approved private Apple test account: BD member [redacted member I], Couple plan 18.
- Controlled recipient: [redacted test vendor name], member [redacted member B], with an approved test-inbox alias.
- No real customers are contacted and no account, draw entry, or prize is deleted in this test.

## Verified

- Native Release build/install/run succeeded on iPhone 17 Pro simulator, iOS 26.5, bundle `ca.weddingwin.app`.
- Existing Hide My Email login reaches the couple main menu.
- Bingo recognizes the relay email as a missing contact email; the editable contact form starts with a blank email instead of the relay address.
- Entering the relay address is rejected locally without sending a confirmation request.
- Contact email keyboard opens correctly. Swiping the form reveals the confirmation button above the keyboard; phone and optional date stay usable.
- Website `/qr` renders a compact contact-email gate and links to the website confirmation form.
- The private state table, five narrowly scoped chat/deletion triggers, and nonunique token-prefix index are installed in `launc29637_directory`.
- Indexed sender lookup uses the new token index with a one-row estimate, rather than a full member scan.
- 20 native contact-email interaction/race tests and 25 website form/chat contract tests pass. TypeScript and Expo lint pass.
- The backend shared suite passes 618 tests; five modified gate entrypoints typecheck.
- The real confirmation email reached the approved Gmail inbox. Before confirmation, BD, app profile, and Auth all retained the relay email; the Apple identity stayed linked and phone saved independently.
- Checking confirmation early displays “Not confirmed yet” and does not open Bingo.
- Rapid double-tap on Resend created exactly one additional request (private generation 2 after initial request), and the prior email link was rejected after resend.
- App chat shows the friendly confirmation-required state. Native chat mutations return 428; the website new-thread preflight returns 403.
- A canonical-owner direct database insert was rejected with SQLSTATE45000 / error1644. Explicit rollback and a subsequent count verified zero test message rows.
- Actual Chrome testing caught `no-referrer` causing Origin:null on legitimate form POSTs. Both verification pages now use `strict-origin`: the origin check is retained, URLs/tokens are not sent in referrers, and the old link reaches the expected invalid-token check. The regression is covered by 59 PHP assertions, 6 Node tests and an isolated real Chromium form test.

- The latest real confirmation link succeeded in Chrome. Merely opening the link did not change the address; the explicit confirmation POST did. BD, linked app profile, and Auth then contained the confirmed address, with the original member ID, Auth UUID, and Apple identity retained.
- App refresh cleared the chat gate. The contact form imported the confirmed address, showed that the contact details were ready, and continued to the QR Bingo agreement screen.
- One app message and one Chrome message were sent to private QA vendor [redacted member B]. Both exact test markers appeared once and were independently read back as incoming, delivered messages from the recipient account. The actual Chrome Send control is `#bd-chat-pmb-sm-sm`; its proprietary markup misspells `button` as `buton`.
- The active `/connect` renderer does not use custom widget 357. A narrowly scoped guard was therefore appended to the existing website footer; all 9,848 original footer bytes were preserved, and a fresh admin readback matched the 4,311-character artifact except the CMS-trimmed final newline. Its human-readable and minified versions each pass 8/8 tests.
- A second real contact-email change was initiated from the website. The live chat page displayed “Confirm your new email before sending messages.” Two fast clicks on the actual Send control were blocked, and the database count for that pending-attempt marker was zero.
- The second confirmation email arrived at the approved inbox. Confirming its current link succeeded; clicking “I have confirmed my email” cleared the chat notice. The unsent test draft was removed, not replayed.
- After that website confirmation, a fresh Apple login in the rebuilt simulator using Hide My Email returned to the same couple's main menu. A subsequent database read confirmed member [redacted member I] still had the verified contact email in both profile and Auth, email confirmation remained true, and the Apple identity remained linked. Apple login did not replace the confirmed contact address with the relay address.

## Scope and remaining limits

- Final controlled contact email: `[redacted test email]`. Both real ownership-confirmation emails and recipient-side delivery of app/Chrome messages were verified. A separate proprietary message-notification email was not asserted.
- Initial raw HTTP probes against the proprietary message endpoint lacked its opaque origin context and were inconclusive. They are not evidence of a product bug; actual Chrome UI, server gates, database counts, and authenticated recipient reads provide the live evidence above.
- This turn tested the native app in the iPhone simulator, not on the connected physical iPhone. The final Release build/install/run succeeded after the last copy correction.
- QR Bingo's contact gate was tested through the pre-scan agreement. No booth scan was submitted outside the configured wedding-show hours, and no draw entry or prize was created or removed.
- Website verification, backend enforcement, and the website chat notice are deployed live. Native changes are local and tested; they have not been pushed to GitHub or published to the App Store in this turn.
- The dedicated contact-email confirmation flow is covered. This report does not claim to intercept every unrelated administrative/API edit to a BD member's email.

No real customers were contacted. Existing unrelated workspace changes were preserved.
