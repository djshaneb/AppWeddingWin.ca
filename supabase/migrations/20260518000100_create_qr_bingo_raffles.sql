create table if not exists public.qr_bingo_raffle_settings (
  id uuid primary key default gen_random_uuid(),
  event_key text not null default 'niagara-wedding-show-2026',
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  vendor_name text not null default '',
  enabled boolean not null default false,
  prize_title text not null default '',
  prize_description text not null default '',
  claim_instructions text not null default '',
  legal_terms_accepted boolean not null default false,
  legal_terms_version text not null default '2026-05-18',
  legal_terms_accepted_at timestamptz,
  draw_opens_at timestamptz not null default '2026-10-18 19:00:00+00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_bingo_raffle_settings_unique_vendor unique (event_key, vendor_bingo_id)
);

create table if not exists public.qr_bingo_raffle_entries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null default 'niagara-wedding-show-2026',
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  vendor_name text not null default '',
  couple_bd_user_id text not null,
  couple_name text not null default '',
  couple_email text not null default '',
  couple_phone text not null default '',
  couple_wedding_date text not null default '',
  consent_share_contact boolean not null default true,
  consent_text text not null,
  consent_version text not null default '2026-05-18',
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint qr_bingo_raffle_entries_unique_couple unique (event_key, vendor_bingo_id, couple_bd_user_id)
);

create table if not exists public.qr_bingo_raffle_draws (
  id uuid primary key default gen_random_uuid(),
  event_key text not null default 'niagara-wedding-show-2026',
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  vendor_name text not null default '',
  entry_id uuid not null references public.qr_bingo_raffle_entries(id) on delete restrict,
  couple_bd_user_id text not null,
  winner_name text not null default '',
  winner_email text not null default '',
  winner_phone text not null default '',
  winner_wedding_date text not null default '',
  prize_title text not null default '',
  prize_description text not null default '',
  claim_instructions text not null default '',
  draw_number integer not null,
  draw_reason text not null default 'initial',
  drawn_by_bd_user_id text not null default '',
  drawn_at timestamptz not null default now(),
  vendor_email_sent_at timestamptz,
  couple_email_sent_at timestamptz,
  email_error text not null default '',
  constraint qr_bingo_raffle_draws_unique_round unique (event_key, vendor_bingo_id, draw_number)
);

create index if not exists qr_bingo_raffle_settings_vendor_idx
  on public.qr_bingo_raffle_settings (vendor_bd_user_id);

create index if not exists qr_bingo_raffle_entries_vendor_idx
  on public.qr_bingo_raffle_entries (event_key, vendor_bingo_id, created_at desc);

create index if not exists qr_bingo_raffle_entries_couple_idx
  on public.qr_bingo_raffle_entries (couple_bd_user_id);

create index if not exists qr_bingo_raffle_draws_vendor_idx
  on public.qr_bingo_raffle_draws (event_key, vendor_bingo_id, drawn_at desc);

alter table public.qr_bingo_raffle_settings enable row level security;
alter table public.qr_bingo_raffle_entries enable row level security;
alter table public.qr_bingo_raffle_draws enable row level security;
