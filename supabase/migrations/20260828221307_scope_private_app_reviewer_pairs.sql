-- An inactive reviewer may chat only with the exact counterpart prepared for App Review.

alter table public.app_private_reviewers
  add column if not exists paired_bd_member_id text;

delete from public.app_private_reviewers
where paired_bd_member_id is null;

alter table public.app_private_reviewers
  alter column paired_bd_member_id set not null;

alter table public.app_private_reviewers
  drop constraint if exists app_private_reviewers_paired_member_check;

alter table public.app_private_reviewers
  add constraint app_private_reviewers_paired_member_check
  check (
    paired_bd_member_id ~ '^[1-9][0-9]*$' and
    paired_bd_member_id <> bd_member_id
  );

create index if not exists app_private_reviewers_pair_idx
  on public.app_private_reviewers (paired_bd_member_id, expires_at);
