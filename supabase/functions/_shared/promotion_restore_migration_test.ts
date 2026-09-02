function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const disableMigrationUrl = new URL(
  "../../migrations/20260829123500_disable_platform_promotion_workflows.sql",
  import.meta.url,
);
const restoreMigrationUrl = new URL(
  "../../migrations/20260829164200_restore_vendor_draw_workflows.sql",
  import.meta.url,
);

Deno.test("vendor draws are restored without silently accepting rules for vendors", async () => {
  const disabled = await Deno.readTextFile(disableMigrationUrl);
  const restored = await Deno.readTextFile(restoreMigrationUrl);

  for (
    const trigger of [
      "block_weddingwin_raffle_settings_mutation",
      "block_weddingwin_raffle_entry_mutation",
      "block_weddingwin_raffle_draw_mutation",
    ]
  ) {
    assert(
      disabled.includes(`create trigger ${trigger}`) &&
        restored.includes(`drop trigger if exists ${trigger}`),
      `${trigger} must be removed by the forward restoration migration`,
    );
  }

  assert(
    !/update\s+public\.qr_bingo_raffle_settings/i.test(restored),
    "restoration must not fabricate vendor rule acceptance or silently enable a draw",
  );
  assert(
    !restored.includes("drop trigger if exists block_weddingwin_grand_prize_entry_mutation"),
    "the separate grand-prize workflow must remain fail-closed",
  );
  assert(
    disabled.includes("create trigger block_weddingwin_grand_prize_entry_mutation") &&
      !restored.includes("drop function if exists public.block_weddingwin_promotion_mutation"),
    "the grand-prize trigger and the function it invokes must both remain installed",
  );
  assert(
    !/delete\s+from\s+public\.qr_bingo_/i.test(restored),
    "restoration must preserve historical settings, entries, and draws",
  );
});
