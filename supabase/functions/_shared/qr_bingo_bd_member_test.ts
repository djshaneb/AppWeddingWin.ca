import { fetchQrBdMember, QrBdMemberLookupUnavailableError } from "./qr_bingo_bd_member.ts";
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
const response = (status: number, body: {status?: string;message?:unknown}) =>
  async (_path: string) => ({ response: new Response("", { status }), body });

Deno.test("busy upstream never becomes an expired session", async () => {
  for (const status of [400,401,403,404,408,429,500,502,503,504]) {
    try {
      await fetchQrBdMember("123", response(status, { status: "error", message: "busy" }));
      throw new Error("unexpected authorization");
    } catch (error) {
      assert(error instanceof QrBdMemberLookupUnavailableError, "failure was not typed");
      assert((error as QrBdMemberLookupUnavailableError).status === 503, "failure may sign out a valid session");
    }
  }
});
Deno.test("network and malformed body failures fail closed as retryable", async () => {
  const bad = [
    async (_path: string): Promise<never> => { throw new Error("network"); },
    response(200, { status: "error", message: "API limit" }),
    response(200, { status: "success", message: null }),
    response(200, { status: "success", message: ["bad"] }),
    response(200, { status: "success", message: [{user_id:123},{user_id:456}] }),
  ];
  for (const call of bad) {
    try { await fetchQrBdMember("123", call); throw new Error("unexpected authorization"); }
    catch(error) { assert(error instanceof QrBdMemberLookupUnavailableError,"untyped failure"); }
  }
});
Deno.test("a confirmed absent member remains absent", async () => {
  assert(await fetchQrBdMember("123", response(200,{status:"success",message:[]})) === undefined,"absent member authorized");
});
Deno.test("valid fresh members preserve role and active fields in both BD envelopes", async () => {
  const row={user_id:123,active:"2",subscription_id:"4",tags:[{tag_id:5}]};
  for (const message of [row,[row]]) {
    let path="";
    const user=await fetchQrBdMember("123",async(p)=>{path=p;return {response:new Response(""),body:{status:"success",message}}});
    assert(path==="/api/v2/user/get/123?include_tags=1","lookup path changed");
    assert(user?.active==="2"&&user?.subscription_id==="4","member changed");
  }
});

