import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Reuse only the existing isolated PostgreSQL fixture bootstrap, including the
// real functions and all ten settings triggers. No network or production rows.
// An explicit boundary makes changes to that fixture fail visibly.
const fixtureUrl = new URL(
  "./test-qr-draw-reset-migration.mjs",
  import.meta.url,
);
const fixture = await readFile(fixtureUrl, "utf8");
const boundary = "\n  let first;";
assert.equal(
  fixture.split(boundary).length,
  2,
  "review fixture bootstrap boundary",
);
const bootstrap = fixture.slice(0, fixture.indexOf(boundary))
  .replaceAll("import.meta.url", JSON.stringify(fixtureUrl.href))
  .replace(
    '"@electric-sql/pglite"',
    JSON.stringify(import.meta.resolve("@electric-sql/pglite")),
  );
const correctionUrl = new URL(
  "../supabase/migrations/20260914012911_fix_vendor_draw_reset_read_permissions.sql",
  import.meta.url,
);
const correction = await readFile(correctionUrl, "utf8");
const cases = String.raw`
  // Match production: actual SQL role, not merely a service-role JWT GUC.
  await db.exec("grant usage on schema auth,extensions to service_role; revoke all on qr_bingo_event_configs,qr_bingo_draw_email_deliveries from service_role; grant select on qr_bingo_event_configs,qr_bingo_draw_email_deliveries to service_role; revoke update,delete on qr_bingo_admin_draw_reset_audit from service_role;");
  // Mirror restrictive production grants on the existing snapshot/audit tables.
  for (const table of ["qr_bingo_vendor_offer_versions", "qr_bingo_vendor_responsibility_acceptance_audit", "qr_bingo_entrant_consent_acceptance_audit", "qr_bingo_event_config_audit"]) {
    if ((await row("select to_regclass($1) relation", [table])).relation) {
      await db.exec("revoke all on " + table + " from service_role; grant select on " + table + " to service_role");
    }
  }
  for (const table of ["qr_bingo_raffle_entry_selection_audit"]) {
    await db.exec("revoke update,delete on " + table + " from service_role");
  }
  for (const table of new Set(columns.map(column => column.table_name))) {
    await db.exec("alter table " + table + " enable row level security");
  }
  await db.exec("alter table qr_bingo_admin_draw_reset_audit enable row level security");
  async function asService(fn) {
    await db.exec("begin; set local role service_role");
    try {
      const result = await fn();
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  const signature = "public.admin_reset_qr_bingo_vendor_draw(text,text,uuid,bigint,uuid,text,text)";
  const configTarget = " perform 1 from public.qr_bingo_event_configs where published order by revision desc limit 1 for share;";
  const configReplacement = " -- Published config is stable under qr_bingo_event_config_publish acquired above.";
  const deliveryTarget = " perform 1 from public.qr_bingo_draw_email_deliveries delivery join public.qr_bingo_raffle_draws draw on draw.id=delivery.draw_id\n  where draw.event_key=p_event_key and draw.vendor_bingo_id=p_vendor_id and draw.vendor_bd_user_id=p_vendor_id order by delivery.id for update of delivery;";
  const deliveryReplacement = " -- Delivery state is stable under its parent draw FOR UPDATE locks above.";
  const original = await row("select pg_get_functiondef($1::regprocedure) definition,prosecdef,proacl::text acl from pg_proc where oid=$1::regprocedure", [signature]);
  const first = await select();
  assert.equal(first.ok, true);
  const originalDraw = await row("select to_jsonb(d) value from qr_bingo_raffle_draws d where id=$1", [first.draw.id]);
  const originalConfig = await row("select to_jsonb(c) value from qr_bingo_event_configs c where published");
  await test("actual service role reproduces config SELECT FOR SHARE denial before the fix", async () => {
    const role = await asService(() => row("select current_user name,rolsuper from pg_roles where rolname=current_user"));
    assert.deepEqual(role, {name:"service_role",rolsuper:false});
    await assert.rejects(asService(() => reset(first.draw.id,0)), error => error.code === "42501" && error.message.includes("qr_bingo_event_configs"));
    assert.equal((await row("select draw_generation from qr_bingo_raffle_settings where id=$1",[settings.id])).draw_generation,0);
    assert.equal((await row("select count(*)::int n from qr_bingo_admin_draw_reset_audit")).n,0);
  });
  await test("removing only the config lock still reproduces the delivery SELECT FOR UPDATE denial", async () => {
    await db.exec("begin");
    try {
      await db.exec(original.definition.replace(configTarget,configReplacement));
      await db.exec("set local role service_role");
      await assert.rejects(reset(first.draw.id,0), error => error.code === "42501" && error.message.includes("qr_bingo_draw_email_deliveries"));
    } finally { await db.exec("rollback"); }
    assert.equal((await row("select pg_get_functiondef($1::regprocedure) definition",[signature])).definition,original.definition);
  });
  await test("migration changes exactly two redundant locks and preserves invoker security and grants", async () => {
    await db.exec(CORRECTION);
    const corrected = await row("select pg_get_functiondef($1::regprocedure) definition,prosecdef,proacl::text acl from pg_proc where oid=$1::regprocedure", [signature]);
    assert.equal(corrected.definition,original.definition.replace(configTarget,configReplacement).replace(deliveryTarget,deliveryReplacement));
    assert.equal(corrected.prosecdef,false);
    assert.equal(corrected.prosecdef,original.prosecdef);
    assert.equal(corrected.acl,original.acl);
    for (const table of ["qr_bingo_event_configs","qr_bingo_draw_email_deliveries"]) {
      assert.deepEqual(await row("select has_table_privilege('service_role',$1,'SELECT') read,has_table_privilege('service_role',$1,'UPDATE') write",[table]), {read:true,write:false});
    }
    await assert.rejects(db.exec(CORRECTION), /Unexpected admin vendor draw-reset function baseline/);
  });
  await test("actual service role resets an unsent draw and preserves entrants, history and configuration", async () => {
    const result = await asService(() => reset(first.draw.id,0));
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.from_generation,0);
    assert.equal(result.to_generation,1);
    assert.equal(result.replayed,false);
    assert.deepEqual(await row("select to_jsonb(d) value from qr_bingo_raffle_draws d where id=$1",[first.draw.id]),originalDraw);
    assert.deepEqual(await row("select to_jsonb(c) value from qr_bingo_event_configs c where published"),originalConfig);
    assert.deepEqual((await row("select to_jsonb(e) record from qr_bingo_raffle_entries e where id=$1",[entry.id])).record,entryBefore);
    assert.equal((await row("select participant_responsibility_disclosure_text disclosure from qr_bingo_raffle_settings where id=$1",[settings.id])).disclosure,settings.participant_responsibility_disclosure_text);
  });
  await test("actual service role replays exactly and rejects stale or changed reset requests", async () => {
    assert.equal((await asService(() => reset(first.draw.id,0))).replayed,true);
    for (const extra of [{actor:"Different Admin"},{reason:"Changed reason"},{vendor:"902"},{event:"another-event"},{draw:id(999)}]) {
      assert.equal((await asService(() => reset(first.draw.id,0,id(200),extra))).code,"draw_reset_request_conflict");
    }
    assert.equal((await asService(() => reset(first.draw.id,0,id(299)))).code,"draw_generation_conflict");
    assert.equal((await asService(() => reset(first.draw.id,1,id(299)))).code,"draw_not_current");
    assert.equal((await row("select count(*)::int n from qr_bingo_admin_draw_reset_audit")).n,1);
  });
  const second = await asService(select);
  let delivery;
  await test("new generation permits the same entrant but still blocks pending and expired email claims", async () => {
    assert.equal(second.ok,true,JSON.stringify(second));
    assert.equal(second.draw.draw_generation,1);
    assert.equal(second.draw.entry_id,entry.id);
    assert.notEqual(second.draw.id,first.draw.id);
    await asService(() => confirm(second.draw.id));
    delivery = await asService(() => claim(second.draw.id));
    assert.equal(delivery.claimed,true);
    assert.equal((await asService(() => reset(second.draw.id,1))).code,"draw_delivery_in_progress");
    await db.exec("update qr_bingo_draw_email_deliveries set claim_expires_at=clock_timestamp()-interval '1 second'");
    assert.equal((await asService(() => reset(second.draw.id,1))).code,"draw_delivery_in_progress");
  });
  await test("ambiguous delivery blocks reset until actual reconciliation and historical replay remains stable", async () => {
    await asService(() => finish(delivery,"ambiguous"));
    assert.equal((await asService(() => reset(second.draw.id,1))).code,"draw_delivery_uncertain");
    await asService(() => db.query("select reconcile_qr_bingo_draw_email_delivery($1,'retryable_failure','offline','Provider confirmed no delivery')",[delivery.delivery_key]));
    const ledger = await row("select to_jsonb(d) value from qr_bingo_draw_email_deliveries d where delivery_key=$1",[delivery.delivery_key]);
    assert.equal((await asService(() => reset(second.draw.id,1))).to_generation,2);
    assert.deepEqual(await row("select to_jsonb(d) value from qr_bingo_draw_email_deliveries d where delivery_key=$1",[delivery.delivery_key]),ledger);
    const replay = await asService(() => reset(first.draw.id,0));
    assert.equal(replay.replayed,true);
    assert.equal(replay.to_generation,1);
    assert.equal((await row("select draw_generation from qr_bingo_raffle_settings where id=$1",[settings.id])).draw_generation,2);
  });
  await test("ordinary SQL roles remain unable to reset even when the JWT claims service role", async () => {
    for (const role of ["anon","authenticated"]) {
      await db.exec("begin; set local role " + role);
      try { await assert.rejects(reset(second.draw.id,2,id(290)), error => error.code === "42501"); }
      finally { await db.exec("rollback"); }
    }
  });
  console.log("PASS: " + passed + " vendor draw-reset permission SQL cases; no production connections or emails.");
} finally { await db.close(); }
`;
await import(
  "data:text/javascript," + encodeURIComponent(
    bootstrap + cases.replaceAll("CORRECTION", JSON.stringify(correction)),
  )
);

// Repeat a reset after the later entry-policy and card-reset migrations. Their
// fixture has future dates, so only the selector's clock is moved past closing;
// its eligibility, locking, insertion and trigger logic remain unchanged.
const currentFixtureUrl = new URL(
  "./test-qr-card-reset-migration.mjs",
  import.meta.url,
);
const currentFixture = await readFile(currentFixtureUrl, "utf8");
const currentBoundary = "\n  const couple='703';";
assert.equal(
  currentFixture.split(currentBoundary).length,
  2,
  "review current fixture bootstrap boundary",
);
const currentBootstrap = currentFixture.slice(
  0,
  currentFixture.indexOf(currentBoundary),
)
  .replaceAll("import.meta.url", JSON.stringify(currentFixtureUrl.href))
  .replace(
    '"@electric-sql/pglite"',
    JSON.stringify(import.meta.resolve("@electric-sql/pglite")),
  );
const currentCases = cases.slice(0, cases.indexOf("  const signature =")) +
  String.raw`
  await db.exec(await readFile(new URL('../supabase/migrations/20260914012236_fix_card_reset_config_read_permissions.sql',FIXTURE_URL),'utf8'));
  await db.exec(CORRECTION);
  await insert('qr_bingo_raffle_entry_selection_state',{entry_id:entry.id,event_key:event,vendor_bingo_id:vendor,vendor_bd_user_id:vendor,included:false,exclusion_reason:'Offline excluded candidate'});
  const selectionDefinition=(await row("select pg_get_functiondef('public.select_qr_bingo_potential_winner(text,text,text,text,text,text,text,text)'::regprocedure) value")).value;
  await db.exec("create function public.test_vendor_reset_clock() returns timestamptz language sql as $$select '"+new Date(new Date(closeAt).getTime()+1000).toISOString()+"'::timestamptz$$");
  await db.exec(selectionDefinition.replaceAll('clock_timestamp()', 'public.test_vendor_reset_clock()'));
  await test("current entry/card schema allows actual service-role vendor reset without resetting either couple card", async () => {
    const selected = await asService(select);
    assert.equal(selected.ok,true,JSON.stringify(selected));
    assert.equal(selected.draw.entry_id,newEntry.id);
    const beforeEntries = (await db.query("select to_jsonb(e) value from qr_bingo_raffle_entries e order by id")).rows;
    const beforeCards = (await db.query("select to_jsonb(c) value from qr_bingo_card_states c order by event_key,couple_bd_user_id")).rows;
    const result = await asService(() => row("select admin_reset_qr_bingo_vendor_draw($1,$2,$3,0,$4,'Offline Admin','Repeat this vendor draw') value",[event,vendor,selected.draw.id,id(990)]));
    assert.equal(result.value.ok,true,JSON.stringify(result));
    assert.equal(result.value.to_generation,1);
    assert.deepEqual((await db.query("select to_jsonb(e) value from qr_bingo_raffle_entries e order by id")).rows,beforeEntries);
    assert.deepEqual((await db.query("select to_jsonb(c) value from qr_bingo_card_states c order by event_key,couple_bd_user_id")).rows,beforeCards);
    const again = await asService(select);
    assert.equal(again.ok,true,JSON.stringify(again));
    assert.equal(again.draw.entry_id,newEntry.id);
    assert.equal(again.draw.draw_generation,1);
    assert.notEqual(again.draw.id,selected.draw.id);
  });
  console.log("PASS: current entry/card migration compatibility; no production connections or emails.");
} finally { await db.close(); }
`;
await import(
  "data:text/javascript," + encodeURIComponent(
    currentBootstrap + currentCases
      .replaceAll("CORRECTION", JSON.stringify(correction))
      .replaceAll("FIXTURE_URL", JSON.stringify(currentFixtureUrl.href)),
  )
);
