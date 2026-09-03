function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const migrationUrl = new URL(
  "../../migrations/20260828190241_preserve_shared_data_on_account_deletion.sql",
  import.meta.url,
);
const identityHardeningMigrationUrl = new URL(
  "../../migrations/20260828211753_harden_deleted_chat_identity_retention.sql",
  import.meta.url,
);
const profileSnapshotMigrationUrl = new URL(
  "../../migrations/20260828213136_stage_deleted_profile_identity_before_auth_purge.sql",
  import.meta.url,
);
const outboxReliabilityMigrationUrl = new URL(
  "../../migrations/20260902070000_chat_send_idempotency_and_outbox_leases.sql",
  import.meta.url,
);
const liveFixtureUrl = new URL(
  "../../tests/account_deletion_privacy_fixture.sql",
  import.meta.url,
);

Deno.test("account deletion preserves the other participant's shared chat history", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const outboxSql = await Deno.readTextFile(outboxReliabilityMigrationUrl);

  for (
    const sharedTable of [
      "app_native_chat_messages",
      "app_native_chat_threads",
      "bd_chat_messages",
      "bd_chat_threads",
      "app_chat_thread_reports",
      "app_chat_member_blocks",
    ]
  ) {
    assert(
      !new RegExp(`delete\\s+from\\s+public\\.${sharedTable}\\b`, "i").test(
        sql,
      ),
      `${sharedTable} must not be deleted when only one participant leaves`,
    );
  }

  assert(
    /status in \('reported', 'reviewing', 'resolved', 'account_deleted'\)/i
      .test(sql),
    "account deletion must have a distinct non-moderation closure status",
  );
  assert(
    /insert into public\.app_chat_thread_reports[\s\S]*?'account_deleted'/i
      .test(sql),
    "shared thread aliases must be marked read-only",
  );
  assert(
    /insert into public\.bd_chat_outbox \(kind, thread_token, payload\)[\s\S]*?'close'/i
      .test(sql),
    "website aliases must be queued for closure without deleting their history",
  );
  assert(
    outboxSql.includes("bd_chat_outbox_pending_close_key") &&
      outboxSql.includes("enqueue_bd_chat_close") &&
      outboxSql.includes(
        "lock table public.bd_chat_outbox in share row exclusive mode",
      ) &&
      outboxSql.includes(
        "purge_weddingwin_member_data_without_fixture_participants_v1",
      ),
    "account deletion and Edge reporters must share an atomic pending-close invariant",
  );

  const outboxDelete = sql.match(
    /delete from public\.bd_chat_outbox([\s\S]*?)get diagnostics v_count = row_count;/i,
  )?.[1] || "";
  assert(
    outboxDelete.includes("sender_bd_user_id = v_user_id"),
    "departing-user outbox rows must be purged",
  );
  assert(
    outboxDelete.includes("owner_identity = any(v_identities)"),
    "owned legacy outbox rows must be purged",
  );
  assert(
    !outboxDelete.includes("thread_token"),
    "the other participant's outbox rows must not be deleted by shared token",
  );

  const cacheDelete = sql.match(
    /delete from public\.bd_edge_cache cache([\s\S]*?)get diagnostics v_count = row_count;/i,
  )?.[1] || "";
  assert(
    cacheDelete.includes("'sess:' || v_user_id"),
    "the departing member's session cache must be purged",
  );
  assert(
    !cacheDelete.includes("cache.value"),
    "shared-token value scans must not erase another member's cache",
  );
});

Deno.test("shared chat keeps content but permanently redacts deleted login identities", async () => {
  const sql = await Deno.readTextFile(identityHardeningMigrationUrl);
  const source = await Deno.readTextFile(
    new URL("../bd-delete-account/index.ts", import.meta.url),
  );

  const tombstoneTable = sql.match(
    /create table if not exists weddingwin_private\.deleted_chat_identities \(([\s\S]*?)\n\);/i,
  )?.[1] || "";
  assert(
    tombstoneTable.includes("identity_hash text not null") &&
      !/identity_(?:value|token|cookie|email)\s+text/i.test(tombstoneTable),
    "deletion tombstones must retain only one-way hashes, never raw identities",
  );
  assert(
    /extensions\.digest\([\s\S]*?'sha256'/i.test(sql),
    "deleted chat identities must use SHA-256 tombstones",
  );
  assert(
    /insert into weddingwin_private\.deleted_chat_identities[\s\S]*?chat_identity_hash\(identity_value\)/i
      .test(sql),
    "known deleted identities must be tombstoned before source caches are removed",
  );

  for (
    const triggerTarget of [
      "public.bd_chat_threads",
      "public.bd_chat_messages",
      "public.app_native_chat_messages",
    ]
  ) {
    assert(
      new RegExp(
        `create trigger weddingwin_redact_deleted_[\\s\\S]*?before insert or update on ${
          triggerTarget.replaceAll(".", "\\.")
        }`,
        "i",
      ).test(sql),
      `${triggerTarget} must reject deleted identities on future mirror writes`,
    );
  }

  assert(
    /update public\.bd_chat_threads[\s\S]*?thread_owner = weddingwin_private\.redact_chat_identity_list\(thread_owner\)[\s\S]*?raw = weddingwin_private\.redact_chat_raw\(raw\)/i
      .test(sql),
    "retained website threads must scrub participant credentials and raw auth data",
  );
  assert(
    /update public\.bd_chat_messages[\s\S]*?message_owner = weddingwin_private\.redact_chat_identity\(message_owner\)[\s\S]*?raw = weddingwin_private\.redact_chat_raw\(raw\)/i
      .test(sql),
    "retained website messages must anonymize only the deleted owner identity",
  );
  assert(
    /update public\.app_native_chat_messages[\s\S]*?set sender_bd_user_id = '\(deleted member\)'[\s\S]*?sender_bd_user_id = v_user_id/i
      .test(sql),
    "retained native messages must anonymize the departed sender id",
  );
  assert(
    !/update public\.(?:bd_chat_messages|app_native_chat_messages)[\s\S]{0,500}?set[\s\S]{0,300}?message_content\s*=/i
      .test(sql),
    "message bodies must remain unchanged for the surviving participant",
  );
  assert(
    /where lower\(entry\.key\) not in \([\s\S]*?'token'[\s\S]*?'cookie'[\s\S]*?'access_token'[\s\S]*?'refresh_token'[\s\S]*?'origin_ip'/i
      .test(sql),
    "raw mirror JSON must discard reusable authentication fields and redundant IP addresses",
  );
  assert(
    /insert into public\.app_chat_member_blocks[\s\S]*?blocked_member_bd_user_id[\s\S]*?v_user_id/i
      .test(await Deno.readTextFile(migrationUrl)),
    "structural member ids must remain available for closure/block enforcement",
  );
  assert(
    /v_result := coalesce\(public\.purge_weddingwin_member_data\([\s\S]*?update public\.bd_chat_threads/i
      .test(sql),
    "closure/block purge and redaction must execute in one transactional wrapper",
  );
  assert(
    /jsonb_agg\(to_jsonb\(blocks\)\)[\s\S]*?jsonb_populate_recordset\([\s\S]*?blocked_by_bd_user_id = previous_block\.blocked_by_bd_user_id/i
      .test(sql) &&
      /revoke all on function public\.purge_weddingwin_member_data\(text, text, text\) from service_role/i
        .test(sql),
    "existing moderation direction must be restored and the unsafe predecessor must not be callable directly",
  );
  assert(
    source.includes(
      'admin.rpc("purge_weddingwin_member_data_with_chat_redaction"',
    ),
    "the deletion handler must call the transactional redaction wrapper",
  );
});

Deno.test("live deletion privacy fixture is disposable and checks the survivor contract", async () => {
  const sql = await Deno.readTextFile(liveFixtureUrl);
  assert(
    /^\s*--[\s\S]*?\bbegin;/i.test(sql) && /rollback;\s*$/i.test(sql),
    "live fixture writes must be wrapped in an explicit rollback transaction",
  );
  assert(
    sql.includes("stage_weddingwin_member_chat_redaction") &&
      sql.includes("purge_weddingwin_member_data_with_chat_redaction") &&
      sql.includes("Shared fixture message remains readable.") &&
      sql.includes("status = 'account_deleted'") &&
      sql.includes("Existing moderation direction must remain unchanged."),
    "fixture must verify readable content plus closure and block semantics",
  );
  assert(
    sql.includes("Simulate a later BD mirror refresh") &&
      sql.includes("thread_owner = 'codex-deletion-fixture-login-token'") &&
      sql.includes("message_owner = 'codex-deletion-fixture-login-token'") &&
      sql.includes("codex-deletion-fixture-apple-sub") &&
      sql.includes("Staged identity became active before the final purge") &&
      sql.includes("Promoted provider identity snapshot was not removed"),
    "fixture must verify inactive staging, profile identity promotion, and future-upsert redaction",
  );
});

Deno.test("provider identities are snapshotted before GoTrue can cascade the profile", async () => {
  const sql = await Deno.readTextFile(profileSnapshotMigrationUrl);
  const source = await Deno.readTextFile(
    new URL("../bd-delete-account/index.ts", import.meta.url),
  );

  const pendingTable = sql.match(
    /create table if not exists weddingwin_private\.pending_deleted_chat_identities \(([\s\S]*?)\n\);/i,
  )?.[1] || "";
  assert(
    pendingTable.includes("member_hash text not null") &&
      pendingTable.includes("identity_hash text not null") &&
      !/(?:email|apple_sub|profile_id|token|cookie)\s+text/i.test(pendingTable),
    "retry staging must persist only hashes, never raw profile or login identifiers",
  );

  const stageFunction = sql.match(
    /create or replace function public\.stage_weddingwin_member_chat_redaction\([\s\S]*?\n\$\$;/i,
  )?.[0] || "";
  assert(
    stageFunction.includes("p_profile_email") &&
      stageFunction.includes("p_apple_sub") &&
      stageFunction.includes("p_profile_id") &&
      stageFunction.includes("profiles.apple_sub") &&
      stageFunction.includes("profiles.id::text"),
    "staging must capture both server-resolved inputs and the still-live profile row",
  );
  assert(
    stageFunction.includes(
      "insert into weddingwin_private.pending_deleted_chat_identities",
    ) &&
      !stageFunction.includes(
        "insert into weddingwin_private.deleted_chat_identities",
      ),
    "preflight staging must remain inactive until deletion reaches its final transaction",
  );

  const stageIndex = source.indexOf(
    'diagnosticStage = "stage_chat_identity_redaction"',
  );
  const authDeleteIndex = source.indexOf(
    'diagnosticStage = "delete_supabase_auth"',
  );
  assert(
    stageIndex >= 0 && authDeleteIndex > stageIndex &&
      source.includes('admin.rpc("stage_weddingwin_member_chat_redaction"') &&
      source.includes('p_profile_email: String(profile?.email || "")') &&
      source.includes("p_apple_sub: appleSub") &&
      source.includes('p_profile_id: String(profile?.id || "")'),
    "the edge function must stage resolved provider identifiers before deleting GoTrue",
  );

  assert(
    /insert into weddingwin_private\.deleted_chat_identities[\s\S]*?from weddingwin_private\.pending_deleted_chat_identities[\s\S]*?purge_weddingwin_member_data_chat_redaction_v1[\s\S]*?delete from weddingwin_private\.pending_deleted_chat_identities/i
      .test(sql),
    "the final wrapper must promote, purge atomically, then clear the retry snapshot",
  );
  assert(
    /revoke all on function public\.purge_weddingwin_member_data_chat_redaction_v1\(text, text, text\)[\s\S]*?service_role/i
      .test(sql),
    "service-role clients must not bypass staged-identity promotion",
  );
  assert(
    /expires_at timestamptz[\s\S]*?interval '30 days'/i.test(sql) &&
      /cron\.schedule\([\s\S]*?'purge-expired-weddingwin-chat-identity-snapshots'/i
        .test(sql),
    "abandoned inactive snapshots must expire automatically",
  );
});

Deno.test("legacy Apple profiles are linked from server-trusted identity data", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const source = await Deno.readTextFile(
    new URL("../bd-delete-account/index.ts", import.meta.url),
  );

  assert(
    /create or replace function public\.link_weddingwin_profile_for_deletion\s*\(/i
      .test(sql),
    "a service-role profile resolver must exist for legacy unlinked provider identities",
  );
  for (const role of ["public", "anon", "authenticated"]) {
    assert(
      new RegExp(
        `revoke all on function public\\.link_weddingwin_profile_for_deletion\\(text, text\\) from ${role}`,
        "i",
      ).test(sql),
      `profile resolver execute must be revoked from ${role}`,
    );
  }
  assert(
    /grant execute on function public\.link_weddingwin_profile_for_deletion\(text, text\) to service_role/i
      .test(sql),
    "only service-role code may link a deletion profile",
  );
  assert(
    source.includes('.select("token, cookie, email")'),
    "the deletion handler must load the server-trusted cached email",
  );
  assert(
    source.includes('admin.rpc("link_weddingwin_profile_for_deletion"'),
    "the deletion handler must resolve and persist the provider-to-BD link",
  );
  assert(
    /if \(appleSub\) \{[\s\S]*?revokeAppleAuthorization/i.test(source),
    "Apple authorization revocation must not depend on the GoTrue row still existing",
  );
});

Deno.test("account deletion purges outstanding login exchanges", async () => {
  const retentionSql = await Deno.readTextFile(
    new URL(
      "../../migrations/20260828200918_harden_app_auth_exchange_retention.sql",
      import.meta.url,
    ),
  );
  const source = await Deno.readTextFile(
    new URL("../bd-delete-account/index.ts", import.meta.url),
  );

  assert(
    /create or replace function public\.purge_member_app_auth_exchanges\(p_bd_member_id text\)/i
      .test(retentionSql) &&
      /delete from public\.app_login_exchanges[\s\S]*bd_member_id = v_user_id/i
        .test(retentionSql) &&
      /delete from public\.app_native_auth_exchanges[\s\S]*bd_member_id = v_user_id/i
        .test(retentionSql),
    "the database must delete both exchange types by normalized member id",
  );
  assert(
    source.includes('diagnosticStage = "purge_auth_exchanges"') &&
      source.includes('admin.rpc("purge_member_app_auth_exchanges"'),
    "the deletion handler must purge reusable exchanges before clearing member data",
  );
});
