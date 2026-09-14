-- The service role intentionally has SELECT-only event configuration access.
-- Configuration and delivery row locks required UPDATE; existing parent locks
-- already protect their reads. The existing publication advisory lock
-- already serializes the snapshot with every authorized config publisher.
-- Keep the function SECURITY INVOKER and preserve all table privileges.
do $migration$
declare definition text; target constant text := ' perform 1 from public.qr_bingo_event_configs where published order by revision desc limit 1 for share;';
 delivery_target constant text := ' perform 1 from public.qr_bingo_draw_email_deliveries delivery join public.qr_bingo_raffle_draws draw on draw.id=delivery.draw_id where draw.event_key=p_event_key and draw.couple_bd_user_id=p_couple_id order by delivery.id for update of delivery;';
begin
 select pg_catalog.pg_get_functiondef('public.admin_reset_qr_bingo_couple_card(text,text,bigint,text,uuid,text,text,timestamptz)'::regprocedure) into definition;
 if md5(definition) <> '0326b3be3e69c7276dafddd934ece8e7' then
  raise exception 'Unexpected admin card-reset function baseline; review before applying.';
 end if;
 if (length(definition)-length(replace(definition,target,'')))/length(target) <> 1 then
  raise exception 'Expected exactly one redundant card-reset configuration row lock.';
 end if;
 if (length(definition)-length(replace(definition,delivery_target,'')))/length(delivery_target) <> 1 then
  raise exception 'Expected exactly one redundant card-reset delivery row lock.';
 end if;
 definition := replace(definition,target,' -- Published config is stable under qr_bingo_event_config_publish acquired above.');
 -- Each claim/finalize/reconcile writer locks its draw before changing delivery.
 -- Retain the draw FOR UPDATE locks above and inspect the ledger read-only.
 execute replace(definition,delivery_target,' -- Delivery state is stable under its parent draw FOR UPDATE locks above.');
end;
$migration$;
