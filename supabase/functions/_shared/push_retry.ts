export const PUSH_RETRY_BASE_MS = 30_000;
export const PUSH_RETRY_MAX_MS = 60 * 60 * 1000;
export const PUSH_RETRY_AFTER_MAX_MS = 24 * 60 * 60 * 1000;
export const PUSH_RETRY_COUNT_MAX = 16;
export const EXPO_RECEIPT_INITIAL_DELAY_MS = 15 * 60 * 1000;
export const EXPO_RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function parseRetryAfterMs(
  value: string | null,
  nowMs = Date.now(),
) {
  const clean = String(value || "").trim();
  if (!clean) return undefined;

  const seconds = Number(clean);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(
      PUSH_RETRY_AFTER_MAX_MS,
      Math.ceil(seconds * 1000),
    );
  }

  const dateMs = Date.parse(clean);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.min(
    PUSH_RETRY_AFTER_MAX_MS,
    Math.max(0, dateMs - nowMs),
  );
}

export function nextPushRetry(
  priorRetryCount: number,
  nowMs = Date.now(),
  retryAfterMs?: number,
) {
  const normalizedPrior = Number.isFinite(priorRetryCount)
    ? Math.max(0, Math.floor(priorRetryCount))
    : 0;
  const retryCount = Math.min(
    PUSH_RETRY_COUNT_MAX,
    normalizedPrior + 1,
  );
  const exponent = Math.min(retryCount - 1, PUSH_RETRY_COUNT_MAX - 1);
  const exponentialDelayMs = Math.min(
    PUSH_RETRY_MAX_MS,
    PUSH_RETRY_BASE_MS * (2 ** exponent),
  );
  const serverDelayMs = Number.isFinite(retryAfterMs)
    ? Math.min(
      PUSH_RETRY_AFTER_MAX_MS,
      Math.max(0, Math.ceil(retryAfterMs || 0)),
    )
    : 0;
  const delayMs = Math.min(
    PUSH_RETRY_AFTER_MAX_MS,
    Math.max(exponentialDelayMs, serverDelayMs),
  );

  return {
    retryCount,
    delayMs,
    nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
  };
}
