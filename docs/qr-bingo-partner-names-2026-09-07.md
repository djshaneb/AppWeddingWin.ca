# QR Bingo partners' first names — 2026-09-07

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Change

- App and live website `/qr`: persistent label **Your name & your partner’s name**, helper **First names are fine.**, and placeholder **e.g. Alex & Jamie**.
- One combined field is retained; no surname requirement or split-field migration. Native input now shares the website/backend 160-character limit.
- Native missing-name prompts and accessibility labels use the same simple language. Physical-test harness recognition was updated to the new labels without changing its safety guards.
- Only widget 258's contact-name markup and one scoped CSS rule were published. Its JavaScript and all unrelated live content were preserved. Exact readback and automatic cache refresh succeeded.
- No backend implementation change or new backend deployment was required. Existing contact storage and draw-contact mapping preserve the combined name; account identity remains separate.

## Verification

- **75 frontend and harness tests passed**, including native save/reload, website form submission, PHP syntax/render checks, date/phone regressions, and test-surface guards.
- **24 backend contact-profile tests passed**, including combined first names with ampersands, `and`, accented characters, and hyphens. Existing validation, scoped storage and draw-contact mapping preserve the complete name.
- **18 isolated PostgreSQL migration tests passed**, including actual persistence of **Alex & Jamie** to the profile, existing opted-in draw entries, newly created entries, and scoped admin reports. These tests ran only in local in-memory PGlite, never against production. The harness initially lacked its runtime environment variable; it passed after using the existing installed runtime.
- TypeScript (`tsc --noEmit`) and `git diff --check` passed. An initial invocation used an obsolete `app-tsconfig.json` path; the actual repository configuration was then tested successfully.
- Release app built and launched in iPhone 17 Pro simulator (iOS 26.5).
- Existing test couple **[redacted member K]**: website saved **Alex & Jamie** (profile version 5), then reopened with the exact value. Native app fetched the same value from the website save.
- Native app saved **Jamie & Alex** (version 6). Both native editor and Chrome reloaded and reopened with that exact value. Database readback confirmed version 6, with contact email, phone, wedding date and venue unchanged; `date_sync_pending=false`.
- Chrome mobile viewport **390 × 844** and native screenshot showed the label, helper and input without clipping. The temporary browser viewport was reset.
- No scans, draw entries, winner selections, emails, account identity changes or account deletions were performed for this test. The test contact name remains **Jamie & Alex**.

The Release build was also successfully installed and launched on the connected physical iPhone (iOS 26.5.2), preserving its existing session. Simulator save testing above is not represented as a physical-device save test. No GitHub push was performed in this task.
