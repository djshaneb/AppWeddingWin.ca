export type NativeSignupRole = "vendor" | "couple";

export class NativeSignupIntentError extends Error {}

export function requireNativeSignupRole(value: unknown): NativeSignupRole {
  if (value !== "vendor" && value !== "couple") {
    throw new NativeSignupIntentError(
      "Invalid signup account type. Please choose Couple or Vendor and try again.",
    );
  }
  return value;
}

export function nativeSignupSubscriptionId(
  role: NativeSignupRole,
): "17" | "18" {
  return requireNativeSignupRole(role) === "vendor" ? "17" : "18";
}

function verifyMatchingSubscription(
  role: NativeSignupRole | undefined,
  value: unknown,
) {
  if (
    role && value !== undefined &&
    String(value) !== nativeSignupSubscriptionId(role)
  ) {
    throw new NativeSignupIntentError(
      "Signup account details do not match. Please choose Couple or Vendor and try again.",
    );
  }
}

/** Detect duplicate top-level keys even when their names use JSON escapes. */
export function parseNativeSignupBody(text: string): Record<string, unknown> {
  if (text.length > 65_536) {
    throw new NativeSignupIntentError("Invalid signup request.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new NativeSignupIntentError("Invalid signup request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new NativeSignupIntentError("Invalid signup request.");
  }
  let depth = 0;
  const seen = new Set<string>();
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === "[") depth++;
    else if (char === "]") depth--;
    else if (char === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === "\\") i += 2;
        else if (text[i] === '"') break;
        else i++;
      }
      if (depth !== 1) continue;
      let next = i + 1;
      while (/\s/.test(text[next] || "") && next < text.length) next++;
      if (text[next] !== ":") continue;
      const key = JSON.parse(text.slice(start, i + 1));
      if (key !== "signup_role" && key !== "subscription_id") continue;
      if (seen.has(key)) {
        throw new NativeSignupIntentError(
          "Duplicate signup account details. Please try again.",
        );
      }
      seen.add(key);
    }
  }
  return body as Record<string, unknown>;
}

export function nativeSignupRoleFromBody(
  body: Record<string, unknown>,
): NativeSignupRole | undefined {
  const role = Object.hasOwn(body, "signup_role")
    ? requireNativeSignupRole(body.signup_role)
    : undefined;
  verifyMatchingSubscription(role, body.subscription_id);
  return role;
}

export function nativeSignupRoleFromQuery(
  params: URLSearchParams,
): NativeSignupRole | undefined {
  const values = params.getAll("signup_role");
  if (values.length === 0) return undefined;
  if (values.length !== 1 || params.getAll("subscription_id").length > 1) {
    throw new NativeSignupIntentError(
      "Duplicate signup account details. Please try again.",
    );
  }
  const role = requireNativeSignupRole(values[0]);
  verifyMatchingSubscription(
    role,
    params.has("subscription_id") ? params.get("subscription_id") : undefined,
  );
  return role;
}

export function nativeSignupErrorMessage(message: string): string {
  return message === "APPLE_SIGNUP_ROLE_MISMATCH"
    ? "This sign-in is already linked to a different WeddingWin membership. Sign in to your existing account or use another sign-in account for this signup. Your existing account has not been changed."
    : message;
}
