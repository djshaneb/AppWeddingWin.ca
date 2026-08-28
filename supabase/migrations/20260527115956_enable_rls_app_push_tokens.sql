-- Filename version reconciled with the linked Supabase migration history.
-- Push tokens are written and read only by service-role Edge Functions.
-- No public policies are needed; direct anon/authenticated access should stay blocked.
ALTER TABLE public.app_push_tokens ENABLE ROW LEVEL SECURITY;
