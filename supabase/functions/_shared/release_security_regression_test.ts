function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("app login and native Google callbacks use one-time exchanges", async () => {
  const helper = await Deno.readTextFile(
    new URL("./auth_exchange.ts", import.meta.url),
  );
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260828190233_add_one_time_auth_exchanges.sql",
      import.meta.url,
    ),
  );
  const googleCallback = await Deno.readTextFile(
    new URL("../google-oauth-callback/index.ts", import.meta.url),
  );
  const googleExchange = await Deno.readTextFile(
    new URL("../google-native-exchange/index.ts", import.meta.url),
  );
  assert(
    helper.includes("/app-login?code="),
    "app-login URLs must contain only an opaque exchange code",
  );
  assert(
    !helper.includes("/app-login?t="),
    "new app-login URLs must not contain readable signed credential payloads",
  );
  assert(
    /delete from public\.app_login_exchanges[\s\S]*returning payload into redeemed/i
      .test(migration),
    "app-login exchange redemption must atomically delete the code",
  );
  assert(
    /delete from public\.app_native_auth_exchanges[\s\S]*code_challenge = p_code_challenge[\s\S]*returning payload into redeemed/i
      .test(migration),
    "native exchanges must be bound to the PKCE challenge and one-time",
  );
  assert(
    googleCallback.includes(
      'appRedirect.searchParams.set("exchange_code", exchangeCode)',
    ) &&
      !googleCallback.includes(
        'appRedirect.searchParams.set("native_session"',
      ) &&
      !googleCallback.includes('appRedirect.searchParams.set("app_login_url"'),
    "Google custom-scheme callbacks must not carry reusable sessions or login URLs",
  );
  assert(
    googleExchange.includes(
      "p_code_challenge: await sha256Base64Url(verifier)",
    ),
    "Google native redemption must prove possession of the PKCE verifier",
  );
});

Deno.test("push delivery is centralized and checks Expo receipts", async () => {
  const status = await Deno.readTextFile(
    new URL("../bd-chat-status/index.ts", import.meta.url),
  );
  const sweep = await Deno.readTextFile(
    new URL("../bd-push-sweep/index.ts", import.meta.url),
  );

  assert(
    !status.includes("exp.host/--/api/v2/push/send"),
    "polling chat status must not also send push notifications",
  );
  assert(
    sweep.includes("/api/v2/push/send") &&
      sweep.includes("/api/v2/push/getReceipts"),
    "the background push worker must inspect both tickets and receipts",
  );
  assert(
    sweep.includes('errorCode === "DeviceNotRegistered"'),
    "unregistered Expo tokens must be disabled",
  );
  const acceptedUpdate = sweep.indexOf(
    "if (delivery.accepted && delivery.ticketId)",
  );
  const countAdvance = sweep.indexOf(
    "last_unread_count: unreadCount",
    acceptedUpdate,
  );
  assert(
    acceptedUpdate >= 0 && countAdvance > acceptedUpdate,
    "unread notification state must advance only after Expo accepts a ticket",
  );
});

Deno.test("verified email login tolerates a transient BD profile miss", async () => {
  const emailLogin = await Deno.readTextFile(
    new URL("../bd-email-login/index.ts", import.meta.url),
  );

  assert(
    emailLogin.includes("fetchCachedUserByVerifiedEmail") &&
      emailLogin.includes("if (bdCredentialAccepted && !user?.user_id)"),
    "a successful BD credential check must use the exact-email identity cache fallback",
  );
  assert(
    emailLogin.includes('url.searchParams.set("limit", "2")') &&
      emailLogin.includes("if (rows.length > 1)"),
    "the identity-cache fallback must reject ambiguous email matches",
  );
  assert(
    /if \(!user\?\.user_id\) \{\s*return jsonResponse\(\{ error: "Login is temporarily unavailable\." \}, 503\)/
      .test(emailLogin),
    "a missing verified member must fail explicitly instead of issuing an empty session",
  );
});

Deno.test("email confirmation never trusts a custom-scheme email value", async () => {
  const appConfirmation = await Deno.readTextFile(
    new URL("../../../app/email-confirmed.tsx", import.meta.url),
  );
  const completeProfile = await Deno.readTextFile(
    new URL("../bd-complete-profile/index.ts", import.meta.url),
  );
  const emailSync = await Deno.readTextFile(
    new URL("./auth_email_sync.ts", import.meta.url),
  );
  const legacyConfirmation = await Deno.readTextFile(
    new URL("../bd-confirm-profile-email/index.ts", import.meta.url),
  );

  assert(
    !appConfirmation.includes("useLocalSearchParams") &&
      !appConfirmation.includes("profile: { email") &&
      appConfirmation.includes("action: 'refresh'"),
    "the custom-scheme confirmation screen must only request a server-authoritative refresh",
  );
  assert(
    completeProfile.includes('String(user?.email || "")') &&
      completeProfile.includes("preflightLinkedAuthEmail(session.user_id, email)") &&
      emailSync.includes('.eq("bd_member_id", memberId)') &&
      !completeProfile.includes('.eq("email", oldEmail)'),
    "email refresh must use the authenticated BD record and linked member id, not client email",
  );
  assert(
    legacyConfirmation.includes('const deepLink = "weddingwin://email-confirmed"') &&
      !legacyConfirmation.includes("email-confirmed?email="),
    "website confirmations must not copy an email into the custom-scheme URL",
  );
  assert(
    legacyConfirmation.includes('const currentEmail = String(user?.email || "")') &&
      legacyConfirmation.includes("currentEmail !== ticketEmail") &&
      legacyConfirmation.includes("String(user.user_id) !== String(ticket.user_id)") &&
      !legacyConfirmation.includes("nativeSessionMatchesBdUser") &&
      !legacyConfirmation.includes("token: typeof user?.token"),
    "a signed email-change ticket must match the current server-side member and email without expecting stripped BD credentials",
  );
});

Deno.test("email-change signing secret is environment-only and fails closed", async () => {
  const completeProfile = await Deno.readTextFile(
    new URL("../bd-complete-profile/index.ts", import.meta.url),
  );

  assert(
    completeProfile.includes('Deno.env.get("APP_EMAIL_CHANGE_SECRET")') &&
      completeProfile.includes("APP_EMAIL_CHANGE_SECRET.length < 32"),
    "email-change signing must require a sufficiently long environment secret",
  );
  assert(
    !completeProfile.includes("ww-app-email-change") &&
      !/APP_EMAIL_CHANGE_SECRET[^\n]*\|\|\s*["'][^"']{16,}/.test(completeProfile),
    "email-change signing must not contain a committed fallback secret",
  );
});

Deno.test("all native authentication successes require a complete token session", async () => {
  const emailLogin = await Deno.readTextFile(
    new URL("../bd-email-login/index.ts", import.meta.url),
  );
  const coupleSignup = await Deno.readTextFile(
    new URL("../bd-couple-signup/index.ts", import.meta.url),
  );
  const vendorSignup = await Deno.readTextFile(
    new URL("../bd-vendor-signup/index.ts", import.meta.url),
  );
  const googleCallback = await Deno.readTextFile(
    new URL("../google-oauth-callback/index.ts", import.meta.url),
  );
  const googleExchange = await Deno.readTextFile(
    new URL("../google-native-exchange/index.ts", import.meta.url),
  );
  const appleAuth = await Deno.readTextFile(
    new URL("./apple_auth.ts", import.meta.url),
  );
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  for (const [name, source] of [
    ["email login", emailLogin],
    ["couple signup", coupleSignup],
    ["vendor signup", vendorSignup],
    ["Google callback", googleCallback],
    ["Google exchange", googleExchange],
    ["Apple native auth", appleAuth],
  ] as const) {
    assert(
      /nativeSession(?:\?\.)?\.user_id|nativeSession\?\.user_id/.test(source) &&
        /nativeSession(?:\?\.)?\.token|nativeSession\?\.token/.test(source),
      `${name} must reject a partial native session`,
    );
  }
  assert(
    app.includes("function hasNativeTokenSession") &&
      (app.match(/hasNativeTokenSession\(/g)?.length || 0) >= 4,
    "the app must reject email, signup, and Google successes without user id and token",
  );
});

Deno.test("authentication exchanges expire, are deletion-linked, and are created only on demand", async () => {
  const retentionMigration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260828200918_harden_app_auth_exchange_retention.sql",
      import.meta.url,
    ),
  );
  const helper = await Deno.readTextFile(
    new URL("./auth_exchange.ts", import.meta.url),
  );
  const emailLogin = await Deno.readTextFile(
    new URL("../bd-email-login/index.ts", import.meta.url),
  );
  const coupleSignup = await Deno.readTextFile(
    new URL("../bd-couple-signup/index.ts", import.meta.url),
  );
  const vendorSignup = await Deno.readTextFile(
    new URL("../bd-vendor-signup/index.ts", import.meta.url),
  );
  const completeProfile = await Deno.readTextFile(
    new URL("../bd-complete-profile/index.ts", import.meta.url),
  );
  const appleNative = await Deno.readTextFile(
    new URL("../apple-native-login/index.ts", import.meta.url),
  );
  const deleteAccount = await Deno.readTextFile(
    new URL("../bd-delete-account/index.ts", import.meta.url),
  );
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    /add column if not exists bd_member_id text/g.test(retentionMigration) &&
      retentionMigration.match(/add column if not exists bd_member_id text/g)?.length === 2 &&
      helper.includes("bd_member_id: String(user.user_id).trim()") &&
      helper.includes("bd_member_id: String(args.bdMemberId"),
    "both exchange types must carry an indexed member id for deletion",
  );
  assert(
    retentionMigration.includes("purge_expired_app_auth_exchanges") &&
      retentionMigration.includes("purge-expired-app-auth-exchanges") &&
      retentionMigration.includes("*/5 * * * *"),
    "expired exchanges must be deleted by a recurring database job",
  );
  assert(
    deleteAccount.includes('admin.rpc("purge_member_app_auth_exchanges"'),
    "account deletion must purge outstanding authentication exchanges",
  );
  assert(
    emailLogin.match(/app_login_url:/g)?.length === 1 &&
      !coupleSignup.includes("app_login_url") &&
      !vendorSignup.includes("app_login_url") &&
      !completeProfile.includes("app_login_url") &&
      appleNative.includes("includeWebsiteRedirect: false") &&
      app.includes("email login ok -> native session"),
    "native-only authentication must not create an unused website exchange",
  );
});

Deno.test("public email login trusts BD rejection and rate-limits generic failures", async () => {
  const emailLogin = await Deno.readTextFile(
    new URL("../bd-email-login/index.ts", import.meta.url),
  );
  const rateLimitFix = await Deno.readTextFile(
    new URL(
      "../../migrations/20260828201325_fix_app_login_rate_limit_first_attempt.sql",
      import.meta.url,
    ),
  );

  assert(
    !emailLogin.includes("bcrypt") &&
      !emailLogin.includes("include_password") &&
      !emailLogin.includes("getPasswordHash"),
    "a rejected BD login must never be overridden with a locally fetched password hash",
  );
  assert(
    emailLogin.includes('admin.rpc("consume_app_login_rate_limit"') &&
      emailLogin.includes("Too many login attempts") &&
      /on conflict \(key_hash\) do nothing[\s\S]*returning \* into v_row;[\s\S]*if found then/i
        .test(rateLimitFix),
    "email login attempts must use the server-side rate limiter",
  );
  const failureBranch = emailLogin.indexOf("if (!bdCredentialAccepted)");
  const failureRecord = emailLogin.indexOf("recordFailedLogin(rateKeys)", failureBranch);
  const completeSession = emailLogin.indexOf("if (!nativeSession.user_id || !nativeSession.token)");
  const successClear = emailLogin.indexOf("clearSuccessfulLoginRateLimits(rateKeys)", completeSession);
  assert(
    emailLogin.includes("`source:${source}`") &&
      emailLogin.includes("`source-email:${source}:${email}`") &&
      !emailLogin.includes("`email:${email}`") &&
      failureBranch >= 0 && failureRecord > failureBranch &&
      completeSession >= 0 && successClear > completeSession,
    "rate limits must combine request source with failed-account attempts and clear after success",
  );
  assert(
    !emailLogin.includes("user_found=") &&
      !emailLogin.includes("has_hash=") &&
      !emailLogin.includes("bd_message") &&
      emailLogin.includes('return jsonResponse({ error: "Invalid email or password." }, 401)'),
    "credential rejection must not disclose account existence or log upstream payloads",
  );
});
