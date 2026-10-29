// Executes the complete checked-in chat routes and selected real shared helpers.
// All identities, rows, leases and HTTP responses are synthetic and local.
// External delivery, backfill and Supabase transport are instrumented boundaries;
// this fixture tests authorization, payloads and coordination, not production throughput.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, webcrypto } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import vm from "node:vm";
import ts from "typescript";
const here = dirname(fileURLToPath(import.meta.url));
const candidate = resolve(here, "../../supabase/functions");
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
function declaration(source, name) {
  const ast = ts.createSourceFile(
    "actual.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const node = ast.statements.find((n) =>
    ts.isFunctionDeclaration(n) && n.name?.text === name ||
    ts.isVariableStatement(n) &&
      n.declarationList.declarations.some((d) => d.name.getText(ast) === name)
  );
  assert(node, name);
  return node.getText(ast).replace(/^export\s+/, "");
}

export function chatFixture(
  {
    ids,
    now = () => Date.now(),
    sourceRoot = candidate,
    disableRefresh = false,
  } = {},
) {
  const trace = [],
    messages = [],
    appThreads = [],
    bdThreads = [],
    bdMessages = [],
    blocks = [],
    users = new Map(),
    cache = new Map();
  let sequence = 0, leaseRow, providerFailure = false;
  const root = sourceRoot;
  const hiddenRosterTokens = new Set();
  const member = (id) => ({
    user_id: id,
    token: "offline-token-" + id,
    cookie: "",
    email: `member-${id}@offline.example.invalid`,
    active: "2",
    subscription_id: ids.includes(id) ? "18" : "3",
    first_name: "Synthetic",
    last_name: id,
  });
  ids.forEach((id, i) => {
    const other = String(200001 + i);
    users.set(id, member(id));
    users.set(other, member(other));
    appThreads.push({
      thread_token: "app:" + String(i + 1).padStart(32, "0"),
      member_a_bd_user_id: id,
      member_b_bd_user_id: other,
      vendor_bd_user_id: other,
      bd_thread_token: null,
      created_at: new Date(now()).toISOString(),
      updated_at: new Date(now()).toISOString(),
      request_uri: "",
    });
    bdThreads.push({
      thread_token: "bd-offline-thread-" + String(i + 1).padStart(16, "0"),
      thread_id: String(i + 1),
      owner_user_id: id,
      responder_user_id: other,
      thread_owner: "offline-token-" + id,
      thread_responders: "offline-token-" + other,
      thread_status: "1",
      bd_created_at: new Date(now()).toISOString(),
      backfilled_at: new Date(now()).toISOString(),
    });
  });
  const tables = {
    app_native_chat_threads: appThreads,
    app_native_chat_messages: messages,
    app_chat_thread_reports: [],
    bd_shared_cache: [],
    bd_chat_threads: bdThreads,
  };
  const value = (r, k) =>
    k.includes("->>") ? r[k.split("->>")[0]]?.[k.split("->>")[1]] : r[k];
  const admin = {
    from(table) {
      let mode = "select",
        payload,
        filters = [],
        conditions = [],
        order,
        limit = Infinity,
        single = false,
        count = false;
      const op = {};
      const run = () => {
        trace.push({
          kind: "supabase_query",
          table,
          mode,
          conditions: [...conditions],
        });
        let rows = (tables[table] || []).filter((r) =>
          filters.every((fn) => fn(r))
        );
        if (mode === "insert" || mode === "upsert") {
          const items = Array.isArray(payload) ? payload : [payload];
          rows = [];
          for (const item of items) {
            if (mode === "upsert") {
              const existing = (tables[table] || []).find((row) =>
                row.thread_token === item.thread_token
              );
              if (existing) {
                Object.assign(existing, item);
                rows.push(existing);
                continue;
              }
            }
            if (
              table === "bd_shared_cache" &&
              tables[table].some((x) => x.key === item.key)
            ) return { data: null, error: { code: "23505" } };
            if (
              table === "app_native_chat_messages" &&
              messages.some((x) =>
                x.thread_token === item.thread_token &&
                x.sender_bd_user_id === item.sender_bd_user_id &&
                x.client_message_id === item.client_message_id
              )
            ) return { data: null, error: { code: "23505" } };
            const added = {
              id: String(++sequence),
              created_at: new Date(now()).toISOString(),
              read_at: null,
              ...item,
            };
            (tables[table] ||= []).push(added);
            rows.push(added);
          }
        }
        if (mode === "update") {
          for (const r of rows) Object.assign(r, payload);
        }
        if (mode === "delete") {
          tables[table] = tables[table].filter((r) => !rows.includes(r));
        }
        if (order) {
          rows.sort((a, b) =>
            String(value(a, order.key) || "").localeCompare(
              String(value(b, order.key) || ""),
            ) * (order.asc ? 1 : -1)
          );
        }
        rows = rows.slice(0, limit);
        return {
          data: single ? (rows[0] || null) : rows.map((x) => ({ ...x })),
          error: null,
          count: count ? rows.length : undefined,
        };
      };
      for (const m of ["select", "insert", "update", "delete", "upsert"]) {
        op[m] = (v, opts) => {
          if (m !== "select") {
            mode = m;
            payload = v;
          }
          if (opts?.count) count = true;
          return op;
        };
      }
      for (const m of ["eq", "neq", "is", "gt", "lte"]) {
        op[m] = (k, v) => {
          conditions.push({ op: m, key: k, value: v });
          filters.push((r) =>
            m === "eq" || m === "is"
              ? value(r, k) === v
              : m === "neq"
              ? value(r, k) !== v
              : m === "gt"
              ? value(r, k) > v
              : value(r, k) <= v
          );
          return op;
        };
      }
      op.in = (k, values) => {
        conditions.push({ op: "in", key: k, value: values });
        filters.push((r) => values.includes(value(r, k)));
        return op;
      };
      op.or = (expression) => {
        const parts = expression.split(",").map((x) => x.split(".eq."));
        filters.push((r) => parts.some(([k, v]) => String(value(r, k)) === v));
        return op;
      };
      op.limit = (n) => {
        limit = n;
        return op;
      };
      op.order = (k, o = {}) => {
        order = { key: k, asc: o.ascending !== false };
        return op;
      };
      op.maybeSingle = op.single = () => {
        single = true;
        return Promise.resolve(run());
      };
      op.then = (ok, bad) => Promise.resolve().then(run).then(ok, bad);
      return op;
    },
  };
  class ClockDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [now()]));
    }
    static now() {
      return now();
    }
  }
  const secret = "synthetic-chat-proof-secret-not-production";
  const base = {
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortSignal,
    Date: ClockDate,
    Error,
    crypto: webcrypto,
    AsyncLocalStorage,
    console: { info() {}, warn() {}, error() {} },
    Deno: {
      env: {
        get: (k) =>
          ({
            APP_EMAIL_CHANGE_SECRET: secret,
            BD_API_BASE_URL: "https://www.weddingwin.ca",
          })[k],
      },
    },
    fetch: async (input, init) => {
      const u = new URL(input);
      assert.equal(u.pathname, "/verify-email-change-app");
      const f = new URLSearchParams(init.body);
      const id = f.get("user_id");
      assert(users.has(id));
      assert.equal(
        f.get("signature"),
        createHmac("sha256", secret).update(
          `status_app|${id}|${f.get("expires")}`,
        ).digest("hex"),
      );
      trace.push({ kind: "website_email_proof", id });
      return new Response(
        JSON.stringify({
          ok: true,
          user_id: id,
          current_email: users.get(id).email,
          email_confirmation_required: false,
          pending_email: null,
          email_verification_status: "none",
        }),
        { status: 200 },
      );
    },
  };
  const modules = new Map();
  function module(name) {
    const path = resolve(root, "_shared", name);
    if (modules.has(path)) return modules.get(path);
    const exports = {};
    modules.set(path, exports);
    const ctx = vm.createContext({
      ...base,
      exports,
      require(spec) {
        if (spec === "node:async_hooks") return { AsyncLocalStorage };
        if (spec === "npm:jpeg-js@0.4.4") {
          return {
            default: {
              decode() {
                throw Error("No images in text-only test");
              },
            },
          };
        }
        assert(spec.startsWith("./"));
        return module(resolve(dirname(path), spec));
      },
    });
    vm.runInContext(transpile(readFileSync(path, "utf8")), ctx);
    return exports;
  }
  const control = module("chat_refresh_control.ts"),
    moderation = module("chat_moderation.ts"),
    membership = module("chat_membership.ts"),
    access = module("chat_member_access.ts");
  const queryCount = (kind) => trace.push({ kind });
  const matches = (thread, id) =>
    [thread.owner_user_id, thread.responder_user_id].includes(String(id));
  const callBd = async (path) => {
    await control.beforeChatRefreshBdCall();
    trace.push({ kind: "bd_api", path });
    if (providerFailure) {
      return {
        response: { ok: false, status: 503 },
        body: { status: "error" },
      };
    }
    const plan = path.match(/subscription_types\/get\/(\d+)/);
    return {
      response: { ok: true, status: 200 },
      body: {
        status: "success",
        message: plan
          ? {
            subscription_id: plan[1],
            enable_direct_messages: "1",
            receive_messages: "1",
          }
          : [],
        current_page: 1,
        total_pages: 1,
      },
    };
  };
  const globals = {
    ...base,
    ...moderation,
    ...membership,
    ...access,
    ...module("member_email_verification.ts"),
    ...control,
    admin,
    BD_API_BASE_URL: "https://www.weddingwin.ca",
    CHAT_IMAGES_ENABLED: false,
    CHAT_IMAGES_DISABLED_NOTICE: "",
    CHAT_MEMBER_BLOCKED_NOTICE: "Conversation blocked",
    BdRateLimitError: class extends Error {},
    ChatMemberBlockedError: class extends Error {},
    ChatImageSharingDisabledError: class extends Error {},
    ObjectionableChatContentError: class extends Error {},
    enqueueCloseOutbox: async (token) =>
      trace.push({ kind: "close_outbox", token }),
    resetRateLimitFlag() {},
    wasRateLimited: () => false,
    rateLimitedNow: () => false,
    loadSharedRateLimit: async () => queryCount("supabase_rate_limit_read"),
    getSessionUser: async (s) => {
      trace.push({ kind: "supabase_identity", id: s.user_id });
      return s.token === "offline-token-" + s.user_id
        ? users.get(s.user_id)
        : undefined;
    },
    bdFetchUserById: async (id) => {
      trace.push({ kind: "bd_api", path: "/api/v2/user/get/" + id });
      return users.get(String(id));
    },
    hasPrivateAppReviewerAccess: async () => false,
    privateAppReviewerPairAllowed: async () => false,
    participantTokens: (u, s) => [String(u.user_id), s.token],
    activeChatBlocksForMember: async (id) =>
      blocks.filter((b) =>
        [b.member_a_bd_user_id, b.member_b_bd_user_id].includes(id)
      ),
    otherMemberIdFromBlock: (b, id) =>
      b.member_a_bd_user_id === id
        ? b.member_b_bd_user_id
        : b.member_a_bd_user_id,
    cachedUsersByIds: async (ids) => {
      queryCount("supabase_cached_users");
      return new Map(
        ids.filter((id) => users.has(id)).map((id) => [id, users.get(id)]),
      );
    },
    cachedUserTitle: (u) => u ? "Synthetic " + u.user_id : "",
    avatarUrlFromBdUser: () => "",
    mirrorThreadsForUser: async (_t, id) => {
      queryCount("supabase_mirror_threads");
      return bdThreads.filter((t) =>
        matches(t, id) && !hiddenRosterTokens.has(t.thread_token) &&
        !t.raw?.deleted_at
      );
    },
    mirrorThreadByToken: async (token) => {
      trace.push({ kind: "supabase_mirror_thread", token });
      return bdThreads.find((t) => t.thread_token === token);
    },
    threadMatchesUser: (t, _tokens, id) => matches(t, id),
    threadHasParticipant: (t, tokens) =>
      tokens.includes(t.owner_user_id) || tokens.includes(t.responder_user_id),
    threadIsClosed: (t) => String(t.thread_status) === "0",
    otherParticipantValue: () => "",
    userSideOfThread: (t, _tokens, id) =>
      t.owner_user_id === id ? "owner" : "responder",
    persistThreadIdentitiesFromSession: async () => {},
    mirrorMessagesForThreads: async (tokens) => {
      trace.push({ kind: "supabase_mirror_messages", tokens });
      return new Map(
        tokens.map((token) => [
          token,
          bdMessages.filter((m) => m.thread_token === token),
        ]),
      );
    },
    mirrorUnreadOwnerCountsForThreads: async () => new Map(),
    appUnreadCountsForThreads: async (tokens, id) => {
      queryCount("supabase_unread");
      return new Map(
        tokens.map((t) => [
          t,
          messages.filter((m) =>
            m.thread_token === t && m.sender_bd_user_id !== id && !m.read_at
          ).length,
        ]),
      );
    },
    pendingSendsForThreads: async () => new Map(),
    ensureThreadBackfilled: async (t) =>
      trace.push({ kind: "backfill", token: t.thread_token }),
    markMirrorThreadRead: async (token, _tokens, id) => {
      trace.push({ kind: "read_receipt", token, id });
      return false;
    },
    messageIsMineInThread: (m, t, _tokens, id) =>
      m.message_owner === "offline-token-" + id,
    filterChatTextForDisplay: (s) => String(s || ""),
    stripHtml: (s) => String(s || ""),
    imageUrlsFromHtml: () => [],
    chatImageAllowedAt: () => false,
    timeValue: (v) => Date.parse(v) || 0,
    randomToken: () => webcrypto.randomUUID().replaceAll("-", ""),
    firstRow: (v) => Array.isArray(v) ? v[0] : v,
    sharedCacheGet: async (k) => {
      queryCount("supabase_plan_cache_read");
      return cache.get(k);
    },
    sharedCacheSet: async (k, v) => {
      queryCount("supabase_plan_cache_write");
      cache.set(k, v);
    },
    callBd,
    validateMessage: (text, image) => ({ clean: String(text).trim(), image }),
    assertChatMemberPairAllowed: async () => {},
    flushOutbox: async () => {
      queryCount("outbox_boundary");
      return 0;
    },
    shortError: (e) => e.message,
  };
  const sharedSource = readFileSync(
    resolve(root, "_shared/bd_chat.ts"),
    "utf8",
  );
  // Run the real identity matching as well as the routes: authorization must
  // not depend on a simplified test-only membership predicate.
  const identityNames = [
    "participantTokens",
    "rowHasToken",
    "threadHasParticipant",
    "splitParticipantValues",
    "matchingParticipantValue",
    "otherParticipantValue",
    "threadMatchesUser",
    "userSideOfThread",
    "messageIsMineInThread",
    "threadIsClosed",
  ];
  const identityContext = vm.createContext({ ...globals });
  vm.runInContext(
    transpile(
      identityNames.map((name) => declaration(sharedSource, name)).join("\n") +
        `\nglobalThis.actualIdentities={${identityNames.join(",")}};`,
    ),
    identityContext,
  );
  Object.assign(globals, identityContext.actualIdentities);
  const refreshContext = vm.createContext({
    ...globals,
    mirrorRefreshStore: {
      read: async () => {
        queryCount("supabase_lease_read");
        return leaseRow ? { ...leaseRow } : undefined;
      },
      deleteExpired: async (n) => {
        queryCount("supabase_lease_delete");
        if (leaseRow?.expiresAt <= n) leaseRow = undefined;
      },
      insert: async (r) => {
        queryCount("supabase_lease_insert");
        if (leaseRow) return false;
        leaseRow = { ...r };
        return true;
      },
      finish: async (owner, n, kind, expiry) => {
        queryCount("supabase_lease_finish");
        if (
          leaseRow?.owner !== owner || leaseRow.kind !== "running" ||
          leaseRow.expiresAt <= n
        ) return false;
        leaseRow = { owner, kind, expiresAt: expiry, finishedAt: n };
        return true;
      },
    },
    listPath: (resource) => "/api/v2/" + resource + "/get",
    rows: (v) => v || [],
    upsertMirrorThreads: async () => queryCount("supabase_thread_upsert"),
    upsertMirrorMessages: async () => queryCount("supabase_message_upsert"),
    resolveThreadIdentities: async () => {},
    repairThreadIdentitiesInBd: async () => {},
  });
  vm.runInContext(
    transpile(
      ["pullRecentThreads", "pullRecentMessages", "refreshMirrorIfStale"].map(
        (n) => declaration(sharedSource, n),
      ).join("\n") + "\nglobalThis.refresh=refreshMirrorIfStale;",
    ),
    refreshContext,
  );
  globals.refreshMirrorIfStale = disableRefresh
    ? async () => false
    : refreshContext.refresh;
  const handlers = {};
  for (const slug of ["bd-chat-status", "bd-chat-sync"]) {
    const path = resolve(root, slug, "index.ts");
    const source = readFileSync(path, "utf8");
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const imported = {};
    for (const imp of ast.statements.filter(ts.isImportDeclaration)) {
      for (const e of imp.importClause?.namedBindings?.elements || []) {
        if (!e.isTypeOnly) {
          imported[e.name.text] = e.name.text.endsWith("Error")
            ? class extends Error {}
            : () => {
              throw Error("Unmocked dependency " + e.name.text);
            };
        }
      }
    }
    const ctx = vm.createContext({
      ...imported,
      ...globals,
      Deno: { ...base.Deno, serve: (fn) => handlers[slug] = fn },
    });
    vm.runInContext(
      transpile(
        ast.statements.filter((n) => !ts.isImportDeclaration(n)).map((n) =>
          n.getText(ast)
        ).join("\n"),
      ),
      ctx,
      { filename: path },
    );
  }
  const invoke = async (id, action = "list", extra = {}) => {
    const status = action === "status";
    const response = await handlers[status ? "bd-chat-status" : "bd-chat-sync"](
      new Request("https://offline.invalid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          native_session: { user_id: id, token: "offline-token-" + id },
          ...extra,
        }),
      }),
    );
    return { status: response.status, body: await response.json() };
  };
  return {
    invoke,
    trace,
    messages,
    appThreads,
    bdThreads,
    bdMessages,
    users,
    blocks,
    hiddenRosterTokens,
    reports: tables.app_chat_thread_reports,
    setProviderFailure: (v) => {
      providerFailure = v;
    },
    sourceRoot: root,
    sourceSha: createHash("sha256").update(
      readFileSync(resolve(root, "bd-chat-sync/index.ts")),
    ).digest("hex"),
  };
}
