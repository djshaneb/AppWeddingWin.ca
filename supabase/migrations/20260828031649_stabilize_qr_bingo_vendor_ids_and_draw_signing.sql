-- QR Bingo vendor identifiers must remain stable when the event tag or vendor
-- ordering changes. Brilliant Directories user_id is the canonical identifier.

do $$
begin
  if exists (
    select 1
    from public.qr_bingo_raffle_settings
    where nullif(trim(vendor_bd_user_id), '') is null
  ) then
    raise exception 'Cannot stabilize QR Bingo settings: blank vendor_bd_user_id exists';
  end if;

  if exists (
    select 1
    from public.qr_bingo_raffle_entries
    where nullif(trim(vendor_bd_user_id), '') is null
  ) then
    raise exception 'Cannot stabilize QR Bingo entries: blank vendor_bd_user_id exists';
  end if;

  if exists (
    select 1
    from public.qr_bingo_raffle_draws
    where nullif(trim(vendor_bd_user_id), '') is null
  ) then
    raise exception 'Cannot stabilize QR Bingo draws: blank vendor_bd_user_id exists';
  end if;

  if exists (
    select 1
    from public.qr_bingo_raffle_settings
    where nullif(trim(vendor_bd_user_id), '') is not null
    group by event_key, trim(vendor_bd_user_id)
    having count(*) > 1
  ) then
    raise exception 'Cannot stabilize QR Bingo settings: duplicate event/vendor rows exist';
  end if;

  if exists (
    select 1
    from public.qr_bingo_raffle_entries
    where nullif(trim(vendor_bd_user_id), '') is not null
    group by event_key, trim(vendor_bd_user_id), couple_bd_user_id
    having count(*) > 1
  ) then
    raise exception 'Cannot stabilize QR Bingo entries: duplicate event/vendor/couple rows exist';
  end if;

  if exists (
    select 1
    from public.qr_bingo_raffle_draws
    where nullif(trim(vendor_bd_user_id), '') is not null
    group by event_key, trim(vendor_bd_user_id), draw_number
    having count(*) > 1
  ) then
    raise exception 'Cannot stabilize QR Bingo draws: duplicate event/vendor/draw rows exist';
  end if;
end;
$$;

update public.qr_bingo_raffle_settings
set vendor_bd_user_id = trim(vendor_bd_user_id),
    vendor_bingo_id = trim(vendor_bd_user_id),
    updated_at = now()
where nullif(trim(vendor_bd_user_id), '') is not null
  and (
    vendor_bd_user_id is distinct from trim(vendor_bd_user_id)
    or vendor_bingo_id is distinct from trim(vendor_bd_user_id)
  );

update public.qr_bingo_raffle_entries
set vendor_bd_user_id = trim(vendor_bd_user_id),
    vendor_bingo_id = trim(vendor_bd_user_id)
where nullif(trim(vendor_bd_user_id), '') is not null
  and (
    vendor_bd_user_id is distinct from trim(vendor_bd_user_id)
    or vendor_bingo_id is distinct from trim(vendor_bd_user_id)
  );

update public.qr_bingo_raffle_draws
set vendor_bd_user_id = trim(vendor_bd_user_id),
    vendor_bingo_id = trim(vendor_bd_user_id)
where nullif(trim(vendor_bd_user_id), '') is not null
  and (
    vendor_bd_user_id is distinct from trim(vendor_bd_user_id)
    or vendor_bingo_id is distinct from trim(vendor_bd_user_id)
  );

alter table public.qr_bingo_raffle_settings
  add constraint qr_bingo_raffle_settings_stable_vendor_id
  check (
    vendor_bd_user_id = trim(vendor_bd_user_id)
    and vendor_bd_user_id <> ''
    and vendor_bingo_id = vendor_bd_user_id
  );

alter table public.qr_bingo_raffle_entries
  add constraint qr_bingo_raffle_entries_stable_vendor_id
  check (
    vendor_bd_user_id = trim(vendor_bd_user_id)
    and vendor_bd_user_id <> ''
    and vendor_bingo_id = vendor_bd_user_id
  );

alter table public.qr_bingo_raffle_draws
  add constraint qr_bingo_raffle_draws_stable_vendor_id
  check (
    vendor_bd_user_id = trim(vendor_bd_user_id)
    and vendor_bd_user_id <> ''
    and vendor_bingo_id = vendor_bd_user_id
  );

-- The draw-email signing private key lives in Supabase Vault. Only the service
-- role used by Edge Functions may retrieve it. The Brilliant Directories
-- widget receives only the corresponding public key.
create or replace function public.get_qr_draw_email_private_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'qr_draw_email_rsa_private_key'
  limit 1
$$;

revoke all on function public.get_qr_draw_email_private_key() from public;
revoke all on function public.get_qr_draw_email_private_key() from anon;
revoke all on function public.get_qr_draw_email_private_key() from authenticated;
grant execute on function public.get_qr_draw_email_private_key() to service_role;

-- Resolve two pre-existing advisor findings while this security migration is
-- being applied. The auth trigger continues to run as its owner.
alter function public.enforce_qr_bingo_raffle_draw_limit()
  set search_path = pg_catalog, public;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

create index if not exists qr_bingo_raffle_draws_entry_id_idx
  on public.qr_bingo_raffle_draws (entry_id);
