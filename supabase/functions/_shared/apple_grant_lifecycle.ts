export type AppleGrantBinding = {
  identityId: string;
  generation: string;
  grantId: string;
  clientId: string;
  appleSub: string;
  bdMemberId: string;
  profileId: string;
};
export type SealedAppleGrant = {
  ciphertext: string;
  iv: string;
  keyVersion: 1;
};
export type AppleStoredGrant = AppleGrantBinding & SealedAppleGrant;
export type AppleRevocationJob = {
  id: string;
  leaseToken: string;
  bdMemberId: string;
  expectedGrants?: number;
  fullCleanup?: boolean;
  profileId?: string;
};

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid encrypted Apple grant.");
  }
  const base = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(base.padEnd(Math.ceil(base.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
}
function aad(binding: AppleGrantBinding): Uint8Array<ArrayBuffer> {
  for (
    const key of [
      "identityId",
      "generation",
      "grantId",
      "clientId",
      "appleSub",
      "bdMemberId",
      "profileId",
    ] as const
  ) {
    if (!binding[key] || typeof binding[key] !== "string") {
      throw new Error("Invalid Apple grant binding.");
    }
  }
  return new TextEncoder().encode(JSON.stringify([
    "weddingwin.apple-grant.v1",
    binding.identityId,
    binding.generation,
    binding.grantId,
    binding.clientId,
    binding.appleSub,
    binding.bdMemberId,
    binding.profileId,
  ]));
}
async function encryptionKey(keyHex: string) {
  if (!/^[a-f0-9]{64}$/.test(keyHex)) {
    throw new Error("Apple grant encryption is unavailable.");
  }
  const bytes = Uint8Array.from(
    keyHex.match(/../g)!,
    (pair) => parseInt(pair, 16),
  );
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function sealAppleRefreshToken(
  token: string,
  binding: AppleGrantBinding,
  keyHex: string,
): Promise<SealedAppleGrant> {
  if (typeof token !== "string" || !token.trim() || token.length > 12_000) {
    throw new Error("Apple did not return a usable authorization credential.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(binding), tagLength: 128 },
    await encryptionKey(keyHex),
    new TextEncoder().encode(token),
  );
  return {
    ciphertext: encode(new Uint8Array(encrypted)),
    iv: encode(iv),
    keyVersion: 1,
  };
}
export async function openAppleRefreshToken(
  sealed: SealedAppleGrant,
  binding: AppleGrantBinding,
  keyHex: string,
): Promise<string> {
  if (sealed.keyVersion !== 1 || decode(sealed.iv).length !== 12) {
    throw new Error("Invalid encrypted Apple grant.");
  }
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(sealed.iv),
      additionalData: aad(binding),
      tagLength: 128,
    },
    await encryptionKey(keyHex),
    decode(sealed.ciphertext),
  );
  const token = new TextDecoder().decode(decrypted);
  if (!token.trim()) throw new Error("Invalid encrypted Apple grant.");
  return token;
}

export class AppleReceiptError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
export async function equalAppleSecret(
  actual: string,
  expected: string,
): Promise<boolean> {
  if (!expected || expected.length < 32 || actual.length > 512) return false;
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
export async function parseAppleDeletionReceipt(
  request: Request,
  expectedSecret: string,
): Promise<{ bdMemberId: string; ignored?: boolean }> {
  const url = new URL(request.url);
  if (request.method !== "POST") {
    throw new AppleReceiptError(405, "POST required.");
  }
  if (
    url.searchParams.getAll("secret").length !== 1 ||
    !await equalAppleSecret(
      url.searchParams.get("secret") || "",
      expectedSecret,
    )
  ) {
    throw new AppleReceiptError(401, "Unauthorized.");
  }
  if (url.searchParams.has("user_action") || url.searchParams.has("user_id")) {
    throw new AppleReceiptError(400, "Invalid deletion event.");
  }
  const text = await request.text();
  if (text.length > 65_536) {
    throw new AppleReceiptError(400, "Invalid deletion event.");
  }
  let action: unknown;
  let id: unknown;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(text);
    if (
      form.has("secret") || form.getAll("user_action").length !== 1 ||
      form.getAll("user_id").length > 1
    ) throw new AppleReceiptError(400, "Invalid deletion event.");
    action = form.get("user_action");
    id = form.get("user_id");
  } else if (contentType.includes("application/json")) {
    // The platform emits form data, but JSON is accepted for trusted delivery
    // adapters. Reject duplicate top-level identity fields rather than let the
    // JSON parser silently replace their values.
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AppleReceiptError(400, "Invalid deletion event.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new AppleReceiptError(400, "Invalid deletion event.");
    }
    if (Object.hasOwn(data, "secret")) {
      throw new AppleReceiptError(400, "Invalid deletion event.");
    }
    const counts = new Map<string, number>();
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{" || text[i] === "[") depth++;
      else if (text[i] === "}" || text[i] === "]") depth--;
      else if (text[i] === '"') {
        const start = i++;
        while (i < text.length) {
          if (text[i] === "\\") i += 2;
          else if (text[i] === '"') break;
          else i++;
        }
        let next = i + 1;
        while (next < text.length && /\s/.test(text[next])) next++;
        if (depth === 1 && text[next] === ":") {
          const key = JSON.parse(text.slice(start, i + 1));
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    if (counts.get("user_action") !== 1 || (counts.get("user_id") || 0) > 1) {
      throw new AppleReceiptError(400, "Invalid deletion event.");
    }
    action = data.user_action;
    id = data.user_id;
  } else throw new AppleReceiptError(415, "Unsupported deletion event.");
  if (typeof action !== "string" || !action) {
    throw new AppleReceiptError(400, "Invalid deletion event.");
  }
  if (action !== "member_deleted") return { bdMemberId: "", ignored: true };
  if (
    typeof id !== "string" && typeof id !== "number" ||
    typeof id === "number" && !Number.isSafeInteger(id) ||
    !/^[1-9][0-9]{0,18}$/.test(String(id))
  ) throw new AppleReceiptError(400, "Invalid deletion event.");
  return { bdMemberId: String(id) };
}

export async function inspectBdAbsence(
  response: Response,
  expectedId: string,
): Promise<boolean> {
  if (!/^[1-9][0-9]{0,18}$/.test(expectedId) || !response.ok) {
    throw new Error("BD member lookup is unavailable.");
  }
  let body: { status?: string; message?: unknown };
  try {
    body = await response.json();
  } catch {
    throw new Error("BD member lookup is unavailable.");
  }
  if (
    body?.status !== "success" || !Array.isArray(body.message) ||
    body.message.length > 1
  ) throw new Error("BD member lookup is unavailable.");
  if (body.message.length === 0) return true;
  const row = body.message[0];
  if (!row || String(row.user_id) !== expectedId) {
    throw new Error("BD member lookup returned an unexpected identity.");
  }
  return false;
}

export async function runAppleRevocationJob(deps: {
  claim: () => Promise<AppleRevocationJob | null>;
  inspect: (bdMemberId: string) => Promise<boolean>;
  grants: (job: AppleRevocationJob) => Promise<AppleStoredGrant[]>;
  revoke: (grant: AppleStoredGrant) => Promise<number>;
  confirm: (job: AppleRevocationJob, grant: AppleStoredGrant) => Promise<void>;
  cleanup?: (job: AppleRevocationJob) => Promise<void>;
  finish: (job: AppleRevocationJob) => Promise<void>;
  retry: (job: AppleRevocationJob, reason: string) => Promise<void>;
}): Promise<
  { status: "idle" | "retry" | "complete" | "partial"; revoked: number }
> {
  const job = await deps.claim();
  if (!job) return { status: "idle", revoked: 0 };
  let revoked = 0;
  try {
    if (!await deps.inspect(job.bdMemberId)) {
      await deps.retry(job, "member_still_exists");
      return { status: "retry", revoked };
    }
    const grants = await deps.grants(job);
    if (!grants.length && !job.expectedGrants) {
      await deps.retry(job, "missing_credentials");
      return { status: "retry", revoked };
    }
    for (const grant of grants.slice(0, 5)) {
      if (grant.bdMemberId !== job.bdMemberId) {
        throw new Error("Grant owner mismatch.");
      }
      if (revoked && !await deps.inspect(job.bdMemberId)) {
        throw new Error("Member reappeared.");
      }
      if (await deps.revoke(grant) !== 200) {
        throw new Error("Apple revocation is unavailable.");
      }
      await deps.confirm(job, grant);
      revoked++;
    }
    if (grants.length > 5) {
      await deps.retry(job, "more_grants_pending");
      return { status: "partial", revoked };
    }
    if (job.fullCleanup) {
      if (!deps.cleanup) throw new Error("Website account cleanup is unavailable.");
      await deps.cleanup(job);
    }
    await deps.finish(job);
    return { status: "complete", revoked };
  } catch {
    await deps.retry(job, "revocation_retry_required");
    return { status: "retry", revoked };
  }
}
