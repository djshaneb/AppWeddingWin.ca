# One winner and editable prize details

Personal test identifiers and private record references are redacted in this public report. Technical findings and test outcomes are preserved.

## Requested behavior

- App and website vendor setup have one winning couple per draw, with no winner-count selector or different-couple toggle.
- Prize title/description and approximate value remain editable after opening entries and selecting a potential winner, until a winner email is claimed for delivery.
- Sending, sent, or uncertain delivery locks prize edits. A definitive no-send failure can release the lock; a retry captures the latest saved prize.
- Replacing a potential winner remains available. Existing contacts, consent evidence, original offers, and historical draw records are preserved, including older multi-winner history.
- Event dates, eligibility and other entry terms remain protected. This does not rewrite entrants' accepted snapshots or change the global rules version.

## Implementation

- Native wizard: `app/(tabs)/index.tsx`.
- Website vendor wizard: widget 328 HTML/JavaScript; existing CSS retained.
- Website couple draw summary: narrow display-copy change in widget 258.
- Linked official rules: page 4306, four corresponding operational paragraphs only.
- Both Bingo Edge endpoints expose `prize_details_locked` and `prize_details_lock_reason` independently of other material-term locks, normalize operational winner controls to one, and send the claim-time prize snapshot.
- Migration `20260908035734_qr_bingo_single_winner_and_editable_prize.sql` uses live-function baseline guards, a one-slot database guard, scoped prize/email locking, and an email-ledger prize snapshot. Existing record contents are not bulk rewritten or deleted. The CLI-created draft initially used version `20260908033841`; the filename was reconciled to the MCP-assigned live version without changing SQL, to prevent duplicate future application.

## Verified locally

- 87 native-callback / website-wizard / winner-review tests passed.
- 24 rules/UI/interaction regression tests passed.
- TypeScript app typecheck passed.
- 19 isolated PostgreSQL/PGlite checks passed against live-derived function/schema fixtures containing only fictional records, including direct insert/scope-change cap enforcement and legacy history updates.
- 10 actual Edge email-orchestration tests passed, with captured in-memory transport and no live email. These cover revised prize/value, missing snapshots, duplicate prevention, sent/busy/ambiguous deliveries, and definitive failure/retry.
- Broader QR regression suite: 251 passed; one pre-existing native fallback-name/contact-copy assertion remains outside this change.
- Migration independently reviewed for history preservation, service-role access, one-slot enforcement and lock ordering.
- Native Release built and installed on the connected iPhone; final bundle timestamp is later than the preview change. Simulator Release build/run preserved the existing test-couple session.

## Reproduction

```sh
node --test scripts/test-vendor-draw-autosave.mjs scripts/test-native-vendor-verification.mjs scripts/test-website-vendor-wizard.mjs
npm run typecheck
deno test --allow-read --allow-env supabase/functions/_shared/qr_bingo_prize_email_test.ts
QR_PRIZE_PGLITE=/absolute/path/to/pinned/pglite/dist/index.js node scripts/test-qr-prize-migration.mjs
```

The PGlite runner never connects to production. Its dependency is supplied explicitly; this task did not alter application dependencies.

## Live verification

- Backend: migration applied; `bd-qr-bingo-sync` v65 and `bd-qr-bingo-vendor-sync` v66. Exact SQL and complete Edge bundle readbacks matched. Existing custom authentication / JWT settings and dependencies were preserved; anonymous requests returned 401. Security-advisor items were unchanged.
- Complete before/after row digests remained identical: 14 settings, 1 entry, 2 draws, 2 deliveries (excluding the new null snapshot column), and 82 historical offers.
- CMS: widget 328 (history 1683, corrected script publication 1686), widget 258 (history 1685), rules page 4306 (history 1684). Round-trip source checks passed; unrelated HTML/CSS/JavaScript fields were preserved and the site cache refreshed. Browser verification caught an extra script wrapper in the initial publication; it was removed and the live page reverified successfully.
- Chrome, existing vendor #[redacted member L]: dashboard read returned 200; both prize fields editable, no winner selector or different-couple toggle. Original prize/value unchanged. Form fit at 390px and 1366px with no horizontal page overflow; temporary viewport overrides were reset. Screenshots include the existing admin toolbar, not a customer-facing control.
- Physical iPhone: final read-only Xcode UI test passed after refreshing the existing vendor wizard. Both fields opened/dismissed keyboards and retained original values. Single-winner copy was visible and the old controls absent. Phone left on Step 1 with keyboard dismissed.
- Native evidence: `harness/iphone-smoke/results/single-winner-20260907-native-report.md` and `single-winner-20260907-device-post-deploy.xcresult` in the parent workspace. Backend provenance: `harness/iphone-smoke/results/2026-09-07-single-winner-prize-backend-verification.json`.

No live winner selection, real prize modification, contact deletion, or email sending is part of this change's verification. No GitHub push was requested in this turn.

## Existing unrelated check failures

The full widget source checker still rejects pre-existing backslashes in local widget 258. Its one-winner and accessibility assertions pass. The live widget 258 change must be applied to a freshly read live source, not by overwriting it with unrelated local edits.

Two existing single-agreement assertions also expect older contact-disclosure wording / the old profile redirect, outside this request.
