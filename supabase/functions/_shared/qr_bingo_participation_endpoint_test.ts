// Execute the actual pre-transport endpoint block with offline provider/storage
// adapters. The shared helper and SQL tests separately exercise DB semantics.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadQrParticipationReceipt, recordQrParticipation, validateQrParticipationRequest, shouldRecordQrParticipationOnUse, QrParticipationError, qrParticipationVersion } from "./qr_bingo_participation.ts";
const config={event_key:"offline-event",rules_version:"2026-09-01-in-person-entry",revision:15};
const notice=qrParticipationVersion(config);
const valid={accepted:true,expected_event_key:config.event_key,rules_version:config.rules_version,participation_notice_version:notice,acceptance_source:"explicit"};
async function harness(endpoint:string){
 const source=await Deno.readTextFile(new URL(`../${endpoint}/index.ts`,import.meta.url));
 const start=source.indexOf("      const isReviewCouple = Boolean("),end=source.indexOf("      // Website proof is the authentication.",start);assert(start>0&&end>start);
 const calls:any[]=[];let complete=true,unavailable=false,receipt:any=null;
 const db:any={from:(table:string)=>{assertEquals(table,"qr_bingo_participation_acceptances");return db;},select:()=>db,eq:()=>db,maybeSingle:()=>({data:receipt,error:null}),rpc:(name:string,args:any)=>{
  calls.push({name,args});if(unavailable)return {data:null,error:{code:"42501"}};
  receipt={id:"00000000-0000-4000-8000-000000000001",event_key:args.p_event_key,couple_bd_user_id:args.p_couple_id,rules_version:args.p_rules_version,notice_version:args.p_notice_version,basis:args.p_basis,accepted_at:"2026-09-14T12:00:00Z",excluded_from_master:args.p_event_key.startsWith("app-review-")};return {data:{ok:true,receipt},error:null};
 }};
 const deps={loadQrParticipationReceipt,recordQrParticipation,validateQrParticipationRequest,shouldRecordQrParticipationOnUse,QrParticipationError,
  requireAdmin:()=>db,qrBingoConfig:()=>config,qrParticipationNoticeVersion:()=>notice,isEmailTestFixture:()=>false,
  loadQrBingoCardState:(_:unknown,event:string,couple:string)=>({event_key:event,couple_id:couple,generation:0,scan_reset_after:null}),assertQrBingoCardGeneration:()=>{},
  loadQrContactProfile:(_:unknown,event:string,couple:string)=>({event_key:event,couple_id:couple,name:"Offline Couple",email:"test@example.test",phone:"5550101001",version:1,complete,saved:true,missing_fields:complete?[]:["phone"],date_sync_pending:false}),
  acceptsQrParticipationNotice:(action:string,body:any)=>!["scan","raffle_offer","raffle_opt_in"].includes(action)||body.participation_notice_version===notice||body.participation_notice_version===undefined,
  jsonResponse:(body:any,status=200)=>({body,status}),BD_API_BASE_URL:"https://example.test"};
 const mod=await import(`data:application/typescript,${encodeURIComponent(`type QrContactProfile=any;type QrBingoCardState=any;export default function(deps:any){const {${Object.keys(deps).join(',')}}=deps;return async function(action:string,body:any,user:any,reviewFixture:any){const authenticatedMemberId=String(user.user_id),websitePrincipal=null;try{${source.slice(start,end)}return {body:{ok:true,participation_agreement:participationAgreement,reached_transport:true},status:200};}catch(error){if(error instanceof QrParticipationError)return jsonResponse({ok:false,code:error.code},error.status);throw error;}}}`)}`);
 return {calls,dispatch:(action:string,body:any={},user:any={user_id:"701",subscription_id:"18",active:"2"},fixture:any=null)=>mod.default(deps)(action,body,user,fixture),setComplete:(value:boolean)=>complete=value,setUnavailable:()=>unavailable=true};
}
for(const endpoint of ["bd-qr-bingo-sync","bd-qr-bingo-vendor-sync"]){
 Deno.test(`${endpoint}: explicit and cached participation acceptance complete before any website/scan transport`,async()=>{
  for(const acceptance_source of ["explicit","cached"]){const h=await harness(endpoint);const result=await h.dispatch("participation_accept",{...valid,acceptance_source});assertEquals(result.status,200);assertEquals(result.body.participation_agreement.recorded,true);assertEquals(result.body.reached_transport,undefined);assertEquals(h.calls.length,1);assertEquals(h.calls[0].args.p_basis,acceptance_source+"_notice");}
 });
 Deno.test(`${endpoint}: non-couple identity, false acceptance, stale event and incomplete profile cannot record`,async()=>{
  const h=await harness(endpoint);assertEquals((await h.dispatch("participation_accept",valid,{user_id:"901",subscription_id:"28",active:"2"})).status,403);
  assertEquals((await h.dispatch("participation_accept",{...valid,accepted:false})).status,428);
  assertEquals((await h.dispatch("participation_accept",{...valid,expected_event_key:"other"})).status,409);
  h.setComplete(false);assertEquals((await h.dispatch("participation_accept",valid)).status,422);assertEquals(h.calls,[]);
 });
 Deno.test(`${endpoint}: database write failure returns503 without unlocking or invoking transport`,async()=>{
  const h=await harness(endpoint);h.setUnavailable();const r=await h.dispatch("participation_accept",valid);assertEquals(r.status,503);assertEquals(r.body.reached_transport,undefined);assertEquals(r.body.participation_agreement,undefined);
 });
 Deno.test(`${endpoint}: fixture profile binding remains private while receipt identifies published notice`,async()=>{
  const h=await harness(endpoint);const r=await h.dispatch("participation_accept",valid,undefined,{event_key:"app-review-offline",authenticated_couple_bd_user_id:"701"});assertEquals(r.status,200);assertEquals(h.calls[0].args.p_event_key,"app-review-offline");assertEquals(r.body.participation_agreement.event_key,config.event_key);assertEquals(r.body.participation_agreement.excluded_from_master,true);
 });
 Deno.test(`${endpoint}: profile reads and list never infer agreement or create a receipt`,async()=>{
  const h=await harness(endpoint);for(const action of ["list","contact_profile_get"]){const r=await h.dispatch(action);assertEquals(r.status,200);assertEquals(r.body.participation_agreement,null);}assertEquals(h.calls,[]);
 });
 Deno.test(`${endpoint}: exact installed-client notice records on use but omitted legacy field does not invent it`,async()=>{
  const h=await harness(endpoint);for(const action of ["scan","raffle_offer","raffle_opt_in"]){await h.dispatch(action,{participation_notice_version:notice});}assertEquals(h.calls.map(c=>c.args.p_basis),["notice_on_use","notice_on_use","notice_on_use"]);
  const older=await harness(endpoint);await older.dispatch("raffle_offer",{});assertEquals(older.calls,[]);
 });
}
