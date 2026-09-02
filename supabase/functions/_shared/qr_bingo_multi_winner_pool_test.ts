const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
const migrationUrl = new URL(
  "../../migrations/20260830170000_add_qr_bingo_multi_winner_pool_controls.sql",
  import.meta.url,
);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function sourceFunction(source: string, functionName: string) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${functionName} is missing`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${functionName} is unterminated`);
}

function sqlFunction(sql: string, functionName: string) {
  const marker = `create or replace function public.${functionName}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${functionName} is missing`);
  const end = sql.indexOf("\n$$;", start);
  assert(end > start, `${functionName} is unterminated`);
  return sql.slice(start, end + 4);
}

Deno.test("multi-winner terms are immutable snapshots with a one-to-three limit", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  for (
    const table of [
      "qr_bingo_raffle_settings",
      "qr_bingo_vendor_offer_versions",
      "qr_bingo_raffle_entries",
      "qr_bingo_raffle_draws",
    ]
  ) {
    const tableAlter = `alter table public.${table}`;
    assert(sql.includes(tableAlter), `${table} must be migrated`);
  }
  for (
    const required of [
      "max_winners smallint not null default 1",
      "exclude_previous_winners boolean not null default true",
      "check (max_winners between 1 and 3)",
      "new.max_winners",
      "new.exclude_previous_winners",
      "participant_responsibility_disclosure_text,\n    max_winners,\n    exclude_previous_winners",
      "new.max_winners,\n    new.exclude_previous_winners",
      "create or replace function public.stamp_qr_bingo_entry_selection_terms()",
      "new.max_winners := offer.max_winners",
      "new.exclude_previous_winners := offer.exclude_previous_winners",
    ]
  ) {
    assert(sql.includes(required), `snapshot migration is missing ${required}`);
  }
  for (
    const lockName of [
      "lock_activated_qr_bingo_offer_material_terms",
      "lock_entered_qr_bingo_material_terms",
    ]
  ) {
    const lock = sqlFunction(sql, lockName);
    assert(
      lock.includes("new.max_winners") &&
        lock.includes("old.max_winners") &&
        lock.includes("new.exclude_previous_winners") &&
        lock.includes("old.exclude_previous_winners"),
      `${lockName} must lock both new material terms`,
    );
  }
});

Deno.test("entrant include and exclude changes are exact-vendor, idempotent, and audited", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const rpc = sqlFunction(sql, "set_qr_bingo_raffle_entry_selection_state");
  for (
    const required of [
      "create table if not exists public.qr_bingo_raffle_entry_selection_state",
      "create table if not exists public.qr_bingo_raffle_entry_selection_audit",
      "QR Bingo entrant selection audit is append-only.",
      "grant select, insert, update, delete\n  on table public.qr_bingo_raffle_entry_selection_state to service_role",
      "grant select, insert on table public.qr_bingo_raffle_entry_selection_audit\n  to service_role",
    ]
  ) {
    assert(
      sql.includes(required),
      `selection-state schema is missing ${required}`,
    );
  }
  for (
    const required of [
      "coalesce(auth.role(), '') <> 'service_role'",
      "normalized_actor is distinct from normalized_vendor_user",
      "and event_key = normalized_event",
      "and vendor_bingo_id = normalized_vendor",
      "and vendor_bd_user_id = normalized_vendor_user",
      "and draw.selection_status = 'potential'",
      "A preserved disqualification record cannot be removed or restored.",
      "and current_state.included is not distinct from p_included",
      "'changed', false",
      "insert into public.qr_bingo_raffle_entry_selection_audit",
    ]
  ) {
    assert(
      rpc.includes(required),
      `selection-state RPC is missing ${required}`,
    );
  }
});

Deno.test("draw limit permits up to three verified winners but only one pending review", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const guard = sqlFunction(sql, "enforce_qr_bingo_raffle_draw_limit");
  assert(
    sql.includes(
      "drop index if exists public.qr_bingo_raffle_draws_one_active_selection_idx",
    ) &&
      sql.includes("qr_bingo_raffle_draws_one_potential_selection_idx") &&
      sql.includes("(event_key, vendor_bingo_id, vendor_bd_user_id)") &&
      sql.includes("where selection_status = 'potential'"),
    "the legacy single-active index must become a one-potential index",
  );
  for (
    const required of [
      "draw.selection_status in ('potential', 'verified')",
      "existing_active_selection_count >= new.max_winners",
      "if new.selection_status = 'potential'",
      "and entry.consent_share_contact",
      "and entry.contact_share_scope = 'named_vendor_draw_administration'",
      "from public.qr_bingo_legacy_qa_archives archive",
      "for share",
      "This entrant is excluded from potential-winner selection.",
      "prior.entry_id = new.entry_id",
      "prior.selection_status in ('potential', 'disqualified')",
      "prior.event_key = new.event_key",
      "prior.vendor_bingo_id = new.vendor_bingo_id",
      "prior.vendor_bd_user_id = new.vendor_bd_user_id",
      "prior.couple_bd_user_id = new.couple_bd_user_id",
      "prior.selection_status = 'verified'",
    ]
  ) {
    assert(guard.includes(required), `draw guard is missing ${required}`);
  }
  assert(
    !guard.includes("prior.vendor_bingo_id <> new.vendor_bingo_id"),
    "a winner at another vendor must remain eligible",
  );
});

Deno.test("vendor APIs separate selection, verification, notice delivery, and pool updates", async () => {
  for (const endpointUrl of endpointUrls) {
    const source = await Deno.readTextFile(endpointUrl);
    const draw = sourceFunction(source, "drawWinner");
    const send = sourceFunction(source, "sendVerifiedWinnerNotice");
    const pool = sourceFunction(source, "loadVendorEntryPool");
    const drawRows = sourceFunction(source, "loadVendorDrawRows");
    assert(
      !draw.includes("sendDrawEmails(") &&
        draw.includes('"select_qr_bingo_potential_winner"') &&
        !draw.includes('from("qr_bingo_raffle_entries")') &&
        !draw.includes('from("qr_bingo_raffle_draws")') &&
        !draw.includes("secureUniformIndex") &&
        !draw.includes(".insert("),
      `${endpointUrl.pathname} draw selection must delegate only to the atomic database RPC and never send`,
    );
    assert(
      pool.includes('selectionStatus === "potential"') &&
        pool.includes('selectionStatus === "disqualified"') &&
        pool.includes("previousWinner") &&
        pool.includes(': "included"'),
      `${endpointUrl.pathname} must allow a verified entrant again only when the immutable exclusion policy is off`,
    );
    for (
      const required of [
        'action === "vendor_raffle_entries_get"',
        'action === "vendor_raffle_entry_update"',
        'action === "vendor_raffle_send_notice"',
        '"set_qr_bingo_raffle_entry_selection_state"',
        '"Selection Pool Status"',
        '"Selection Pool Reason"',
        "included_entry_count",
        "excluded_entry_count",
        "eligible_entry_count",
        "selection_in_progress",
        "remaining_winner_slots",
      ]
    ) {
      assert(
        source.includes(required),
        `${endpointUrl.pathname} is missing ${required}`,
      );
    }
    assert(
      send.includes("body.draw_id") &&
        send.includes('.eq("event_key", eventKey)') &&
        send.includes('.eq("vendor_bingo_id", vendor.id)') &&
        send.includes('ownedDraw.selection_status !== "verified"') &&
        send.includes("sendDrawEmails(") &&
        send.includes("suppressed_test_complete: true") &&
        send.includes("no delivery timestamp was recorded"),
      `${endpointUrl.pathname} notice action must bind one verified draw to its vendor`,
    );
    assert(
      source.includes("can_test_suppressed_notice") &&
        source.includes(
          'isolatedFixturePurpose(isolatedFixture) === "app_review"',
        ),
      `${endpointUrl.pathname} must expose an explicit no-delivery App Review send test`,
    );
    assert(
      drawRows.includes('.eq("vendor_bingo_id", vendorId)') &&
        drawRows.includes('.eq("vendor_bd_user_id", vendorBdUserId)') &&
        pool.includes('row.selection_status === "verified"'),
      `${endpointUrl.pathname} prior-winner checks must remain within this vendor promotion`,
    );
  }
});

Deno.test("winner selection is atomic, uncapped, promotion-scoped, and service-only", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const rpc = sqlFunction(sql, "select_qr_bingo_potential_winner");
  for (
    const required of [
      "coalesce(auth.role(), '') <> 'service_role'",
      "normalized_actor is distinct from normalized_vendor_user",
      "pg_advisory_xact_lock_shared",
      "'qr-bingo-alternate-entry-closure:' || normalized_event",
      "normalized_event || ':' || normalized_vendor",
      "qr_bingo_alternate_entry_reconciliation_closures",
      "latest_reconciliation > latest_declaration.declared_at",
      "with eligible as materialized",
      "entry.contact_share_scope = 'named_vendor_draw_administration'",
      "entry.draw_administration_contact_share_acknowledged_at is not null",
      "entry.promotion_responsibility_acknowledged_at is not null",
      "from public.qr_bingo_raffle_entry_selection_state state",
      "and not state.included",
      "prior.selection_status in ('potential', 'disqualified')",
      "not entry.exclude_previous_winners",
      "prior.selection_status = 'verified'",
      "count(*) over ()::integer as eligible_entry_count",
      "extensions.gen_random_bytes(16) as random_key",
      "order by random_key, id",
      "insert into public.qr_bingo_raffle_draws",
      "active_selection_count >= settings.max_winners",
      "coalesce(max(draw.draw_number), 0) + 1",
    ]
  ) {
    assert(
      rpc.includes(required),
      `atomic selection RPC is missing ${required}`,
    );
  }
  assert(
    !rpc.includes(
      "offer.event_revision is distinct from current_config.revision",
    ) &&
      !rpc.includes(".limit(") &&
      sql.includes(
        "grant execute on function public.select_qr_bingo_potential_winner",
      ),
    "atomic selection must accept materially unchanged operational publishes, avoid API caps, and remain service-only",
  );
});

Deno.test("all entrant writes and pool changes serialize before selection", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const state = sqlFunction(sql, "set_qr_bingo_raffle_entry_selection_state");
  const entryLock = sqlFunction(sql, "lock_qr_bingo_raffle_entry_promotion");
  const reconcile = sqlFunction(sql, "reconcile_qr_bingo_alternate_free_entry");
  const promotionLock = "normalized_event || ':' || normalized_vendor";
  assert(
    state.includes(promotionLock),
    "pool changes must take the promotion lock",
  );
  assert(
    entryLock.includes("locked_event || ':' || locked_vendor") &&
      entryLock.includes("when tg_op in ('UPDATE', 'DELETE')") &&
      entryLock.includes("entrant promotion identity cannot change") &&
      sql.includes("create trigger a0_lock_qr_bingo_raffle_entry_promotion") &&
      sql.includes(
        "create trigger a0_lock_qr_bingo_raffle_selection_state_promotion",
      ) &&
      sql.includes(
        "drop trigger if exists lock_qr_bingo_raffle_entry_promotion",
      ),
    "all entry writes must take the promotion lock first and remove the stale trigger name",
  );
  assert(
    reconcile.includes("pg_advisory_xact_lock") &&
      reconcile.includes(promotionLock) &&
      reconcile.includes(
        "reconcile_qr_bingo_alternate_free_entry_contact_proof_unlocked_v1",
      ),
    "Form 354 reconciliation must lock before calling the retained contact-proof implementation",
  );
});

Deno.test("account purge removes multi-couple and email-test fixture PII", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const purge = sqlFunction(sql, "purge_weddingwin_member_data");
  for (
    const required of [
      "app_review_raffle_fixture_participants",
      "qr_bingo_email_test_fixtures",
      "qr_bingo_email_test_fixture_scans",
      "email_fixture_event_keys",
      "delete from public.qr_bingo_raffle_settings",
      "delete from public.qr_bingo_email_test_fixtures",
      "purge_weddingwin_member_data_without_fixture_participants_v1",
    ]
  ) {
    assert(purge.includes(required), `account purge is missing ${required}`);
  }
  assert(
    sql.includes(
      "purge_weddingwin_member_data_without_fixture_participants_v1(text,text,text)",
    ) &&
      sql.includes("from public, anon, authenticated, service_role"),
    "retained purge implementations must be owner-only",
  );
});

Deno.test("multi-couple App Review fixture scans use the authenticated couple identity", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  assert(
    sql.includes(
      "create table if not exists public.app_review_raffle_fixture_participants",
    ) &&
      sql.includes("primary key (fixture_id, couple_bd_user_id)") &&
      sql.includes("couple_bd_user_id text not null unique") &&
      sql.includes("to service_role"),
    "fixture participants must be service-only and exact-fixture scoped",
  );
  for (const endpointUrl of endpointUrls) {
    const source = await Deno.readTextFile(endpointUrl);
    const load = sourceFunction(source, "loadAppReviewRaffleFixture");
    const readScans = sourceFunction(source, "isolatedFixtureScannedIds");
    const saveScan = sourceFunction(source, "saveIsolatedFixtureScan");
    assert(
      load.includes('from("app_review_raffle_fixture_participants")') &&
        load.includes('.eq("couple_bd_user_id", userId)') &&
        load.includes("authenticated_couple_bd_user_id: userId"),
      `${endpointUrl.pathname} must load additional couples through the service-only join`,
    );
    assert(
      readScans.includes(
        'eq("couple_bd_user_id", authenticatedCoupleBdUserId)',
      ) &&
        saveScan.includes("couple_bd_user_id: authenticatedCoupleBdUserId"),
      `${endpointUrl.pathname} fixture scans must use the authenticated couple, not the legacy fixture owner`,
    );
  }
});

Deno.test("fixture context is authenticated, exact-couple, and never fetches the website QR page", async () => {
  for (const endpointUrl of endpointUrls) {
    const source = await Deno.readTextFile(endpointUrl);
    const fixtureContext = sourceFunction(source, "isolatedFixtureContext");
    for (
      const required of [
        "fixtureCoupleId !== authenticatedBdUserId",
        "app_review_fixture: false",
        "email_test_fixture: false",
        "vendors: []",
        "scanned: []",
        "total_count: 0",
        "isolatedFixtureScannedIds(fixture, authenticatedBdUserId)",
        "vendors: [vendor]",
        "total_count: 1",
        "completed: scanned.includes(vendor.id)",
      ]
    ) {
      assert(
        fixtureContext.includes(required),
        `${endpointUrl.pathname} fixture context is missing ${required}`,
      );
    }
    assert(
      !fixtureContext.includes("loginWebsiteSession") &&
        !fixtureContext.includes("getQrPage"),
      `${endpointUrl.pathname} fixture context must never recurse through /qr`,
    );
    const branch = source.slice(
      source.indexOf('if (action === "fixture_context")'),
      source.indexOf("const isVendorRaffleAction"),
    );
    assert(
      branch.includes("fetchFullBdUserById(nativeSession.user_id)") &&
        branch.includes("loadAppReviewRaffleFixture") &&
        branch.includes("loadEmailTestRaffleFixture") &&
        !branch.includes("loginWebsiteSession") &&
        !branch.includes("getQrPage"),
      `${endpointUrl.pathname} fixture_context must authenticate and return before website session/page loading`,
    );
  }
});
