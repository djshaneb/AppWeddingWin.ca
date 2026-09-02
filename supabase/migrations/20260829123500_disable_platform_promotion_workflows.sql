-- WeddingWin's QR feature records booth visits/progress only. Promotion entry,
-- configuration, selection, and fulfilment workflows are disabled at the
-- database boundary. Historical rows remain available for deletion, audits,
-- disputes, and lawful retention; this migration does not erase or rewrite
-- prior acceptance/draw evidence.

update public.qr_bingo_raffle_settings
   set enabled = false,
       legal_terms_accepted = false,
       legal_terms_accepted_at = null,
       rules_viewed_at = null,
       apple_non_sponsor_acknowledged = false,
       updated_at = now()
 where enabled
    or legal_terms_accepted
    or legal_terms_accepted_at is not null
    or rules_viewed_at is not null
    or apple_non_sponsor_acknowledged;

create or replace function public.block_weddingwin_promotion_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'WeddingWin promotion workflows are disabled; QR scans record booth visits only.';
end;
$$;

revoke all on function public.block_weddingwin_promotion_mutation()
  from public, anon, authenticated;

drop trigger if exists block_weddingwin_raffle_settings_mutation
  on public.qr_bingo_raffle_settings;
create trigger block_weddingwin_raffle_settings_mutation
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.block_weddingwin_promotion_mutation();

drop trigger if exists block_weddingwin_raffle_entry_mutation
  on public.qr_bingo_raffle_entries;
create trigger block_weddingwin_raffle_entry_mutation
before insert or update on public.qr_bingo_raffle_entries
for each row execute function public.block_weddingwin_promotion_mutation();

drop trigger if exists block_weddingwin_raffle_draw_mutation
  on public.qr_bingo_raffle_draws;
create trigger block_weddingwin_raffle_draw_mutation
before insert or update on public.qr_bingo_raffle_draws
for each row execute function public.block_weddingwin_promotion_mutation();

drop trigger if exists block_weddingwin_grand_prize_entry_mutation
  on public.qr_bingo_grand_prize_entries;
create trigger block_weddingwin_grand_prize_entry_mutation
before insert or update on public.qr_bingo_grand_prize_entries
for each row execute function public.block_weddingwin_promotion_mutation();

comment on function public.block_weddingwin_promotion_mutation() is
  'Fail-closed database guard for retired WeddingWin promotion workflows. Deletes remain permitted for account deletion and lawful retention cleanup.';
