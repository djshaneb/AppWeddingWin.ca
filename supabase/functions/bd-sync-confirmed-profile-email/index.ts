import { createConfirmedProfileEmailHandler } from "../_shared/confirmed_profile_email_handler.ts";
import { syncConfirmedWebsiteProfileEmail } from "../_shared/confirmed_profile_email_sync.ts";

// Public transport, authenticated only by a short-lived purpose-bound website
// HMAC. It returns no session or credentials and cannot create an account.
Deno.serve(createConfirmedProfileEmailHandler({
  secret: () => Deno.env.get("APP_EMAIL_CHANGE_SECRET") || "",
  sync: syncConfirmedWebsiteProfileEmail,
}));
