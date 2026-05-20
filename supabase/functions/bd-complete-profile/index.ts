import {
  buildBdNativeSession,
  callBd,
  corsHeaders,
  createAppLoginUrl,
  admin,
  ensureBdSessionCookie,
  fetchBdUserByEmail,
  fetchFullBdUserById,
  nativeSessionMatchesBdUser,
  sanitizeBdUser,
  type BdNativeSession,
} from "../_shared/apple_auth.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const APP_EMAIL_CHANGE_SECRET =
  Deno.env.get("APP_EMAIL_CHANGE_SECRET") ||
  "ww-app-email-change-v1-2026-05-19-2e87d51b6b6f4ef6a3f060bb7b";

type ProfileInput = {
  first_name?: string;
  email?: string;
  phone?: string;
  wedding_date?: string;
};

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
    throw new Error("Profile details cannot contain HTML.");
  }
  return text.slice(0, maxLength);
}

function isApplePrivateRelayEmail(email: string) {
  return email.trim().toLowerCase().endsWith("@privaterelay.appleid.com");
}

function cleanRealEmail(value: unknown) {
  const email = cleanPlainText(value, 254).toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (isApplePrivateRelayEmail(email)) {
    throw new Error("Please enter your regular email address, not an Apple private relay email.");
  }
  return email;
}

function cleanWeddingDate(value: unknown) {
  const text = cleanPlainText(value, 20);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("Wedding date must use YYYY-MM-DD format.");
  }
  return text;
}

function profileUpdateMessage(detail: string) {
  if (/email/i.test(detail) && /already|duplicate|exists|registered/i.test(detail)) {
    return "That email is already connected to a WeddingWin account. Please sign in with that email, or use a different email.";
  }

  return "Profile could not be saved.";
}

async function syncSupabaseEmail(previousEmail: string, nextEmail: string, userId: unknown) {
  const oldEmail = previousEmail.trim().toLowerCase();
  const newEmail = nextEmail.trim().toLowerCase();
  if (!oldEmail || !newEmail || oldEmail === newEmail) return;

  try {
    await admin.from("profiles").update({ email: newEmail, updated_at: new Date().toISOString() }).eq("email", oldEmail);
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const authUser = list?.users.find((candidate) => {
      return String(candidate.email || "").trim().toLowerCase() === oldEmail;
    });
    if (authUser?.id) {
      await admin.auth.admin.updateUserById(authUser.id, {
        email: newEmail,
        email_confirm: true,
      });
    }
  } catch (syncError) {
    console.error("bd-complete-profile:supabase-email-sync-failed", {
      user_id: userId,
      detail: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }
}

function parseWebsiteEmailResponse(text: string): { ok?: boolean; message?: string } | null {
  try {
    return JSON.parse(text);
  } catch {
    const marker = text.indexOf('{"ok"');
    if (marker < 0) return null;
    const end = text.indexOf("}", marker);
    if (end < 0) return null;
    try {
      return JSON.parse(text.slice(marker, end + 1));
    } catch {
      return null;
    }
  }
}

function hexFromBytes(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signAppEmailChange(userId: string, nextEmail: string, expires: number) {
  const payload = `${Number(userId)}|${nextEmail.trim().toLowerCase()}|${expires}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_EMAIL_CHANGE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return hexFromBytes(new Uint8Array(signature));
}

async function requestWebsiteEmailChange(userId: string, nextEmail: string) {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const params = new URLSearchParams({
    ww_email_change_action: "request_app",
    user_id: String(Number(userId)),
    new_email: nextEmail,
    expires: String(expires),
    signature: await signAppEmailChange(userId, nextEmail, expires),
  });

  const response = await fetch(`${BD_API_BASE_URL}/verify-email-change-app`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "WeddingWinAppProfile/1.0",
    },
    body: params.toString(),
  });
  const text = await response.text();
  const data = parseWebsiteEmailResponse(text);

  if (!response.ok || !data) {
    console.error("bd-complete-profile:website-email-change-invalid-response", {
      status: response.status,
      body: text.slice(0, 240),
    });
    throw new Error("Confirmation email could not be sent through WeddingWin.ca yet. Please try again in a moment.");
  }

  if (!data.ok) {
    throw new Error(data.message || "Confirmation email could not be sent through WeddingWin.ca yet.");
  }

  return data.message || "Verification email sent. Open the app confirmation link in that email to finish changing your login email.";
}

async function sendEmailChangeConfirmation(args: {
  userId: string;
  userCookie: string;
  existingEmail: string;
  nextEmail: string;
  firstName: string;
  phone: string;
  weddingDate: string;
}) {
  return await requestWebsiteEmailChange(args.userId, args.nextEmail);
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
    const session = body.native_session as BdNativeSession | undefined;

    if (!session?.user_id || !session?.token) {
      return jsonResponse({ error: "Stored session expired. Please sign in again." }, 401);
    }

    let user = await ensureBdSessionCookie(await fetchFullBdUserById(session.user_id));
    if (!nativeSessionMatchesBdUser(session, user)) {
      return jsonResponse({ error: "Stored session expired. Please sign in again." }, 401);
    }

    const profile = (body.profile || {}) as ProfileInput;
    const existingEmail = String(user?.email || session.email || "").trim().toLowerCase();
    const nextEmail = cleanRealEmail(profile.email || existingEmail);
    if (isApplePrivateRelayEmail(existingEmail) && !nextEmail) {
      return jsonResponse({ error: "Please enter your regular email address." }, 400);
    }

    const updateBody = new URLSearchParams({
      user_id: String(session.user_id),
      country_code: "CA",
      first_name: cleanPlainText(profile.first_name, 80),
      email: nextEmail,
      phone_number: cleanPlainText(profile.phone, 40),
      wedding_date: cleanWeddingDate(profile.wedding_date),
    });

    for (const [key, value] of [...updateBody.entries()]) {
      if (key !== "user_id" && !value) updateBody.delete(key);
    }

    if ([...updateBody.keys()].length <= 1) {
      return jsonResponse({ error: "Add at least one couple detail before saving." }, 400);
    }

    if (nextEmail && nextEmail !== existingEmail) {
      const existingNextUser = await fetchBdUserByEmail(nextEmail);
      if (existingNextUser?.user_id && String(existingNextUser.user_id) !== String(session.user_id)) {
        return jsonResponse({
          error: "That email is already connected to a WeddingWin account. Please sign in with that email, or use a different email.",
        }, 409);
      }

      const profileOnlyUpdateBody = new URLSearchParams(updateBody);
      profileOnlyUpdateBody.delete("email");
      if ([...profileOnlyUpdateBody.keys()].some((key) => key !== "user_id")) {
        const profileUpdate = await callBd("/api/v2/user/update", {
          method: "PUT",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: profileOnlyUpdateBody.toString(),
        });
        if (!profileUpdate.response.ok || profileUpdate.body.status !== "success") {
          const detail =
            typeof profileUpdate.body.message === "string"
              ? profileUpdate.body.message
              : JSON.stringify(profileUpdate.body.message).slice(0, 180);
          console.error("bd-complete-profile:profile-fields-before-email-failed", {
            user_id: session.user_id,
            status: profileUpdate.response.status,
            detail,
          });
          return jsonResponse({ error: profileUpdateMessage(detail), detail }, 502);
        }
        user = await ensureBdSessionCookie(await fetchFullBdUserById(session.user_id));
      }

      const message = await sendEmailChangeConfirmation({
        userId: String(session.user_id),
        userCookie: String(user?.cookie || session.cookie || ""),
        existingEmail,
        nextEmail,
        firstName: updateBody.get("first_name") || "",
        phone: updateBody.get("phone_number") || "",
        weddingDate: updateBody.get("wedding_date") || "",
      });

      return jsonResponse({
        ok: true,
        email_confirmation_required: true,
        user: sanitizeBdUser(user, existingEmail),
        native_session: buildBdNativeSession(user, existingEmail),
        message,
      });
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
      console.error("bd-complete-profile:update-failed", {
        user_id: session.user_id,
        status: update.response.status,
        detail,
      });
      return jsonResponse({ error: profileUpdateMessage(detail), detail }, 502);
    }

    await syncSupabaseEmail(existingEmail, nextEmail, session.user_id);

    user = await fetchFullBdUserById(session.user_id);
    user = await ensureBdSessionCookie(user);
    const email = String(user?.email || session.email || "").trim().toLowerCase();
    await syncSupabaseEmail(String(session.email || ""), email, session.user_id);
    const appLoginUrl = await createAppLoginUrl(user, email);

    return jsonResponse({
      ok: true,
      user: sanitizeBdUser(user, email),
      native_session: buildBdNativeSession(user, email),
      app_login_url: appLoginUrl,
      dashboard_url: `${BD_API_BASE_URL}/account/home`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile update failed.";
    console.error("bd-complete-profile:error", message);
    return jsonResponse({ error: message }, 400);
  }
});
