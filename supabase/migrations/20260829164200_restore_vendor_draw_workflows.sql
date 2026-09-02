-- Restore the vendor-specific QR prize-draw workflow. A booth scan records
-- visit progress only; the couple must separately review the rules and opt in
-- before an entry is written. Existing settings remain disabled because the
-- retirement migration cleared their acceptance audit fields. Each vendor
-- must review the current rules, accept them again, and explicitly re-enable
-- its draw through the vendor dashboard.

drop trigger if exists block_weddingwin_raffle_settings_mutation
  on public.qr_bingo_raffle_settings;

drop trigger if exists block_weddingwin_raffle_entry_mutation
  on public.qr_bingo_raffle_entries;

drop trigger if exists block_weddingwin_raffle_draw_mutation
  on public.qr_bingo_raffle_draws;

-- The separate WeddingWin grand-prize workflow is not part of the restored
-- vendor booth flow. Keep its database guard in place unless that promotion is
-- separately configured, reviewed, and enabled in a later migration.
comment on function public.block_weddingwin_promotion_mutation() is
  'Fail-closed database guard retained for the separately disabled WeddingWin grand-prize workflow. Vendor booth prize-draw writes are restored.';
