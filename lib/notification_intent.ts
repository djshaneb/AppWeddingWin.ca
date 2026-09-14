// Notification data chooses a destination, never grants access to its contents.
// Persist only this validated, bounded shape in the platform's encrypted store.
export const NOTIFICATION_INTENT_STORAGE_KEY = 'weddingwin.notificationIntent.v1';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LEGACY_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_ID = /^[1-9][0-9]{0,19}$/;
const THREAD_TOKEN = /^(?:[a-zA-Z0-9_-]{16,128}|app:[0-9a-f]{32})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const LEGACY_ID = /^[a-zA-Z0-9_.:-]{1,128}$/;
const MAX_HANDLED = 6;

function validCalendarDate(text: string) {
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export type NotificationIntent = {
  id: string;
  version: 0 | 1;
  recipientMemberId: string | null;
  screen: 'chat' | 'draw_result' | 'vendor_draw_result';
  threadToken?: string;
  drawId?: string;
  expiresAt: number;
};
type StoredIntents = {
  version: 1;
  pending: NotificationIntent | null;
  handled: { id: string; expiresAt: number }[];
};
export type NotificationRouteOutcome = 'handled' | 'unavailable' | 'retry';
export type NotificationProcessOutcome = NotificationRouteOutcome | 'waiting' | 'wrong_account' | 'expired' | 'idle';

export function parseNotificationIntent(data: unknown, responseId: string, now = Date.now()): NotificationIntent | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.v === undefined && value.screen === 'chat') {
    // Old notifications can open only the signed-in member's own inbox.
    if (!LEGACY_ID.test(responseId)) return null;
    return { id: `legacy:${responseId}`, version: 0, recipientMemberId: null, screen: 'chat', expiresAt: now + LEGACY_AGE_MS };
  }
  if (value.v !== 1 || typeof value.event_id !== 'string' || !UUID.test(value.event_id) ||
      typeof value.recipient_member_id !== 'string' || !MEMBER_ID.test(value.recipient_member_id) ||
      typeof value.expires_at !== 'string' || !ISO_DATE.test(value.expires_at) || !validCalendarDate(value.expires_at)) return null;
  const expiresAt = Date.parse(value.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + MAX_AGE_MS) return null;
  const base = { id: `event:${value.event_id.toLowerCase()}`, version: 1 as const,
    recipientMemberId: value.recipient_member_id, expiresAt };
  if (value.screen === 'chat') {
    if (value.thread_token !== undefined && (typeof value.thread_token !== 'string' || !THREAD_TOKEN.test(value.thread_token))) return null;
    return { ...base, screen: 'chat', ...(value.thread_token ? { threadToken: value.thread_token as string } : {}) };
  }
  if ((value.screen === 'draw_result' || value.screen === 'vendor_draw_result') &&
      typeof value.draw_id === 'string' && UUID.test(value.draw_id)) {
    return { ...base, screen: value.screen, drawId: value.draw_id.toLowerCase() };
  }
  return null;
}

function validStoredIntent(value: unknown, now: number): value is NotificationIntent {
  if (!value || typeof value !== 'object') return false;
  const p = value as NotificationIntent;
  if (!Number.isFinite(p.expiresAt) || p.expiresAt > now + MAX_AGE_MS || typeof p.id !== 'string') return false;
  if (p.version === 0) return p.id.startsWith('legacy:') && LEGACY_ID.test(p.id.slice(7)) && p.recipientMemberId === null && p.screen === 'chat' && !p.threadToken && !p.drawId;
  return p.version === 1 && p.id.startsWith('event:') && UUID.test(p.id.slice(6)) &&
    typeof p.recipientMemberId === 'string' && MEMBER_ID.test(p.recipientMemberId) &&
    ((p.screen === 'chat' && (p.threadToken === undefined || (typeof p.threadToken === 'string' && THREAD_TOKEN.test(p.threadToken))) && !p.drawId) ||
      ((p.screen === 'draw_result' || p.screen === 'vendor_draw_result') && typeof p.drawId === 'string' && UUID.test(p.drawId) && !p.threadToken));
}

export function createNotificationIntentStore(storage: {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}, now: () => number = Date.now) {
  let state: StoredIntents | null = null;
  let writes = Promise.resolve();
  let processing: Promise<NotificationProcessOutcome> | null = null;
  const mutate = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = writes.catch(() => {}).then(operation);
    writes = pending.then(() => {}, () => {});
    return pending;
  };
  const load = async () => {
    if (state) return state;
    const raw = await storage.getItemAsync(NOTIFICATION_INTENT_STORAGE_KEY);
    let parsed: Partial<StoredIntents> = {};
    try {
      if (raw && raw.length <= 2000) {
        const value = JSON.parse(raw);
        if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value;
      }
    } catch { /* Ignore malformed local data. */ }
    state = { version: 1,
      pending: parsed.version === 1 && validStoredIntent(parsed.pending, now()) ? {
        id: parsed.pending.id, version: parsed.pending.version,
        recipientMemberId: parsed.pending.recipientMemberId, screen: parsed.pending.screen,
        expiresAt: parsed.pending.expiresAt,
        ...(parsed.pending.threadToken ? { threadToken: parsed.pending.threadToken } : {}),
        ...(parsed.pending.drawId ? { drawId: parsed.pending.drawId } : {}),
      } : null,
      handled: parsed.version === 1 && Array.isArray(parsed.handled) ? parsed.handled.filter(x =>
        x && typeof x.id === 'string' &&
        ((x.id.startsWith('event:') && UUID.test(x.id.slice(6))) || (x.id.startsWith('legacy:') && LEGACY_ID.test(x.id.slice(7)))) &&
        Number.isFinite(x.expiresAt) && x.expiresAt > now() && x.expiresAt <= now() + MAX_AGE_MS)
        .slice(-MAX_HANDLED).map(x => ({ id: x.id, expiresAt: x.expiresAt })) : [] };
    return state;
  };
  const save = async (next: StoredIntents) => {
    await storage.setItemAsync(NOTIFICATION_INTENT_STORAGE_KEY, JSON.stringify(next));
    state = next; // Never claim durability before the encrypted write succeeds.
  };
  const complete = (intent: NotificationIntent) => mutate(async () => {
    const current = await load();
    await save({ version: 1, pending: current.pending?.id === intent.id ? null : current.pending,
      handled: [...current.handled.filter(x => x.id !== intent.id && x.expiresAt > now()),
        { id: intent.id, expiresAt: Math.max(intent.expiresAt, now() + LEGACY_AGE_MS) }].slice(-MAX_HANDLED) });
  });
  const api = {
    async receive(data: unknown, responseId: string): Promise<'saved' | 'duplicate' | 'invalid'> {
      const intent = parseNotificationIntent(data, responseId, now());
      if (!intent) return 'invalid';
      return mutate(async () => {
        const current = await load();
        if (current.handled.some(x => x.id === intent.id && x.expiresAt > now())) return 'duplicate';
        if (current.pending?.id === intent.id) return 'saved';
        await save({ version: 1, pending: intent, handled: current.handled.filter(x => x.expiresAt > now()) });
        return 'saved';
      });
    },
    peek: () => mutate(async () => (await load()).pending),
    process(memberId: string | null, isCurrent: () => boolean,
      route: (intent: NotificationIntent) => Promise<NotificationRouteOutcome>): Promise<NotificationProcessOutcome> {
      if (processing) return processing.catch(() => 'retry' as const).then(() => api.process(memberId, isCurrent, route));
      const work = (async (): Promise<NotificationProcessOutcome> => {
        const intent = await mutate(async () => (await load()).pending);
        if (!intent) return 'idle';
        if (intent.expiresAt <= now()) { await complete(intent); return 'expired'; }
        if (!memberId) return 'waiting';
        if (!isCurrent()) return 'retry';
        if (intent.recipientMemberId && intent.recipientMemberId !== memberId) {
          await complete(intent); return 'wrong_account';
        }
        if (!isCurrent()) return 'retry';
        let outcome: NotificationRouteOutcome;
        try { outcome = await route(intent); } catch { return 'retry'; }
        if (!isCurrent()) return 'retry';
        if (outcome === 'handled' || outcome === 'unavailable') await complete(intent);
        return outcome;
      })();
      processing = work.finally(() => { processing = null; });
      return processing;
    },
  };
  return api;
}
