# Apple missing-account recovery — physical iPhone

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Scope

The owner authorized installing the updated app, deleting only the WeddingWin
account associated with `[redacted test email]`, and testing ordinary Apple
login followed by explicit signup. The phone's default Apple account must not
be used. No Apple-account deletion or iCloud settings change is authorized.

## Installed build

- Active checkout: `AppWeddingWin.ca-update-test`, branch
  `codex-fix-native-google-oauth`, including existing uncommitted changes.
- Xcode workspace: `ios/WeddingWin.xcworkspace`; scheme `WeddingWin`; Release.
- Actual target: owner's USB-connected iPhone, iOS 26.5.2.
- XcodeBuildMCP `build_run_device` succeeded on September 7, 2026 at
  approximately 11:34 UTC. The app installed and launched as `ca.weddingwin.app`.
- This build includes the missing-account explanation and guarded **Create
  account** action. It does not automatically accept terms or start signup.
- The prior code verification passed 64 app/keyboard tests and 22 backend
  classification tests, plus TypeScript. A later focused rerun passed all 31
  browser-login tests. These are automated regressions, not live Apple sign-ins.

## Website deletion and cleanup

The enrolled Apple identity resolved to member **[redacted member I]**, Couple plan **18**.
Its contact email had been updated during the earlier QR email-verification
test. The exact member ID, name and current contact email were checked in the
website admin before any deletion. Older unlinked profiles/cache-only matches
were not treated as deletion targets.

Normal website actions were used: member Actions → Delete Account → enable
only Delete Member → Yes, continue → final permanent-deletion confirmation.
The separate profile-image/file and post-deletion switches remained off.

The website showed **Member #[redacted member I] Deleted** and zero matching results.
Read-only Supabase checks confirmed full cleanup at **11:37:03 UTC**:

- Expected Apple grants: 5; snapshotted: 5; revoked: 5; pending: 0.
- Exact old profile, Auth user, sessions, Apple identity, grants, native cache,
  native exchanges and website login exchanges: all zero remaining.

No cleanup worker was forced, no unrelated member was deleted, and no Apple
password, authorization code, token or grant ciphertext is stored in this report.

## Physical interaction status

The updated app is installed. The actual phone correctly expired the deleted
member's session. The exact **Please sign in again** alert was dismissed, and
ordinary Couple **Sign in with Apple** was started. The branded iOS permission
prompt correctly names **weddingwin.ca**.

Apple initially offered the phone's default identity. The runner instead used
the visible **Use a different Apple Account** control, entered only the approved
test email, and selected the phone's saved-password **Fill Password** confirmation
only after its visible email and apple.com domain matched. The saved password
was never read into a tool response, test environment or file. No default Apple
identity was authorized and no iCloud settings changed.

The first attempt expired while the device-control checkpoints were being
established. At 11:59:42 UTC the callback failed at signed-state verification
(`state` / `state_nonce`), before browser binding, token exchange or account
creation. The observed attempt exceeded the existing ten-minute validity limit;
that limit was not weakened. No new matching account was created.

A fresh normal in-app attempt started at approximately 12:02 UTC, again using
the different-account path and the same approved saved test credential.
At 12:02:54 UTC the exact saved-password autofill confirmation was selected.
The latest passive phone observation at 12:04:26 UTC still showed the Apple
browser, not the native missing-account alert or a signed-in menu. Completion
of the current phone-side Apple/password prompt is pending.

Two separately guarded follow-up methods are prepared for the native missing-
account CTA and explicit couple signup. They have **not** been run. Twelve
offline harness guard tests pass; the 31 app browser-login regressions also
passed again during this run. No Git push or backend deployment was performed.

## Fresh-login recovery verified

The fresh attempt returned at **12:05:41 UTC**. Apple verification succeeded;
the backend returned the expected `signup_required` result without creating an
account or exchanging an app session. Physical observation 12 confirmed the
native **Create your WeddingWin account** alert and its **Create account** and
**Not now** buttons.

At **12:07 UTC**, the exact couple-specific alert's **Create account** button
was tapped once. The form opened correctly. That first harness case was marked
skipped because iOS exposes the checkbox value as `checkbox, unchecked`, which
the original guard did not recognize; this was a harness classification issue,
not an app navigation failure. After accepting only the exact observed checkbox
state format, the separate read-only postcondition case passed at **12:08 UTC**:
correct couple signup, agreement unchecked, and no automatic Apple launch.

The separately authorized explicit signup case then passed at **12:09 UTC**:
one agreement tap, checked state confirmed, then one **Sign up with Apple** tap.
The branded browser permission, **Use a different Apple Account**, approved
test email entry, and exact saved-password autofill each passed separately.
The signup attempt is waiting for completion of the current phone-side Apple
prompt. A new account and returning-user login have **not yet** been verified.

At **12:11 UTC**, passive physical observation 13 confirmed the system's
saved-password unlock prompt (Face ID/passcode). No further action was taken
on that security prompt. The previous failed-login grant cleanup had already
completed at **12:06:01 UTC**, with its stored grant erased and identity barrier
removed, before this signup attempt began.

An observation or preparation pass is not a successful signup/login.

iPhone Mirroring currently reports **iCloud Signed Out** on the Mac. No iCloud
or default Apple-account setting was changed to enable it. Physical test actions
use the existing, separately signed Xcode UI-test runner.
