-- A master export uses durable agreement evidence, never contact-profile presence.
-- Contact values and membership are frozen together in one INSERT statement.
create table public.qr_bingo_master_exports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  operator_identity text not null check (length(operator_identity) between 3 and 160 and operator_identity !~ '[<>[:cntrl:]]'),
  total integer not null default 0 check (total >= 0),
  served_through integer not null default 0 check (served_through >= 0 and served_through <= total),
  generated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes'),
  completed_at timestamptz
);
create table public.qr_bingo_master_export_rows (
  export_id uuid not null references public.qr_bingo_master_exports(id) on delete cascade,
  row_number integer not null check (row_number >= 0),
  couple_id text not null,
  row_data jsonb not null,
  primary key(export_id,row_number),
  unique(export_id,couple_id)
);
create index qr_bingo_master_export_rows_couple_idx on public.qr_bingo_master_export_rows(couple_id);
create table public.qr_bingo_master_export_audit (
  export_id uuid primary key,
  request_id uuid not null,
  operator_identity text not null,
  row_count integer not null check (row_count >= 0),
  generated_at timestamptz not null,
  completed_at timestamptz not null default clock_timestamp()
);
alter table public.qr_bingo_master_exports enable row level security;
alter table public.qr_bingo_master_export_rows enable row level security;
alter table public.qr_bingo_master_export_audit enable row level security;
revoke all on public.qr_bingo_master_exports,public.qr_bingo_master_export_rows,public.qr_bingo_master_export_audit from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.qr_bingo_master_exports to service_role;
grant select,insert,delete on public.qr_bingo_master_export_rows to service_role;
grant select,insert on public.qr_bingo_master_export_audit to service_role;

-- Privacy erasure invalidates unfinished files rather than releasing a partial or
-- stale file. Card resets and contact-list removal do not delete this evidence.
create function public.invalidate_qr_bingo_master_export_on_erasure()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('qr_master_export_privacy',0));
  delete from public.qr_bingo_master_exports e
  where exists(select 1 from public.qr_bingo_master_export_rows r where r.export_id=e.id and r.couple_id=old.couple_bd_user_id);
  return old;
end;
$$;
revoke all on function public.invalidate_qr_bingo_master_export_on_erasure() from public,anon,authenticated;
create trigger invalidate_qr_bingo_master_export_on_erasure after delete on public.qr_bingo_participation_acceptances
for each row execute function public.invalidate_qr_bingo_master_export_on_erasure();

create function public.purge_expired_qr_bingo_master_export_rows()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare deleted_count bigint;
begin
  delete from public.qr_bingo_master_export_rows r using public.qr_bingo_master_exports e
    where r.export_id=e.id and e.expires_at<=clock_timestamp();
  get diagnostics deleted_count=row_count;
  return deleted_count;
end;
$$;
revoke all on function public.purge_expired_qr_bingo_master_export_rows() from public,anon,authenticated;
grant execute on function public.purge_expired_qr_bingo_master_export_rows() to service_role;
-- pg_cron is already used by the project's existing retention jobs. Retain
-- metadata receipts for replay/audit, but purge expired contact snapshots even
-- when nobody opens the admin page again. No outbound request or secret needed.
select cron.schedule('weddingwin-qr-master-export-retention','* * * * *',
  'select public.purge_expired_qr_bingo_master_export_rows();');

create function public.qr_bingo_master_contacts_export(
  p_action text,p_operator_identity text,p_request_id uuid default null,
  p_export_id uuid default null,p_cursor integer default null,p_expected_row_count integer default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  snapshot public.qr_bingo_master_exports%rowtype;
  records jsonb;
  returned_count integer;
  result jsonb;
begin
  if p_action not in ('start','page','complete') or p_action is null
    or p_operator_identity is null or p_operator_identity <> btrim(p_operator_identity)
    or length(p_operator_identity) not between 3 and 160 or p_operator_identity ~ '[<>[:cntrl:]]' then
    return jsonb_build_object('ok',false,'code','invalid_export_request');
  end if;
  -- Serialize snapshot reads with the erasure trigger. A concurrent purge that
  -- already deleted its source rows will invalidate this snapshot after we commit.
  perform pg_advisory_xact_lock(hashtextextended('qr_master_export_privacy',0));
  -- Expired snapshots contain personal data, unlike the metadata-only audit.
  perform public.purge_expired_qr_bingo_master_export_rows();
  if p_action='start' then
    if p_request_id is null or p_export_id is not null or p_cursor is not null or p_expected_row_count is not null then
      return jsonb_build_object('ok',false,'code','invalid_export_request');
    end if;
    -- Serialize retry keys and per-operator start throttling.
    perform pg_advisory_xact_lock(hashtextextended('qr_master_export:'||p_operator_identity,0));
    perform pg_advisory_xact_lock(hashtextextended('qr_master_export_request:'||p_request_id::text,0));
    select * into snapshot from public.qr_bingo_master_exports where request_id=p_request_id for update;
    if found then
      if snapshot.expires_at <= clock_timestamp() then
        return jsonb_build_object('ok',false,'code','export_expired');
      end if;
      if snapshot.operator_identity<>p_operator_identity then
        return jsonb_build_object('ok',false,'code','export_identity_mismatch');
      end if;
    else
      if exists(select 1 from public.qr_bingo_master_export_audit where request_id=p_request_id) then
        return jsonb_build_object('ok',false,'code','export_already_completed');
      end if;
      if (select count(*) from public.qr_bingo_master_exports where operator_identity=p_operator_identity and generated_at>clock_timestamp()-interval '1 minute') >= 5 then
        return jsonb_build_object('ok',false,'code','export_rate_limited');
      end if;
      insert into public.qr_bingo_master_exports(request_id,operator_identity)
        values(p_request_id,p_operator_identity) returning * into snapshot;
      with genuine as materialized (
        select a.* from public.qr_bingo_participation_acceptances a
        where not a.excluded_from_master
          and not public.qr_bingo_participation_is_test(a.event_key,a.couple_bd_user_id)
          and not exists(select 1 from public.qr_bingo_legacy_qa_archives q where q.entry_id=a.source_entry_id)
          and not exists(select 1 from public.qr_bingo_raffle_entries e join public.qr_bingo_vendor_offer_versions o
            on o.event_key=e.event_key and o.vendor_bingo_id=e.vendor_bingo_id and o.vendor_offer_version=e.vendor_offer_version
            where e.id=a.source_entry_id and o.activation_excluded_as_legacy_qa)
      ), couples as (
        select couple_bd_user_id,min(accepted_at) first_accepted_at,max(accepted_at) last_accepted_at,
          string_agg(distinct event_key,'; ' order by event_key) event_keys,
          string_agg(distinct rules_version,'; ' order by rules_version) rules_versions,
          string_agg(distinct basis,'; ' order by basis) evidence_bases
        from genuine group by couple_bd_user_id
      )
      insert into public.qr_bingo_master_export_rows(export_id,row_number,couple_id,row_data)
      select snapshot.id,(row_number() over(order by length(c.couple_bd_user_id),c.couple_bd_user_id)-1)::integer,c.couple_bd_user_id,
        jsonb_build_object('couple_id',c.couple_bd_user_id,
          'name',coalesce(p.name,e.couple_name,''),'email',coalesce(p.email,e.couple_email,''),
          'phone',coalesce(p.phone,e.couple_phone,''),'wedding_date',coalesce(p.wedding_date,e.couple_wedding_date,''),
          'wedding_venue',coalesce(p.wedding_venue,e.couple_wedding_venue,''),
          'first_accepted_at',c.first_accepted_at,'last_accepted_at',c.last_accepted_at,
          'event_keys',c.event_keys,'rules_versions',c.rules_versions,'evidence_bases',c.evidence_bases)
      from couples c
      left join lateral (
        select profile.* from public.qr_bingo_contact_profiles profile
        where profile.couple_bd_user_id=c.couple_bd_user_id
          and exists(select 1 from genuine g where g.couple_bd_user_id=c.couple_bd_user_id and g.event_key=profile.event_key)
        order by profile.updated_at desc,profile.version desc,profile.event_key limit 1
      ) p on true
      left join lateral (
        select entry.* from genuine g join public.qr_bingo_raffle_entries entry on entry.id=g.source_entry_id
        where g.couple_bd_user_id=c.couple_bd_user_id
        order by g.accepted_at desc,g.recorded_at desc,g.id limit 1
      ) e on true;
      get diagnostics returned_count = row_count;
      update public.qr_bingo_master_exports set total=returned_count where id=snapshot.id returning * into snapshot;
    end if;
    return jsonb_build_object('ok',true,'export_id',snapshot.id,'request_id',snapshot.request_id,'total',snapshot.total,
      'generated_at',snapshot.generated_at,'expires_at',snapshot.expires_at,'page_size',250);
  end if;

  if p_export_id is null or p_request_id is not null then
    return jsonb_build_object('ok',false,'code','invalid_export_request');
  end if;
  select * into snapshot from public.qr_bingo_master_exports where id=p_export_id for update;
  if not found or snapshot.operator_identity<>p_operator_identity then
    return jsonb_build_object('ok',false,'code','export_unavailable');
  end if;
  if snapshot.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'code','export_expired');
  end if;
  if p_action='page' then
    if p_cursor is null or p_cursor<0 or p_cursor>snapshot.total or p_cursor%250<>0 or p_expected_row_count is not null then
      return jsonb_build_object('ok',false,'code','invalid_export_request');
    end if;
    if p_cursor>snapshot.served_through then
      return jsonb_build_object('ok',false,'code','export_page_gap');
    end if;
    select coalesce(jsonb_agg(r.row_data order by r.row_number),'[]'::jsonb),count(*)::integer into records,returned_count
      from public.qr_bingo_master_export_rows r where r.export_id=snapshot.id and r.row_number>=p_cursor and r.row_number<p_cursor+250;
    if returned_count<>least(250,snapshot.total-p_cursor) then
      return jsonb_build_object('ok',false,'code','export_snapshot_incomplete');
    end if;
    update public.qr_bingo_master_exports set served_through=greatest(served_through,p_cursor+returned_count) where id=snapshot.id;
    return jsonb_build_object('ok',true,'export_id',snapshot.id,'total',snapshot.total,'cursor',p_cursor,
      'row_count',returned_count,'next_cursor',case when p_cursor+returned_count<snapshot.total then p_cursor+returned_count else null end,
      'done',p_cursor+returned_count=snapshot.total,'rows',records);
  end if;
  if p_cursor is not null or p_expected_row_count is null or p_expected_row_count<>snapshot.total then
    return jsonb_build_object('ok',false,'code','invalid_export_request');
  end if;
  if snapshot.served_through<>snapshot.total then
    return jsonb_build_object('ok',false,'code','export_incomplete');
  end if;
  if snapshot.completed_at is null then
    if (select count(*) from public.qr_bingo_master_export_rows where export_id=snapshot.id)<>snapshot.total then
      return jsonb_build_object('ok',false,'code','export_snapshot_incomplete');
    end if;
    -- The audit and completion commit atomically; no report is returned if either fails.
    insert into public.qr_bingo_master_export_audit(export_id,request_id,operator_identity,row_count,generated_at)
      values(snapshot.id,snapshot.request_id,snapshot.operator_identity,snapshot.total,snapshot.generated_at);
    update public.qr_bingo_master_exports set completed_at=clock_timestamp() where id=snapshot.id;
  end if;
  return jsonb_build_object('ok',true,'export_id',snapshot.id,'total',snapshot.total,'generated_at',snapshot.generated_at);
end;
$$;
revoke all on function public.qr_bingo_master_contacts_export(text,text,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.qr_bingo_master_contacts_export(text,text,uuid,uuid,integer,integer) to service_role;
comment on table public.qr_bingo_master_export_audit is 'Metadata-only completed master CSV export audit. No contact data is stored here.';
comment on table public.qr_bingo_master_export_rows is 'Temporary immutable export snapshot; inaccessible after 15 minutes and purged by expiry maintenance or source privacy erasure.';
