# App Review notes — operator guide

Reconciled September 14, 2026 against source `533821d` (build configuration `58e3438`). **The private walkthrough is prepared; submission remains on hold.** This file is an internal guide, not text to paste into App Store Connect.

## Authoritative private notes

Use [submission/review-notes.txt](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/submission/review-notes.txt) as the single maintained Apple-facing draft. It is under Apple's 4,000-byte limit and contains no credentials. This guide no longer duplicates that text, which prevents old Yes/entry instructions from surviving in a second copy.

The current authoritative notes describe a short prize summary without promising a displayed value for the zero-value demo. They place account deletion after the other walkthrough checks because it removes the signed-in account; they do not promise a separately supplied disposable account.

The notes distinguish John and Jane (couple), Cedar & Light Photography (ordinary vendor), and Willow & Bloom Floral Studio (display-only draw fixture). The current Willow example can show the named prize prompt and No path; Yes does not create an entry, and winner selection/notice delivery cannot be tested with it. Do not describe that fixture as functional draw review access.

## Saved fields and remaining review checks

- The receiving-flag fix is deployed and normal authenticated API sends/delivery/read pass in both directions. Verify ordinary messaging on the physical TestFlight build as part of final acceptance. See [two-way chat verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/demo-chat-send-verification.json).
- Supply and test authorised functional draw access, update the notes to match it, and keep all review accounts available through review and follow-up. The display-only fixture's recorded expiry is September 21, 2026 at 20:47:37.829 UTC.
- Verify each account's actual login and email/access state. The pending Willow email update is not proof that its proposed address is a working login. The private walkthrough directs account deletion after its other checks; it removes the signed-in account and no separately supplied account is promised.
- The [sample QR](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/submission/attachments/weddingwin-review-vendor-qr.png) is uploaded, processed and persisted after reload. Its display-only access still needs a functional review solution; preserve historical offers and acceptance evidence.
- Private contact, sign-in credentials and reviewer notes including vendor credentials are saved in Apple and persisted after reload, with Save disabled. No private values are in package files. The linked plain-text notes remain the maintained public-to-this-package body; private additions exist only in Apple.
- Resolve the remaining sponsorship, privacy/retention, report handling, rights, payment and age-rating decisions; complete the distribution/TestFlight checks in the [release checklist](RELEASE_READINESS.md).
- Both scene 06 refreshes are complete and all fourteen images are uploaded with Apple previews visually checked. Screenshot preparation does not establish working entry or winner flows.

The published policy rollout supersedes the earlier missing-prize-detail and old privacy-acknowledgement findings. The couple-screen cleanup in `648e60f` preserves the agreement controls and links. See [TERMS-POLICY-UPDATE.md](TERMS_POLICY_UPDATE_2026-09-14.md), [demo setup](REVIEWER_ACCOUNTS.md) and the [current submission review](APPLE_SUBMISSION_REVIEW.md).

Screenshot uploads and TestFlight upload are complete. No App Review submission or public release is recorded. Remaining code/configuration changes keep their applicable approval requirement.
