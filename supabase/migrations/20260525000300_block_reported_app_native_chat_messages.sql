create or replace function public.block_reported_app_native_chat_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.app_chat_thread_reports reports
    where reports.status <> 'resolved'
      and (
        reports.thread_token = new.thread_token
        or reports.app_thread_token = new.thread_token
      )
  ) then
    raise exception 'Chat Reported: This conversation will remain closed while it''s being reviewed.';
  end if;

  return new;
end;
$$;

drop trigger if exists block_reported_app_native_chat_message on public.app_native_chat_messages;
create trigger block_reported_app_native_chat_message
before insert on public.app_native_chat_messages
for each row execute function public.block_reported_app_native_chat_message();
