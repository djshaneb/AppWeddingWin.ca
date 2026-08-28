-- Filename version reconciled with the linked Supabase migration history.
create or replace function public.enforce_qr_bingo_raffle_draw_limit()
returns trigger
language plpgsql
as $$
declare
  existing_draw_count integer;
  max_draw_count integer := 3;
begin
  perform pg_advisory_xact_lock(hashtext(new.event_key || ':' || new.vendor_bingo_id));

  if new.vendor_bd_user_id = '23608' then
    max_draw_count := 100;
  end if;

  select count(*)
    into existing_draw_count
    from public.qr_bingo_raffle_draws
   where event_key = new.event_key
     and vendor_bingo_id = new.vendor_bingo_id;

  if existing_draw_count >= max_draw_count then
    raise exception 'Winner limit reached. Vendors can pick up to % winners for this event.', max_draw_count
      using errcode = '23514';
  end if;

  return new;
end;
$$;
