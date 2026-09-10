# QR Bingo contact profiles — implementation and preflight

## Contract

QR contact details are independent of the account login email and its ownership-confirmation state. Existing native-session and signed website-couple boundaries bind every request to the fresh BD member; only active couple plans may get/save contacts. The event is chosen by the server from the published event or an authorized isolated fixture.

Both QR Edge endpoints accept `contact_profile_get` and `contact_profile_save`. Save receives `contact_profile: {name,email,phone,wedding_date?,wedding_venue?,expected_version}` and an optional checked `expected_event_key`. Responses include the existing `event_config`, `event_key`, `contact_profile`, `profile_complete`, and `missing_profile_fields`. The contact profile includes `event_key`, `couple_id`, fields, version, saved/complete state and missing fields. A prefilled profile is not complete until explicitly saved.

Contact email must be a valid direct email (not Apple private relay), but QR-only contact save does not send confirmation mail or modify BD/Auth account email, account proof, Apple subjects, or login bindings. Name, email and phone are required; a blank wedding date is allowed. Wedding dates are validated as real ISO calendar dates. Omitted date means retain; explicit empty means clear.

Wedding date alone is copied to the canonical BD `users_data.wedding_date` field and any pre-existing same-member `users_meta.wedding_date` shadows. Explicit physical clear uses `wedding_date=&__clear_fields=wedding_date`; confirmed metadata rows use `value=&__clear_fields=value`. No metadata is created or deleted. A durable pending flag and version-bound readback prevent false success and repair a concurrent stale date write; contact GET retries a pending sync. A failed save propagation returns `contact_date_sync_pending` (503), while the QR contact save remains committed. A GET with continued propagation failure returns that saved, editable profile with `date_sync_pending:true` and a safe warning instead of trapping the user outside the editor.

## Contact access and consent

The migration creates service-role-only RLS-protected contact, contact-history, and export-audit tables. Contact saves use version comparison and member/event advisory locks. Only existing same-event, same-couple QR entries with explicit named-vendor sharing and marketing consent receive operational name, email, phone, wedding date and optional venue fields. There is no entry insertion and no scan-only vendor access. Archive rows are excluded. Consent versions, acceptance times, offer snapshots and other entry fields remain unchanged.

Existing offer and rules triggers allow only a full-row-equal-except-contact update, retaining archived-row and material-write checks. The entry-identity reservation allows a previously reserved address only for the same exact entry; cross-couple duplicates still fail and roll back the whole contact save. A before-insert trigger uses the latest saved contact profile to close the stale opt-in snapshot race.

Winner snapshots remain historical and admin column labels say “at selection.” This change does not rewrite old winner notices or alter sent-email idempotency.

Deletion uses the existing canonical hash-only deleted-identity marker. A service-only guard serializes save/insert against the existing account-purge wrapper and rejects deleted members. The wrapper purges that member's contact profiles across all events; contact-history rows cascade. Neither other members nor the existing shared-chat retention policy changes.

## Admin data

`bd-qr-bingo-admin` handles `data_list`, `data_export`, and scan-only `data_export_audit` only after its existing signed-admin verification. Contacts, entries and winner data use literal search, exact event/vendor filters and bounded pagination. Lists allow 1–100 rows; CSV export rejects totals above 5,000 or incomplete results rather than returning an unlabeled partial file. Explicit operator identity is required for download audit. CSV quotes and formula-prefix escaping are applied before output.

Real website scan data remains in BD `vendor_visits.scan_date`; the website admin plugin owns its bounded query/export. That table stores the most recent scan for a couple/vendor, not an immutable all-event scan history. The scan-audit action accepts only metadata, not client-provided contact records.

## Offline verification

The following counts describe the initial contact-profile handoff; final follow-up counts are recorded below.

- All three modified Edge entrypoints passed `deno check`.
- The complete shared Edge test suite passed: **667 tests, zero failures**. `git diff --check` also passed.
- 93 focused Deno tests passed: new contact/admin/date tests (18), existing email length (14), account-email proof (18), native/website contact gate (10), and website signature adversarial (33).
- 13 executable PostgreSQL migration tests passed in isolated PGlite 0.5.8. This executes the actual migration with schema-only current column definitions; test identities and records use `example.test`. Existing unrelated deletion work is stubbed, not claimed as re-tested.
- PostgreSQL cases cover current and older explicit draw opt-ins after close, unchanged non-sharing/archived/different-event/couple controls, version conflicts, A→B→A reservation, other-couple duplicate atomic rollback, material-write/archive rejection, shared settings/grand-prize trigger compatibility, date/relay validation, stale insert snapshot repair, admin filters and bounds, denied client privileges, exact-member all-event deletion/audit cascade, and no contact resurrection after deletion.

Run the database harness with a pinned PGlite installation outside the repository:

```sh
QR_CONTACT_PGLITE=/absolute/path/to/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-qr-contact-migration.mjs
```

The harness never opens a production database connection. PostgreSQL schema-only fixture: `scripts/fixtures/qr-contact-schema-columns.json`. No production records, auth secrets or tokens are included.

## Deployment order / limits

Apply `20260907132342_add_qr_bingo_contact_profiles.sql` first, then deploy the two QR endpoints and their new/shared helper changes, then the admin endpoint/helper and website/native UI. Existing live dependencies should be retained unchanged. At backend handoff, no production schema, member, widget or email mutation had been performed by this implementation agent. Live coupled app/website/date/admin verification belongs to the parent task and must be recorded separately.

## Optional wedding venue follow-up

After the parent deployed the original contact migration, the user requested a wedding venue option when a wedding date is selected. The additive follow-up is `20260907134716_add_qr_bingo_optional_wedding_venue.sql`; the already-applied initial migration was not edited.

- `contact_profile.wedding_venue` is an optional string, bounded to 200 characters with markup/control characters rejected. Missing old-response venue defaults to empty. No venue is guessed from BD account fields.
- Omitted venue preserves the existing value while a date remains. Clearing the date clears venue in both the profile and opted-in operational entry snapshots. Explicit blank venue clears only venue.
- The uniquely named `save_qr_bingo_contact_profile_with_venue` avoids overloaded RPC ambiguity. The existing eight-argument save RPC remains as a compatibility wrapper, with omitted venue preserved under the same member/event locks and version check.
- Venue is copied by the existing insert snapshot trigger and narrow contact-only draw refresh. It is included in contact-history audit, admin contacts/entries data and search, and named-vendor contact row/CSV output as `couple_wedding_venue`. Historical winner snapshots remain unchanged.
- BD propagation still writes only `wedding_date` (and the existing date-clear directive). Account email, email proof, Apple identity and BD venue fields are not modified.
- The updated harness executes both migrations: **17 PostgreSQL tests passed**. New venue tests cover old clients, date clearing, validation, audit/snapshot persistence, admin filtering and RPC permissions. The complete shared Edge suite passed **671 tests, zero failures**; all three modified Edge endpoints type-check.

For release, apply the venue follow-up migration before deploying the venue-aware helpers/endpoints and UI. The parent owns live release and end-to-end verification; this backend agent made no live changes.

## Date-shadow repair and live release evidence

The parent deployed both migrations and the venue-aware endpoints, then found a
live clear discrepancy: the Couples dashboard's direct physical date was blank,
but the merged member API still returned an old existing metadata date. The raw
parent date clear had succeeded. The installed connector's fixed native-column
allowlist routes ordinary `wedding_date` writes to metadata instead, while its
clear directive goes only to the parent endpoint. Those paths had left two
stored copies inconsistent.

Shared `bd_wedding_date.ts` now synchronizes only list-confirmed existing rows
scoped to `database=users_data`, the authenticated member ID, and
`key=wedding_date`. It validates every returned identity before any metadata
write, preserves unrelated fields, never creates/deletes metadata, and verifies
both metadata and merged member readback. Permission failures stop with a safe
diagnostic rather than using an alternate route. The same helper is used by
normal profile saves without changing their account-email ownership checks.

The parent reported these completed live checks on the authorized test couple:

- QR sync **62** and vendor sync **63** deployed with the helper.
- Clearing through the normal Chrome QR form produced profile version **3**
  with blank date and venue, `date_sync_pending:false`, blank merged API date,
  and a blank dashboard countdown showing **Start Timer**.
- The original date **2027-06-12** was restored with the test venue through the
  same form, yielding profile version **4**, `date_sync_pending:false`.
- Normal `bd-complete-profile` **28** was published with only the four reviewed
  date-sync entrypoint blocks plus the new helper. All eleven pre-existing
  dependencies were retained unchanged; JWT verification remains enabled.

The final pagination hardening rejects non-first/current-page contradictions,
malformed counts, and a full 25-row result without explicit matching total and
one-page proof. Brilliant Directories populates `next_page` even on the last
page, so it is accepted only when `total` matches the complete rows and
`current_page=total_pages=1`; its presence alone is not used to declare another
page. This last guard is staged separately from the live versions above.

Final focused tests: **63 passed** (23 metadata-shadow, 23 QR contact/admin,
17 real profile-handler tests). All three affected endpoints type-check. The
full shared Edge test suite after this last guard passed **697 tests, zero
failures**. `git diff --check` passed. No production writes were made by the
backend implementation agent; live actions and verification were owned by the
parent task.
