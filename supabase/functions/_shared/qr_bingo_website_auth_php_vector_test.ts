import {
  resolveWebsiteSigningSecret, verifyQrBingoWebsiteRequest,
  websiteBodySha256, websiteRequestSignature,
} from "./qr_bingo_website_auth.ts";

// Produced by actual PHP.wasm CLI using json_encode, hash('sha256', ...),
// hash_hmac's default HEX output and implode(chr(10), ...). This deliberately
// includes PHP's escaped Unicode and slash, not JavaScript JSON serialization.
// The key and identity are fictional, public test data, never real credentials.
const key = "unit-test-only-website-signing-key-DO-NOT-USE-REAL";
const rawBody = String.raw`{"action":"vendor_dashboard_access","website_member_id":"707","client_platform":"website","label":"\u00c9t\u00e9 \/ test"}`;
const vector = {
  scope: "weddingwin:qr-bingo:vendor-website:v1", userId: "707",
  action: "vendor_dashboard_access", expires: "1790000030",
  nonce: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  bodyHash: "6c74f4eaebd27f8677325bf59ac423a1c7d47486e56d656aa73d1ab5cb71dac6",
  signature: "a5b929d7b6d7e1805d3fa8c44e546aea0f8e7b711c0585e6d04415680a2d87f6",
};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function request() {
  return new Request("https://example.invalid/vendor", {
    method: "POST", body: rawBody, headers: {
      "x-ww-website-scope": vector.scope, "x-ww-website-member": vector.userId,
      "x-ww-website-expires": vector.expires, "x-ww-website-nonce": vector.nonce,
      "x-ww-website-body-sha256": vector.bodyHash, "x-ww-website-signature": vector.signature,
    },
  });
}
Deno.test("actual PHP JSON/body-hash and domain-separated HMAC vector matches Deno", async () => {
  assert(await websiteBodySha256(rawBody) === vector.bodyHash, "PHP and Deno exact body bytes differ");
  assert(await websiteRequestSignature(key, vector) === vector.signature, "PHP and Deno HMAC bytes differ");
});
Deno.test("actual PHP website proof uses configured admin key before a different Vault key", async () => {
  let vaultReads = 0, consumed = 0;
  const principal = await verifyQrBingoWebsiteRequest(request(), rawBody, JSON.parse(rawBody), {
    nowSeconds: () => 1790000000,
    loadSecret: () => resolveWebsiteSigningSecret(`  ${key}\n`, async () => {
      vaultReads += 1; return "a-different-fictional-vault-key-must-not-be-used";
    }),
    consumeNonce: async () => { consumed += 1; return true; },
  });
  assert(principal.userId === "707" && principal.kind === "vendor", "PHP proof principal did not match");
  assert(vaultReads === 0 && consumed === 1, "Configured environment key must take precedence without reading Vault");
});
Deno.test("both deployed QR copies use the same environment-first signing-key resolver", async () => {
  for (const file of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
    const source = await Deno.readTextFile(new URL(`../${file}/index.ts`, import.meta.url));
    assert(source.includes('resolveWebsiteSigningSecret(Deno.env.get("QR_BINGO_ADMIN_HMAC_SECRET"), async () => {'),
      `${file} bypassed the existing signing-key source precedence`);
    assert(source.includes('requireAdmin().rpc("get_qr_bingo_admin_hmac_secret")'), `${file} lost the Vault fallback`);
  }
});
