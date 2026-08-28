-- Trigger helpers are internal database plumbing, not public RPC endpoints.
revoke all on function public.upsert_member_block_from_chat_report() from public;
revoke all on function public.upsert_member_block_from_chat_report() from anon;
revoke all on function public.upsert_member_block_from_chat_report() from authenticated;
grant execute on function public.upsert_member_block_from_chat_report() to service_role;
