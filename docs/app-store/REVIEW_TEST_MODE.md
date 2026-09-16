# Controlled draw review mode

Prepared September 15, 2026; status reconciled September 16 for candidate build 7. The feature was introduced in build 6 and retained in build 7. Its API and simulator walkthroughs passed, and matching private Notes are saved in Apple. Final distribution-build access and physical notification delivery remain unverified. Current execution evidence belongs in [release verification](RELEASE_VERIFICATION_2026-09-15.md).

## Accounts and scope

| Role | Fictional display name | Sign-in identifier | Internal member / private plan |
| --- | --- | --- | --- |
| Couple | Emma and Liam Parker | review.couple@weddingwin.ca | 39086 / 18 |
| Vendor | Meadow & Pine Florals | review.vendor@weddingwin.ca | 39087 / 39 |

These are the separately assigned controlled review accounts. Their fixture expires November 14, 2026. Keep access available for Apple's review and follow-up; check the fixture's exact expiry before scheduling review. The identifiers above do not assert that mailboxes exist. Passwords, tokens and private review-contact details must stay out of Git and be supplied only through Apple's private review fields or the existing private local credential record.

On the signed-in native home, these server-authorized accounts see **Review test — no real prize or email**. The same label remains visible inside the review panel. The sample workflow creates no real contest entry, legal acceptance, eligible winner, prize claim or email. It uses separate review state and authenticated test results. Other accounts cannot activate it through a request flag.

John and Jane, Cedar & Light Photography, and Willow & Bloom Floral Studio remain the earlier screenshot/chat identities described in [reviewer accounts](REVIEWER_ACCOUNTS.md). The John/Jane–Willow draw fixture is still display/scan-only: its Yes option does not create an entry and it cannot select or notify a winner. Its earlier sample QR and screenshot captures do not activate this new mode. Do not substitute its credentials for Emma/Liam and Meadow & Pine when following this guide.

## Review walkthrough

1. Sign in as Meadow & Pine Florals. On native home, open **Review test — no real prize or email**, then choose **Turn test draw on**. The saved status should show **Test draw: On**.
2. Sign in as Emma and Liam Parker, open the same review panel and select **Refresh review test** if it was already open. Choose **Use review QR sample**. This button records a simulated sample scan; it does not test the camera or a physical QR code.
3. At **Enter this vendor’s review draw?**, choose **No** to check the optional path. Sample scan remains recorded and Test entry remains Not entered. Choose **Yes** when ready to continue. The saved status changes to Entered and the Yes/No choice closes. A later No does not withdraw an existing Yes; use the vendor reset for a new cycle.
4. Return to the vendor review panel and choose **Refresh review test**, then **Select test winner**. Confirm **simulated review checks**, answer **What is 3 × 4?** with **12**, and choose **Verify test winner**. These checks do not attest to real eligibility.
5. If checking notifications, complete the device opt-in below **before** selecting Send. Then choose the separate **Send test result** button. Verification alone sends nothing. Send creates one test result for each review role, with no real prize or email; repeating the request does not create a second result for that cycle.
6. Each account can select **Refresh review test** and **View test result**. A test notification, when delivered and tapped, opens that account's authenticated review result. Signing in with the other account must not expose the recipient's result. The destination is the review panel, not a real Winner panel or claim screen.

The accounts may be used sequentially for the panel walkthrough. Use separate registered physical devices, one signed in to each role, when testing both notification recipients concurrently. Account deletion removes the signed-in account; perform it only after the other walkthrough checks and replace access before another review pass.

## Optional physical notification check

- In each account's review panel, select **Enable test notifications on this device** and allow iOS notifications. Wait for the success feedback before the vendor chooses **Send test result**. A simulator or unavailable push registration may report that a registered physical iPhone or iPad is required; that is not a successful push test.
- Opt-in applies to the current device registration and review cycle. Enable remains available to explicitly register again if the device registration changes. **Disable test notifications on this device** removes that device's review opt-in.
- A vendor result opened while signed out may initially show the couple login path. Choose **Change path → Vendor → Log In** and sign in as Meadow & Pine Florals; changing the path preserves the pending result. Alternatively, sign into the correct vendor account before tapping its notification. Signing into a different account rejects the pending result; it does not reveal the other account's data.
- Enabling after Send does not replay an earlier result. To perform another delivery check, the vendor must reset, both devices must enable again, and the sample entry/verification/Send sequence must be repeated.
- Record observed alert, sound, badge, app state and notification-tap destination separately. A saved result, device opt-in response or provider receipt alone does not prove all of those physical behaviors. No physical review-draw push verification is claimed by this document.

## Reset and repeat

Only the vendor can select **Reset review test** and confirm the reset. It clears this isolated cycle's enabled state, sample scan, entry and winner selection. Older test-result links become unavailable and old device opt-ins cannot deliver results from the new cycle. It does not clear production Bingo cards, real entries or earlier screenshot records.

For the next cycle, turn the test draw on, enable notifications again on both participating test devices, and repeat the sample scan, explicit Yes, selection, verification and Send steps. Refresh the other account's open panel after a reset.

## App Store Connect handoff

Apple’s private review Notes already match this walkthrough and were verified after reload. Before submission, verify both private sign-ins against the actual selected distribution build and preserve working access through review. The existing screenshot QR attachment should remain explicitly described as display-only, or be replaced with an attachment that accurately explains **Use review QR sample**; it must not be represented as the sample control's physical QR test. [App Review notes](APP_REVIEW_NOTES.md) tracks the private text handoff.

Passwords must not be pasted into this guide, a public listing, screenshots, repository changes or test output. Screenshot uploads and older build evidence retain their original provenance; the guide itself is not evidence of physical TestFlight or production-push acceptance.
