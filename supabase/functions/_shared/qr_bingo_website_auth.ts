// Separate, narrowly scoped authentication for the logged-in BD website.
// Native identities remain app-issued cache identities; website requests never
// seed that cache, change a member token, or inherit QR-admin privileges.
export const WEBSITE_VENDOR_SCOPE = "weddingwin:qr-bingo:vendor-website:v1";
export const WEBSITE_COUPLE_SCOPE = "weddingwin:qr-bingo:couple-website:v1";
export const WEBSITE_KEY_CONTEXT = "weddingwin:qr-bingo:website-key:v1";
export const WEBSITE_VENDOR_ACTIONS = [
  "vendor_dashboard_access", "vendor_raffle_get", "vendor_raffle_update",
  "vendor_raffle_draw", "vendor_raffle_export", "vendor_raffle_review",
  "vendor_raffle_replace",
  "vendor_raffle_entries_get", "vendor_raffle_entry_update",
  "vendor_raffle_send_notice",
] as const;
export type WebsiteVendorAction = typeof WEBSITE_VENDOR_ACTIONS[number];
export const WEBSITE_COUPLE_ACTIONS = ["fixture_context", "scan", "raffle_offer", "raffle_opt_in", "contact_profile_get", "contact_profile_save"] as const;
export type WebsiteCoupleAction = typeof WEBSITE_COUPLE_ACTIONS[number];
export type WebsitePrincipal = {
  userId: string; action: WebsiteVendorAction | WebsiteCoupleAction;
  kind: "vendor" | "couple"; transportToken?: string;
};
export type WebsiteAuthDependencies = {
  nowSeconds?: () => number;
  loadSecret: () => Promise<string>;
  consumeNonce: (nonce: string, expiresAt: string) => Promise<boolean>;
};
/** Match the already-published QR admin signing-key source exactly. A present
 * but invalid override must fail closed, never silently switch credentials. */
export async function resolveWebsiteSigningSecret(
  environmentOverride: string | undefined,
  loadVault: () => Promise<unknown>,
): Promise<string> {
  const configured = environmentOverride?.trim() || "";
  if (configured) return configured;
  const stored = await loadVault();
  return typeof stored === "string" ? stored.trim() : "";
}
export class WebsiteAuthenticationError extends Error {
  constructor(message = "Website session could not be verified.", public status = 401) {
    super(message);
    this.name = "WebsiteAuthenticationError";
  }
}
export function hasQrBingoWebsiteProof(request: Request, body: Record<string, unknown>) {
  return [...request.headers.keys()].some((key) => key.startsWith("x-ww-website-")) ||
    Object.prototype.hasOwnProperty.call(body, "website_member_id");
}
function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function websiteBodySha256(rawBody: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody)));
}
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function constantTimeHexEqual(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  let different = 0;
  for (let index = 0; index < 64; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}
export async function websiteRequestSignature(secret: string, fields: {
  scope: string; userId: string; action: string; expires: string; nonce: string; bodyHash: string;
}) {
  const key = await hmac(secret, WEBSITE_KEY_CONTEXT);
  return hmac(key, [fields.scope, fields.userId, fields.action, fields.expires, fields.nonce, fields.bodyHash].join("\n"));
}
export async function verifyQrBingoWebsiteRequest(
  request: Request,
  rawBody: string,
  body: Record<string, unknown>,
  dependencies: WebsiteAuthDependencies,
): Promise<WebsitePrincipal> {
  const read = (name: string) => request.headers.get(`x-ww-website-${name}`) || "";
  const scope = read("scope"), userId = read("member"), expiresText = read("expires");
  const nonce = read("nonce"), bodyHash = read("body-sha256"), signature = read("signature");
  const now = (dependencies.nowSeconds || (() => Math.floor(Date.now() / 1000)))();
  const expires = Number(expiresText);
  const action = body.action;
  const kind = scope === WEBSITE_VENDOR_SCOPE ? "vendor" : scope === WEBSITE_COUPLE_SCOPE ? "couple" : null;
  const allowedActions: readonly string[] = kind === "couple" ? WEBSITE_COUPLE_ACTIONS : WEBSITE_VENDOR_ACTIONS;
  const hasTransportToken = Object.prototype.hasOwnProperty.call(body, "website_session_token");
  const transportToken = body.website_session_token;
  if (request.method !== "POST" || new TextEncoder().encode(rawBody).length > 131072 ||
    !kind || !/^[1-9][0-9]{0,17}$/.test(userId) ||
    !/^[1-9][0-9]{9,12}$/.test(expiresText) || !Number.isSafeInteger(expires) ||
    expires <= now || expires > now + 60 || !/^[0-9a-f]{32}$/.test(nonce) ||
    !/^[0-9a-f]{64}$/.test(bodyHash) || !/^[0-9a-f]{64}$/.test(signature) ||
    body.website_member_id !== userId || Object.prototype.hasOwnProperty.call(body, "native_session") ||
    (hasTransportToken && (kind !== "couple" || typeof transportToken !== "string" ||
      transportToken.length < 16 || transportToken.length > 512 || /\s/.test(transportToken))) ||
    typeof action !== "string" || !allowedActions.includes(action)) {
    throw new WebsiteAuthenticationError();
  }
  if (!constantTimeHexEqual(await websiteBodySha256(rawBody), bodyHash)) throw new WebsiteAuthenticationError();
  let secret: string;
  try { secret = await dependencies.loadSecret(); } catch {
    throw new WebsiteAuthenticationError("Website sign-in verification is temporarily unavailable.", 503);
  }
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 4096) {
    throw new WebsiteAuthenticationError("Website sign-in verification is temporarily unavailable.", 503);
  }
  const expected = await websiteRequestSignature(secret, { scope, userId, action, expires: expiresText, nonce, bodyHash });
  if (!constantTimeHexEqual(expected, signature)) throw new WebsiteAuthenticationError();
  let accepted = false;
  try {
    accepted = await dependencies.consumeNonce(`website-${kind}:${nonce}`, new Date(expires * 1000).toISOString());
  } catch {
    throw new WebsiteAuthenticationError("Website sign-in verification is temporarily unavailable.", 503);
  }
  if (accepted !== true) throw new WebsiteAuthenticationError("This website request has expired. Please try again.");
  return { userId, action: action as WebsiteVendorAction | WebsiteCoupleAction, kind,
    ...(kind === "couple" && typeof transportToken === "string" ? { transportToken } : {}) };
}
