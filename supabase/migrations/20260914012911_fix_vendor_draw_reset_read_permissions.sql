-- Config and delivery tables intentionally grant service_role SELECT only.
-- Their row locks required UPDATE despite this reset never writing either table.
-- The retained global publication advisory lock serializes authorized config
-- writers, and every delivery claim/finalize/reconcile writer first locks its
-- parent draw. Retain those draw locks, SECURITY INVOKER, and existing grants.
do $migration$
declare
 definition text;
 config_target constant text := ' perform 1 from public.qr_bingo_event_configs where published order by revision desc limit 1 for share;';
 delivery_target constant text := ' perform 1 from public.qr_bingo_draw_email_deliveries delivery join public.qr_bingo_raffle_draws draw on draw.id=delivery.draw_id
  where draw.event_key=p_event_key and draw.vendor_bingo_id=p_vendor_id and draw.vendor_bd_user_id=p_vendor_id order by delivery.id for update of delivery;';
begin
 select pg_catalog.pg_get_functiondef('public.admin_reset_qr_bingo_vendor_draw(text,text,uuid,bigint,uuid,text,text)'::regprocedure) into definition;
 if md5(definition) <> 'c0e46d97993607a2c7cfcdba73c2dad1' then
  raise exception 'Unexpected admin vendor draw-reset function baseline; review before applying.';
 end if;
 if (length(definition)-length(replace(definition,config_target,'')))/length(config_target) <> 1 then
  raise exception 'Expected exactly one redundant vendor draw-reset configuration row lock.';
 end if;
 if (length(definition)-length(replace(definition,delivery_target,'')))/length(delivery_target) <> 1 then
  raise exception 'Expected exactly one redundant vendor draw-reset delivery row lock.';
 end if;
 definition := replace(definition,config_target,' -- Published config is stable under qr_bingo_event_config_publish acquired above.');
 execute replace(definition,delivery_target,' -- Delivery state is stable under its parent draw FOR UPDATE locks above.');
end;
$migration$;
