function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function functionBody(source: string, functionName: string) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  const nextFunction = source.indexOf("\nasync function ", start + 1);
  const candidates = [nextExport, nextFunction].filter((index) =>
    index > start
  );
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

Deno.test("successful login clears only the source-account rate-limit key", async () => {
  const login = await Deno.readTextFile(
    new URL("../bd-email-login/index.ts", import.meta.url),
  );
  const clearBody = functionBody(login, "clearSuccessfulLoginRateLimits");

  assert(
    /`source:\$\{source\}`[\s\S]*clearOnSuccess: false/.test(login),
    "the global source budget must survive a successful login",
  );
  assert(
    /`source-email:\$\{source\}:\$\{email\}`[\s\S]*clearOnSuccess: true/.test(
      login,
    ),
    "the source-account budget should be cleared after a valid login",
  );
  assert(
    clearBody.includes(".filter((key) => key.clearOnSuccess)") &&
      clearBody.includes('.in("key_hash", hashesToClear)') &&
      !clearBody.includes("keys.map((key) => key.hash)"),
    "success cleanup must not delete every rate-limit key",
  );
  assert(
    login.includes('"Cache-Control": "no-store"'),
    "credential responses must not be cached",
  );
});

Deno.test("linked email synchronization preflights ownership and rolls back partial writes", async () => {
  const helper = await Deno.readTextFile(
    new URL("./auth_email_sync.ts", import.meta.url),
  );
  const applyBody = functionBody(helper, "applyLinkedAuthEmail");
  const targetLookup = helper.indexOf(
    "findAuthUserByEmail(normalizedNextEmail)",
  );
  const unlinkedReturn = helper.indexOf("if (!linkedProfiles?.length)");
  const authWrite = applyBody.indexOf(
    "await updateAuthEmail(plan.profileId, plan.nextEmail)",
  );
  const profileWrite = applyBody.indexOf(
    "await updateProfileEmail(plan.profileId, plan.nextEmail)",
  );

  assert(
    helper.includes("await admin.auth.admin.getUserById(profileId)") &&
      helper.includes("await findAuthUserByEmail(normalizedNextEmail)") &&
      helper.includes("targetOwner.id !== profileId") &&
      targetLookup >= 0 && unlinkedReturn > targetLookup &&
      helper.includes("if (targetOwner) throw new AuthEmailConflictError()"),
    "the linked user and target-email owner must be resolved before writes",
  );
  assert(
    authWrite >= 0 && profileWrite > authWrite,
    "GoTrue must be updated before the profile mirror",
  );
  assert(
    applyBody.includes("plan.previousProfileEmail") &&
      applyBody.includes("plan.previousAuthEmail") &&
      applyBody.includes("rollback: async () =>"),
    "both Supabase identity stores must have compensating rollback writes",
  );
});

Deno.test("confirmed email changes cannot report success after identity divergence", async () => {
  const confirmation = await Deno.readTextFile(
    new URL("../bd-confirm-profile-email/index.ts", import.meta.url),
  );
  const preflight = confirmation.indexOf("await preflightLinkedAuthEmail(");
  const apply = confirmation.indexOf("await applyLinkedAuthEmail(", preflight);
  const bdUpdate = confirmation.indexOf(
    'await callBd("/api/v2/user/update"',
    apply,
  );
  const success = confirmation.indexOf('"Email confirmed"', bdUpdate);

  assert(
    preflight >= 0 && apply > preflight && bdUpdate > apply &&
      success > bdUpdate,
    "GoTrue ownership and Supabase writes must precede the final BD email update",
  );
  assert(
    (confirmation.match(/rollbackAppliedEmailChange\(/g)?.length || 0) >= 3 &&
      confirmation.includes(
        'if (!update.response.ok || update.body.status !== "success")',
      ) &&
      confirmation.includes("refreshedEmail !== nextEmail") &&
      confirmation.includes("afterFailureEmail === ticketEmail"),
    "transport failures and rejected BD updates must compensate Supabase writes",
  );
  assert(
    !confirmation.includes("supabase-email-sync-failed") &&
      confirmation.includes("error instanceof AuthEmailSyncError") &&
      confirmation.includes("? 503"),
    "identity synchronization failures must produce a non-success response",
  );
});

Deno.test("profile completion does not swallow linked identity failures", async () => {
  const completeProfile = await Deno.readTextFile(
    new URL("../bd-complete-profile/index.ts", import.meta.url),
  );

  assert(
    completeProfile.includes(
      "await preflightLinkedAuthEmail(session.user_id, nextEmail)",
    ) &&
      completeProfile.includes(
        "await applyLinkedAuthEmail(confirmedEmailPlan)",
      ) &&
      completeProfile.includes("await applyLinkedAuthEmail(linkedEmailPlan)"),
    "save and refresh flows must use the shared consistency boundary",
  );
  assert(
    !completeProfile.includes("supabase-email-sync-failed") &&
      completeProfile.includes("error instanceof AuthEmailConflictError") &&
      completeProfile.includes("error instanceof AuthEmailSyncError"),
    "profile completion must return conflict or unavailable instead of full success",
  );
});
