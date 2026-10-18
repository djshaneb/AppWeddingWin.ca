import { websiteFixtureContextIsConfirmedEmpty } from "./qr_bingo_fixture_empty.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
type Result = { data: unknown; error: unknown };
const tables = ["app_review_raffle_fixtures","app_review_raffle_fixture_participants","qr_bingo_email_test_fixtures"];
function fixture(results: Partial<Record<string,Result|Error>> = {}) {
  const calls: Array<{table:string;select:string;filter:string;limit:number}> = [];
  const client = {from(table:string) {
    const call={table,select:"",filter:"",limit:0};calls.push(call);
    const chain={
      select(value:string) {call.select=value;return chain;},
      or(value:string) {call.filter=value;return chain;},
      eq(column:string,value:string) {call.filter=column+"="+value;return chain;},
      limit(value:number) {
        call.limit=value;
        const result=results[table] || {data:[],error:null};
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
      },
    };
    return chain;
  }} as unknown as SupabaseClient;
  return {client,calls};
}
Deno.test("only a verified website couple fixture probe can skip BD lookup", async () => {
  for(const principal of [null,{kind:"vendor",userId:"123"},{kind:"couple",userId:"x"},{kind:"couple",userId:"38970"},{kind:"couple",userId:"38971"}]) {
    const f=fixture();
    assert(!await websiteFixtureContextIsConfirmedEmpty(principal,"fixture_context",f.client),"unsupported principal shortcut");
    assert(f.calls.length===0,"unsupported principal touched fixture tables");
  }
  for(const action of ["list","scan","raffle_offer","raffle_opt_in","contact_profile_get","contact_profile_save","participation_accept","vendor_raffle_draw"]) {
    const f=fixture();
    assert(!await websiteFixtureContextIsConfirmedEmpty({kind:"couple",userId:"123"},action,f.client),"real action skipped fresh checks");
    assert(f.calls.length===0,"real action touched shortcut");
  }
});
Deno.test("all assignment tables must confirm absence with member-bound queries", async () => {
  const f=fixture();
  assert(await websiteFixtureContextIsConfirmedEmpty({kind:"couple",userId:"123"},"fixture_context",f.client),"confirmed absence not recognized");
  assert(f.calls.length===3,"not all assignments checked");
  for(const call of f.calls) {
    assert(call.limit===1,"unbounded read");
    assert(call.filter===(call.table===tables[1]?"couple_bd_user_id=123":"couple_bd_user_id.eq.123,vendor_bd_user_id.eq.123"),"query not member-bound");
    assert(!call.filter.includes("enabled"),"disabled assignments could be skipped");
  }
});
Deno.test("any assigned fixture or participant retains original fresh checks", async () => {
  for(const table of tables) {
    const f=fixture({[table]:{data:[{id:"assigned",enabled:false}],error:null}});
    assert(!await websiteFixtureContextIsConfirmedEmpty({kind:"couple",userId:"123"},"fixture_context",f.client),"assigned fixture skipped fresh checks");
  }
});
Deno.test("missing tables, malformed responses and network failures never claim absence", async () => {
  for(const failure of [{data:null,error:{code:"PGRST205"}},{data:null,error:null},{data:{},error:null},new Error("network")]) {
    const f=fixture({[tables[0]]:failure});
    assert(!await websiteFixtureContextIsConfirmedEmpty({kind:"couple",userId:"123"},"fixture_context",f.client),"uncertain assignment claimed absence");
  }
});
Deno.test("deployed handler places shortcut after HMAC and nonce validation before fresh member lookup", async () => {
  const source=await Deno.readTextFile(new URL("../bd-qr-bingo-vendor-sync/index.ts",import.meta.url));
  const serve=source.indexOf("Deno.serve(");
  const verify=source.indexOf("websitePrincipal = await verifyQrBingoWebsiteRequest",serve);
  const nonce=source.indexOf('rpc("consume_qr_bingo_admin_nonce"',verify);
  const shortcut=source.indexOf("if (await websiteFixtureContextIsConfirmedEmpty",nonce);
  const fresh=source.indexOf("const websiteCoupleUser =",shortcut);
  assert(serve<verify&&verify<nonce&&nonce<shortcut&&shortcut<fresh,"shortcut moved before proof");
  assert(source.slice(shortcut,fresh).includes("isolatedFixtureContext(null, authenticatedMemberId)"),"response is not existing empty fixture result");
});

