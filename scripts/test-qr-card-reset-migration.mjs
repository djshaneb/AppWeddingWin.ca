import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Isolated PostgreSQL/WASM. No production connections, credentials or email.
// Run: node scripts/test-qr-card-reset-migration.mjs
// Optional QR_ENTRY_PGLITE=/absolute/path/to/pglite/dist/index.js overrides the pinned package.
// Fixtures are read-only pg_catalog/column metadata snapshots from 2026-09-10; no live rows.
const runtime = process.env.QR_ENTRY_PGLITE;
const testNow = Date.now();
const closeAt = new Date(testNow + 176400000).toISOString();
const showAt = new Date(testNow + 172800000).toISOString();
const earlyAt = new Date(testNow - 3600000).toISOString();
const { PGlite } = await import(
  runtime ? pathToFileURL(runtime).href : "@electric-sql/pglite"
);
const db = new PGlite();
const columns = JSON.parse(
  await readFile(
    new URL("./fixtures/qr-reset-schema-columns.json", import.meta.url),
    "utf8",
  ),
);
const before = await readFile(
  new URL("./fixtures/qr-reset-live-functions.sql", import.meta.url),
  "utf8",
);
const helpers = await readFile(
  new URL("./fixtures/qr-reset-live-helpers.sql", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260910195501_add_admin_vendor_draw_reset_generations.sql",
    import.meta.url,
  ),
  "utf8",
);
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
async function row(sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
async function insert(table, data) {
  const keys = Object.keys(data);
  return db.query(
    `insert into public.${table} (${keys.join(",")}) values (${
      keys.map((_, i) => "$" + (i + 1)).join(",")
    }) returning *`,
    Object.values(data),
  );
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const event = "offline-prize-test",
  vendor = "901",
  rules = "2026-09-01-in-person-entry",
  stamp = "2026-01-01T00:00:00Z";
const terms = {
  vendor_name: "Offline Vendor",
  prize_title: "Original prize",
  prize_description: "Original description",
  prize_approx_value_cad: 100,
  eligibility_region: "Ontario",
  entry_closes_at: closeAt,
  draw_opens_at: closeAt,
  draw_at: closeAt,
  odds_basis: "Equal chance",
  no_purchase_required: true,
  skill_testing_question_required: true,
  official_rules_url: "https://www.weddingwin.ca/qr-bingo-vendor-draw-rules",
  alternate_free_entry_url: "https://www.weddingwin.ca/qr-bingo",
  administrator_name: "Wedding Win Inc.",
  co_sponsor_name: "",
  prize_provider_name: "Offline Vendor",
};
const acceptance = {
  enabled: true,
  legal_terms_accepted: true,
  legal_terms_version: rules,
  legal_terms_accepted_at: stamp,
  rules_viewed_at: stamp,
  apple_non_sponsor_acknowledged: true,
  vendor_responsibility_acknowledged: true,
  vendor_responsibility_acknowledged_at: stamp,
  vendor_responsibility_version: rules,
  vendor_responsibility_disclosure_text: "Vendor responsibilities",
  participant_responsibility_disclosure_text:
    "By entering, I confirm that I visited this vendor booth in person at the wedding show and scanned its QR code. Other prize, privacy and marketing terms remain unchanged.",
};
const settings = {
  id: id(1),
  event_key: event,
  vendor_bingo_id: vendor,
  vendor_bd_user_id: vendor,
  ...terms,
  ...acceptance,
  max_winners: 1,
  exclude_previous_winners: true,
  updated_at: stamp,
};
const entry = {
  id: id(10),
  event_key: event,
  vendor_bingo_id: vendor,
  vendor_bd_user_id: vendor,
  ...terms,
  couple_bd_user_id: "701",
  couple_name: "Alex and Sam",
  couple_email: "alex@example.test",
  couple_phone: "5550101001",
  couple_wedding_date: "",
  vendor_offer_version: stamp,
  consent_share_contact: true,
  consent_version: rules,
  consent_text: "Explicit consent",
  contact_share_scope: "named_vendor_draw_administration",
  draw_administration_contact_share_acknowledged: true,
  draw_administration_contact_share_acknowledged_at: stamp,
  draw_administration_contact_share_version: rules,
  draw_administration_contact_share_consent_text: "Explicit sharing",
  rules_viewed_at: stamp,
  apple_non_sponsor_acknowledged: true,
  age_of_majority_attested: true,
  residency_attested: true,
  exclusions_attested: true,
  eligibility_attested_at: stamp,
  eligibility_attestation_text: "Eligible",
  promotion_responsibility_acknowledged: true,
  promotion_responsibility_acknowledged_at: stamp,
  promotion_responsibility_version: rules,
  promotion_disclosure_text:
    acceptance.participant_responsibility_disclosure_text,
  entry_method: "qr_scan_opt_in",
  in_show_scan_verified: true,
  in_show_scan_verified_at: stamp,
  max_winners: 1,
  exclude_previous_winners: true,
};
delete entry.draw_opens_at; // Settings-only schedule field, not an entry column.
async function select() {
  return (await row(
    "select select_qr_bingo_potential_winner($1,$2,$3,$3,$4,$5,$6,$7) result",
    [event, vendor, vendor, "initial", "TEST", "a".repeat(32), "b".repeat(64)],
  )).result;
}
try {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions; create function extensions.gen_random_uuid() returns uuid language sql as $$ select pg_catalog.gen_random_uuid() $$; create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$; select set_config('request.jwt.claim.role','service_role',false);",
  );
  for (const table of new Set(columns.map((c) => c.table_name))) {
    const fields = columns.filter((c) => c.table_name === table).map((c) =>
      `"${c.column_name}" ${
        c.data_type === "ARRAY" ? c.udt_name.slice(1) + "[]" : c.data_type
      }${
        table === "qr_bingo_draw_email_deliveries" &&
          c.column_name === "delivery_key"
          ? " generated always as (draw_id::text || ':' || channel) stored"
          : c.column_default && !c.column_default.includes("nextval(")
          ? " default " + c.column_default
          : ""
      }`
    );
    await db.exec(`create table public.${table} (${fields.join(",")});`);
  }
  await db.exec(`alter table qr_bingo_raffle_draws add primary key(id);
    alter table qr_bingo_raffle_settings add primary key(id),add unique(event_key,vendor_bingo_id);
    alter table qr_bingo_draw_email_deliveries add unique(draw_id,channel),add unique(delivery_key);
    alter table qr_bingo_vendor_offer_versions add unique(event_key,vendor_bingo_id,vendor_offer_version);
    alter table qr_bingo_raffle_entry_selection_state add primary key(entry_id);
    create unique index qr_bingo_raffle_draws_one_potential_selection_idx on qr_bingo_raffle_draws(event_key,vendor_bingo_id,vendor_bd_user_id) where selection_status='potential';
    create unique index qr_bingo_raffle_draws_unique_round on qr_bingo_raffle_draws(event_key,vendor_bingo_id,draw_number);
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(substr(md5(random()::text),1,$1*2),'hex')$$;
    grant all on all tables in schema public to service_role;`);
  // Empty allowlist fixture: production-event tests must not gain reviewer exceptions.
  await db.exec(
    "create table app_review_raffle_fixture_participants(fixture_id uuid,couple_bd_user_id text)",
  );
  await db.exec(helpers + before);
  await db.exec(
    `alter table qr_bingo_raffle_entries add constraint qr_bingo_raffle_entries_in_show_scan_proof_complete check ((in_show_scan_verified is null and in_show_scan_verified_at is null) or (in_show_scan_verified is true and in_show_scan_verified_at is not null));`,
  );
  await insert("qr_bingo_event_configs", {
    id: id(2),
    event_key: event,
    event_name: "Offline show",
    revision: 1,
    published: true,
    scan_enabled: true,
    scan_open_early: true,
    scan_early_access_starts_at: earlyAt,
    history_starts_at: showAt,
    rules_version: rules,
    vendor_draws_enabled: true,
    send_vendor_email: true,
    send_couple_email: true,
    email_delivery_mode: "production_verified_fulfillment",
    ...Object.fromEntries(
      [
        "official_rules_url",
        "alternate_free_entry_url",
        "eligibility_region",
        "entry_closes_at",
        "draw_at",
        "draw_opens_at",
      ].map((k) => [k, terms[k]]),
    ),
  });
  await test("lock ordering serializes reset before settings/config and leaves finalization free of reverse advisory acquisition", async () => {
    const resetDefinition = migration.match(
      /create or replace function public.admin_reset_qr_bingo_vendor_draw[\s\S]*?\n\$\$;/,
    )[0];
    assert.ok(
      resetDefinition.indexOf(
        "hashtextextended('qr_bingo_event_config_publish'",
      ) <
        resetDefinition.indexOf(
          "hashtextextended(p_event_key||':'||p_vendor_id",
        ),
    );
    assert.ok(
      resetDefinition.indexOf(
        "hashtextextended(p_event_key||':'||p_vendor_id",
      ) < resetDefinition.indexOf("for share"),
    );
    assert.ok(
      resetDefinition.indexOf("for share") <
        resetDefinition.indexOf("for update"),
    );
    const triggerDefinition = migration.match(
      /create or replace function public.enforce_qr_bingo_draw_generation\(\)[\s\S]*?\n\$\$;/,
    )[0];
    assert.match(
      triggerDefinition,
      /if tg_op='INSERT' then\s+perform pg_catalog.pg_advisory_xact_lock[\s\S]*?end if;/,
    );
    assert.equal(
      (triggerDefinition.match(/pg_advisory_xact_lock/g) || []).length,
      1,
    );
  });
  await test("exact migration applies to the reviewed live function baseline", async () => {
    await db.exec(migration);
  });
  await db.exec(
    `create trigger draw_limit before insert or update of event_key,vendor_bingo_id,vendor_bd_user_id,entry_id,couple_bd_user_id,selection_status,max_winners,exclude_previous_winners on qr_bingo_raffle_draws for each row execute function enforce_qr_bingo_raffle_draw_limit();
    create trigger verify_draw before insert or update on qr_bingo_raffle_draws for each row execute function enforce_qr_bingo_draw_verification();
`,
  );
  await insert("qr_bingo_raffle_settings", settings);
  await db.exec(
    await readFile(
      new URL("./fixtures/qr-reset-settings-triggers.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    "select set_config('request.qr_bingo_participant_responsibility_disclosure',$1,false)",
    [settings.participant_responsibility_disclosure_text],
  );
  await db.query(
    "update qr_bingo_raffle_settings set enabled=enabled where id=$1",
    [settings.id],
  );
  await db.exec(
    "select set_config('request.qr_bingo_participant_responsibility_disclosure','',false)",
  );
  await insert("qr_bingo_raffle_entries", entry);
  // Historical missing-proof candidate remains valid as preserved data, but never eligible.
  await insert("qr_bingo_raffle_entries", {
    ...entry,
    id: id(11),
    couple_bd_user_id: "799",
    in_show_scan_verified: null,
    in_show_scan_verified_at: null,
  });
  const entryBefore = (await row(
    "select to_jsonb(e) record from qr_bingo_raffle_entries e where id=$1",
    [entry.id],
  )).record;

  const settingsBefore = (await row(
    "select to_jsonb(s) record from qr_bingo_raffle_settings s where id=$1",
    [settings.id],
  )).record;
  const offersBefore = (await db.query(
    "select to_jsonb(v) record from qr_bingo_vendor_offer_versions v",
  )).rows;
  await db.exec(
    await readFile(
      new URL("./fixtures/qr-entry-access-live-functions.sql", import.meta.url),
      "utf8",
    ),
  );
  await test("entry access migration applies without rewriting any vendor acceptance offer or old entry", async () => {
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260911224030_allow_vendor_enabled_qr_draw_entry.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await row(
        "select to_jsonb(s) record from qr_bingo_raffle_settings s where id=$1",
        [settings.id],
      )).record,
      settingsBefore,
    );
    assert.deepEqual(
      (await db.query(
        "select to_jsonb(v) record from qr_bingo_vendor_offer_versions v",
      )).rows,
      offersBefore,
    );
    const old = (await row(
      "select to_jsonb(e) record from qr_bingo_raffle_entries e where id=$1",
      [entry.id],
    )).record;
    for (const [key, value] of Object.entries(entryBefore)) {
      assert.deepEqual(old[key], value);
    }
    assert.equal(old.vendor_draw_scan_verified, null);
  });
  await db.exec(
    `create trigger entry_offer before insert or update on qr_bingo_raffle_entries for each row execute function enforce_qr_bingo_entry_offer_version();
    create trigger entry_rules before insert or update on qr_bingo_raffle_entries for each row execute function enforce_qr_bingo_current_rules();`,
  );
  const newEntry = {
    ...entry,
    id: id(31),
    couple_bd_user_id: "703",
    vendor_offer_version: settingsBefore.updated_at,
    in_show_scan_verified: null,
    in_show_scan_verified_at: null,
    vendor_draw_scan_verified: true,
    vendor_draw_scan_verified_at: new Date().toISOString(),
    vendor_draw_scan_config_revision: 1,
    entry_access_policy_version: "2026-09-11-vendor-enabled-entry",
    entry_access_policy_disclosure:
      (await row("select qr_bingo_entry_access_policy_disclosure() value"))
        .value,
    vendor_marketing_consent: true,
    vendor_marketing_consented_at: new Date().toISOString(),
    vendor_marketing_consent_text:
      "I accept wedding-related offers and promotions and may unsubscribe.",
    promotion_disclosure_text:
      (await row("select qr_bingo_effective_entry_disclosure($1) value", [
        entry.promotion_disclosure_text,
      ])).value,
  };
  newEntry.entry_access_applied_at = newEntry.vendor_draw_scan_verified_at;

  // No deleted identities exist in this isolated fixture. The real member lock still executes.
  await db.exec("create schema weddingwin_private; create function weddingwin_private.is_deleted_chat_identity(text) returns boolean language sql as $$ select false $$;");
  await db.exec("create or replace function public.lock_active_qr_bingo_contact_member(p_member_id text)\nreturns void language plpgsql security definer set search_path = '' as $$\nbegin\n  if p_member_id is null or p_member_id !~ '^[1-9][0-9]{0,17}$' then\n    raise exception using errcode='22023',message='Invalid QR contact member.';\n  end if;\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact-member:'||p_member_id,0));\n  if weddingwin_private.is_deleted_chat_identity(p_member_id) then\n    raise exception using errcode='42501',message='This member account was deleted.';\n  end if;\nend;\n$$;\nrevoke all on function public.lock_active_qr_bingo_contact_member(text) from public,anon,authenticated;\ngrant execute on function public.lock_active_qr_bingo_contact_member(text) to service_role;\n\n");
  // Restore the exact live functions used by the additive card-reset migration.
  await db.exec(await readFile(new URL('./fixtures/qr-card-reset-live-functions.sql',import.meta.url),'utf8'));
  await db.exec(`create table app_review_raffle_fixture_scans(fixture_id uuid,couple_bd_user_id text,vendor_bingo_id text,scanned_at timestamptz default now(),primary key(fixture_id,couple_bd_user_id,vendor_bingo_id));
    alter table qr_bingo_email_test_fixture_scans add unique(fixture_id,couple_bd_user_id,vendor_bingo_id);
    alter table qr_bingo_raffle_entries add primary key(id),add unique(event_key,vendor_bingo_id,couple_bd_user_id);`);
  await db.exec(await readFile(new URL('./fixtures/qr-card-reset-consent-audit.sql',import.meta.url),'utf8'));
  await insert('qr_bingo_raffle_entries',newEntry);
  const untouched = (await row('select to_jsonb(e) value from qr_bingo_raffle_entries e where id=$1',[entry.id])).value;
  await test('card reset migration applies to the exact reviewed live functions',async()=>{
    await db.exec(await readFile(new URL('../supabase/migrations/20260911232445_add_admin_couple_bingo_card_reset.sql',import.meta.url),'utf8'));
  });
  const couple='703';
  const state = async (who=couple) => (await row('select read_qr_bingo_card_state($1,$2) value',[event,who])).value;
  const preview = async (who=couple) => (await row('select qr_bingo_card_reset_snapshot($1,$2) value',[event,who])).value;
  let cutoff = new Date(Math.floor(Date.now()/1000)*1000).toISOString();
  const reset = async (p,request=id(801),reason='Reset test card',at=cutoff) => (await row('select admin_reset_qr_bingo_couple_card($1,$2,$3,$4,$5,$6,$7,$8) value',[event,couple,p.expected_generation,p.preview_token,request,'Offline admin',reason,at])).value;
  let firstPreview;
  await test('preview is read only and exact-account scoped',async()=>{
    firstPreview=await preview();assert.equal(firstPreview.entry_count,1);assert.equal(firstPreview.can_reset,true);assert.equal(firstPreview.expected_generation,0);
    assert.equal((await state()).generation,0);assert.equal((await row('select count(*) n from qr_bingo_card_reset_audit')).n,0);
  });
  await test('reset clears selected entries and advances one card without changing another couple',async()=>{
    const r=await reset(firstPreview);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.entry_count,1);assert.equal(r.to_generation,1);assert.equal(r.replayed,false);
    const e=(await row('select to_jsonb(e) value from qr_bingo_raffle_entries e where id=$1',[newEntry.id])).value;
    assert(e.card_reset_at);assert.equal(e.card_generation,0);assert.equal((await state()).generation,1);assert.equal((await state('701')).generation,0);
    const other=(await row('select to_jsonb(e) value from qr_bingo_raffle_entries e where id=$1',[entry.id])).value;delete other.card_generation;delete other.card_reset_at;assert.deepEqual(other,untouched);
  });
  await test('same request replays without resetting later activity and changed details are rejected',async()=>{
    const r=await reset(firstPreview);assert.equal(r.replayed,true);assert.equal((await row('select count(*) n from qr_bingo_card_reset_audit')).n,1);
    assert.equal((await reset(firstPreview,id(801),'Different reason')).code,'card_reset_request_conflict');
    assert.equal((await reset(firstPreview,id(802))).code,'stale_card_generation');
  });
  await test('an in-flight pre-reset entry cannot restore cleared participation',async()=>{
    const payload={...newEntry,card_generation:0,card_reset_at:null};delete payload.id;
    await assert.rejects(db.query('select save_qr_bingo_card_entry($1,$2)',[payload,newEntry.id]),/stale_card_generation/);
  });
  await insert('qr_bingo_raffle_entry_selection_state',{entry_id:entry.id,event_key:event,vendor_bingo_id:vendor,vendor_bd_user_id:vendor,included:false,exclusion_reason:'Offline excluded candidate'});
  let selectedDraw;
  const selectionDefinition=(await row("select pg_get_functiondef('public.select_qr_bingo_potential_winner(text,text,text,text,text,text,text,text)'::regprocedure) value")).value;
  await db.exec("create function public.test_card_draw_clock() returns timestamptz language sql as $$select '"+new Date(new Date(closeAt).getTime()+1000).toISOString()+"'::timestamptz$$");
  await db.exec(selectionDefinition.replaceAll('clock_timestamp()', 'public.test_card_draw_clock()'));
  await test('reset entries disappear from actual selection and admin entry counts',async()=>{
    const selected=await select();assert.equal(selected.ok,false);assert.equal(selected.code,'no_eligible_entries',JSON.stringify(selected));
    const list=(await row("select read_qr_bingo_admin_data('entries',$1,'','703',0,50) value",[event])).value;
    assert.equal(list.total,0);assert.equal(list.rows.length,0);
  });
  await test('reset keeps prior consent evidence without recording new consent',async()=>{
    assert.equal((await row('select count(*) n from qr_bingo_entrant_consent_acceptance_audit where entry_id=$1',[newEntry.id])).n,1);
  });
  await test('fresh Yes reactivates the stable entry with new generation and appends consent history',async()=>{
    const payload={...newEntry,card_generation:1,card_reset_at:null,consented_at:new Date(Date.now()+1000).toISOString()};delete payload.id;
    const result=await row('select (save_qr_bingo_card_entry($1,$2)).*',[payload,newEntry.id]);
    assert.equal(result.id,newEntry.id);assert.equal(result.card_generation,1);assert.equal(result.card_reset_at,null);
    assert.equal((await row('select count(*) n from qr_bingo_raffle_entries where event_key=$1 and couple_bd_user_id=$2',[event,couple])).n,1);
    assert.equal((await row('select count(*) n from qr_bingo_entrant_consent_acceptance_audit where entry_id=$1',[newEntry.id])).n,2);
    assert.equal((await reset(firstPreview)).replayed,true);assert.equal((await preview()).entry_count,1);
  });
  await test('fresh re-entry is eligible for actual scheduled selection with its new generation',async()=>{
    const result=await select();assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.draw.entry_id,newEntry.id);selectedDraw=result.draw;
    assert.equal((await row('select entry_card_generation from qr_bingo_raffle_draws where id=$1',[selectedDraw.id])).entry_card_generation,1);
    await db.query('select require_current_qr_bingo_draw_generation($1)',[selectedDraw.id]);
  });
  await test('pending and uncertain email delivery prevent resetting the selected card',async()=>{
    for(const [status,code] of [['pending','draw_delivery_in_progress'],['claimed','draw_delivery_in_progress'],['ambiguous','draw_delivery_uncertain']]){
      await insert('qr_bingo_draw_email_deliveries',{id:id(850),draw_id:selectedDraw.id,channel:'couple',status});
      const p=await preview();assert.equal(p.can_reset,false);assert.equal(p.reset_block_reason,code);
      assert.equal((await reset(p,id(851))).code,code);assert.equal((await state()).generation,1);
      await db.query('delete from qr_bingo_draw_email_deliveries where id=$1',[id(850)]);
    }
  });
  await test('reset preserves an unsent winner row and permanently fences it even after re-entry',async()=>{
    const oldDraw=(await row('select to_jsonb(d) value from qr_bingo_raffle_draws d where id=$1',[selectedDraw.id])).value;
    const p=await preview();const r=await reset(p,id(852));assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.to_generation,2);
    await assert.rejects(db.query('select require_current_qr_bingo_draw_generation($1)',[selectedDraw.id]),/stale_card_generation/);
    const payload={...newEntry,card_generation:2,card_reset_at:null,consented_at:new Date(Date.now()+2000).toISOString()};delete payload.id;
    await db.query('select save_qr_bingo_card_entry($1,$2)',[payload,newEntry.id]);
    await assert.rejects(db.query('select require_current_qr_bingo_draw_generation($1)',[selectedDraw.id]),/stale_card_generation/);
    assert.deepEqual((await row('select to_jsonb(d) value from qr_bingo_raffle_draws d where id=$1',[selectedDraw.id])).value,oldDraw);
  });
  await test('isolated couple scans reset by generation and cannot be replayed with the old generation',async()=>{
    const fixtureEvent='app-review-offline-card-reset', fixtureId=id(900);
    await insert('app_review_raffle_fixtures',{id:fixtureId,event_key:fixtureEvent,couple_bd_user_id:couple,vendor_bingo_id:vendor,vendor_bd_user_id:vendor,enabled:true,expires_at:new Date(Date.now()+86400000).toISOString()});
    const scan=async(generation)=>(await row('select save_qr_bingo_fixture_card_scan($1,$2,$3,$4,$5,false) value',[fixtureEvent,couple,fixtureId,vendor,generation])).value;
    assert.equal((await scan(0)).ok,true);
    const p=(await row('select qr_bingo_card_reset_snapshot($1,$2) value',[fixtureEvent,couple])).value;
    const r=(await row('select admin_reset_qr_bingo_couple_card($1,$2,$3,$4,$5,$6,$7,$8) value',[fixtureEvent,couple,0,p.preview_token,id(901),'Offline admin','Reset fixture card',cutoff])).value;
    assert.equal(r.ok,true,JSON.stringify(r));assert.equal((await scan(0)).code,'stale_card_generation');assert.equal((await scan(1)).ok,true);
    const scans=(await db.query('select * from app_review_raffle_fixture_scans where fixture_id=$1',[fixtureId])).rows;assert.equal(scans.length,1);assert.equal(scans[0].card_generation,1);
  });
  await test('cutoff reports contain only the requested event and exact current account state',async()=>{
    const result=(await row('select read_qr_bingo_card_reset_cutoffs($1) value',[event])).value;
    assert.equal(result.has_more,false);assert.equal(result.event_key,event);assert.deepEqual(result.rows.map(x=>[x.couple_id,x.generation]),[[couple,2]]);
    const empty=(await row('select read_qr_bingo_card_reset_cutoffs($1) value',['other-event'])).value;assert.deepEqual(empty.rows,[]);
  });
  await test('another reset cannot move the cutoff backward and reveal old scans',async()=>{
    const p=await preview();const earlier=new Date(Date.parse(cutoff)-1000).toISOString();
    assert.equal((await reset(p,id(902),'Reset test card',earlier)).code,'card_reset_preview_changed');
    assert.equal((await state()).generation,2);
  });
  await test('anonymous and ordinary signed-in roles cannot invoke reset or read card state tables',async()=>{
    for(const role of ['anon','authenticated']){
      const grants=await row("select has_function_privilege($1,'public.admin_reset_qr_bingo_couple_card(text,text,bigint,text,uuid,text,text,timestamptz)','EXECUTE') reset,has_table_privilege($1,'public.qr_bingo_card_states','SELECT') read",[role]);
      assert.equal(grants.reset,false);assert.equal(grants.read,false);
    }
    const rls=await row("select bool_and(relrowsecurity) value from pg_class where relname in ('qr_bingo_card_states','qr_bingo_card_reset_audit')");assert.equal(rls.value,true);
  });
  console.log(`PASS: ${passed} isolated card-reset SQL cases; no production mutations.`);
} finally { await db.close(); }
