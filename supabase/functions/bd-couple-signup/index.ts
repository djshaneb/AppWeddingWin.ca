import {
  buildBdNativeSession,
  callBd,
  corsHeaders,
  ensureBdSessionCookie,
  fetchBdUserByEmail,
  fetchFullBdUserById,
  sanitizeBdUser,
} from "../_shared/apple_auth.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
// /checkout/10 is the public website signup route. BD's user API needs the real
// Couples membership plan id, which is subscription_id 18.
const BD_COUPLE_SUBSCRIPTION_ID = Deno.env.get("BD_COUPLE_SUBSCRIPTION_ID") || "18";

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

function cleanPlainText(value: unknown, maxLength: number) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (/[<>]/.test(text)) {
    throw new Error("Details cannot contain HTML.");
  }
  return text.slice(0, maxLength);
}

function cleanEmail(value: unknown) {
  const email = cleanPlainText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (email.endsWith("@privaterelay.appleid.com")) {
    throw new Error("Please use your regular email address.");
  }
  return email;
}

function cleanPassword(value: unknown) {
  const password = String(value || "").trim();
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (/[<>]/.test(password)) {
    throw new Error("Password cannot contain HTML characters.");
  }
  return password.slice(0, 120);
}

function cleanWeddingDate(value: unknown) {
  const text = cleanPlainText(value, 20);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("Wedding date must use YYYY-MM-DD format.");
  }
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const email = cleanEmail(body.email);
    const password = cleanPassword(body.password);
    const firstName = cleanPlainText(body.first_name, 80) || "WeddingWin Couple";
    const phone = cleanPlainText(body.phone, 40);
    const weddingDate = cleanWeddingDate(body.wedding_date);
    const acceptedAt = cleanPlainText(body.accepted_at, 40);

    if (body.accepted_terms !== true || body.accepted_privacy !== true || !acceptedAt) {
      throw new Error("Agreement to the Terms of Use and Privacy Policy is required.");
    }

    if (!firstName) {
      return jsonResponse(
        { error: "Email and password are required." },
        400,
      );
    }

    const existing = await fetchBdUserByEmail(email);
    if (existing?.user_id) {
      return jsonResponse(
        { error: "An account already exists with this email. Please log in instead." },
        409,
      );
    }

    const createBody = new URLSearchParams({
      email,
      first_name: firstName,
      active: "2",
      subscription_id: BD_COUPLE_SUBSCRIPTION_ID,
      country_code: "CA",
      password,
      pass: password,
      send_email_notifications: "0",
      signup_terms_accepted: "1",
      signup_privacy_accepted: "1",
      signup_terms_accepted_at: acceptedAt,
      signup_terms_version: cleanPlainText(body.terms_version, 40),
      signup_privacy_version: cleanPlainText(body.privacy_version, 40),
    });
    if (weddingDate) createBody.set("wedding_date", weddingDate);
    if (phone) createBody.set("phone_number", phone);

    const created = await callBd("/api/v2/user/create", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createBody.toString(),
    });

    if (!created.response.ok || created.body.status !== "success") {
      const detail =
        typeof created.body.message === "string"
          ? created.body.message
          : JSON.stringify(created.body.message).slice(0, 180);
      console.error("bd-couple-signup:create-failed", {
        email,
        status: created.response.status,
        detail,
      });
      return jsonResponse({ error: "Account could not be created.", detail }, 502);
    }

    let user = await fetchBdUserByEmail(email);
    if (user?.user_id) {
      user = await fetchFullBdUserById(user.user_id);
    }

    user = await ensureBdSessionCookie(user);
    const nativeSession = buildBdNativeSession(user, email);
    if (!nativeSession.user_id || !nativeSession.token) {
      return jsonResponse({
        error: "Account was created, but the app session is not ready yet. Please log in to continue.",
      }, 503);
    }
    return jsonResponse({
      ok: true,
      user: sanitizeBdUser(user, email),
      native_session: nativeSession,
      dashboard_url: `${BD_API_BASE_URL}/account/home`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signup failed.";
    console.error("bd-couple-signup:error", message);
    return jsonResponse({ error: message }, 400);
  }
});
