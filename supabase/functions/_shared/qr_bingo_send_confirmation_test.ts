const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
const migrationUrl = new URL("../../migrations/20260905145000_confirm_vendor_checks_when_sending_notice.sql", import.meta.url);
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function between(source: string, start: string, end: string) {
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  assert(from>=0&&to>from,`Missing ${start}`);return source.slice(from,to);
}

Deno.test("Send confirmation has explicit vendor ownership, truthful internal notes and consistent lock ordering", async () => {
  const sql=await Deno.readTextFile(migrationUrl);
  for(const required of [
    "p_winner_checks_confirmed is distinct from true", "coalesce(auth.role(), '') <> 'service_role'",
    "normalized_vendor_user is distinct from normalized_vendor", "'vendor:' || normalized_vendor || ':'",
    "pg_catalog.hashtextextended(normalized_event || ':' || normalized_vendor, 0)",
    "where id = p_draw_id and event_key = normalized_event", "and vendor_bd_user_id = normalized_vendor_user",
    "reviewed.selection_status <> 'potential'", "return public.attest_qr_bingo_potential_winner_by_vendor(",
    "to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD')",
    "Method: Vendor confirmation of completed Draw Rules checks",
    "Reference: Internal action vendor_raffle_send_notice / selection ",
    "Wedding Win did not independently verify eligibility, an answer, an external document or prize fulfilment.",
    ") from public, anon, authenticated;", ") to service_role;",
  ]) assert(sql.includes(required),`Confirmation must preserve ${required}`);
  const promotion=sql.indexOf("perform pg_catalog.pg_advisory_xact_lock");
  const config=sql.indexOf("perform 1 from public.qr_bingo_event_configs");
  const row=sql.indexOf("select * into reviewed from public.qr_bingo_raffle_draws");
  assert(promotion<config&&config<row,"Send and Replace must lock promotion/config/draw in that order");
  const signature=between(sql,"confirm_qr_bingo_winner_checks_for_notice(",")\nreturns");
  assert(!/p_(notes|method|reference|answer|skill_question)/.test(signature),"No client-fabricated evidence accepted");
  assert(!/\b(update public|insert into|delete from|alter table|drop table)\b/i.test(sql),"New wrapper must not backfill or edit history directly");
});

Deno.test("verified confirmation retries preserve legacy evidence and never send from the database wrapper",async()=>{
  const sql=await Deno.readTextFile(migrationUrl);
  const verified=between(sql,"if reviewed.selection_status = 'verified' then","  if reviewed.selection_status <> 'potential'");
  assert(verified.includes("public.qr_bingo_skill_verification_complete(reviewed)")&&verified.includes("return reviewed;"),"Existing valid proof returns unchanged");
  assert(!verified.includes("attest_qr_bingo_potential_winner_by_vendor")&&!/\b(update|insert|delete)\b/i.test(verified),"Retry must not replace the original evidence/timestamps");
  assert(!/skill_question_verified_at\s*:=|skill_question_verified_at\s*=|claim_.*email_delivery\(/.test(sql),"Confirmation neither fabricates answer proof nor claims email delivery");
});

Deno.test("both send handlers require explicit pending confirmation then re-read verified ownership before delivery",async()=>{
  for(const url of endpointUrls){
    const source=await Deno.readTextFile(url);
    const send=between(source,"async function sendVerifiedWinnerNotice(","Deno.serve(");
    for(const required of [
      'typeof body.winner_checks_confirmed !== "boolean"', 'ownedDraw.selection_status === "potential"',
      'body.winner_checks_confirmed !== true', '"confirm_qr_bingo_winner_checks_for_notice"',
      'p_winner_checks_confirmed: true', 'ownedDraw = confirmedDraw',
      'ownedDraw.selection_status !== "verified"', '!hasQrBingoSkillVerification(ownedDraw)',
      '.eq("vendor_bd_user_id", String(vendor.user_id || user?.user_id || ""))',
      'partial_delivery: true', 'getVendorRaffleDashboard(vendor, user, eventKey, allowEarlyDraw, suppressOutboundEmail, isolatedFixture)',
    ]) assert(send.includes(required),`${url.pathname}: missing ${required}`);
    assert(send.indexOf('!qrDrawEmailsEnabled(isolatedFixture)')<send.indexOf('"confirm_qr_bingo_winner_checks_for_notice"'),"Unavailable mail must not advance the pending selection");
    assert(send.indexOf('ownedDraw = confirmedDraw')<send.indexOf('ownedDraw.selection_status !== "verified"')&&
      send.indexOf('ownedDraw.selection_status !== "verified"')<send.indexOf('await sendDrawEmails('),"Re-read and enforce verified status before transport");
    assert(!/body\.(review_notes|skill_question_answer|eligibility_confirmed|rules_release_confirmed)/.test(send),"Send must not fabricate a client-side verification form");
    const automatic=between(source,"async function drawWinner(","async function sendVerifiedWinnerNotice(");
    assert(!automatic.includes('"confirm_qr_bingo_winner_checks_for_notice"'),"Choosing or replacing a winner must not automatically confirm checks");
  }
});

Deno.test("actual per-draw capabilities distinguish pending confirmation, verified send and suppressed tests",async()=>{
  for(const url of endpointUrls){
    const source=await Deno.readTextFile(url);
    const visible=between(source,"function vendorVisibleDraw(","function csvCell(");
    const module=await import(`data:application/typescript,${encodeURIComponent(`type RaffleDraw=any;type IsolatedRaffleFixture=any;export default function(deps:any){const {isolatedEmailTestRecipient,qrBingoConfig,hasQrBingoSkillVerification,hasQrBingoVendorSkillAttestation,isolatedFixturePurpose,qrDrawEmailsEnabled,cleanText}=deps;${visible};return vendorVisibleDraw;}`)}`);
    for(const status of ["potential","verified","replaced","disqualified","legacy"]){
      for(const enabled of [true,false])for(const suppressed of [true,false]){
        const draw=module.default({
          isolatedEmailTestRecipient:()=>null,qrBingoConfig:()=>({send_vendor_email:false,send_couple_email:true}),
          hasQrBingoSkillVerification:()=>true,hasQrBingoVendorSkillAttestation:()=>false,
          isolatedFixturePurpose:()=>"app_review",qrDrawEmailsEnabled:()=>enabled,
          cleanText:(value:unknown)=>String(value||""),
        })({selection_status:status},{},suppressed);
        assert(draw.can_send_notice===(status==="verified"&&enabled&&!suppressed),"Do not weaken the verified-only send capability");
        assert(draw.can_confirm_and_send_notice===(status==="potential"&&enabled&&!suppressed),"Pending confirmation must require available outbound mode");
        assert(draw.can_confirm_and_test_suppressed_notice===(status==="potential"&&suppressed),"Only pending suppressed fixtures expose Test Send confirmation");
      }
    }
  }
});
