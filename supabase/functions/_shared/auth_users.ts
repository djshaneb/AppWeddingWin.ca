import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function findAuthUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;

  const perPage = 200;
  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find(
      (user) => String(user.email || "").trim().toLowerCase() === normalized,
    );
    if (match) return match;
    if (data.users.length < perPage) return undefined;
  }

  throw new Error("Auth user lookup exceeded the safety page limit.");
}
