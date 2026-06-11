create or replace function public.app_native_chat_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.app_native_chat_threads
  set updated_at = now()
  where thread_token = new.thread_token;
  return new;
end;
$$;
