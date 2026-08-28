function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("pair unblock migration is transactional and service-role only", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../migrations/20260828162556_add_app_chat_member_blocks.sql", import.meta.url),
  );
  assert(/create or replace function public\.resolve_chat_member_block_pair\s*\(/i.test(sql), "unblock RPC must exist");
  assert(/update public\.app_chat_thread_reports[\s\S]*status = 'resolved'/i.test(sql), "RPC must resolve all pair reports");
  assert(/update public\.app_chat_member_blocks[\s\S]*status = 'revoked'/i.test(sql), "RPC must revoke the pair block");
  assert(/update public\.bd_chat_outbox[\s\S]*kind = 'close'[\s\S]*sent_at is null/i.test(sql), "RPC must cancel pending close work for the unblocked pair");
  for (const role of ["public", "anon", "authenticated"]) {
    assert(
      new RegExp(`revoke all on function public\\.resolve_chat_member_block_pair\\(text, text, text\\) from ${role}`, "i").test(sql),
      `RPC execute must be revoked from ${role}`,
    );
  }
  assert(/grant execute on function public\.resolve_chat_member_block_pair\(text, text, text\) to service_role/i.test(sql), "service role must retain execute");
});

Deno.test("push sweep cron is authenticated by a Vault-only secret", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../migrations/20260828162613_secure_push_sweep_cron.sql", import.meta.url),
  );
  assert(/vault\.create_secret\s*\(/i.test(sql), "migration must create the random cron secret in Vault");
  assert(
    /create or replace function public\.verify_weddingwin_push_sweep_secret\s*\(/i.test(sql),
    "migration must provide the server-side secret verifier",
  );
  for (const role of ["public", "anon", "authenticated"]) {
    assert(
      new RegExp(`revoke all on function public\\.verify_weddingwin_push_sweep_secret\\(text\\) from ${role}`, "i").test(sql),
      `push verifier execute must be revoked from ${role}`,
    );
  }
  assert(
    /grant execute on function public\.verify_weddingwin_push_sweep_secret\(text\) to service_role/i.test(sql),
    "only service-role code may invoke the push verifier",
  );
  assert(
    /'X-WeddingWin-Cron-Secret',[\s\S]*vault\.decrypted_secrets/i.test(sql),
    "cron must read the request header from Vault at execution time",
  );
  assert(!/\bPUSH_SWEEP_CRON_SECRET\b/.test(sql), "migration must not require a duplicated Edge secret");
});

Deno.test("legacy app reports still durably enqueue a known BD alias", async () => {
  const source = await Deno.readTextFile(
    new URL("../bd-chat-report/index.ts", import.meta.url),
  );
  assert(
    source.includes('appThread?.bd_thread_token || ""'),
    "report handler must retain the saved BD alias when its live lookup fails",
  );
  assert(
    /else if \(knownBdThreadToken\)[\s\S]*await enqueueCloseOutbox\(knownBdThreadToken, ""\)/.test(source),
    "known BD aliases must be queued even without a fetched BD row",
  );
});
