# Apple cross-platform live tests

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

Test date: September 6, 2026. This report distinguishes observed live results
from separate offline checks. Untested paths are not implied to pass by earlier
tests or source review.

## Scope

Authorized Apple test account: `[redacted test email]`.

Platforms: WeddingWin app and WeddingWin website in Chrome. The user also
requested coverage of Apple's **Hide My Email** option. Only this authorized
test account is in the deletion scope; no other accounts were affected.

## Verified live results

### Returning website sign-in

- Opened the normal website `/login` flow in Chrome.
- Continued through `/auth/apple-start`, its agreement, and Apple's sign-in.
- Returned to `/account/home` successfully.
- The existing account remained Brilliant Directories member **[redacted member D]**, vendor
  membership plan **17**. The returning login did not create another account or
  change the member to a couple.

### Returning app sign-in and sign-out

- In the preceding app test, ordinary vendor Apple login completed through the
  branded WeddingWin gateway successfully.
- The current test exercised the app's sign-out confirmation and returned to
  the signed-out account-path chooser successfully.

### Website deletion and Apple cleanup

- Resolved member **[redacted member D]** by the exact test email before deletion.
- Deleted that member using the normal website admin detail flow:
  **Permanently Delete Member → Yes, continue**.
- The website confirmed **“Member #[redacted member D] Deleted.”**
- Opening the former website `/account/home` session subsequently redirected to
  `/login?action=loggedout`.
- The Supabase deletion job reached **complete** with full cleanup:
  expected grants **5**, snapshot grants **5**, revoked grants **5**, pending
  grants **0**.
- Follow-up checks found **zero** remaining old authentication users, profiles,
  Apple identities, grants, cached identity records, and web/native exchanges
  associated with the deleted test account.
- No other accounts were affected.

These observations establish the completed deletion checkpoint before the next
fresh signup.

### Fresh app couple signup with Hide My Email

- In the iPhone simulator, selected Apple's **Hide My Email** option and checked
  the explicit signup agreement.
- The fresh signup completed at **2026-09-07 01:36:09 UTC** and created new
  Brilliant Directories member **[redacted member E]**, couple membership plan **18**, with
  active status **2**.
- The new authentication record's email was verified. Its Apple private-relay
  domain was confirmed, and the Brilliant Directories email matched that
  verified relay address exactly. The full relay address is omitted here.
- The app opened the correct couples main menu, displayed the name **[redacted test name]**, and showed the Apple email-forwarding note. No required contact-detail
  gate blocked entry to the menu.

### Website login to the new app-created Hide My Email account

- Started ordinary Apple login from the website `/login` page in Chrome.
- Successfully reached `/account/home` as the same new member **[redacted member E]**, with
  the plan shown as **Couples**.
- The login did not remap the verified relay email or create a duplicate member.

### Returning app login to the new Hide My Email account

- Ordinary Apple login in the app succeeded as the same member **[redacted member E]**.
- The app again displayed the correct couple main menu. Fresh app signup,
  returning app login, and cross-platform website login have therefore each
  passed for this Hide My Email account.

### Second website deletion before fresh website signup

- Resolved exact member **[redacted member E]** through the normal website admin member search
  and detail page, then used **Permanently Delete Member**.
- The website confirmed **“Member #[redacted member E] Deleted.”** A browser DOM-read timeout
  was resolved with a read-only check; the deletion action was not repeated.
- Navigated away from the destructive admin URL after confirmation.
- The deletion job initially showed **3 expected grants** with cleanup pending.
  It then completed at **2026-09-07 01:40:03 UTC**, with full cleanup confirmed
  and **3 of 3** expected grants revoked. The old authentication-user and profile
  counts were both **0**.
- This completed the reset for a fresh website vendor signup using plan **17**
  and Apple's Hide My Email option.

### Fresh website vendor signup with Hide My Email

- Started at the website `/checkout/17` page, selected Apple signup, and chose
  **Hide My Email**.
- The fresh signup created new Brilliant Directories member **[redacted member F]**, vendor
  membership plan **17**, active status **2**. Its new profile was created at
  **2026-09-07 01:40:41 UTC** with a verified Apple private-relay email.

### App login to the new website-created vendor account

- Started ordinary Apple login deliberately from the app's **couple** login UI
  to test that the picker did not override an existing account's actual role.
- Login succeeded as the same website-created account, member **[redacted member F]**, plan
  **17**, and opened the correct **vendor** menu with the private-email note.
- Website vendor signup with Hide My Email and the subsequent cross-platform
  app login both passed. No app or website bug has been confirmed in these live
  checks.

### Website reset of the Hide My Email vendor

- The normal website deletion flow confirmed member **[redacted member F]** deleted.
- Cleanup completed at **2026-09-07 01:43:03 UTC**, with full cleanup confirmed
  and **2 of 2** expected grants revoked.

### Fresh app vendor signup with Share My Email

- After the completed reset, selected **Share My Email** for a fresh app vendor
  Apple signup.
- Signup passed and created Brilliant Directories member **[redacted member G]**, vendor
  plan **17**. Its new profile was created at **2026-09-07 01:43:58 UTC**.
- The email was verified, matched `[redacted test email]` exactly, and was
  not a relay address.
- The app opened the correct vendor menu without the Apple forwarding note.
  The previous account's private-relay address was not carried into the new
  Share My Email account after reset.

### Website reset before Niagara Wedding Show signup

- Deleted member **[redacted member G]** through the normal website deletion flow.
- Cleanup completed at **2026-09-07 01:45:02 UTC**, with full cleanup confirmed
  and **1 of 1** expected grants revoked.

### Fresh website Niagara Wedding Show signup with Share My Email

- Started from `/checkout/niagara-wedding-show` and completed Apple signup with
  **Share My Email**.
- Signup passed and created Brilliant Directories member **[redacted member H]**, Niagara
  Wedding Show membership plan **38**, active status **2**, with a new profile
  at **2026-09-07 01:46:04 UTC**.
- The verified email matched the authorized non-relay test email.

### App login, cancellation and retry for the show vendor

- Cross-platform app Apple login passed and opened the correct vendor menu.
- The database cache reflected the same account's plan **38** at
  **2026-09-07 01:48:54 UTC**; the account had **2** grants at that checkpoint.
- Cancelling the app's system authentication prompt returned to a usable login
  screen. A subsequent retry completed Apple login successfully.

### Website logout and final returning login

- Opened the website **Account** menu and used its **Logout** link. The website
  reached `/login?action=loggedout` successfully.
- An earlier automation action against the closed menu was a no-op, not a
  confirmed product defect.
- The final returning Apple login in Chrome passed and reached `/account/home`
  as the same member **[redacted member H]**, with the plan shown as **Niagara Wedding Show**.

### Final cleanup and account checkpoint

- Aggregate checks confirmed all deletion jobs for old members **[redacted member D]–[redacted member G]**
  completed with full cleanup. Their revoked-grant totals matched the expected
  counts: **5, 3, 2, and 1**, respectively.
- For each deleted member, old profile, authentication-user, session, and grant
  counts were **0**.
- All live flows attempted in this report have completed successfully. The
  remaining test account, member **[redacted member H]**, is left signed in on both Chrome and
  the simulator.

Member **[redacted member H]** is being left intact; no further deletion is planned in this
run. Fresh website **couple registration** has not been tested. The app results
are from the simulator and do not establish Apple login on a physical device.
No app or backend code changes were made during this live test turn; only this
report was updated. Earlier working gateway changes remain uncommitted. No app
or website bug fix has been needed for the live cases completed so far.

## Separate offline checks

An initial focused offline run passed **152** tests. This count is separate from
the additional email-security run below; the runs may overlap and are not added
together as a unique-test total.

All **29** additional offline missing/unverified-email tests passed. They verify
that a new account or exchange is blocked without a verified email, while a
trusted server-side identity can support a returning login when Apple omits the
email on a subsequent response.

These are offline security checks, not live provider observations. A verified
Hide My Email relay address is a supplied verified email; it is distinct from a
missing or unverified email response.

## Live coverage status

| Check | Status |
| --- | --- |
| Fresh app couple signup with Apple Hide My Email | Passed in the iPhone simulator |
| Correct new couple membership and new profile after that signup | Passed: member [redacted member E], plan 18; couples main menu |
| Apple's relay email retained and usable without requiring the underlying email | Passed for fresh app signup and returning website login |
| Returning app login to that new Hide My Email account | Passed: same member [redacted member E] and correct couple menu |
| Returning website login to that same new Hide My Email account | Passed in Chrome: same member [redacted member E], Couples plan |
| Second website deletion of member [redacted member E] | Passed: full cleanup, 3 of 3 grants revoked, old auth/profile counts 0 |
| Fresh website vendor signup with Hide My Email, plan 17 | Passed in Chrome: new member [redacted member F], plan 17 |
| App login to the website-created Hide My Email vendor, from couple login UI | Passed: same member [redacted member F], correct vendor menu and plan 17 |
| Website-only reset of member [redacted member F] | Passed: full cleanup, 2 of 2 grants revoked |
| Fresh app vendor signup with Share My Email | Passed: new member [redacted member G], plan 17, correct verified non-relay email |
| Prior private email not carried into a new Share My Email account after reset | Passed |
| Website reset of member [redacted member G] | Passed: full cleanup, 1 of 1 grants revoked |
| Website Niagara Wedding Show signup with Share My Email, plan 38 | Passed: new member [redacted member H], plan 38 and verified non-relay email |
| App login to the new website Niagara Wedding Show account | Passed: correct vendor menu; cache confirms plan 38 |
| App system-authentication cancellation and retry | Passed: usable login after cancel, successful retry |
| Website logout | Passed: `/login?action=loggedout` |
| Final returning website login for Niagara Wedding Show member [redacted member H] | Passed in Chrome: same member [redacted member H], Niagara Wedding Show plan |
| Fresh website couple registration | Not tested in this run |
| Physical-device Apple login | Not tested in this run |

## Evidence handling

This report intentionally omits passwords, Apple verification codes, tokens,
authorization links, raw callback URLs, and private relay addresses. It records
the scoped results rather than claiming all Apple paths are flawless. No GitHub
push or unrelated edit is part of this report update.
