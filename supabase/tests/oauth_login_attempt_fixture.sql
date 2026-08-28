-- Disposable regression fixture for 20260828214932_bind_web_oauth_attempts.sql.
-- Run only after that migration. Every write is rolled back.

begin;

insert into public.oauth_login_attempts (
  state_hash,
  provider,
  binding_hash,
  expires_at
) values (
  repeat('s', 43),
  'google',
  repeat('b', 43),
  now() + interval '10 minutes'
);

do $oauth_redemption_contract$
begin
  if public.redeem_oauth_login_attempt(
    repeat('s', 43),
    'google',
    repeat('x', 43)
  ) then
    raise exception 'A mismatched browser binding redeemed the OAuth attempt.';
  end if;

  if not exists (
    select 1 from public.oauth_login_attempts where state_hash = repeat('s', 43)
  ) then
    raise exception 'A mismatched browser binding consumed the legitimate attempt.';
  end if;

  if public.redeem_oauth_login_attempt(
    repeat('s', 43),
    'apple',
    repeat('b', 43)
  ) then
    raise exception 'A mismatched provider redeemed the OAuth attempt.';
  end if;

  if not public.redeem_oauth_login_attempt(
    repeat('s', 43),
    'google',
    repeat('b', 43)
  ) then
    raise exception 'The matching OAuth attempt was not redeemed.';
  end if;

  if public.redeem_oauth_login_attempt(
    repeat('s', 43),
    'google',
    repeat('b', 43)
  ) then
    raise exception 'An OAuth attempt was redeemed more than once.';
  end if;
end;
$oauth_redemption_contract$;

insert into public.oauth_login_attempts (
  state_hash,
  provider,
  binding_hash,
  created_at,
  expires_at
) values (
  repeat('e', 43),
  'apple',
  repeat('b', 43),
  now() - interval '2 minutes',
  now() - interval '1 minute'
);

do $oauth_expiry_contract$
begin
  if public.redeem_oauth_login_attempt(
    repeat('e', 43),
    'apple',
    repeat('b', 43)
  ) then
    raise exception 'An expired OAuth attempt was redeemed.';
  end if;

  if exists (
    select 1 from public.oauth_login_attempts where state_hash = repeat('e', 43)
  ) then
    raise exception 'Expired OAuth attempts were not cleaned up.';
  end if;
end;
$oauth_expiry_contract$;

rollback;
