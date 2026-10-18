import { verifiedWebsiteCoupleMember, WebsiteMemberSnapshotError } from "./qr_bingo_website_member.ts";
import { verifyQrBingoWebsiteRequest, websiteBodySha256, websiteRequestSignature, WEBSITE_COUPLE_SCOPE } from "./qr_bingo_website_auth.ts";
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m);};
const member={version:1,user_id:"123",active:"2",subscription_id:"18",first_name:"Test",last_name:"Couple",email:"test@example.test",phone_number:"9055551234",phone:"",wedding_date:"2027-06-12"};
const principal={kind:"couple",userId:"123",action:"contact_profile_get"} as const;
Deno.test("valid member snapshot preserves needed couple fields and excludes credentials",()=>{
 const got=verifiedWebsiteCoupleMember(principal,{website_member_snapshot:member});
 assert(got?.email===member.email&&got?.wedding_date===member.wedding_date,"lost contact defaults");
 assert(!("version" in got!)&&!('token' in got!),"metadata/credentials leaked");
});
Deno.test("missing snapshot preserves fallback; native and vendor never use snapshot",()=>{
 assert(verifiedWebsiteCoupleMember(principal,{})===undefined,"missing not fallback");
 assert(verifiedWebsiteCoupleMember(null,{website_member_snapshot:member})===undefined,"native accepted snapshot");
 assert(verifiedWebsiteCoupleMember({kind:"vendor",userId:"123",action:"vendor_raffle_get"},{website_member_snapshot:member})===undefined,"vendor accepted couple snapshot");
});
Deno.test("present malformed identity role fields and secret-bearing snapshots all fail closed",()=>{
 const values=[null,[],false,{}, {...member,user_id:"124"},{...member,user_id:123},{...member,active:"1"},{...member,active:2},
 {...member,subscription_id:"17"},{...member,subscription_id:18},{...member,version:"1"},{...member,token:"secret"},
 {...member,email:null},{...member,first_name:"é".repeat(251)},{...member,phone:"a\u0000b"}];
 for(const value of values){let rejected=false;try{verifiedWebsiteCoupleMember(principal,{website_member_snapshot:value});}catch(e){rejected=e instanceof WebsiteMemberSnapshotError;}assert(rejected,"malformed snapshot accepted");}
});
async function signed(body:Record<string,unknown>) {
 const raw=JSON.stringify(body),secret="offline-test-secret-must-be-longer-than-32-bytes",now=1800000000,expires=String(now+30),nonce="a".repeat(32),hash=await websiteBodySha256(raw);
 const signature=await websiteRequestSignature(secret,{scope:WEBSITE_COUPLE_SCOPE,userId:"123",action:"contact_profile_get",expires,nonce,bodyHash:hash});
 const headers={"x-ww-website-scope":WEBSITE_COUPLE_SCOPE,"x-ww-website-member":"123","x-ww-website-expires":expires,"x-ww-website-nonce":nonce,"x-ww-website-body-sha256":hash,"x-ww-website-signature":signature};
 return {raw,secret,now,headers};
}
Deno.test("existing production HMAC and nonce guard protect attached snapshot from tampering and replay",async()=>{
 const body={action:"contact_profile_get",website_member_id:"123",website_member_snapshot:member},s=await signed(body);
 let nonceCalls=0;
 const deps={nowSeconds:()=>s.now,loadSecret:async()=>s.secret,consumeNonce:async()=>++nonceCalls===1};
 const request=new Request("https://example.test",{method:"POST",headers:s.headers});
 const p=await verifyQrBingoWebsiteRequest(request,s.raw,body,deps);
 assert(verifiedWebsiteCoupleMember(p,body)?.user_id==="123","signed snapshot failed");
 for(const [raw,b] of [[s.raw,body],[JSON.stringify({...body,website_member_snapshot:{...member,active:"1"}}),{...body,website_member_snapshot:{...member,active:"1"}}]] as const) {
  let rejected=false;try{await verifyQrBingoWebsiteRequest(request,raw,b,deps);}catch{rejected=true;}assert(rejected,"replay/tamper accepted");
 }
});
Deno.test("handler validates after nonce before empty fixture return and leaves date readback intact",async()=>{
 const source=await Deno.readTextFile(new URL("../bd-qr-bingo-vendor-sync/index.ts",import.meta.url));
 const begin=source.indexOf("Deno.serve("),nonce=source.indexOf('rpc("consume_qr_bingo_admin_nonce"',begin),parse=source.indexOf("const websiteAttestedMember =",nonce),empty=source.indexOf("if (await websiteFixtureContextIsConfirmedEmpty",parse);
 assert(begin<nonce&&nonce<parse&&parse<empty,"incorrect validation order");
 assert(source.includes("websiteAttestedMember ?? await fetchFullBdUserById(authenticatedMemberId)"),"old clients lack fallback");
 assert(source.includes("callBd, fetchUser: fetchFullBdUserById"),"date readback bypassed");
});

