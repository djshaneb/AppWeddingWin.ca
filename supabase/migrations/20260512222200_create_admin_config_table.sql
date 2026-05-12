/*
  # Create admin_config table

  Server-only key/value store for sensitive configuration that edge functions
  need at runtime (e.g. Google OAuth credentials). Lives in the database
  because edge-function environment secrets cannot be set through the MCP
  tools available in this environment.

  1. New Tables
    - `admin_config`
      - `key` (text, primary key) - config name, e.g. 'google_client_id'
      - `value` (text) - the secret/config value
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled
    - NO policies are defined. With RLS on and no policies, the table is
      completely inaccessible to the `anon` and `authenticated` roles.
      Only the `service_role` (used by edge functions via SUPABASE_SERVICE_ROLE_KEY)
      bypasses RLS and can read/write these rows.

  3. Notes
    - This table must never be exposed through PostgREST to client roles.
    - Values are inserted via a separate execute_sql call so the secret is not
      committed to the migrations folder in source control.
*/

CREATE TABLE IF NOT EXISTS admin_config (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
