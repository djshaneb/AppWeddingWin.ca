# WeddingWin App / QR Bingo Handoff Context

Last updated: 2026-05-24

## Project

- Local app project: `C:\Users\Shane\Documents\New project\AppWeddingWin.ca`
- Main app file most work has happened in: `app/(tabs)/index.tsx`
- Supabase function work:
  - `supabase/functions/bd-qr-bingo-sync/index.ts`
  - `supabase/functions/bd-qr-bingo-vendor-sync/`
- Recent migrations:
  - `supabase/migrations/20260522000100_limit_qr_bingo_raffle_draws.sql`
  - `supabase/migrations/20260523000100_remove_qr_bingo_claim_instructions.sql`
  - `supabase/migrations/20260523000200_allow_test_vendor_100_qr_bingo_draws.sql`
- Current Expo tunnel from prior work:
  - Port: `8081`
  - Tunnel URL seen earlier: `exp://spx3siw-anonymous-8081.exp.direct`
  - QR image path: `C:\Users\Shane\Documents\New project\AppWeddingWin.ca\expo-current-qr.png`

## Website / BD Pages

- Main site: `https://www.weddingwin.ca`
- Vendor draw page: `https://www.weddingwin.ca/qr-bingo-vendor-draw`
- QR Bingo scanner page: `https://www.weddingwin.ca/qr`
- Vendor dashboard: `https://www.weddingwin.ca/account/home`
- Website builder SSO: `https://www.weddingwin.ca/builder-sso`
- Admin: `https://ww2.managemydirectory.com/admin/index.php`

Important BD/live notes:
- Writes to BD are live production writes.
- Use BD tools carefully, especially for widgets/pages/email templates.
- For website-only users, QR Bingo vendor draw must remain available on the website, not only the app.
- Emails must be sent the Brilliant Directories way, not by a separate external email path.
- The user does not want public/user-facing text mentioning “Brilliant Directories”; use “WeddingWin.ca” or “WeddingWin”.

## QR Bingo / Vendor Draw Feature

Purpose:
- Couples scan vendor QR codes at wedding shows.
- Scanning all participating vendors makes couples eligible for the WeddingWin grand prize.
- Individual vendors can optionally turn on their own booth prize draw.
- If vendor prize entries are enabled, couples who scan that vendor can opt in with one tap.
- WeddingWin already has couple contact details; vendors should not need paper forms at the booth.

Vendor draw requirements:
- Only vendors/listings that are part of QR Bingo can use the vendor draw settings.
- Vendors can enable/disable prize entries.
- When enabling prize entries, they accept vendor draw rules.
- Prize details are one text box now.
- Removed separate fields:
  - Prize title field
  - Claim instructions field
  - Vendor contact note/backend field
- First line of Prize details is used as the draw item/prize name.
- Winner email is standardized to help delivery and avoid spam.
- Vendors can export opt-ins as CSV and TXT.
- Vendors can pick winners after the show opens for drawing.
- Event/draw opens after: October 18, 2026 at 3:00 PM America/Toronto.
- Normal accounts limited to 3 winner selections.
- Member ID `23608` is allowed 100 winner selections for testing.

Vendor draw website page current layout:
1. Header/infographic
2. `Prize setup`
3. `1. Set up your prize`
4. Accept prize entries toggle/rules acceptance
5. Prize details text box
6. Couple email preview
7. Prize entries section with export buttons
8. Winner selection section
9. Winner history

Current approved infographic:
- Website URL: `https://www.weddingwin.ca/images/weddingwin-page-assets/qr-bingo-vendor-draw-show-flow-final.webp`
- App asset: `assets/images/qr-bingo/vendor-draw-infographic.webp`
- Must shrink to fit screen in app; no horizontal overflow.

Brand/button color requested:
- Primary draw page button color: `#aa565d`
- Other colors should adapt around that.

## App Vendor Draw Page

The app page should stay synced to `https://www.weddingwin.ca/qr-bingo-vendor-draw`.

Recent app cleanup:
- Removed extra app-only content that did not exist on website:
  - Vendor name line at top
  - “Booth draw, no paper slips” info card
  - Scan / Opt in / Entries sync / Pick winner pills
  - Extra grand-prize paragraph
- Current app flow now mirrors website:
  - Infographic
  - Prize setup
  - Set up your prize
  - Accept prize entries toggle
  - Prize details
  - Couple email preview
  - Prize entries
  - Winner selection

Recent autosave/listening fix in `app/(tabs)/index.tsx`:
- App vendor draw autosave was glitching like another listener/window was fighting input.
- Fixed by:
  - Tracking local edit timestamps.
  - Avoiding rehydrating form fields from autosave responses while user is typing.
  - Allowing only one save in flight at a time.
  - Removing the full `vendorRaffle` response object from the autosave effect dependency.
  - Queueing latest changes after save completes instead of jumping back to older saved values.
- Typecheck passed after this change: `npm.cmd run typecheck`.

Important behavior:
- The app and website should use the same draw record/data.
- The app no longer needs a “Website page” button on vendor draw screen.
- App vendor dashboard should include:
  - Private chats
  - Vendor Bingo draw settings
  - Link to vendor dashboard: `https://www.weddingwin.ca/account/home`

## Email Formatting

Email goals:
- Use BD email system.
- Avoid spammy/free-form vendor-written email content.
- Couple email should be short, clean, and standardized.
- Vendor prize details should populate the standardized email, not create a large vendor-written email body.

Current couple email copy direction:
- Subject: `Your name was selected for a QR Bingo booth draw`
- Greeting in preview: `Hi First Name,`
- Body:
  - `Congratulations, your name was selected by [Vendor Name] for their draw.`
  - `Your draw`
  - `Vendor: [Vendor Name]`
  - `Draw item: [first line of prize details]`
  - `What happens next`
  - `[Vendor Name] will follow up with prize details and next steps.`
  - Button: `View vendor profile`
  - Why received: `You opted in after scanning this vendor's QR code at the wedding show.`
  - Footer: `WeddingWin.ca`

Vendor email direction:
- Vendor receives winner contact details.
- Couple receives only a short notice that they were selected and that vendor will follow up.
- Avoid duplicate prize content.
- Include vendor profile/listing link in couple email when available, cleanly as a button/link.

Known previous bug:
- BD page `content_footer_html` JavaScript had backslashes/regex stripped by BD, causing preview strings like vendor name `Sound Of Harmony` to become `Sou`.
- Fixed by avoiding regex/backslash-sensitive JS in BD page script.

## App Chat / Wrapper Notes

Implemented/expected chat behavior:
- Native app chat syncs with website private member chat.
- Chat bubble should stay hidden unless there is an unread message.
- New message alerts should update bubble anywhere in app when logged in.
- Pleasant ding and vibration requested.
- If user is currently in chat and reads the message first, alert is no longer needed.
- App chat should be more Messenger-like: clicking a chat opens only that conversation window.
- App chat should support images/profile photos/logos/report button similarly to website.
- Company name should display in chats when account has a company name.
- Report button should show report/cancel confirmation popup in app.

Wrapper notes:
- Website logout and app logout should stay synced.
- Wrapped website has app back/forward buttons at the top middle.
- Spinner should show only while URL is actually loading.
- Back button sometimes needed double tap previously; fixes were made around spinner/back acknowledgement.
- For `https://wedwebsite.ca/`, content should sit below app forward/back arrows; arrows moved higher and a bit smaller.

## Signup / Wizard Notes

App onboarding flow:
- First wizard screen asks only:
  - Couple
  - Vendor
- Couple signup:
  - Sign up with Apple
  - Sign up with Google
  - Sign up with email near email form
  - Membership Plan ID: `18`
  - Wedding date should not be on signup stage; collected later for couples.
- Vendor signup:
  - Sign up with Apple
  - Sign up with Google
  - Sign up with email near email form
  - Membership Plan ID: `17`
  - Vendors should not be prompted for wedding date.
- New signups should agree to Privacy Policy and Terms of Use.
- Email already exists should be shown clearly.
- If Apple hides email and user changes email, user must confirm they own it before continuing.
- App email confirmation page/widget was approved and created on BD side.
- Confirmation email should be able to take them back to the app where possible.

## App Menus

Couples app menu:
- Appears at end of app wizard and after couples log in.
- Only for couples accounts.
- Menu options:
  - Wedding Website Builder -> `https://www.weddingwin.ca/builder-sso`
  - Vendor Search Dashboard -> `https://www.weddingwin.ca/account/home`
  - Private Chat Messages -> native app chat
- Tiny non-invasive bottom-center button should take users to couples app menu.

Vendor app menu:
- Should include:
  - Private chats
  - Vendor Bingo draw settings
  - Vendor dashboard link -> `https://www.weddingwin.ca/account/home`

## QR Scanner App Version

Scanner purpose:
- App version of `https://www.weddingwin.ca/qr`.
- Couples scan each vendor QR code at a wedding show.
- If all vendor QR codes are scanned, they are eligible for the grand prize.

Event detail used in app card:
- Saturday, October 18, 2026
- Americana Niagara Resort
- Niagara Falls

Scanner behavior:
- If same QR code scanned again, show clear feedback over camera screen.
- When all QR codes scanned, show celebratory/completion message.
- Vendor draw opt-in popup appears when scanning a vendor with prize entries enabled.
- Popup must explain Wedding Win Inc. will share the couple's contact info with that vendor if they opt in.

Known issue previously asked:
- App showed 72 vendors then jumped to 71, probably because one vendor was missing profile data or was filtered after hydration. Need preserve if reappears.
- User asked which tag app reads for vendor bingo; context likely in QR Bingo sync function.

## Current Git / Working Tree Notes

At last check there were uncommitted changes including:
- `app/(tabs)/index.tsx`
- `supabase/functions/bd-qr-bingo-sync/index.ts`
- New/untracked:
  - `assets/images/qr-bingo/`
  - `expo-current-qr-matrix.json`
  - `supabase/functions/bd-qr-bingo-vendor-sync/`
  - migrations listed above

Do not reset or discard changes unless explicitly requested.

## Browser / Chrome Notes

- Chrome extension has been used successfully before.
- Chrome extension browser id seen earlier: `-3e31-4af7-be56-d5939a799c43`
- In-app browser id seen earlier: `-0030-4bdb-a78a-99c57fceb76d`
- Chrome was logged into vendor account `Sound Of Harmony` on the vendor draw page during recent audits.
- In-app browser was sometimes logged into a couple account and showed “This account is not on the QR Bingo vendor list.” Use the real Chrome tab/account for vendor page comparison when needed.

## Test Accounts

The user provided test accounts earlier in chat. For safety, this handoff does not store passwords in this file. Ask the user to paste credentials again if needed.

Known test identifiers:
- Vendor/Sound Of Harmony account has Member ID `23608`.
- Couple test email used in QR entries: `weddingwin50@gmail.com`

## Useful Commands

From project root:

```powershell
npm.cmd run typecheck
```

Launch Expo tunnel:

```powershell
$env:EXPO_NO_TELEMETRY='1'; npx.cmd expo start --tunnel --port 8081 --clear
```

If PowerShell blocks `npm`/`npx`, use `npm.cmd` / `npx.cmd`.

## Recent Verification

- `npm.cmd run typecheck` passed after app autosave/listening fix and app draw cleanup.
- Expo tunnel rebuilt app bundle successfully after recent edits.

## User Preferences / Style

- User wants practical, working changes, not long theory.
- They want app screens cleaner and more professional.
- Remove unnecessary URLs or internal platform names from user-facing app UI.
- Use website page as the source of truth when app/website versions should match.
- If something is wrong visually, connect to Chrome and audit visually.
- Keep copy simple and easy to understand.
