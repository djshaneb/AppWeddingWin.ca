-- A vendor may request a different random potential winner without supplying a
-- disqualification reason. Preserve the old selection as truthful history;
-- never label it ineligible and never send mail as part of replacement.
alter table public.qr_bingo_raffle_draws
  add column if not exists replaced_at timestamptz,
  add column if not exists replaced_by_bd_user_id text not null default '',
  add column if not exists replacement_note text not null default '',
  add column if not exists replaces_draw_id uuid
    references public.qr_bingo_raffle_draws(id) on delete set null;

do $$
declare
  actual text;
begin
  select pg_get_constraintdef(oid) into actual
    from pg_constraint
   where conrelid = 'public.qr_bingo_raffle_draws'::regclass
     and conname = 'qr_bingo_raffle_draws_selection_status_check';
  if actual is distinct from
    'CHECK ((selection_status = ANY (ARRAY[''legacy''::text, ''potential''::text, ''verified''::text, ''disqualified''::text])))'
  then
    raise exception 'Unexpected selection-status constraint; inspect before migrating.';
  end if;
end;
$$;

alter table public.qr_bingo_raffle_draws
  drop constraint qr_bingo_raffle_draws_selection_status_check,
  add constraint qr_bingo_raffle_draws_selection_status_check
    check (selection_status in ('legacy', 'potential', 'verified', 'disqualified', 'replaced')),
  add constraint qr_bingo_replacement_audit_required check (
    selection_status <> 'replaced' or (
      replaced_at is not null
      and replaced_by_bd_user_id = vendor_bd_user_id
      and replacement_note = 'Vendor requested another potential winner.'
      and vendor_email_sent_at is null and couple_email_sent_at is null
    )
  ),
  add constraint qr_bingo_replacement_not_self check (replaces_draw_id is distinct from id);

create unique index qr_bingo_one_replacement_per_selection
  on public.qr_bingo_raffle_draws(replaces_draw_id)
  where replaces_draw_id is not null;

-- Modify only the three known exclusion predicates in the current live
-- function bodies. All existing current-rules, fixture, privacy, locking,
-- cryptographic selection, and winner-limit checks remain byte-for-byte intact.
do $$
declare
  target regprocedure;
  original text;
  updated text;
  needle text;
  replacement text;
  occurrences integer;
begin
  for target, needle, replacement in
    select * from (values
      ('public.select_qr_bingo_potential_winner(text,text,text,text,text,text,text,text)'::regprocedure,
       'prior.selection_status in (''potential'', ''disqualified'')',
       'prior.selection_status in (''potential'', ''disqualified'', ''replaced'')'),
      ('public.enforce_qr_bingo_raffle_draw_limit()'::regprocedure,
       'prior.selection_status in (''potential'', ''disqualified'')',
       'prior.selection_status in (''potential'', ''disqualified'', ''replaced'')'),
      ('public.set_qr_bingo_raffle_entry_selection_state(uuid,text,text,text,boolean,text,text,text)'::regprocedure,
       'and draw.selection_status = ''disqualified''',
       'and draw.selection_status in (''disqualified'', ''replaced'')')
    ) as patches(function_oid, old_text, new_text)
  loop
    original := pg_get_functiondef(target);
    occurrences := (length(original) - length(replace(original, needle, ''))) / length(needle);
    if occurrences <> 1 then
      raise exception 'Unexpected replacement exclusion count for %: %', target, occurrences;
    end if;
    updated := replace(original, needle, replacement);
    if target = 'public.set_qr_bingo_raffle_entry_selection_state(uuid,text,text,text,boolean,text,text,text)'::regprocedure then
      needle := 'A preserved disqualification record cannot be removed or restored.';
      replacement := 'A preserved selection record cannot be removed or restored.';
      occurrences := (length(updated) - length(replace(updated, needle, ''))) / length(needle);
      if occurrences <> 1 then
        raise exception 'Unexpected preserved-selection message count: %', occurrences;
      end if;
      updated := replace(updated, needle, replacement);
    end if;
    execute updated;
  end loop;
end;
$$;

create or replace function public.replace_qr_bingo_potential_winner_by_vendor(
  p_draw_id uuid,
  p_event_key text,
  p_vendor_bingo_id text,
  p_vendor_bd_user_id text,
  p_drawn_by_bd_user_id text,
  p_skill_question_prompt text,
  p_skill_question_salt text,
  p_skill_question_answer_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_drawn_by_bd_user_id, ''));
  previous public.qr_bingo_raffle_draws%rowtype;
  replacement public.qr_bingo_raffle_draws%rowtype;
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_draw_id is null
    or normalized_event !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event) > 100
    or normalized_vendor !~ '^[1-9][0-9]{0,19}$'
    or normalized_vendor_user is distinct from normalized_vendor
    or normalized_actor is distinct from normalized_vendor_user
  then
    raise exception using errcode = '22023', message = 'An exact selection, promotion, and vendor actor are required.';
  end if;

  -- Same promotion lock as initial selection and pool changes, acquired before
  -- the draw row. Duplicate taps cannot retire or replace two pending records.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_event || ':' || normalized_vendor, 0)
  );
  select * into previous
    from public.qr_bingo_raffle_draws
   where id = p_draw_id and event_key = normalized_event
     and vendor_bingo_id = normalized_vendor
     and vendor_bd_user_id = normalized_vendor_user
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'This selection does not belong to the signed-in vendor.';
  end if;
  if previous.selection_status <> 'potential' then
    return jsonb_build_object('ok', false, 'code', 'selection_not_pending',
      'error', 'Only the current potential winner can be replaced. Refresh to see the latest selection.');
  end if;

  -- This block is a PostgreSQL subtransaction. A rejected/no-alternative result
  -- rolls back every change inside it before returning the original selection.
  begin
    update public.qr_bingo_raffle_draws
       set selection_status = 'replaced', replaced_at = clock_timestamp(),
           replaced_by_bd_user_id = normalized_actor,
           replacement_note = 'Vendor requested another potential winner.'
     where id = previous.id;

    result := public.select_qr_bingo_potential_winner(
      normalized_event, normalized_vendor, normalized_vendor_user,
      normalized_actor, 'vendor_requested_replacement', p_skill_question_prompt,
      p_skill_question_salt, p_skill_question_answer_hash
    );
    if result->>'ok' is distinct from 'true' then
      raise exception using errcode = 'PZR01', message = 'Replacement selection did not complete.';
    end if;

    select * into replacement
      from public.qr_bingo_raffle_draws
     where id = (result->'draw'->>'id')::uuid
       and event_key = normalized_event and vendor_bingo_id = normalized_vendor
       and vendor_bd_user_id = normalized_vendor_user
       and selection_status = 'potential'
     for update;
    if not found or replacement.couple_bd_user_id = previous.couple_bd_user_id
      or replacement.entry_id = previous.entry_id
    then
      raise exception using errcode = '23514', message = 'A different eligible couple is required for replacement.';
    end if;
    update public.qr_bingo_raffle_draws
       set replaces_draw_id = previous.id
     where id = replacement.id
     returning * into replacement;

    return result || jsonb_build_object('draw', to_jsonb(replacement),
      'replaced_draw_id', previous.id, 'replacement_selected', true);
  exception when sqlstate 'PZR01' then
    if result->>'code' = 'no_eligible_entries' then
      return jsonb_build_object('ok', false, 'code', 'no_replacement_available',
        'error', 'There are no other eligible couples to choose from. Your current potential winner has not changed.');
    end if;
    return coalesce(result, jsonb_build_object('ok', false,
      'code', 'replacement_unavailable', 'error', 'The potential winner could not be changed.'));
  end;
end;
$$;

revoke all on function public.replace_qr_bingo_potential_winner_by_vendor(
  uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.replace_qr_bingo_potential_winner_by_vendor(
  uuid, text, text, text, text, text, text, text
) to service_role;

comment on function public.replace_qr_bingo_potential_winner_by_vendor(
  uuid, text, text, text, text, text, text, text
) is 'Service-only exact-vendor random replacement. No reason input, no email, and no change when another eligible couple is unavailable.';
