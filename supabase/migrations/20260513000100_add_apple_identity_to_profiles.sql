/*
  # Add Apple identity mapping

  Stores Apple's stable subject identifier for a WeddingWin account so native
  iOS Sign in with Apple and browser Sign in with Apple can resolve to the same
  Supabase profile.
*/

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS apple_sub text DEFAULT '';

CREATE INDEX IF NOT EXISTS profiles_apple_sub_idx ON profiles (apple_sub);
