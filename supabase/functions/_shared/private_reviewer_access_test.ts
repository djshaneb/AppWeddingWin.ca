import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationUrl = new URL(
  "../../migrations/20260828221025_enable_private_app_reviewers.sql",
  import.meta.url,
);
const pairMigrationUrl = new URL(
  "../../migrations/20260828221307_scope_private_app_reviewer_pairs.sql",
  import.meta.url,
);

Deno.test("private App Review access is service-only and expires", async () => {
  const migration = await Deno.readTextFile(migrationUrl);
  assert(migration.includes("enable row level security"));
  assert(migration.includes("revoke all on table public.app_private_reviewers from public, anon, authenticated"));
  assert(migration.includes("grant select, insert, update, delete on table public.app_private_reviewers to service_role"));
  assert(migration.includes("expires_at timestamptz not null"));
});

Deno.test("inactive chat access is limited to the expiring reviewer allowlist", async () => {
  const shared = await Deno.readTextFile(new URL("./bd_chat.ts", import.meta.url));
  const sync = await Deno.readTextFile(new URL("../bd-chat-sync/index.ts", import.meta.url));
  const status = await Deno.readTextFile(new URL("../bd-chat-status/index.ts", import.meta.url));
  const pairMigration = await Deno.readTextFile(pairMigrationUrl);

  assert(shared.includes('.from("app_private_reviewers")'));
  assert(shared.includes('.gt("expires_at", new Date().toISOString())'));
  assert(shared.includes("privateAppReviewerPairAllowed"));
  assert(shared.includes("String(row.paired_bd_member_id) === second"));
  assert(shared.includes("if (error)"));
  assert(sync.includes("await hasPrivateAppReviewerAccess(user.user_id)"));
  assert(sync.includes('await assertActiveChatMember(user, "account")'));
  assert(sync.includes("await privateAppReviewerPairAllowed(currentUser.user_id, user?.user_id)"));
  assert(status.includes("await hasPrivateAppReviewerAccess(user.user_id)"));
  assert(pairMigration.includes("paired_bd_member_id <> bd_member_id"));
  assert(pairMigration.includes("alter column paired_bd_member_id set not null"));
});
