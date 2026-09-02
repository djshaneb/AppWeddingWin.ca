import { assert, assertMatch } from "jsr:@std/assert@1";

Deno.test("QR Bingo publish conflicts complete without leaking the serialized lock", async () => {
  const migration = await Deno.readTextFile(new URL(
    "../../migrations/20260829201500_return_qr_bingo_publish_conflicts.sql",
    import.meta.url,
  ));
  const admin = await Deno.readTextFile(new URL(
    "../bd-qr-bingo-admin/index.ts",
    import.meta.url,
  ));

  assertMatch(migration, /exception[\s\S]*when serialization_failure[\s\S]*'conflict', true/);
  assertMatch(migration, /when invalid_parameter_value[\s\S]*'conflict', false/);
  assertMatch(migration, /notify pgrst, 'reload schema'/);
  assert(admin.includes("publishResult.ok === false"));
  assert(admin.includes("publishResult.conflict === true"));
});
