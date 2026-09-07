export type BdNativeRefreshSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};
export class BdNativeSessionRefreshUnavailable extends Error {
  constructor() {
    super("Login is temporarily unavailable.");
    this.name = "BdNativeSessionRefreshUnavailable";
  }
}
type Dependencies = {
  fetchMember: (id: string) => Promise<{
    response: Response;
    body: { status?: string; message?: unknown };
  }>;
  matchesIdentity: (session: BdNativeRefreshSession) => Promise<boolean>;
};

function canonicalMemberId(value: unknown): string | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  }
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
      !/\s/.test(value)
    ? value
    : undefined;
}

/** Undefined means a confirmed invalid/expired session (401). Inability to
 * establish authoritative membership or canonical-token validity is a
 * temporary failure (503), never evidence that the account was deleted. */
export async function resolveBdNativeSessionRefresh(
  value: unknown,
  deps: Dependencies,
): Promise<Record<string, unknown> | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const session = value as BdNativeRefreshSession;
  const id = canonicalMemberId(session.user_id);
  if (!id || typeof session.token !== "string" || !session.token.trim()) {
    return undefined;
  }

  try {
    const { response, body } = await deps.fetchMember(id);
    // Even upstream 401/403/404 may be a service/configuration/proxy failure.
    // Only BD's successful exact lookup with [] confirms member absence.
    if (!response.ok || body?.status !== "success") {
      throw new BdNativeSessionRefreshUnavailable();
    }
    const message = body.message;
    let user: unknown;
    if (Array.isArray(message)) {
      if (message.length === 0) return undefined;
      if (message.length !== 1) throw new BdNativeSessionRefreshUnavailable();
      user = message[0];
    } else user = message;
    if (
      !user || typeof user !== "object" || Array.isArray(user) ||
      canonicalMemberId((user as Record<string, unknown>).user_id) !== id
    ) {
      throw new BdNativeSessionRefreshUnavailable();
    }
    // BD's documented scalar states: 1 Not Active, 2 Active, 3 Canceled,
    // 4 On Hold, 5 Past Due, 6 Incomplete. A saved canonical token must not
    // reauthorize an account which has since left the Active state.
    const rawActive = (user as Record<string, unknown>).active;
    const active =
      typeof rawActive === "string" || typeof rawActive === "number"
        ? String(rawActive)
        : "";
    if (active !== "2") {
      if (["1", "3", "4", "5", "6"].includes(active)) return undefined;
      // Missing/new/malformed statuses are not proof that the user was banned.
      throw new BdNativeSessionRefreshUnavailable();
    }
    if (!await deps.matchesIdentity(session)) return undefined;
    return user as Record<string, unknown>;
  } catch {
    // Do not expose BD response text, canonical tokens, or network details.
    throw new BdNativeSessionRefreshUnavailable();
  }
}
