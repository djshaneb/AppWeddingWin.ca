// Shared BD chat mirror engine.
//
// Architecture: Supabase is the source of truth the app reads from and writes
// to. BD (the website) is synchronized in the background with a strict API
// call budget, so the app NEVER depends on a synchronous burst of BD calls
// and can never be taken down by BD's 100 req/min rate limit.
//
//   - bd_chat_threads / bd_chat_messages  -> mirror of BD chat data
//   - bd_chat_outbox                      -> queued writes (send/read/close/mirror)
//   - bd_users_cache                      -> BD member identities (titles/avatars/auth)
//   - bd_edge_cache                       -> cross-isolate state (rate limit, locks)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { nativeSessionMatchesCachedBdIdentity } from "./bd_identity.ts";
import {
  containsInlineImagePayload,
  matchingParticipantIdentity,
  isChatImageSharingEnabled,
  parseChatTimestamp,
  participantValueMatchesIdentities,
  participantValuesMatch,
  splitParticipantIdentities,
  stripInlineImagePayloads,
} from "./chat_moderation.ts";

export const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BD_SITE_TIME_ZONE = Deno.env.get("BD_SITE_TIME_ZONE") || "America/Toronto";
// Keep this unset/off until a real server-side image moderation provider is
// enforced. The release-safe default rejects image writes and strips reads.
export const CHAT_IMAGES_ENABLED = isChatImageSharingEnabled(
  Deno.env.get("CHAT_IMAGES_ENABLED"),
);
export const CHAT_IMAGES_DISABLED_NOTICE =
  "Photo sharing is temporarily unavailable while WeddingWin completes image-safety review. Please send a text message instead.";

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export type BdEnvelope = {
  status?: string;
  message?: unknown;
  total?: string | number;
  current_page?: number;
  total_pages?: number;
  next_page?: string;
};
export type BdRow = Record<string, unknown>;
export type NativeSession = { email?: string; user_id?: string | number; token?: string; cookie?: string };

export type MirrorThread = {
  thread_token: string;
  thread_id: string | null;
  thread_owner: string | null;
  thread_responders: string | null;
  request_uri: string | null;
  thread_status: string | null;
  bd_created_at: string | null;
  bd_updated_at: string | null;
  owner_user_id: string | null;
  responder_user_id: string | null;
  identity_resolved_at: string | null;
  backfilled_at: string | null;
  raw?: Record<string, unknown> | null;
};
export type MirrorMessage = {
  message_id: string;
  message_token: string | null;
  thread_token: string;
  message_owner: string | null;
  message_content: string | null;
  message_status: string;
  bd_created_at: string | null;
};
export type OutboxRow = {
  id: string;
  kind: string;
  thread_token: string | null;
  app_thread_token: string | null;
  sender_bd_user_id: string | null;
  owner_identity: string | null;
  message_token: string | null;
  content: string | null;
  image_data_uri: string | null;
  payload: Record<string, unknown> | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};
export type CachedUser = {
  user_id: string;
  token: string | null;
  cookie: string | null;
  email: string | null;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  filename: string | null;
};

export const CHAT_MEMBER_BLOCKED_NOTICE =
  "Member blocked: This conversation is closed and future messages from this member will not appear while WeddingWin reviews your report.";

export type ChatMemberBlock = {
  id: string;
  member_a_bd_user_id: string;
  member_b_bd_user_id: string;
  blocked_by_bd_user_id: string;
  blocked_member_bd_user_id: string;
  source_thread_token: string | null;
  status: "active" | "revoked";
  notice: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

export class ChatImageSharingDisabledError extends Error {
  readonly status = 403;

  constructor(message = CHAT_IMAGES_DISABLED_NOTICE) {
    super(message);
    this.name = "ChatImageSharingDisabledError";
  }
}

export class ChatMemberBlockedError extends Error {
  readonly status = 423;

  constructor(message = CHAT_MEMBER_BLOCKED_NOTICE) {
    super(message);
    this.name = "ChatMemberBlockedError";
  }
}

export const CHAT_CONTENT_REJECTED_NOTICE =
  "Message not sent: WeddingWin does not allow threats, hate speech, sexual exploitation, explicit sexual solicitation, or targeted harassment. Edit the message and try again.";

export class ObjectionableChatContentError extends Error {
  readonly status = 422;

  constructor(message = CHAT_CONTENT_REJECTED_NOTICE) {
    super(message);
    this.name = "ObjectionableChatContentError";
  }
}

function normalizedModerationText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[013457@$!]/g, (character) => ({
      "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
      "@": "a", "$": "s", "!": "i",
    })[character] || character)
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isObjectionableChatText(value: string) {
  const text = normalizedModerationText(value);
  if (!text) return false;
  return [
    /\b(?:kill|murder|shoot|stab|rape|hurt)\s+(?:you|u)\b/,
    /\b(?:send|show|share)\s+(?:me\s+)?(?:a\s+)?(?:nude|nudes|naked|porn|dick\s+pic)\b/,
    /\b(?:child|minor|underage)\s+(?:porn|sex|sexual|nude|nudes|naked)\b/,
    /\b(?:blowjob|handjob|cumshot|rape\s+fantasy|dick\s+pic)\b/,
    /\b(?:nigger|faggot|kike|chink)\b/,
    /\b(?:worthless|disgusting)\s+(?:bitch|whore|slut)\b/,
  ].some((pattern) => pattern.test(text));
}

export function filterChatTextForDisplay(value: string) {
  const safeValue = CHAT_IMAGES_ENABLED ? value : stripInlineImagePayloads(value);
  return isObjectionableChatText(safeValue)
    ? "[Message hidden by WeddingWin's safety filter. You can report and block the sender.]"
    : safeValue;
}

export function canonicalChatMemberPair(first: unknown, second: unknown): [string, string] {
  const left = String(first || "").trim();
  const right = String(second || "").trim();
  if (!left || !right || left === right) {
    throw new Error("Two distinct chat members are required.");
  }
  return left < right ? [left, right] : [right, left];
}

export async function activeChatMemberBlock(
  first: unknown,
  second: unknown,
): Promise<ChatMemberBlock | undefined> {
  const [memberA, memberB] = canonicalChatMemberPair(first, second);
  const { data, error } = await admin
    .from("app_chat_member_blocks")
    .select("*")
    .eq("member_a_bd_user_id", memberA)
    .eq("member_b_bd_user_id", memberB)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data || undefined) as ChatMemberBlock | undefined;
}

export async function assertChatMemberPairAllowed(first: unknown, second: unknown) {
  const block = await activeChatMemberBlock(first, second);
  if (block) throw new ChatMemberBlockedError(block.notice || CHAT_MEMBER_BLOCKED_NOTICE);
}

export async function activeChatBlocksForMember(memberId: unknown): Promise<ChatMemberBlock[]> {
  const id = String(memberId || "").trim();
  if (!id) return [];
  const { data, error } = await admin
    .from("app_chat_member_blocks")
    .select("*")
    .eq("status", "active")
    .or(`member_a_bd_user_id.eq.${id},member_b_bd_user_id.eq.${id}`)
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []) as ChatMemberBlock[];
}

export function otherMemberIdFromBlock(block: ChatMemberBlock, memberId: unknown) {
  const id = String(memberId || "").trim();
  if (block.member_a_bd_user_id === id) return block.member_b_bd_user_id;
  if (block.member_b_bd_user_id === id) return block.member_a_bd_user_id;
  return "";
}

export async function upsertChatMemberBlock(
  blockedBy: unknown,
  blockedMember: unknown,
  sourceThreadToken: unknown,
) {
  const reporter = String(blockedBy || "").trim();
  const other = String(blockedMember || "").trim();
  const [memberA, memberB] = canonicalChatMemberPair(reporter, other);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("app_chat_member_blocks")
    .select("*")
    .eq("member_a_bd_user_id", memberA)
    .eq("member_b_bd_user_id", memberB)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const values: Record<string, unknown> = {
      member_a_bd_user_id: memberA,
      member_b_bd_user_id: memberB,
      blocked_by_bd_user_id: reporter,
      blocked_member_bd_user_id: other,
      source_thread_token: String(sourceThreadToken || "").trim() || null,
      status: "active",
      notice: CHAT_MEMBER_BLOCKED_NOTICE,
      updated_at: now,
      revoked_at: null,
      revoked_by: null,
  };

  if (existing) {
    // Aliases discovered while the same pair block is active must inherit the
    // original cutoff. A genuinely revoked-and-reported pair starts a new one.
    if (String(existing.status) === "revoked") values.created_at = now;
    const { data, error } = await admin
      .from("app_chat_member_blocks")
      .update(values)
      .eq("id", String(existing.id))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as ChatMemberBlock;
  }

  const { data, error } = await admin
    .from("app_chat_member_blocks")
    .insert({ ...values, created_at: now })
    .select("*")
    .single();
  if (error) {
    // Concurrent reports for the same pair can race the unique constraint.
    // Read the winner; the report trigger and subsequent aliases are idempotent.
    if (String(error.code || "") === "23505") {
      const { data: raced, error: racedError } = await admin
        .from("app_chat_member_blocks")
        .select("*")
        .eq("member_a_bd_user_id", memberA)
        .eq("member_b_bd_user_id", memberB)
        .single();
      if (!racedError && raced) return raced as ChatMemberBlock;
    }
    throw new Error(error.message);
  }
  return data as ChatMemberBlock;
}

export class BdRateLimitError extends Error {
  constructor() {
    super("The website API is busy right now. Please try again in about a minute.");
    this.name = "BdRateLimitError";
  }
}

export function rows(message: unknown): BdRow[] {
  return Array.isArray(message)
    ? message.filter((row): row is BdRow => row !== null && typeof row === "object")
    : [];
}

export function firstRow(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? first as BdRow : undefined;
  }
  return message && typeof message === "object" ? message as BdRow : undefined;
}

export function formBody(values: Record<string, string | number>) {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => body.set(key, String(value)));
  return body;
}

export function shortError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

export function listPath(model: string, params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => search.set(key, String(value)));
  return `/api/v2/${model}/get?${search.toString()}`;
}

export function permissionError(path: string, message: unknown) {
  const reason = typeof message === "string" ? message : "API key permission denied";
  return `${reason}. Enable ${path.split("?")[0]} in BD Admin > Developer Hub > API key permissions.`;
}

// ---------------------------------------------------------------------------
// Caching + rate limit (cross-isolate via bd_edge_cache)
// ---------------------------------------------------------------------------

type CacheEntry = { value: unknown; expires: number };
const memoryCache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown, ttlMs: number) {
  if (memoryCache.size > 1000) memoryCache.clear();
  memoryCache.set(key, { value, expires: Date.now() + ttlMs });
}

export async function sharedCacheGet<T>(key: string): Promise<T | undefined> {
  const local = cacheGet<T>(key);
  if (local !== undefined) return local;
  try {
    const { data } = await admin
      .from("bd_edge_cache")
      .select("value, expires_at")
      .eq("key", key)
      .maybeSingle();
    if (!data) return undefined;
    const remainingMs = new Date(String(data.expires_at)).getTime() - Date.now();
    if (remainingMs <= 0) return undefined;
    cacheSet(key, data.value, remainingMs);
    return data.value as T;
  } catch {
    return undefined;
  }
}

export async function sharedCacheSet(key: string, value: unknown, ttlMs: number) {
  cacheSet(key, value, ttlMs);
  try {
    await admin.from("bd_edge_cache").upsert({
      key,
      value,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
  } catch {
    // Best effort.
  }
}

export async function sharedCacheDelete(key: string) {
  memoryCache.delete(key);
  try {
    await admin.from("bd_edge_cache").delete().eq("key", key);
  } catch {
    // Best effort.
  }
}

const RATE_LIMIT_KEY = "bd:ratelimited_until";
let bdRateLimitedUntil = 0;
let bdRateLimitHit = false;

export function resetRateLimitFlag() {
  bdRateLimitHit = false;
}

export function wasRateLimited() {
  return bdRateLimitHit;
}

export function rateLimitedNow() {
  return Date.now() < bdRateLimitedUntil;
}

export async function loadSharedRateLimit() {
  const until = await sharedCacheGet<number>(RATE_LIMIT_KEY);
  if (typeof until === "number" && until > bdRateLimitedUntil) {
    bdRateLimitedUntil = until;
  }
}

export async function callBd(path: string, init: RequestInit = {}) {
  if (!BD_API_KEY) throw new Error("BD_API_KEY is not configured");
  if (rateLimitedNow()) {
    bdRateLimitHit = true;
    throw new BdRateLimitError();
  }
  const response = await fetch(`${BD_API_BASE_URL}${path}`, {
    ...init,
    headers: { "X-Api-Key": BD_API_KEY, ...(init.headers || {}) },
  });
  const text = await response.text();
  if (response.status === 429) {
    bdRateLimitHit = true;
    bdRateLimitedUntil = Date.now() + 60_000;
    sharedCacheSet(RATE_LIMIT_KEY, bdRateLimitedUntil, 60_000).catch(() => {});
    console.error("BD API rate limited (429)", { path: path.split("?")[0] });
    throw new BdRateLimitError();
  }
  let body: BdEnvelope;
  try {
    body = JSON.parse(text);
  } catch {
    body = { status: "error", message: text };
  }
  return { response, body };
}

// ---------------------------------------------------------------------------
// Small format helpers
// ---------------------------------------------------------------------------

export function timeValue(value: unknown) {
  const time = parseChatTimestamp(value, BD_SITE_TIME_ZONE);
  return Number.isFinite(time) ? time : 0;
}

export function formatNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BD_SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}${value("month")}${value("day")}${value("hour")}${value("minute")}${value("second")}`;
}

export function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|#39|nbsp|amp|lt|gt);/gi, (entity, code) => {
    const normalized = String(code).toLowerCase();
    if (normalized.startsWith("#x")) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    if (normalized.startsWith("#")) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    return ({ quot: "\"", apos: "'", "#39": "'", nbsp: " ", amp: "&", lt: "<", gt: ">" } as Record<string, string>)[normalized] || entity;
  });
}

export function stripHtml(value: unknown) {
  return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
}

export function imageUrlsFromHtml(value: unknown) {
  const html = String(value || "");
  const urls = new Set<string>();
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const match = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i) || tag.match(/\bsrc\s*=\s*([^\s>]+)/i);
    const src = decodeHtml(match?.[2] || match?.[1] || "").trim();
    if (/^https?:\/\//i.test(src) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) urls.add(src);
  }
  return [...urls];
}

export function absoluteUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith("/") ? `${BD_API_BASE_URL.replace(/\/+$/, "")}${raw}` : `${BD_API_BASE_URL.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
}

export function avatarUrlFromBdUser(user: BdRow | undefined) {
  if (!user) return "";
  return [user.image_main_file, user.logo, user.profile_photo, user.cover_photo]
    .map(absoluteUrl)
    .find((url) => url && !/profile-profile-holder\.(png|jpe?g|webp)$/i.test(url) && !/default.*logo/i.test(url)) || "";
}

export function displayNameFromParts(company: unknown, firstName: unknown, lastName: unknown) {
  return String(company || "").trim() ||
    [firstName, lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ") ||
    "Conversation";
}

// ---------------------------------------------------------------------------
// Participant matching
// ---------------------------------------------------------------------------

export function participantTokens(user: BdRow | CachedUser, session: NativeSession) {
  const record = user as Record<string, unknown>;
  // Email is accepted only from the verified server-side BD record. The email
  // sent by the client is not an authorization identity.
  return [...new Set([record.user_id, session.user_id, record.email, record.token, session.token, record.cookie, session.cookie]
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

export function rowHasToken(value: unknown, tokens: string[]) {
  return participantValueMatchesIdentities(value, tokens);
}

export function threadHasParticipant(thread: { thread_owner?: unknown; thread_responders?: unknown }, tokens: string[]) {
  return rowHasToken(thread.thread_owner, tokens) || rowHasToken(thread.thread_responders, tokens);
}

export function splitParticipantValues(value: unknown) {
  return splitParticipantIdentities(value);
}

function matchingParticipantValue(value: unknown, tokens: string[]) {
  return matchingParticipantIdentity(value, tokens);
}

export function ownerIdentityForThread(thread: { thread_owner?: unknown; thread_responders?: unknown }, tokens: string[]) {
  return matchingParticipantValue(thread.thread_owner, tokens) ||
    matchingParticipantValue(thread.thread_responders, tokens) ||
    tokens[0] ||
    "";
}

export function otherParticipantValue(thread: { thread_owner?: unknown; thread_responders?: unknown }, userTokens: string[]) {
  if (rowHasToken(thread.thread_owner, userTokens)) {
    return splitParticipantValues(thread.thread_responders)[0] || "";
  }
  return splitParticipantValues(thread.thread_owner)[0] || "";
}

// Tokens rotate on every login, so token-string matching alone misses older
// threads. Whenever the thread's BD user ids are known, match on those too.
export function threadMatchesUser(thread: MirrorThread, tokens: string[], userId = "") {
  const id = String(userId || "").trim();
  if (id && (String(thread.owner_user_id || "") === id || String(thread.responder_user_id || "") === id)) {
    return true;
  }
  return threadHasParticipant(thread, tokens);
}

export function userSideOfThread(
  thread: { thread_owner?: unknown; thread_responders?: unknown; owner_user_id?: string | null; responder_user_id?: string | null },
  tokens: string[],
  userId = "",
) {
  const id = String(userId || "").trim();
  if (id && String(thread.owner_user_id || "") === id) return "owner";
  if (id && String(thread.responder_user_id || "") === id) return "responder";
  if (rowHasToken(thread.thread_owner, tokens)) return "owner";
  if (rowHasToken(thread.thread_responders, tokens)) return "responder";
  return "";
}

export function messageIsMineInThread(
  message: { message_owner?: unknown },
  thread: MirrorThread | undefined,
  tokens: string[],
  userId = "",
) {
  const owner = String(message.message_owner || "").trim();
  if (!owner) return false;
  if (rowHasToken(owner, tokens)) return true;
  if (!thread) return false;
  const side = userSideOfThread(thread, tokens, userId);
  if (!side) return false;
  const matchesParts = (value: unknown) => participantValuesMatch(owner, value);
  const matchesOwnerSide = matchesParts(thread.thread_owner);
  const matchesResponderSide = matchesParts(thread.thread_responders);
  if (side === "owner") return matchesOwnerSide && !matchesResponderSide;
  return matchesResponderSide && !matchesOwnerSide;
}

// Permanently associate the session user's CURRENT tokens with the threads
// they match, before the tokens rotate on the next login.
export async function persistThreadIdentitiesFromSession(threads: MirrorThread[], tokens: string[], userId: string) {
  const id = String(userId || "").trim();
  if (!id) return;
  const ownerTokens: string[] = [];
  const responderTokens: string[] = [];
  for (const thread of threads) {
    if (!thread.owner_user_id && rowHasToken(thread.thread_owner, tokens)) {
      ownerTokens.push(thread.thread_token);
    } else if (!thread.responder_user_id && rowHasToken(thread.thread_responders, tokens)) {
      responderTokens.push(thread.thread_token);
    }
  }
  try {
    if (ownerTokens.length) {
      await admin.from("bd_chat_threads").update({ owner_user_id: id }).in("thread_token", ownerTokens);
    }
    if (responderTokens.length) {
      await admin.from("bd_chat_threads").update({ responder_user_id: id }).in("thread_token", responderTokens);
    }
  } catch {
    // Best effort.
  }
}

export function threadIsClosed(thread: { thread_status?: unknown } | undefined) {
  const status = String(thread?.thread_status ?? "").trim().toLowerCase();
  return status === "0" || status === "closed";
}

export function profilePathFromThread(thread: { request_uri?: unknown }) {
  const requestUri = String(thread.request_uri || "").trim();
  if (!requestUri) return "";
  try {
    const parsed = new URL(requestUri, BD_API_BASE_URL);
    return decodeURIComponent(parsed.pathname || "").replace(/^\/+|\/+$/g, "");
  } catch {
    return requestUri.replace(/^\/+|\/+$/g, "");
  }
}

// ---------------------------------------------------------------------------
// BD users cache
// ---------------------------------------------------------------------------

export async function upsertBdUserCache(user: BdRow | undefined) {
  const userId = String(user?.user_id || "").trim();
  if (!userId) return;
  try {
    // BD's API strips token/cookie from reads, so a fresh BD record must never
    // overwrite the canonical identity we already store for this user.
    const { data: existing } = await admin
      .from("bd_users_cache")
      .select("token, cookie")
      .eq("user_id", userId)
      .maybeSingle();
    const token = String(user?.token || "").trim() || String(existing?.token || "").trim() || null;
    const cookie = String(user?.cookie || "").trim() || String(existing?.cookie || "").trim() || null;
    const raw: BdRow = { ...user };
    if (token) raw.token = token;
    if (cookie) raw.cookie = cookie;
    await admin.from("bd_users_cache").upsert({
      user_id: userId,
      token,
      cookie,
      email: String(user?.email || "").trim() || null,
      company: String(user?.company || "").trim() || null,
      first_name: String(user?.first_name || "").trim() || null,
      last_name: String(user?.last_name || "").trim() || null,
      avatar_url: avatarUrlFromBdUser(user) || null,
      filename: String(user?.filename || "").trim() || null,
      raw,
      synced_at: new Date().toISOString(),
    });
  } catch {
    // Best effort.
  }
}

export async function cachedUsersByIds(ids: string[]): Promise<Map<string, CachedUser>> {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  const map = new Map<string, CachedUser>();
  if (!unique.length) return map;
  const { data } = await admin.from("bd_users_cache").select("*").in("user_id", unique);
  for (const row of (data || []) as CachedUser[]) map.set(row.user_id, row);
  return map;
}

export async function findCachedUserByIdentity(value: string): Promise<CachedUser | undefined> {
  const clean = String(value || "").trim();
  if (!clean) return undefined;
  if (/^\d+$/.test(clean)) {
    const { data } = await admin.from("bd_users_cache").select("*").eq("user_id", clean).maybeSingle();
    if (data) return data as CachedUser;
    return undefined;
  }
  for (const column of ["token", "cookie", "email"]) {
    const { data } = await admin.from("bd_users_cache").select("*").eq(column, clean).limit(1);
    if (Array.isArray(data) && data[0]) return data[0] as CachedUser;
  }
  return undefined;
}

const IDENTITY_VALUE = /^[A-Za-z0-9]{20,64}$/;

function looksLikeIdentityValue(value: string) {
  return IDENTITY_VALUE.test(value) && !/^\d+$/.test(value);
}

function generateBdToken() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function generateBdCookie() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Returns a STABLE BD identity (users_data.token) for a user. The BD website
 * chat inbox matches threads by users_data.token, so every thread/message we
 * write must use this exact value.
 *
 * Resolution order:
 * 1. bd_users_cache.token (canonical once set).
 * 2. Adopt the identity an existing BD thread already uses for this user
 *    (keeps their historical website threads visible).
 * 3. Generate a fresh one.
 * In cases 2-3 the value is pushed to BD (users_data.token) and cached.
 * Costs at most 1 BD call, and only when the cache is cold.
 */
export async function canonicalIdentityForUser(userId: string): Promise<{ token: string; cookie: string; calls: number }> {
  const uid = String(userId || "").trim();
  if (!uid) return { token: "", cookie: "", calls: 0 };

  const { data: cached } = await admin
    .from("bd_users_cache")
    .select("token, cookie, email")
    .eq("user_id", uid)
    .maybeSingle();
  const cachedToken = String(cached?.token || "").trim();
  const cachedCookie = String(cached?.cookie || "").trim();
  if (cachedToken) return { token: cachedToken, cookie: cachedCookie, calls: 0 };

  // Adopt the identity their existing BD threads already reference so those
  // threads keep working on the website once we push it to users_data.token.
  let token = "";
  const { data: threads } = await admin
    .from("bd_chat_threads")
    .select("thread_owner, thread_responders, owner_user_id, responder_user_id, bd_updated_at")
    .or(`owner_user_id.eq.${uid},responder_user_id.eq.${uid}`)
    .order("bd_updated_at", { ascending: false })
    .limit(5);
  for (const thread of (threads || []) as MirrorThread[]) {
    const value = String(thread.owner_user_id) === uid
      ? splitParticipantValues(thread.thread_owner)[0] || ""
      : splitParticipantValues(thread.thread_responders)[0] || "";
    if (looksLikeIdentityValue(value)) {
      token = value;
      break;
    }
  }
  if (!token) token = generateBdToken();
  const cookie = cachedCookie || generateBdCookie();

  let calls = 0;
  try {
    await callBd("/api/v2/user/update", {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ user_id: uid, token, cookie }),
    });
    calls = 1;
  } catch (error) {
    if (error instanceof BdRateLimitError) throw error;
    console.error("canonicalIdentityForUser: BD push failed", { uid, error: shortError(error) });
  }

  try {
    await admin.from("bd_users_cache").upsert({ user_id: uid, token, cookie });
  } catch {
    // Best effort.
  }
  return { token, cookie, calls };
}

export function cachedUserTitle(user: CachedUser | undefined) {
  if (!user) return "";
  const name = displayNameFromParts(user.company, user.first_name, user.last_name);
  return name === "Conversation" ? "" : name;
}

// BD lookups for users (used sparingly, results cached forever in bd_users_cache)

export async function bdFetchUserById(userId: string | number) {
  const result = await callBd(`/api/v2/user/get/${encodeURIComponent(String(userId))}`);
  const user = result.response.ok && result.body.status === "success" ? firstRow(result.body.message) : undefined;
  if (user?.user_id) await upsertBdUserCache(user);
  return user;
}

export async function bdFindUserByParticipant(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return undefined;
  if (/^\d+$/.test(clean)) return bdFetchUserById(clean);
  for (const property of ["token", "cookie", "email"]) {
    const result = await callBd(listPath("user", {
      limit: 1,
      property,
      property_value: clean,
      property_operator: "eq",
    }));
    if (result.response.ok && result.body.status === "success") {
      const user = rows(result.body.message)[0];
      if (user?.user_id) {
        await upsertBdUserCache(user);
        return user;
      }
    }
  }
  return undefined;
}

export async function bdFetchUserByProfilePath(profilePath: string) {
  const clean = profilePath.replace(/^\/+|\/+$/g, "");
  for (const filename of [clean, `/${clean}`]) {
    const result = await callBd(listPath("user", {
      limit: 1,
      property: "filename",
      property_value: filename,
      property_operator: "eq",
    }));
    if (result.response.ok && result.body.status === "success") {
      const user = rows(result.body.message)[0];
      if (user?.user_id) {
        await upsertBdUserCache(user);
        return user;
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Session auth (zero BD calls when cached)
// ---------------------------------------------------------------------------

export async function getSessionUser(session: NativeSession): Promise<BdRow | undefined> {
  const userId = String(session.user_id || "").trim();
  const token = String(session.token || "").trim();
  const cookie = String(session.cookie || "").trim();
  if (!userId || !await nativeSessionMatchesCachedBdIdentity(session)) return undefined;

  const cacheKey = `sess:${userId}:${token}:${cookie}`;

  const cached = await sharedCacheGet<BdRow>(cacheKey);
  if (cached?.user_id && String(cached.user_id) === userId) return cached;

  // Zero-BD path: the user record saved during a verified login / sync.
  try {
    const { data } = await admin.from("bd_users_cache").select("raw").eq("user_id", userId).maybeSingle();
    const raw = (data?.raw || undefined) as BdRow | undefined;
    if (raw?.user_id && String(raw.user_id) === userId) {
      await sharedCacheSet(cacheKey, raw, 300_000);
      return raw;
    }
  } catch {
    // Fall through to BD.
  }

  const user = await bdFetchUserById(userId);
  if (user?.user_id && String(user.user_id) === userId) {
    await sharedCacheSet(cacheKey, user, 300_000);
    return user;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// BD message send / thread ops (used only by the budgeted flusher)
// ---------------------------------------------------------------------------

export function validateMessage(content: string, imageDataUri = "") {
  const clean = content.trim();
  const image = imageDataUri.trim();
  if (!clean && !image) throw new Error("Message required");
  if (clean.length > 2000) throw new Error("Message is too long");
  if (!CHAT_IMAGES_ENABLED && containsInlineImagePayload(clean)) {
    throw new ChatImageSharingDisabledError();
  }
  if (clean && isObjectionableChatText(clean)) throw new ObjectionableChatContentError();
  if (image) {
    if (!CHAT_IMAGES_ENABLED) throw new ChatImageSharingDisabledError();
    if (!/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(image)) throw new Error("Unsupported image format");
    if (image.length > 2_500_000) throw new Error("Image is too large. Please choose a smaller image.");
  }
  return { clean, image };
}

export async function bdSendMessage(threadToken: string, content: string, owner: string, imageDataUri = "", messageToken = "") {
  const { clean, image } = validateMessage(content, imageDataUri);
  const textHtml = clean ? `<p>${escapeHtml(clean).replace(/\r\n|\r|\n/g, "<br>")}</p>` : "";
  const imageHtml = image ? `<p><img src="${escapeHtml(image)}" alt="Chat image" style="max-width:100%;height:auto;"></p>` : "";
  const token = messageToken || randomToken();
  const createdAt = formatNow();
  const result = await callBd("/api/v2/chat_message_items/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      message_token: token,
      thread_token: threadToken,
      message_status: 0,
      message_owner: owner,
      message_content: `${textHtml}${imageHtml}`,
      created_at: createdAt,
    }),
  });
  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Message send failed";
    throw new Error(result.response.status === 401 || result.response.status === 403 ? permissionError("/api/v2/chat_message_items/create", message) : message);
  }
  const sent = firstRow(result.body.message);
  const messageId = String(sent?.message_id || "").trim();
  if (messageId) {
    await admin.from("bd_chat_messages").upsert({
      message_id: messageId,
      message_token: String(sent?.message_token || token),
      thread_token: threadToken,
      message_owner: String(sent?.message_owner || owner),
      message_content: String(sent?.message_content || `${textHtml}${imageHtml}`),
      message_status: String(sent?.message_status ?? "0"),
      bd_created_at: String(sent?.created_at || createdAt),
      raw: sent || null,
      synced_at: new Date().toISOString(),
    });
  }
  await admin.from("bd_chat_threads")
    .update({ bd_updated_at: createdAt, synced_at: new Date().toISOString() })
    .eq("thread_token", threadToken);
  return sent;
}

export async function bdCreateThread(owner: string, responder: string, requestUri: string) {
  const createdAt = formatNow();
  const token = randomToken();
  const result = await callBd("/api/v2/chat_message_threads/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      thread_token: token,
      thread_owner: owner,
      thread_responders: responder,
      thread_status: 1,
      request_uri: requestUri,
      created_at: createdAt,
      updated_at: createdAt,
    }),
  });
  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Chat thread create failed";
    throw new Error(result.response.status === 401 || result.response.status === 403 ? permissionError("/api/v2/chat_message_threads/create", message) : message);
  }
  const created = firstRow(result.body.message) || {
    thread_token: token,
    thread_owner: owner,
    thread_responders: responder,
    thread_status: "1",
    request_uri: requestUri,
    created_at: createdAt,
    updated_at: createdAt,
  };
  await upsertMirrorThreads([created]);
  return created;
}

export async function bdCloseThread(threadToken: string, threadId = "") {
  const payload: Record<string, string | number> = {
    thread_token: threadToken,
    thread_status: 0,
    updated_at: formatNow(),
  };
  if (threadId) payload.thread_id = threadId;
  const result = await callBd("/api/v2/chat_message_threads/update", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(payload),
  });
  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Chat thread close failed";
    throw new Error(result.response.status === 401 || result.response.status === 403 ? permissionError("/api/v2/chat_message_threads/update", message) : message);
  }
  await admin.from("bd_chat_threads")
    .update({ thread_status: "0", synced_at: new Date().toISOString() })
    .eq("thread_token", threadToken);
}

// ---------------------------------------------------------------------------
// Mirror writes
// ---------------------------------------------------------------------------

export async function upsertMirrorThreads(bdThreads: BdRow[]) {
  const payload = bdThreads
    .map((thread) => ({
      thread_token: String(thread.thread_token || "").trim(),
      thread_id: String(thread.thread_id || "").trim() || null,
      thread_owner: String(thread.thread_owner || "") || null,
      thread_responders: String(thread.thread_responders || "") || null,
      request_uri: String(thread.request_uri || "") || null,
      thread_status: String(thread.thread_status ?? "") || null,
      bd_created_at: String(thread.created_at || "") || null,
      bd_updated_at: String(thread.updated_at || thread.created_at || "") || null,
      raw: thread,
      synced_at: new Date().toISOString(),
    }))
    .filter((row) => row.thread_token);
  if (!payload.length) return;
  const { error } = await admin.from("bd_chat_threads").upsert(payload);
  if (error) console.error("mirror thread upsert failed", error.message);
}

export async function upsertMirrorMessages(bdMessages: BdRow[]) {
  const mapped = bdMessages
    .map((message) => ({
      message_id: String(message.message_id || "").trim(),
      message_token: String(message.message_token || "").trim() || null,
      thread_token: String(message.thread_token || "").trim(),
      message_owner: String(message.message_owner || "") || null,
      message_content: String(message.message_content || "") || null,
      message_status: String(message.message_status ?? "0"),
      bd_created_at: String(message.created_at || "") || null,
      raw: message,
      synced_at: new Date().toISOString(),
    }))
    .filter((row) => row.message_id && row.thread_token);
  if (!mapped.length) return;

  // Never downgrade a locally-read message back to unread while the read
  // receipt is still queued for BD.
  const ids = mapped.map((row) => row.message_id);
  const { data: readRows } = await admin
    .from("bd_chat_messages")
    .select("message_id")
    .in("message_id", ids)
    .eq("message_status", "1");
  const readSet = new Set((readRows || []).map((row) => String(row.message_id)));
  for (const row of mapped) {
    if (readSet.has(row.message_id)) row.message_status = "1";
  }

  const { error } = await admin.from("bd_chat_messages").upsert(mapped);
  if (error) console.error("mirror message upsert failed", error.message);
}

// ---------------------------------------------------------------------------
// Mirror reads
// ---------------------------------------------------------------------------

export async function mirrorThreadsForUser(userTokens: string[], userId = ""): Promise<MirrorThread[]> {
  const { data, error } = await admin
    .from("bd_chat_threads")
    .select("*")
    .order("synced_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const mine = ((data || []) as MirrorThread[]).filter((thread) => {
    // Admin/website-deleted threads must never resurface in the app.
    const rawDeleted = String((thread.raw as Record<string, unknown> | null)?.deleted_at || "").trim();
    if (rawDeleted) return false;
    return threadMatchesUser(thread, userTokens, userId);
  });
  return mine.sort((a, b) => timeValue(b.bd_updated_at || b.bd_created_at) - timeValue(a.bd_updated_at || a.bd_created_at));
}

export async function mirrorThreadByToken(token: string): Promise<MirrorThread | undefined> {
  const clean = String(token || "").trim();
  if (!clean) return undefined;
  const { data } = await admin.from("bd_chat_threads").select("*").eq("thread_token", clean).maybeSingle();
  return (data || undefined) as MirrorThread | undefined;
}

export async function mirrorMessagesForThread(threadToken: string): Promise<MirrorMessage[]> {
  const { data, error } = await admin
    .from("bd_chat_messages")
    .select("*")
    .eq("thread_token", threadToken)
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data || []) as MirrorMessage[]).sort((a, b) =>
    Number(a.message_id || 0) - Number(b.message_id || 0) || timeValue(a.bd_created_at) - timeValue(b.bd_created_at)
  );
}

export async function mirrorMessagesForThreads(threadTokens: string[]): Promise<Map<string, MirrorMessage[]>> {
  const map = new Map<string, MirrorMessage[]>();
  const unique = [...new Set(threadTokens.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await admin
    .from("bd_chat_messages")
    .select("*")
    .in("thread_token", unique)
    .limit(2000);
  if (error) throw new Error(error.message);
  for (const message of (data || []) as MirrorMessage[]) {
    const list = map.get(message.thread_token) || [];
    list.push(message);
    map.set(message.thread_token, list);
  }
  for (const [token, list] of map) {
    map.set(token, list.sort((a, b) =>
      Number(a.message_id || 0) - Number(b.message_id || 0) || timeValue(a.bd_created_at) - timeValue(b.bd_created_at)
    ));
  }
  return map;
}

// Pending sends that BD hasn't confirmed yet, so the user always sees their
// message instantly even while it is queued.
export async function pendingSendsForThreads(threadTokens: string[], mirrorTokens: Set<string>): Promise<Map<string, OutboxRow[]>> {
  const map = new Map<string, OutboxRow[]>();
  const unique = [...new Set(threadTokens.filter(Boolean))];
  if (!unique.length) return map;
  const { data } = await admin
    .from("bd_chat_outbox")
    .select("*")
    .eq("kind", "send")
    .is("sent_at", null)
    .in("thread_token", unique)
    .order("created_at", { ascending: true })
    .limit(200);
  for (const row of (data || []) as OutboxRow[]) {
    const token = String(row.message_token || "").trim();
    if (token && mirrorTokens.has(token)) continue;
    const list = map.get(String(row.thread_token)) || [];
    list.push(row);
    map.set(String(row.thread_token), list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export async function enqueueOutbox(row: Partial<OutboxRow>) {
  const { data, error } = await admin.from("bd_chat_outbox").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as OutboxRow;
}

export async function enqueueCloseOutbox(threadToken: unknown, threadId: unknown = "") {
  const token = String(threadToken || "").trim();
  if (!token) throw new Error("Conversation token required");
  const { data: queued, error: queuedError } = await admin
    .from("bd_chat_outbox")
    .select("*")
    .eq("kind", "close")
    .eq("thread_token", token)
    .is("sent_at", null)
    .limit(1);
  if (queuedError) throw new Error(queuedError.message);
  if (queued?.length) return queued[0] as OutboxRow;
  return await enqueueOutbox({
    kind: "close",
    thread_token: token,
    payload: { thread_id: String(threadId || "").trim() },
  });
}

export async function markOutboxSent(id: string) {
  const { error } = await admin
    .from("bd_chat_outbox")
    .update({ sent_at: new Date().toISOString(), last_error: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function markOutboxError(row: OutboxRow, error: unknown) {
  const attempts = (row.attempts || 0) + 1;
  const detail = shortError(error);
  const lastError = attempts >= 10
    ? `Delivery stopped after ${attempts} attempts: ${detail}`
    : detail;
  await admin.from("bd_chat_outbox").update({ attempts, last_error: lastError }).eq("id", row.id);

  if (row.kind === "mirror_app_thread") {
    const appThreadToken = String(row.app_thread_token || row.thread_token || "").trim();
    if (appThreadToken) {
      await admin.from("app_native_chat_messages")
        .update({ bd_sync_error: lastError })
        .eq("thread_token", appThreadToken)
        .is("bd_synced_at", null);
    }
  }

  if (attempts >= 10) {
    console.error("BD chat outbox delivery stopped", {
      outbox_id: row.id,
      kind: row.kind,
      thread_token: row.thread_token,
      attempts,
      error: detail,
    });
  }
}

async function markOutboxBlocked(
  row: OutboxRow,
  error: ChatMemberBlockedError | ChatImageSharingDisabledError,
) {
  const detail = shortError(error);
  const lastError = `Delivery blocked: ${detail}`;
  await admin.from("bd_chat_outbox").update({ attempts: 10, last_error: lastError }).eq("id", row.id);

  const appThreadToken = String(row.app_thread_token || row.thread_token || "").trim();
  if (appThreadToken.startsWith("app:")) {
    await admin.from("app_native_chat_messages")
      .update({ bd_sync_error: lastError })
      .eq("thread_token", appThreadToken)
      .is("bd_synced_at", null);
  }
}

async function activeThreadTokenReport(threadToken: string) {
  if (!threadToken) return false;
  const { data, error } = await admin
    .from("app_chat_thread_reports")
    .select("id")
    .eq("thread_token", threadToken)
    .neq("status", "resolved")
    .limit(1);
  if (error) throw new Error(error.message);
  return !!data?.length;
}

async function appThreadForDeliveryToken(threadToken: string) {
  const { data: byAppToken, error: appError } = await admin
    .from("app_native_chat_threads")
    .select("member_a_bd_user_id, member_b_bd_user_id")
    .eq("thread_token", threadToken)
    .maybeSingle();
  if (appError) throw new Error(appError.message);
  if (byAppToken) return byAppToken as { member_a_bd_user_id: string; member_b_bd_user_id: string };

  const { data: byBdToken, error: bdError } = await admin
    .from("app_native_chat_threads")
    .select("member_a_bd_user_id, member_b_bd_user_id")
    .eq("bd_thread_token", threadToken)
    .maybeSingle();
  if (bdError) throw new Error(bdError.message);
  return (byBdToken || undefined) as
    | { member_a_bd_user_id: string; member_b_bd_user_id: string }
    | undefined;
}

async function assertThreadDeliveryAllowed(threadToken: string, senderId: string) {
  if (await activeThreadTokenReport(threadToken)) {
    throw new ChatMemberBlockedError();
  }

  const appThread = await appThreadForDeliveryToken(threadToken);
  if (appThread) {
    await assertChatMemberPairAllowed(
      appThread.member_a_bd_user_id,
      appThread.member_b_bd_user_id,
    );
    return;
  }

  const mirror = await mirrorThreadByToken(threadToken);
  if (!mirror) return;
  const ownerId = String(mirror.owner_user_id || "").trim();
  const responderId = String(mirror.responder_user_id || "").trim();
  if (ownerId && responderId) {
    await assertChatMemberPairAllowed(ownerId, responderId);
    return;
  }

  const otherId = [ownerId, responderId].find((id) => id && id !== senderId) || "";
  if (senderId && otherId) await assertChatMemberPairAllowed(senderId, otherId);
}

async function resolveBdThreadTokenForOutbox(row: OutboxRow): Promise<{ token: string; calls: number }> {
  const raw = String(row.thread_token || "").trim();
  if (raw && !raw.startsWith("app:")) {
    await assertThreadDeliveryAllowed(raw, String(row.sender_bd_user_id || ""));
    return { token: raw, calls: 0 };
  }

  const appToken = raw || String(row.app_thread_token || "").trim();
  if (!appToken) throw new Error("Outbox row has no thread token");
  const { data } = await admin
    .from("app_native_chat_threads")
    .select("*")
    .eq("thread_token", appToken)
    .maybeSingle();
  if (!data) throw new Error("App thread not found for outbox row");
  await assertChatMemberPairAllowed(data.member_a_bd_user_id, data.member_b_bd_user_id);
  const saved = String(data.bd_thread_token || "").trim();
  if (saved) {
    await assertThreadDeliveryAllowed(saved, String(row.sender_bd_user_id || ""));
    return { token: saved, calls: 0 };
  }

  // Create the BD thread now (budgeted).
  let calls = 0;
  const memberIds = [String(data.member_a_bd_user_id || ""), String(data.member_b_bd_user_id || "")];
  const senderId = String(row.sender_bd_user_id || "");
  const otherId = memberIds.find((id) => id && id !== senderId) || memberIds[0];

  // The BD website inbox matches threads by users_data.token, so both sides
  // MUST be written with their canonical token (user ids do not match there).
  const senderIdentity = await canonicalIdentityForUser(senderId);
  calls += senderIdentity.calls;
  const otherIdentity = await canonicalIdentityForUser(otherId);
  calls += otherIdentity.calls;
  const owner = senderIdentity.token;
  const responder = otherIdentity.token;
  if (!owner || !responder) throw new Error("BD chat participants are missing tokens");
  const requestUri = String(data.request_uri || "").trim() ||
    `${BD_API_BASE_URL.replace(/\/+$/, "")}/${String(data.profile_path || "").replace(/^\/+/, "")}`;

  const created = await bdCreateThread(owner, responder, requestUri);
  calls += 1;
  const createdToken = String(created.thread_token || "").trim();
  // We know exactly who both sides are; persist it so thread matching never
  // depends on rotating tokens.
  await admin.from("bd_chat_threads").update({
    owner_user_id: senderId,
    responder_user_id: otherId,
    identity_resolved_at: new Date().toISOString(),
  }).eq("thread_token", createdToken);
  await admin.from("app_native_chat_threads").update({
    bd_thread_token: createdToken,
    bd_thread_id: String(created.thread_id || "").trim() || null,
    bd_synced_at: new Date().toISOString(),
    bd_sync_error: null,
  }).eq("thread_token", appToken);
  return { token: createdToken, calls };
}

async function flushSendRow(row: OutboxRow): Promise<number> {
  const resolved = await resolveBdThreadTokenForOutbox(row);
  await assertThreadDeliveryAllowed(resolved.token, String(row.sender_bd_user_id || ""));
  let calls = resolved.calls;
  // message_owner must be a token the website recognizes; a bare user id
  // breaks ownership alignment in the website thread view.
  let owner = String(row.owner_identity || "").trim();
  if (!owner || /^\d+$/.test(owner)) {
    const identity = await canonicalIdentityForUser(String(row.sender_bd_user_id || ""));
    calls += identity.calls;
    owner = identity.token || owner || String(row.sender_bd_user_id || "");
  }
  const content = String(row.content || "");
  const storedImage = String(row.image_data_uri || "");
  if (!CHAT_IMAGES_ENABLED && storedImage && !content.trim()) {
    throw new ChatImageSharingDisabledError();
  }
  const sent = await bdSendMessage(
    resolved.token,
    content,
    owner,
    CHAT_IMAGES_ENABLED ? storedImage : "",
    String(row.message_token || ""),
  );
  calls += 1;
  await markOutboxSent(row.id);
  const appMessageId = String(row.payload?.app_message_id || "").trim();
  if (appMessageId) {
    await admin.from("app_native_chat_messages").update({
      bd_message_id: String(sent?.message_id || sent?.message_token || "").trim() || null,
      bd_synced_at: new Date().toISOString(),
      bd_sync_error: null,
    }).eq("id", appMessageId);
  }
  return calls;
}

async function flushReadRow(row: OutboxRow, room: number): Promise<number> {
  const ids = Array.isArray(row.payload?.message_ids)
    ? (row.payload!.message_ids as unknown[]).map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) {
    await markOutboxSent(row.id);
    return 0;
  }
  let calls = 0;
  const remaining: string[] = [];
  let deliveryFailed = false;
  let deliveryError = "";
  for (const id of ids) {
    if (calls >= room) {
      remaining.push(id);
      continue;
    }
    const result = await callBd("/api/v2/chat_message_items/update", {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ message_id: id, message_status: 1 }),
    }).catch((error) => {
      if (error instanceof BdRateLimitError) throw error;
      return undefined;
    });
    calls += 1;
    if (!result || !result.response.ok || result.body.status !== "success") {
      remaining.push(id);
      deliveryFailed = true;
      deliveryError = typeof result?.body.message === "string"
        ? result.body.message
        : `Read receipt ${id} was rejected by BD.`;
    }
  }
  if (remaining.length) {
    const update: Record<string, unknown> = {
      payload: { ...(row.payload || {}), message_ids: remaining },
    };
    if (deliveryFailed) {
      const attempts = (row.attempts || 0) + 1;
      update.attempts = attempts;
      update.last_error = attempts >= 10
        ? `Delivery stopped after ${attempts} attempts: ${deliveryError}`
        : deliveryError;
      if (attempts >= 10) {
        console.error("BD chat read-receipt delivery stopped", {
          outbox_id: row.id,
          thread_token: row.thread_token,
          attempts,
          error: deliveryError,
        });
      }
    }
    await admin.from("bd_chat_outbox").update(update).eq("id", row.id);
  } else {
    await markOutboxSent(row.id);
  }
  return calls;
}

async function flushCloseRow(row: OutboxRow): Promise<number> {
  const token = String(row.thread_token || "").trim();
  if (!token) {
    await markOutboxSent(row.id);
    return 0;
  }
  // Moderation can revoke a block before this queued operation runs. Never
  // close a thread unless its report is still active at delivery time.
  if (!await activeThreadTokenReport(token)) {
    await markOutboxSent(row.id);
    return 0;
  }
  await bdCloseThread(token, String(row.payload?.thread_id || "").trim());
  await markOutboxSent(row.id);
  return 1;
}

async function flushMirrorAppThreadRow(row: OutboxRow): Promise<number> {
  const resolved = await resolveBdThreadTokenForOutbox(row);
  let calls = resolved.calls;

  // Push any app messages that have not reached BD yet.
  const appToken = String(row.app_thread_token || row.thread_token || "").trim();
  const { data } = await admin
    .from("app_native_chat_messages")
    .select("*")
    .eq("thread_token", appToken)
    .is("bd_synced_at", null)
    .order("created_at", { ascending: true })
    .limit(10);
  for (const message of (data || []) as Record<string, unknown>[]) {
    const senderId = String(message.sender_bd_user_id || "");
    const identity = await canonicalIdentityForUser(senderId);
    calls += identity.calls;
    const owner = identity.token || senderId;
    const content = String(message.message_content || "");
    const imageUrls = Array.isArray(message.image_urls) ? message.image_urls.map((url) => String(url || "")) : [];
    if (!CHAT_IMAGES_ENABLED && imageUrls.length && !content.trim()) {
      const lastError = `Delivery stopped: ${CHAT_IMAGES_DISABLED_NOTICE}`;
      if (String(message.bd_sync_error || "") !== lastError) {
        await admin.from("app_native_chat_messages").update({ bd_sync_error: lastError }).eq("id", String(message.id));
      }
      continue;
    }
    const sent = await bdSendMessage(
      resolved.token,
      content,
      owner,
      CHAT_IMAGES_ENABLED ? imageUrls[0] || "" : "",
    );
    calls += 1;
    await admin.from("app_native_chat_messages").update({
      bd_message_id: String(sent?.message_id || sent?.message_token || "").trim() || null,
      bd_synced_at: new Date().toISOString(),
      bd_sync_error: null,
    }).eq("id", String(message.id));
  }
  await markOutboxSent(row.id);
  return calls;
}

export async function flushOutbox(budget: number): Promise<number> {
  const { data } = await admin
    .from("bd_chat_outbox")
    .select("*")
    .is("sent_at", null)
    .lt("attempts", 10)
    .order("created_at", { ascending: true })
    .limit(25);
  const pending = ((data || []) as OutboxRow[]).sort((left, right) => {
    const leftPriority = left.kind === "read" ? 0 : 1;
    const rightPriority = right.kind === "read" ? 0 : 1;
    return leftPriority - rightPriority || timeValue(left.created_at) - timeValue(right.created_at);
  });
  let calls = 0;
  for (const row of pending) {
    if (calls >= budget || rateLimitedNow()) break;
    try {
      if (row.kind === "send") calls += await flushSendRow(row);
      else if (row.kind === "read") calls += await flushReadRow(row, budget - calls);
      else if (row.kind === "close") calls += await flushCloseRow(row);
      else if (row.kind === "mirror_app_thread") calls += await flushMirrorAppThreadRow(row);
      else await markOutboxSent(row.id);
    } catch (error) {
      if (error instanceof BdRateLimitError) {
        await markOutboxError(row, error);
        break;
      }
      if (error instanceof ChatMemberBlockedError) {
        await markOutboxBlocked(row, error);
        continue;
      }
      if (error instanceof ChatImageSharingDisabledError) {
        await markOutboxBlocked(row, error);
        continue;
      }
      await markOutboxError(row, error);
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Mirror refresh (the ONLY steady-state BD reader)
// ---------------------------------------------------------------------------

const MIRROR_REFRESH_KEY = "bd:mirror_refreshed_at";
const MIRROR_LOCK_KEY = "bd:mirror_lock";
const MIRROR_STALE_MS = 20_000;

async function pullRecentThreads(pages: number) {
  let page = "";
  for (let index = 0; index < pages; index += 1) {
    const params: Record<string, string | number> = {
      limit: 100,
      order_column: "updated_at",
      order_type: "DESC",
    };
    if (page) params.page = page;
    const result = await callBd(listPath("chat_message_threads", params));
    if (!result.response.ok || result.body.status !== "success") break;
    await upsertMirrorThreads(rows(result.body.message));
    const current = Number(result.body.current_page || index + 1);
    const total = Number(result.body.total_pages || current);
    const next = String(result.body.next_page || "").trim();
    if (!next || current >= total) break;
    page = next;
  }
}

async function pullRecentMessages(pages: number) {
  let page = "";
  for (let index = 0; index < pages; index += 1) {
    const params: Record<string, string | number> = {
      limit: 100,
      order_column: "created_at",
      order_type: "DESC",
    };
    if (page) params.page = page;
    const result = await callBd(listPath("chat_message_items", params));
    if (!result.response.ok || result.body.status !== "success") break;
    await upsertMirrorMessages(rows(result.body.message));
    const current = Number(result.body.current_page || index + 1);
    const total = Number(result.body.total_pages || current);
    const next = String(result.body.next_page || "").trim();
    if (!next || current >= total) break;
    page = next;
  }
}

async function resolveThreadIdentities(maxBdCalls: number) {
  const { data } = await admin
    .from("bd_chat_threads")
    .select("*")
    .is("identity_resolved_at", null)
    .order("synced_at", { ascending: false })
    .limit(6);
  let calls = 0;
  for (const thread of (data || []) as MirrorThread[]) {
    // Deleted/closed threads (e.g. admin-removed) never render anywhere;
    // don't burn BD lookups resolving their participants.
    const rawDeleted = String((thread.raw as Record<string, unknown> | null)?.deleted_at || "").trim();
    if (rawDeleted) {
      await admin.from("bd_chat_threads")
        .update({ identity_resolved_at: new Date().toISOString() })
        .eq("thread_token", thread.thread_token);
      continue;
    }

    const update: Record<string, unknown> = {};

    // Zero-cost source of truth: threads created from the app know both
    // member ids via the app link table.
    const { data: appLink } = await admin
      .from("app_native_chat_threads")
      .select("member_a_bd_user_id, member_b_bd_user_id, vendor_bd_user_id")
      .eq("bd_thread_token", thread.thread_token)
      .maybeSingle();
    if (appLink) {
      const vendorId = String(appLink.vendor_bd_user_id || "").trim();
      const memberIds = [String(appLink.member_a_bd_user_id || "").trim(), String(appLink.member_b_bd_user_id || "").trim()];
      const creatorId = memberIds.find((id) => id && id !== vendorId) || memberIds[0];
      const responderId = vendorId || memberIds.find((id) => id && id !== creatorId) || "";
      if (creatorId && responderId) {
        await admin.from("bd_chat_threads").update({
          owner_user_id: thread.owner_user_id || creatorId,
          responder_user_id: thread.responder_user_id || responderId,
          identity_resolved_at: new Date().toISOString(),
        }).eq("thread_token", thread.thread_token);
        continue;
      }
    }

    for (const [column, value] of [
      ["owner_user_id", splitParticipantValues(thread.thread_owner)[0] || ""],
      ["responder_user_id", splitParticipantValues(thread.thread_responders)[0] || ""],
    ] as const) {
      if (!value) continue;
      const cached = await findCachedUserByIdentity(value);
      if (cached?.user_id) {
        update[column] = cached.user_id;
        continue;
      }
      if (calls >= maxBdCalls || rateLimitedNow()) continue;
      const user = await bdFindUserByParticipant(value).catch((error) => {
        if (error instanceof BdRateLimitError) throw error;
        return undefined;
      });
      calls += Math.min(3, maxBdCalls - calls);
      if (user?.user_id) update[column] = String(user.user_id);
    }

    // Fallback: the vendor can usually be resolved from the profile URL the
    // thread was started on.
    if (!update.responder_user_id && !thread.responder_user_id) {
      const profilePath = profilePathFromThread(thread);
      if (profilePath) {
        const { data: byFilename } = await admin
          .from("bd_users_cache")
          .select("user_id")
          .or(`filename.eq.${profilePath},filename.eq./${profilePath}`)
          .limit(1);
        if (Array.isArray(byFilename) && byFilename[0]?.user_id) {
          update.responder_user_id = String(byFilename[0].user_id);
        } else if (calls < maxBdCalls && !rateLimitedNow()) {
          const user = await bdFetchUserByProfilePath(profilePath).catch(() => undefined);
          calls += 2;
          if (user?.user_id) update.responder_user_id = String(user.user_id);
        }
      }
    }

    const resolvedBoth = (update.owner_user_id || thread.owner_user_id) && (update.responder_user_id || thread.responder_user_id);
    if (resolvedBoth || calls >= maxBdCalls) {
      if (resolvedBoth) update.identity_resolved_at = new Date().toISOString();
      if (Object.keys(update).length) {
        await admin.from("bd_chat_threads").update(update).eq("thread_token", thread.thread_token);
      }
      if (calls >= maxBdCalls) break;
      continue;
    }
    if (Object.keys(update).length) {
      await admin.from("bd_chat_threads").update(update).eq("thread_token", thread.thread_token);
    }
  }
}

/**
 * Heals threads whose BD participant strings no longer match the canonical
 * token of a known participant (historical token rotation orphaned them from
 * the website inbox). Only touches sides whose BD user id is known - pure
 * website-only chats with unresolved participants are never modified.
 */
async function repairThreadIdentitiesInBd(maxBdCalls: number): Promise<number> {
  let calls = 0;
  const { data } = await admin
    .from("bd_chat_threads")
    .select("*")
    .not("owner_user_id", "is", null)
    .order("bd_updated_at", { ascending: false, nullsFirst: false })
    .limit(20);

  for (const thread of (data || []) as MirrorThread[]) {
    if (calls >= maxBdCalls || rateLimitedNow()) break;

    const sides = [
      { uid: String(thread.owner_user_id || "").trim(), field: "thread_owner", current: splitParticipantValues(thread.thread_owner)[0] || "" },
      { uid: String(thread.responder_user_id || "").trim(), field: "thread_responders", current: splitParticipantValues(thread.thread_responders)[0] || "" },
    ];
    const update: Record<string, string> = {};
    const rewrites: Array<{ from: string; to: string }> = [];
    for (const side of sides) {
      if (!side.uid) continue;
      const { data: cached } = await admin
        .from("bd_users_cache")
        .select("token")
        .eq("user_id", side.uid)
        .maybeSingle();
      let canonical = String(cached?.token || "").trim();
      if (!canonical) {
        if (looksLikeIdentityValue(side.current)) {
          // The thread already carries a usable identity for this user; adopt
          // it as canonical (no BD write) so future app sends reuse it.
          try {
            await admin.from("bd_users_cache").upsert({ user_id: side.uid, token: side.current });
          } catch {
            // Best effort.
          }
          continue;
        }
        if (calls >= maxBdCalls || rateLimitedNow()) continue;
        // Bare user-id participant: the website inbox can never match it.
        // Resolve a real identity (adopts from their other threads first).
        const identity = await canonicalIdentityForUser(side.uid);
        calls += identity.calls;
        canonical = identity.token;
      }
      if (!canonical || side.current === canonical) continue;
      update[side.field] = canonical;
      if (side.current) rewrites.push({ from: side.current, to: canonical });
    }
    if (!Object.keys(update).length) continue;

    const raw = (thread.raw || {}) as Record<string, unknown>;
    const threadId = String(thread.thread_id || raw.thread_id || "").trim();
    if (!threadId) continue;

    await callBd("/api/v2/chat_message_threads/update", {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        thread_id: threadId,
        thread_token: thread.thread_token,
        ...update,
        // Preserve ordering - do not bump the thread to the top of inboxes.
        updated_at: String(raw.updated_at || "").trim() || formatNow(),
      }),
    });
    calls += 1;
    await admin.from("bd_chat_threads").update(update).eq("thread_token", thread.thread_token);

    // Re-home this thread's messages from the stale identity to the canonical
    // one so ownership alignment stays correct in the website thread view.
    for (const rewrite of rewrites) {
      if (calls >= maxBdCalls || rateLimitedNow()) break;
      const { data: messages } = await admin
        .from("bd_chat_messages")
        .select("message_id")
        .eq("thread_token", thread.thread_token)
        .eq("message_owner", rewrite.from)
        .limit(25);
      for (const message of (messages || []) as Array<{ message_id: string }>) {
        if (calls >= maxBdCalls || rateLimitedNow()) break;
        await callBd("/api/v2/chat_message_items/update", {
          method: "PUT",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody({ message_id: message.message_id, message_owner: rewrite.to }),
        });
        calls += 1;
        await admin.from("bd_chat_messages").update({ message_owner: rewrite.to }).eq("message_id", message.message_id);
      }
    }
  }
  return calls;
}

export async function refreshMirrorIfStale(force = false): Promise<boolean> {
  await loadSharedRateLimit();
  if (rateLimitedNow()) return false;

  const last = await sharedCacheGet<number>(MIRROR_REFRESH_KEY);
  if (!force && typeof last === "number" && Date.now() - last < MIRROR_STALE_MS) return false;

  const lock = await sharedCacheGet<number>(MIRROR_LOCK_KEY);
  if (lock) return false;
  await sharedCacheSet(MIRROR_LOCK_KEY, Date.now(), 15_000);

  try {
    const { count } = await admin.from("bd_chat_threads").select("thread_token", { count: "exact", head: true });
    const seeded = (count || 0) > 0;
    await pullRecentThreads(seeded ? 1 : 3);
    await pullRecentMessages(seeded ? 1 : 3);
    await flushOutbox(12);
    await resolveThreadIdentities(4);
    await repairThreadIdentitiesInBd(8);
    await sharedCacheSet(MIRROR_REFRESH_KEY, Date.now(), 3_600_000);
    return true;
  } catch (error) {
    if (!(error instanceof BdRateLimitError)) {
      console.error("mirror refresh failed", shortError(error));
    }
    return false;
  } finally {
    await sharedCacheDelete(MIRROR_LOCK_KEY);
  }
}

// One-time full history pull for a thread the user opens.
export async function ensureThreadBackfilled(thread: MirrorThread | undefined) {
  if (!thread || thread.backfilled_at) return;
  if (rateLimitedNow()) return;
  try {
    const result = await callBd(listPath("chat_message_items", {
      limit: 100,
      property: "thread_token",
      property_value: thread.thread_token,
      property_operator: "eq",
      order_column: "created_at",
      order_type: "ASC",
    }));
    if (!result.response.ok || result.body.status !== "success") return;
    await upsertMirrorMessages(rows(result.body.message));
    await admin.from("bd_chat_threads")
      .update({ backfilled_at: new Date().toISOString() })
      .eq("thread_token", thread.thread_token);
  } catch (error) {
    if (!(error instanceof BdRateLimitError)) {
      console.error("thread backfill failed", shortError(error));
    }
  }
}

// Local read-mark + queued BD read receipts.
export async function markMirrorThreadRead(threadToken: string, userTokens: string[], userId = "") {
  const thread = await mirrorThreadByToken(threadToken);
  const messages = await mirrorMessagesForThread(threadToken);
  const unreadIds = messages
    .filter((message) =>
      !messageIsMineInThread(message, thread, userTokens, userId) &&
      String(message.message_status || "0") === "0"
    )
    .map((message) => message.message_id);
  if (!unreadIds.length) return false;

  // Persist/merge the durable website receipt before changing the local mirror.
  // Otherwise an outbox failure leaves the mirror marked read and future calls
  // can no longer discover the receipt that still needs to be sent.
  const { data, error: lookupError } = await admin
    .from("bd_chat_outbox")
    .select("*")
    .eq("kind", "read")
    .eq("thread_token", threadToken)
    .is("sent_at", null)
    .limit(1);
  if (lookupError) throw new Error(lookupError.message);
  const existing = (data || [])[0] as OutboxRow | undefined;
  if (existing) {
    const merged = [...new Set([
      ...(Array.isArray(existing.payload?.message_ids) ? (existing.payload!.message_ids as unknown[]).map(String) : []),
      ...unreadIds,
    ])];
    const { error } = await admin
      .from("bd_chat_outbox")
      .update({ payload: { message_ids: merged } })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    await enqueueOutbox({ kind: "read", thread_token: threadToken, payload: { message_ids: unreadIds } });
  }

  const { error: mirrorError } = await admin
    .from("bd_chat_messages")
    .update({ message_status: "1" })
    .in("message_id", unreadIds);
  if (mirrorError) throw new Error(mirrorError.message);
  return true;
}
