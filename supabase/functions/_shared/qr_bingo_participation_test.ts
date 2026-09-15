import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadQrParticipationReceipt, QrParticipationError, qrParticipationVersion, recordQrParticipation, shouldRecordQrParticipationOnUse, validateQrParticipationRequest } from "./qr_bingo_participation.ts";
const config = {event_key:"offline-show",rules_version:"2026-09-01-in-person-entry",revision:15};
const notice = qrParticipationVersion(config);
const profile = {event_key:config.event_key,couple_id:"701",name:"Test Couple",email:"test@example.test",phone:"5550100101",wedding_date:"",wedding_venue:"",version:2,saved:true,complete:true,missing_fields:[],updated_at:null,date_sync_pending:false};
const row = {id:"00000000-0000-4000-8000-000000000001",event_key:config.event_key,couple_bd_user_id:"701",rules_version:config.rules_version,notice_version:notice,basis:"explicit_notice",accepted_at:"2026-09-14T12:00:00Z",excluded_from_master:false};
const request = {accepted:true,expected_event_key:config.event_key,rules_version:config.rules_version,participation_notice_version:notice,acceptance_source:"explicit",expected_config_revision:15};
Deno.test("participation accepts only explicit boolean and supported receipt provenance", () => {
  assertEquals(validateQrParticipationRequest(request,config),"explicit_notice");
  assertEquals(validateQrParticipationRequest({...request,acceptance_source:"cached"},config),"cached_notice");
  for (const accepted of [false,"true",1,undefined]) assertThrows(()=>validateQrParticipationRequest({...request,accepted},config),QrParticipationError);
  assertThrows(()=>validateQrParticipationRequest({...request,acceptance_source:"profile"},config),QrParticipationError);
});
Deno.test("participation binds current event rules notice and optional revision", () => {
  for (const patch of [{expected_event_key:"another-show"},{rules_version:"old"},{participation_notice_version:"old"},{expected_config_revision:14},{expected_config_revision:"15"}]) {
    const error=assertThrows(()=>validateQrParticipationRequest({...request,...patch},config),QrParticipationError); assertEquals(error.status,409);
  }
  assertEquals(validateQrParticipationRequest({...request,expected_config_revision:undefined},config),"explicit_notice");
});
Deno.test("on-use replay requests carry only the exact current notice and supported actions", () => {
  for(const action of ["scan","raffle_offer","raffle_opt_in"]) assertEquals(shouldRecordQrParticipationOnUse(action,{participation_notice_version:notice},config),true);
  for(const action of ["list","contact_profile_save","contact_profile_get","vendor_raffle_get"]) assertEquals(shouldRecordQrParticipationOnUse(action,{participation_notice_version:notice},config),false);
  for(const body of [{},{participation_notice_version:"2026-09-01-in-person-entry"},{participation_notice_version:notice+" "}]) assertEquals(shouldRecordQrParticipationOnUse("raffle_opt_in",body,config),false);
});
Deno.test("participation cannot infer acceptance from unsaved or incomplete contact profiles", async () => {
  let calls=0;const db={rpc:()=>{calls++;throw new Error("unexpected");}};
  for(const patch of [{saved:false},{complete:false},{couple_id:"702"},{event_key:"other"},{version:0}]) await assertRejects(()=>recordQrParticipation(db,config,config.event_key,"701",{...profile,...patch},"explicit_notice"),QrParticipationError);
  assertEquals(calls,0);
});
Deno.test("participation passes server authority and profile version, exposes no contact values", async () => {
  let args:any;const db={rpc:(name:string,body:any)=>{args={name,body};return {data:{ok:true,receipt:row},error:null};}};
  const receipt=await recordQrParticipation(db,config,config.event_key,"701",profile,"explicit_notice",15);
  assertEquals(args,{name:"record_qr_bingo_participation_acceptance",body:{p_published_event_key:config.event_key,p_event_key:config.event_key,p_couple_id:"701",p_rules_version:config.rules_version,p_notice_version:notice,p_profile_version:2,p_basis:"explicit_notice",p_expected_revision:15}});
  assertEquals(receipt.recorded,true);assertEquals(receipt.acceptance_id,row.id);assertEquals("email" in receipt,false);
});
Deno.test("fixture receipt keeps published and private profile event distinct", async () => {
  const eventKey="app-review-offline";
  const receipt=await recordQrParticipation({rpc:()=>({data:{ok:true,receipt:{...row,event_key:eventKey,excluded_from_master:true}},error:null})},config,eventKey,"701",{...profile,event_key:eventKey},"cached_notice");
  assertEquals(receipt.event_key,config.event_key);assertEquals(receipt.profile_event_key,eventKey);assertEquals(receipt.excluded_from_master,true);
});
Deno.test("database failures and unverified receipt identity fail closed", async () => {
  for(const output of [{error:{code:"42501"},data:null},{error:null,data:{ok:false,code:"unknown"}},{error:null,data:{ok:true,receipt:{...row,couple_bd_user_id:"702"}}},{error:null,data:{ok:true,receipt:{...row,notice_version:"old"}}},{error:null,data:{ok:true,receipt:{...row,id:"not-an-id"}}},{error:null,data:{ok:true,receipt:{...row,excluded_from_master:"false"}}}]) {
    const error=await assertRejects(()=>recordQrParticipation({rpc:()=>output},config,config.event_key,"701",profile,"explicit_notice"),QrParticipationError);assertEquals(error.status,503);
  }
});
Deno.test("database staleness and profile conflict remain retryable user decisions", async () => {
  for(const [code,status] of [["participation_agreement_stale",409],["participation_profile_changed",409],["profile_incomplete",422],["participation_notice_required",428]] as const) {
    const error=await assertRejects(()=>recordQrParticipation({rpc:()=>({data:{ok:false,code},error:null})},config,config.event_key,"701",profile,"explicit_notice"),QrParticipationError);assertEquals(error.code,code);assertEquals(error.status,status);
  }
});
Deno.test("receipt lookup filters exact account event rules and full notice version", async () => {
  const filters:any[]=[];const db:any={from:(table:string)=>{filters.push(table);return db;},select:()=>db,eq:(...args:any[])=>{filters.push(args);return db;},maybeSingle:()=>({data:row,error:null})};
  assertEquals((await loadQrParticipationReceipt(db,config,config.event_key,"701"))?.couple_id,"701");
  assertEquals(filters,["qr_bingo_participation_acceptances",["event_key",config.event_key],["couple_bd_user_id","701"],["rules_version",config.rules_version],["notice_version",notice]]);
  db.maybeSingle=()=>({data:null,error:null});assertEquals(await loadQrParticipationReceipt(db,config,config.event_key,"701"),null);
  db.maybeSingle=()=>({data:null,error:{}});await assertRejects(()=>loadQrParticipationReceipt(db,config,config.event_key,"701"),QrParticipationError);
});

Deno.test("new notice is distinct from the historical pre-scan notice", () => {
  assertEquals(notice, config.rules_version + "|2026-09-14-showday-prize-lock");
  const error=assertThrows(()=>validateQrParticipationRequest({...request,
    participation_notice_version:config.rules_version+"|2026-09-04-pre-scan-draw-consent"},config),QrParticipationError);
  assertEquals(error.code,"participation_agreement_stale");
});
Deno.test("new-version receipt cannot claim cached or on-use first acceptance", async () => {
  for(const basis of ["cached_notice","notice_on_use","vendor_draw_entry"]){
    await assertRejects(()=>recordQrParticipation({rpc:()=>({data:{ok:true,receipt:{...row,basis}},error:null})},
      config,config.event_key,"701",profile,"cached_notice"),QrParticipationError);
  }
});
