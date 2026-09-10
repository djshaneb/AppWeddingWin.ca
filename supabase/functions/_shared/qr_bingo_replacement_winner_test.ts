// Offline regression contracts: no Supabase client, environment or network use.
const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
const reviewMigrationUrl = new URL(
  "../../migrations/20260830100000_add_vendor_winner_verification.sql", import.meta.url,
);
const selectionMigrationUrl = new URL(
  "../../migrations/20260901072000_disable_qr_bingo_alternate_free_entry.sql", import.meta.url,
);
const poolMigrationUrl = new URL(
  "../../migrations/20260830170000_add_qr_bingo_multi_winner_pool_controls.sql", import.meta.url,
);

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
}

Deno.test("replacement starts with an owned pending selection and documented disqualification, never an email", async () => {
  for (const url of endpointUrls) {
    const source = await Deno.readTextFile(url);
    const review = between(source, "async function reviewPotentialWinner(", "async function sendVerifiedWinnerNotice(");
    for (const required of [
      'requestedDecision === "disqualify"',
      '.eq("id", drawId)', '.eq("event_key", eventKey)',
      '.eq("vendor_bingo_id", vendor.id)', '.eq("vendor_bd_user_id",',
      'ownedDraw.selection_status !== "potential"',
      'decision === "disqualified" && !notes',
      'cleanText(body.disqualification_reason, 1000)',
      ': "review_qr_bingo_potential_winner_by_vendor"',
      'const externalVerification = decision === "verified"',
      'p_decision: decision', 'p_notes: notes',
    ]) assert(review.includes(required), `${url.pathname}: missing ${required}`);
    assert(!review.includes("sendDrawEmails("), "Disqualification/review must not send email");
    assert(!review.includes("drawWinner("), "Disqualification must not silently start another random selection");
  }
});

Deno.test("disqualification preserves the selected row and contact/proof history under a row lock", async () => {
  const source = await Deno.readTextFile(reviewMigrationUrl);
  const review = between(source, "create or replace function public.review_qr_bingo_potential_winner_by_vendor(", "revoke all on function public.review_qr_bingo_potential_winner_by_vendor(");
  for (const required of [
    "coalesce(auth.role(), '') <> 'service_role'", "for update;",
    "reviewed.selection_status <> 'potential'", "A disqualification reason is required.",
    "and event_key = btrim(coalesce(p_event_key, ''))",
    "and vendor_bingo_id = btrim(coalesce(p_vendor_bingo_id, ''))",
    "and vendor_bd_user_id = btrim(coalesce(p_vendor_bd_user_id, ''))",
  ]) assert(review.includes(required), `Review lock/ownership is missing ${required}`);
  const disqualify = between(review, "elsif p_decision = 'disqualified' then", "  else\n");
  for (const required of [
    "set selection_status = 'disqualified'", "disqualified_at = now()",
    "disqualification_reason = btrim(p_notes)", "verified_by = btrim(p_reviewed_by)",
    "where id = p_draw_id", "returning * into reviewed",
  ]) assert(disqualify.includes(required), `Disqualification must retain ${required}`);
  assert(!/\b(delete|insert|truncate)\b/i.test(disqualify), "Disqualification updates its row only");
  assert(!/winner_(email|name|phone)|email_sent_at|skill_question_verified_at/.test(disqualify),
    "Disqualification must not erase contacts, invent proof or send notices");
});

Deno.test("current in-person selector frees disqualified slots and randomly selects a remaining eligible entry", async () => {
  const source = await Deno.readTextFile(selectionMigrationUrl);
  const select = between(source, "create or replace function public.select_qr_bingo_potential_winner(", "\n$$;");
  const count = between(select, "select count(*)\n    into active_selection_count", "  -- Draw numbers");
  assert(count.includes("draw.selection_status in ('potential', 'verified')"), "Only pending/verified winners consume slots");
  assert(!count.includes("disqualified"), "Disqualification must free its slot");
  for (const required of [
    "coalesce(max(draw.draw_number), 0) + 1", "active_selection_count >= settings.max_winners",
    "prior.entry_id = entry.id", "prior.selection_status in ('potential', 'disqualified')",
    "not entry.exclude_previous_winners", "prior.selection_status = 'verified'",
    "with eligible as materialized", "extensions.gen_random_bytes(16) as random_key",
    "order by random_key, id", "'code', 'no_eligible_entries'",
  ]) assert(select.includes(required), `Replacement selection is missing ${required}`);
  const args = between(select, "select_qr_bingo_potential_winner(", ")\nreturns");
  assert(!/p_(entry_id|winner|couple)/.test(args), "The caller must not choose the replacement identity");
});

Deno.test("actual dashboard uses one slot even for legacy multi-winner settings and preserves history", async () => {
  for (const url of endpointUrls) {
    const source = await Deno.readTextFile(url);
    const dashboard = between(source, "async function getVendorRaffleDashboard(", "async function ");
    const calculation = between(dashboard, "  const activeWinnerCount =", "  const availableAt =");
    // Execute the exact production calculation, using only fake in-memory rows.
    const counts = new Function("draws", "settings", "raffleMaxWinners", `${calculation}\nreturn { activeWinnerCount, verifiedWinnerCount, drawsRemaining };`);
    for (const max of [1, 2, 3]) {
      for (const disqualified of [0, 1, 20]) {
        for (let verified = 0; verified <= max; verified += 1) {
          for (const potential of [0, 1]) {
            const rows = [
              ...Array.from({ length: disqualified }, () => ({ selection_status: "disqualified" })),
              ...Array.from({ length: disqualified }, () => ({ selection_status: "replaced" })),
              ...Array.from({ length: verified }, () => ({ selection_status: "verified" })),
              ...Array.from({ length: potential }, () => ({ selection_status: "potential" })),
            ];
            const actual = counts(rows, { max_winners: max }, (value: number) => value);
            assert(actual.activeWinnerCount === verified + potential, "Historical disqualification consumed a slot");
            assert(actual.verifiedWinnerCount === verified, "Potential/disqualified row counted as confirmed winner");
            assert(actual.drawsRemaining === Math.max(0, 1 - verified - potential), "Wrong remaining winner slots");
          }
        }
      }
    }
  }
});

Deno.test("disqualified contacts remain listed but cannot be restored into the selection pool", async () => {
  const sql = await Deno.readTextFile(poolMigrationUrl);
  const state = between(sql, "create or replace function public.set_qr_bingo_raffle_entry_selection_state(", "\n$$;");
  assert(state.includes("and draw.selection_status = 'disqualified'"), "Pool restoration must check preserved disqualification");
  assert(state.includes("A preserved disqualification record cannot be removed or restored."), "Preserved disqualification cannot be undone through pool controls");
  for (const url of endpointUrls) {
    const source = await Deno.readTextFile(url);
    const pool = between(source, "async function loadVendorEntryPool(", "async function vendorRaffleEntriesResponse(");
    const entryFilter = between(pool, "  const entries = entryRows.filter", "  const priorWinnerCoupleIds");
    assert(!entryFilter.includes("disqualified"), "Do not remove disqualified contacts from the list");
    assert(pool.includes('selectionStatus === "disqualified"'), "Expose preserved disqualification as a pool state");
    assert(pool.includes('selectionStatus !== "disqualified"'), "Disqualified entry must have no pool edit control");
    assert(pool.includes('in_selection_pool: selectionEligible && poolStatus === "included"'), "Only included eligible entries may be redrawn");
  }
});

Deno.test("no-reason replacement is atomic, actor-scoped and distinct from disqualification", async () => {
  const migration = await Deno.readTextFile(new URL(
    "../../migrations/20260905143000_add_atomic_potential_winner_replacement.sql", import.meta.url,
  ));
  const rpc = between(migration, "create or replace function public.replace_qr_bingo_potential_winner_by_vendor(", "\n$$;");
  const args = between(rpc, "replace_qr_bingo_potential_winner_by_vendor(", ")\nreturns");
  assert(!/reason|notes|eligibility|couple/i.test(args), "Caller supplies no reason, eligibility claim or preferred winner");
  for (const required of [
    "coalesce(auth.role(), '') <> 'service_role'", "normalized_actor is distinct from normalized_vendor_user",
    "pg_catalog.pg_advisory_xact_lock", "normalized_event || ':' || normalized_vendor", "for update;",
    "where id = p_draw_id and event_key = normalized_event", "and vendor_bd_user_id = normalized_vendor_user",
    "previous.selection_status <> 'potential'", "'selection_not_pending'",
    "set selection_status = 'replaced'", "Vendor requested another potential winner.",
    "result := public.select_qr_bingo_potential_winner(", "exception when sqlstate 'PZR01' then",
    "'no_replacement_available'", "replacement.couple_bd_user_id = previous.couple_bd_user_id",
    "replacement.entry_id = previous.entry_id", "set replaces_draw_id = previous.id",
  ]) assert(rpc.includes(required), `Atomic replacement missing ${required}`);
  assert(rpc.indexOf("pg_catalog.pg_advisory_xact_lock") < rpc.indexOf("select * into previous"),
    "Serialize same-promotion concurrent requests before locking the old draw");
  assert(!/disqualified_at\s*=|disqualification_reason\s*=|email_sent_at\s*=|delete from|claim_.*email|send_.*email/i.test(rpc),
    "Replacement must not invent a disqualification, erase a contact or send mail");
  assert(migration.includes("create unique index qr_bingo_one_replacement_per_selection") &&
    migration.includes("on public.qr_bingo_raffle_draws(replaces_draw_id)"),
    "One old selection can have only one replacement");
  assert(migration.includes("'prior.selection_status in (''potential'', ''disqualified'', ''replaced'')'") &&
    migration.includes("'and draw.selection_status in (''disqualified'', ''replaced'')'"),
    "Replaced entries must stay out of both random selection and manual pool restoration");
  assert(migration.includes("A preserved selection record cannot be removed or restored."),
    "A requested replacement must not be described as an eligibility disqualification");
});
