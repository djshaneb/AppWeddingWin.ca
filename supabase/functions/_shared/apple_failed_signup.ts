/** A failed, unbound signup grant is not a member grant. Its separate AAD and
 * outbox never invent a BD member/profile or authorize account-data deletion. */
export type AppleFailedSignupBinding = {
  identityId: string;
  generation: string;
  jobId: string;
  clientId: string;
  appleSub: string;
};

export type SealedAppleFailedSignupGrant = {
  ciphertext: string;
  iv: string;
  keyVersion: 1;
};

export type AppleFailedSignupJob = SealedAppleFailedSignupGrant & {
  id: string;
  leaseToken: string;
  identityId: string;
  generation: string;
  clientId: string;
  appleSub: string;
};

export type AppleFailedSignupEnqueue =
  & AppleFailedSignupBinding
  & SealedAppleFailedSignupGrant
  & {
    leaseToken: string;
    tokenHash: string;
  };

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid encrypted failed-signup grant.");
  }
  const base = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(base.padEnd(Math.ceil(base.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

function aad(binding: AppleFailedSignupBinding): Uint8Array<ArrayBuffer> {
  const fields = [
    binding.identityId,
    binding.generation,
    binding.jobId,
    binding.clientId,
    binding.appleSub,
  ];
  if (fields.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("Invalid failed-signup grant binding.");
  }
  return new TextEncoder().encode(JSON.stringify([
    "weddingwin.apple-failed-signup.v1",
    ...fields,
  ]));
}

async function encryptionKey(keyHex: string): Promise<CryptoKey> {
  if (!/^[a-f0-9]{64}$/.test(keyHex)) {
    throw new Error("Failed-signup grant encryption is unavailable.");
  }
  return await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(keyHex.match(/../g)!, (pair) => parseInt(pair, 16)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealAppleFailedSignupGrant(
  token: string,
  binding: AppleFailedSignupBinding,
  keyHex: string,
): Promise<SealedAppleFailedSignupGrant> {
  if (typeof token !== "string" || !token.trim() || token.length > 12_000) {
    throw new Error("Apple did not return a usable failed-signup credential.");
  }
  const additionalData = aad(binding);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    await encryptionKey(keyHex),
    new TextEncoder().encode(token),
  );
  return {
    ciphertext: encode(new Uint8Array(encrypted)),
    iv: encode(iv),
    keyVersion: 1,
  };
}

export async function openAppleFailedSignupGrant(
  sealed: SealedAppleFailedSignupGrant,
  binding: AppleFailedSignupBinding,
  keyHex: string,
): Promise<string> {
  if (sealed.keyVersion !== 1) {
    throw new Error("Unsupported failed-signup grant encryption version.");
  }
  const iv = decode(sealed.iv);
  if (iv.length !== 12) throw new Error("Invalid failed-signup grant IV.");
  const decoded = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad(binding), tagLength: 128 },
    await encryptionKey(keyHex),
    decode(sealed.ciphertext),
  );
  return new TextDecoder().decode(decoded);
}

export type AppleFailedSignupRevocationDependencies = {
  claim: () => Promise<AppleFailedSignupJob | null>;
  // Production adapter revalidates the SQL lease and still-unbound owner
  // immediately before the external POST, after decrypt/sign work.
  invalidateToken: (job: AppleFailedSignupJob) => Promise<number>;
  complete: (job: AppleFailedSignupJob) => Promise<void>;
  retry: (job: AppleFailedSignupJob) => Promise<void>;
};

export async function invalidateAppleFailedSignupToken(
  job: AppleFailedSignupJob,
  deps: {
    allowedClientIds: string[];
    encryptionKey: string;
    makeClientSecret: (clientId: string) => Promise<string>;
    authorize: (job: AppleFailedSignupJob) => Promise<{ leaseUntil: string }>;
    fetch: typeof fetch;
    now?: () => number;
  },
): Promise<number> {
  if (!deps.allowedClientIds.includes(job.clientId)) {
    throw new Error("Failed-signup OAuth client is not configured.");
  }
  const token = await openAppleFailedSignupGrant(job, {
    identityId: job.identityId,
    generation: job.generation,
    jobId: job.id,
    clientId: job.clientId,
    appleSub: job.appleSub,
  }, deps.encryptionKey);
  const clientSecret = await deps.makeClientSecret(job.clientId);
  // SQL refuses a rebound/legacy owner or a lost generation. Decryption and
  // signing precede the last fence; do no awaited work before the Apple POST.
  const authorization = await deps.authorize(job);
  if (
    !(Date.parse(authorization.leaseUntil) - (deps.now || Date.now)() > 10_000)
  ) {
    throw new Error("Failed-signup token cleanup authorization expired.");
  }
  const response = await deps.fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: job.clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(5_000),
  });
  return response.status;
}

export type AppleFailedSignupRevocationResult = {
  status: "idle" | "retry" | "complete";
  invalidated: number;
};

/** HTTP 200 means only that this token/session was invalidated or was already
 * invalid. It is not evidence that every client or Apple's global consent UI
 * was reset. There is deliberately no BD/Auth deletion in this runner. */
export async function runAppleFailedSignupRevocation(
  deps: AppleFailedSignupRevocationDependencies,
): Promise<AppleFailedSignupRevocationResult> {
  let job: AppleFailedSignupJob | null = null;
  try {
    job = await deps.claim();
    if (!job) return { status: "idle", invalidated: 0 };
    if (await deps.invalidateToken(job) !== 200) {
      throw new Error("Failed-signup token invalidation will retry.");
    }
    await deps.complete(job);
    return { status: "complete", invalidated: 1 };
  } catch {
    if (job) {
      try {
        await deps.retry(job);
      } catch { /* Expired workers cannot release a newer owner's lease. */ }
    }
    return { status: "retry", invalidated: 0 };
  }
}
