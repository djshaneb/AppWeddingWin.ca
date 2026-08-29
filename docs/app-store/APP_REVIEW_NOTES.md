# App Review notes

Status: **FINAL TEMPLATE — release gates remain open.**

The paste block is under Apple's 4,000-byte limit. Put the primary couple credentials in App Store Connect's sign-in fields. This file contains no password.

Do not paste until:

- [ ] Replace only `[[PRIVATE_VENDOR_CREDENTIALS]]` from the password manager; never save the completed text.
- [ ] Both accounts and non-expiring pair access pass on processed TestFlight.
- [ ] Reset couple `38971`/isolated event; attach `sample-qr-review-vendor-38970.png`.
- [ ] Physical Apple/Google, printed QR, push, and iPad gates pass.
- [ ] Final privacy policy and draw legal/owner/operations approvals are complete.

```text
WeddingWin connects engaged couples with wedding vendors. Sign-in is required for account features.

ACCOUNTS
Use the couple account entered in App Store Connect's sign-in fields for the primary flow. It is member 38971 and displays the fictional name “App Review.”

Additional private vendor account:
[[PRIVATE_VENDOR_CREDENTIALS]]
This is member 38970. Its listing is intentionally nonpublic, but the account can open the vendor dashboard, private text chat, and the isolated review draw.

COUPLE FLOW
1. Launch WeddingWin, choose Couple, and sign in with the primary account.
2. The home screen opens Wedding Website Builder, Vendor Search, Private Messages, and QR Bingo.
3. In Private Messages, open the prepared conversation with the review vendor. Messaging is text-only in this release; image sending is disabled.
4. In QR Bingo, scan the attached QR for vendor 38970. It uses isolated event app-review-weddingwin-2026-38970 and cannot change production event data. Camera access is used only to decode QR codes; camera frames are not uploaded.

VENDOR FLOW
1. Sign out, choose Vendor, and use the additional account above.
2. Open Vendor Dashboard, Private Messages, and Vendor Draw Settings. Dashboard website content stays inside the app except approved external links.
3. The prepared conversation mirrors WeddingWin.ca text chat. The active couple can reply from the website and the reply appears in the vendor app.

MESSAGING SAFETY
Use Report only after other chat checks because it closes the current conversation. Existing history becomes read-only and the app removes the composer. The app suppresses the reported member; an externally created website thread may exist briefly until app synchronization discovers and closes it.

ACCOUNT DELETION
For a disposable signed-in account, choose About > Delete Account and confirm. This removes the login, profile or vendor listing, push tokens, QR/draw records, and other account-owned app data. Related conversations close and cannot receive new messages. Shared message history and moderation evidence may remain read-only for the other participant under the published retention policy. Apple-linked accounts may request Apple reauthentication before revocation. Do not delete either standing review account; contact info@weddingwin.ca for a disposable account.

NOTIFICATIONS AND PERMISSIONS
Notifications are optional and carry a generic new-message alert, not message text. The app requests camera access for QR scanning. Native chat photo upload, microphone access, and background-location access are not enabled in this release.

QR BINGO DRAWS
A scan does not enter a draw. Entry is a separate voluntary action after the user sees the named prize, data-sharing notice, and official rules. No purchase is required. Entry is for draw administration and prize fulfilment, not marketing. Vendors cannot view an entrant list; only a selected potential winner's disclosed contact information may be used for eligibility verification and prize fulfilment. Apple is not a sponsor and is not involved. The review fixture uses fictional data and suppresses outbound draw email.

Rules: https://www.weddingwin.ca/qr-bingo-vendor-draw-rules
Support/reset contact: info@weddingwin.ca
```
