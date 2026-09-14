-- Complete notification snapshots take longer than pg_net's 5-second default.
-- Preserve the existing job, schedule, URL and Vault-backed authentication.
-- This changes response waiting only; it neither invokes nor duplicates a run.
do $$
declare
 target record;
 expected_hash constant text := '4e4b13a2a4b057cb3916509156f8fe4f';
 original_fragment constant text := 'body := ''{}''::jsonb';
 updated_fragment constant text := E'body := ''{}''::jsonb,\n    timeout_milliseconds := 180000';
 original_command text;
begin
 if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
  or to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null then
  raise exception 'Expected notification scheduler signatures are unavailable';
 end if;
 -- Extension catalogs intentionally grant SELECT only; cron.alter_job owns
 -- the supported write and checks job ownership. Do not grant catalog UPDATE.
 select jobid,jobname,schedule,active,command into target from cron.job
 where jobname='weddingwin-chat-push-sweep';
 if not found or target.jobid<>2 or target.schedule<>'* * * * *' or target.active is not true then
  raise exception 'Unexpected notification cron job baseline';
 end if;
 if md5(target.command)=expected_hash then
  if array_length(string_to_array(target.command,original_fragment),1)<>2
   or position('timeout_milliseconds' in target.command)>0 then
   raise exception 'Unexpected notification HTTP request shape';
  end if;
  perform cron.alter_job(target.jobid,command:=replace(target.command,original_fragment,updated_fragment));
 else
  -- Idempotent only for this exact addition to the reviewed original command.
  original_command:=replace(target.command,updated_fragment,original_fragment);
  if original_command=target.command or md5(original_command)<>expected_hash
   or array_length(string_to_array(target.command,updated_fragment),1)<>2 then
   raise exception 'Unexpected notification cron command baseline';
  end if;
 end if;
end $$;
