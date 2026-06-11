alter table if exists public.qr_bingo_raffle_settings
  drop column if exists claim_instructions;

alter table if exists public.qr_bingo_raffle_draws
  drop column if exists claim_instructions;
