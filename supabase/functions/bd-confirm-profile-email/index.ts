import {
  admin,
  callBd,
  corsHeaders,
  createAppLoginUrl,
  ensureBdSessionCookie,
  fetchBdUserByEmail,
  fetchFullBdUserById,
  nativeSessionMatchesBdUser,
  type BdNativeSession,
} from "../_shared/apple_auth.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET") || "";

type EmailChangeTicket = {
  purpose?: string;
  user_id?: string | number;
  existing_email?: string;
  next_email?: string;
  first_name?: string;
  phone?: string;
  wedding_date?: string;
  exp?: number;
};

function htmlPage(title: string, body: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff8f5;color:#2e2e32;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.card{width:min(520px,calc(100vw - 40px));text-align:center;background:#fff;border:1px solid #f0d5d1;border-radius:16px;padding:32px;box-shadow:0 20px 50px rgba(71,43,38,.12)}
h1{font-size:24px;margin:0 0 12px}.msg{font-size:16px;line-height:1.5;color:#6f5a56}.btn{display:inline-block;margin-top:22px;background:#c66a6a;color:#fff;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:800}.sub{margin-top:16px;font-size:13px;color:#927d78}
</style></head><body><main class="card">${body}</main></body></html>`;
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function base64UrlToString(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function verifyTicket(token: string): Promise<EmailChangeTicket> {
  if (!APP_LOGIN_SECRET) throw new Error("APP_LOGIN_SECRET is not configured");

  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Confirmation link is invalid.");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_LOGIN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  if (base64UrlFromBytes(new Uint8Array(expected)) !== signature) {
    throw new Error("Confirmation link is invalid.");
  }

  const ticket = JSON.parse(base64UrlToString(payload)) as EmailChangeTicket;
  if (ticket.purpose !== "bd-profile-email-change") {
    throw new Error("Confirmation link is invalid.");
  }
  if (!ticket.exp || ticket.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Confirmation link expired. Please save your profile again to get a new email.");
  }
  if (!ticket.user_id || !ticket.next_email) {
    throw new Error("Confirmation link is missing profile details.");
  }

  return ticket;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t") || "";
    const ticket = await verifyTicket(token);
    const nextEmail = cleanText(ticket.next_email, 254).toLowerCase();

    const user = await fetchFullBdUserById(ticket.user_id);
    const session: BdNativeSession = {
      user_id: ticket.user_id,
      email: ticket.existing_email || "",
      token: typeof user?.token === "string" ? user.token : "",
      cookie: typeof user?.cookie === "string" ? user.cookie : "",
    };

    if (!nativeSessionMatchesBdUser(session, user)) {
      throw new Error("This confirmation link no longer matches your WeddingWin session.");
    }

    const existingNextUser = await fetchBdUserByEmail(nextEmail);
    if (existingNextUser?.user_id && String(existingNextUser.user_id) !== String(ticket.user_id)) {
      throw new Error("That email is already connected to another WeddingWin account.");
    }

    const updateBody = new URLSearchParams({
      user_id: String(ticket.user_id),
      email: nextEmail,
      first_name: cleanText(ticket.first_name, 80),
      phone_number: cleanText(ticket.phone, 40),
      wedding_date: cleanText(ticket.wedding_date, 20),
      country_code: "CA",
    });
    for (const [key, value] of [...updateBody.entries()]) {
      if (key !== "user_id" && !value) updateBody.delete(key);
    }

    const update = await callBd("/api/v2/user/update", {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: updateBody.toString(),
    });
    if (!update.response.ok || update.body.status !== "success") {
      const detail =
        typeof update.body.message === "string"
          ? update.body.message
          : JSON.stringify(update.body.message).slice(0, 180);
      throw new Error(`Profile could not be saved: ${detail}`);
    }

    try {
      const existingEmail = String(ticket.existing_email || "").trim().toLowerCase();
      await admin.from("profiles").update({ email: nextEmail, updated_at: new Date().toISOString() }).eq("email", existingEmail);
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const authUser = list?.users.find((candidate) => {
        return String(candidate.email || "").trim().toLowerCase() === existingEmail;
      });
      if (authUser?.id) {
        await admin.auth.admin.updateUserById(authUser.id, {
          email: nextEmail,
          email_confirm: true,
        });
      }
    } catch (syncError) {
      console.error("bd-confirm-profile-email:supabase-email-sync-failed", {
        user_id: ticket.user_id,
        detail: syncError instanceof Error ? syncError.message : String(syncError),
      });
    }

    const refreshed = await ensureBdSessionCookie(await fetchFullBdUserById(ticket.user_id));
    const appLoginUrl = await createAppLoginUrl(refreshed, nextEmail);
    const deepLink = `weddingwin://email-confirmed?app_login_url=${encodeURIComponent(appLoginUrl)}&email=${encodeURIComponent(nextEmail)}`;
    const fallback = appLoginUrl;

    return htmlResponse(htmlPage(
      "Email confirmed",
      `<h1>Email confirmed</h1><p class="msg">Your WeddingWin app profile has been updated.</p><a class="btn" href="${escapeHtml(deepLink)}">Open WeddingWin app</a><p class="sub"><a href="${escapeHtml(fallback)}">Continue on the website</a></p><script>setTimeout(function(){window.location.href=${JSON.stringify(deepLink)}},500)</script>`
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email confirmation failed.";
    console.error("bd-confirm-profile-email:error", message);
    return htmlResponse(htmlPage(
      "Email confirmation failed",
      `<h1>Email confirmation failed</h1><p class="msg">${escapeHtml(message)}</p><p class="sub">Open the app and save your profile again to request a fresh confirmation email.</p>`
    ), 400);
  }
});
