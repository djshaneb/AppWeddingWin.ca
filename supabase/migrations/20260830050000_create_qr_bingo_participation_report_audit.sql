-- Vendor participation reports are deliberately non-identifying. The audit
-- stores only who requested a report, its vendor/event scope, and row count;
-- it never stores the CSV body or any entrant/member identifier.

create table if not exists public.qr_bingo_participation_report_audit (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  requested_by_bd_user_id text not null,
  client_platform text not null default 'unknown',
  row_count integer not null default 0,
  requested_at timestamptz not null default now(),
  constraint qr_bingo_participation_report_audit_event_present
    check (btrim(event_key) <> '' and length(event_key) <= 80),
  constraint qr_bingo_participation_report_audit_vendor_present
    check (btrim(vendor_bingo_id) <> '' and btrim(vendor_bd_user_id) <> ''),
  constraint qr_bingo_participation_report_audit_requester_present
    check (btrim(requested_by_bd_user_id) <> ''),
  constraint qr_bingo_participation_report_audit_platform_known
    check (client_platform in ('ios', 'website', 'unknown')),
  constraint qr_bingo_participation_report_audit_row_count_safe
    check (row_count between 0 and 5000)
);

create index if not exists qr_bingo_participation_report_audit_rate_idx
  on public.qr_bingo_participation_report_audit
    (event_key, vendor_bingo_id, requested_at desc);

alter table public.qr_bingo_participation_report_audit enable row level security;

revoke all on table public.qr_bingo_participation_report_audit
  from public, anon, authenticated;
grant select, insert on table public.qr_bingo_participation_report_audit
  to service_role;

create or replace function public.protect_qr_bingo_participation_report_audit()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'QR Bingo participation-report audit records are immutable.';
end;
$$;

revoke all on function public.protect_qr_bingo_participation_report_audit()
  from public, anon, authenticated;

drop trigger if exists protect_qr_bingo_participation_report_audit
  on public.qr_bingo_participation_report_audit;
create trigger protect_qr_bingo_participation_report_audit
before update or delete on public.qr_bingo_participation_report_audit
for each row execute function public.protect_qr_bingo_participation_report_audit();

comment on table public.qr_bingo_participation_report_audit is
  'Immutable metadata audit for on-demand non-PII vendor participation CSV reports. CSV content and entrant identifiers are never stored here.';
