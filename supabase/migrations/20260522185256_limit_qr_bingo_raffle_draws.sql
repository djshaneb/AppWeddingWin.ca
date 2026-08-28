-- Filename version reconciled with the linked Supabase migration history.
create or replace function public.enforce_qr_bingo_raffle_draw_limit()
returns trigger
language plpgsql
as $$
declare
  existing_draw_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.event_key || ':' || new.vendor_bingo_id));

  select count(*)
    into existing_draw_count
    from public.qr_bingo_raffle_draws
   where event_key = new.event_key
     and vendor_bingo_id = new.vendor_bingo_id;

  if existing_draw_count >= 3 then
    raise exception 'Winner limit reached. Vendors can pick up to 3 winners for this event.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists qr_bingo_raffle_draw_limit
  on public.qr_bingo_raffle_draws;

create trigger qr_bingo_raffle_draw_limit
before insert on public.qr_bingo_raffle_draws
for each row
execute function public.enforce_qr_bingo_raffle_draw_limit();
