CREATE TABLE IF NOT EXISTS public.app_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bd_member_id text NOT NULL,
  bd_member_token text DEFAULT '',
  expo_push_token text NOT NULL UNIQUE,
  platform text DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  last_unread_count integer NOT NULL DEFAULT 0,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_push_tokens_bd_member_id_idx
  ON public.app_push_tokens (bd_member_id);

CREATE INDEX IF NOT EXISTS app_push_tokens_enabled_idx
  ON public.app_push_tokens (enabled);
