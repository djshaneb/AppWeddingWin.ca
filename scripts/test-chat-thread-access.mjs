import assert from "node:assert/strict";
import { test } from "node:test";
import { chatFixture } from "./fixtures/chat-handler-fixture.mjs";

const ids = Array.from({ length: 10 }, (_, i) => String(100001 + i));
const now = Date.parse("2026-10-29T12:00:00Z");
const before = new Date(now - 2000).toISOString();
const cutoff = new Date(now - 1000).toISOString();
const after = new Date(now).toISOString();

function fixture() {
  // Disable the independent global mirror sweep so assertions measure the
  // requested token's reads/writes, rather than unrelated background work.
  const f = chatFixture({ ids, now: () => now, disableRefresh: true });
  f.appThreads.forEach((thread, i) =>
    f.messages.push({
      id: `seed-app-${i}`,
      thread_token: thread.thread_token,
      sender_bd_user_id: thread.member_b_bd_user_id,
      message_content: `Synthetic native message ${i}`,
      image_urls: [],
      created_at: before,
      read_at: null,
      bd_synced_at: null,
    })
  );
  f.bdThreads.forEach((thread, i) =>
    f.bdMessages.push({
      message_id: `seed-bd-${i}`,
      message_token: `synthetic-message-${i}`,
      thread_token: thread.thread_token,
      message_owner: `offline-token-${thread.responder_user_id}`,
      message_content: `Synthetic mirrored message ${i}`,
      message_status: "0",
      bd_created_at: before,
    })
  );
  return f;
}

function assertNoMessageAccess(trace) {
  assert.equal(
    trace.filter((x) =>
      x.kind === "supabase_query" &&
      x.table === "app_native_chat_messages"
    ).length,
    0,
    "No native message query",
  );
  assert.equal(
    trace.filter((x) =>
      [
        "supabase_mirror_messages",
        "backfill",
        "read_receipt",
        "close_outbox",
        "outbox_boundary",
      ].includes(x.kind)
    ).length,
    0,
    "No mirror message fetch, backfill, receipt or outbox operation",
  );
  assert.equal(
    trace.filter((x) =>
      x.kind === "supabase_query" &&
      x.mode !== "select"
    ).length,
    0,
    "No database write",
  );
}

for (const action of ["list", "read", "send", "report"]) {
  test(`${action} rejects an explicitly selected deleted mirrored thread before message access or writes`, async () => {
    const f = fixture();
    f.bdThreads[0].raw = { deleted_at: cutoff };
    const result = await f.invoke(ids[0], action, {
      thread_token: f.bdThreads[0].thread_token,
      message: "A deleted thread must not accept this message",
      client_message_id: "deleted-direct-no-send",
    });
    assert.equal(result.status, 404, JSON.stringify(result.body));
    assertNoMessageAccess(f.trace);
    assert.equal(f.reports.length, 0);
  });
}

for (const action of ["list", "read"]) {
  test(`${action} keeps an owned native thread native when its mirrored alias is deleted`, async () => {
    const f = fixture();
    const deleted = f.bdThreads[0].thread_token;
    f.bdThreads[0].raw = { deleted_at: cutoff };
    f.appThreads[0].bd_thread_token = deleted;
    const result = await f.invoke(ids[0], action, {
      thread_token: f.appThreads[0].thread_token,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(
      result.body.selected_thread_token,
      f.appThreads[0].thread_token,
    );
    assert.equal(result.body.messages.length, 1);
    assert.equal(
      result.body.messages[0].thread_token,
      f.appThreads[0].thread_token,
    );
    assert(
      !f.trace.some((x) =>
        ["read_receipt", "backfill", "close_outbox"].includes(x.kind) &&
        x.token === deleted
      ),
    );
    assert(
      !f.trace.some((x) =>
        x.kind === "supabase_mirror_messages" && x.tokens.includes(deleted)
      ),
    );
  });
}

for (const action of ["send", "report"]) {
  test(`${action} rejects a deleted linked alias without writes`, async () => {
    const f = fixture();
    f.bdThreads[0].raw = { deleted_at: cutoff };
    f.appThreads[0].bd_thread_token = f.bdThreads[0].thread_token;
    const result = await f.invoke(ids[0], action, {
      thread_token: f.appThreads[0].thread_token,
      message: "A deleted alias must not accept this message",
      client_message_id: "deleted-alias-no-send",
    });
    assert.equal(result.status, 404, JSON.stringify(result.body));
    assertNoMessageAccess(f.trace);
    assert.equal(f.reports.length, 0);
  });
}

test("blocked native thread with a deleted alias cannot queue a report or close for that alias", async () => {
  const f = fixture();
  const deleted = f.bdThreads[0].thread_token;
  f.bdThreads[0].raw = { deleted_at: cutoff };
  f.appThreads[0].bd_thread_token = deleted;
  f.blocks.push({
    member_a_bd_user_id: ids[0],
    member_b_bd_user_id: "200001",
    blocked_by_bd_user_id: ids[0],
    created_at: cutoff,
    notice: "Conversation blocked",
  });
  const result = await f.invoke(ids[0], "list", {
    thread_token: f.appThreads[0].thread_token,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.selected_thread_reported, true);
  assert(
    !f.trace.some((x) =>
      ["read_receipt", "backfill", "close_outbox"].includes(x.kind) &&
      x.token === deleted
    ),
  );
  assert(
    !f.reports.some((row) =>
      [row.thread_token, row.bd_thread_token].includes(deleted)
    ),
  );
});

for (const action of ["list", "read"]) {
  for (const type of ["app", "bd"]) {
    for (const existence of ["foreign", "missing"]) {
      test(`${action} rejects ${existence} ${type} tokens for all ten identities before message access`, async () => {
        const f = fixture();
        for (let i = 0; i < ids.length; i++) {
          const foreign = (i + 1) % ids.length;
          const token = existence === "missing"
            ? type === "app"
              ? `app:${"f".repeat(32)}`
              : "missing-synthetic-thread-123456"
            : type === "app"
            ? f.appThreads[foreign].thread_token
            : f.bdThreads[foreign].thread_token;
          const start = f.trace.length;
          const result = await f.invoke(ids[i], action, {
            thread_token: token,
          });
          assert.equal(result.status, 404, JSON.stringify(result.body));
          assert.equal(result.body.ok, false);
          assert.equal(result.body.messages, undefined);
          assertNoMessageAccess(f.trace.slice(start));
        }
        assert.equal(f.messages.length, 10);
        assert(f.messages.every((message) => message.read_at === null));
      });
    }
  }
}

for (const action of ["list", "read"]) {
  for (const type of ["app", "bd"]) {
    test(`${action} permits both participants in all ten ${type} conversations`, async () => {
      const f = fixture();
      for (let i = 0; i < ids.length; i++) {
        const token = type === "app"
          ? f.appThreads[i].thread_token
          : f.bdThreads[i].thread_token;
        for (const id of [ids[i], String(200001 + i)]) {
          const result = await f.invoke(id, action, { thread_token: token });
          assert.equal(result.status, 200, JSON.stringify(result.body));
          assert.equal(result.body.selected_thread_token, token);
          assert.equal(result.body.messages.length, 1);
          assert.equal(result.body.messages[0].thread_token, token);
        }
      }
    });
  }
}

test("owned native aliases resolve only to an owned mirrored thread, including an older roster omission", async () => {
  const f = fixture();
  for (let i = 0; i < ids.length; i++) {
    f.appThreads[i].bd_thread_token = f.bdThreads[i].thread_token;
    f.messages[i].bd_synced_at = before;
    if (i % 2) f.hiddenRosterTokens.add(f.bdThreads[i].thread_token);
    const result = await f.invoke(ids[i], "read", {
      thread_token: f.appThreads[i].thread_token,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(
      result.body.selected_thread_token,
      f.bdThreads[i].thread_token,
    );
    assert.equal(result.body.messages.length, 1);
    assert.equal(
      result.body.messages[0].thread_token,
      f.bdThreads[i].thread_token,
    );
    assert(f.trace.some((x) =>
      x.kind === "read_receipt" &&
      x.token === f.bdThreads[i].thread_token && x.id === ids[i]
    ));
  }
});

test("an owned native thread with a foreign mirror alias stays native and never reads or acknowledges the foreign alias", async () => {
  const f = fixture();
  for (let i = 0; i < ids.length; i++) {
    const foreign = f.bdThreads[(i + 1) % ids.length].thread_token;
    f.appThreads[i].bd_thread_token = foreign;
    const start = f.trace.length;
    const result = await f.invoke(ids[i], "read", {
      thread_token: f.appThreads[i].thread_token,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(
      result.body.selected_thread_token,
      f.appThreads[i].thread_token,
    );
    assert.equal(result.body.messages.length, 1);
    assert.equal(
      result.body.messages[0].thread_token,
      f.appThreads[i].thread_token,
    );
    const trace = f.trace.slice(start);
    assert(
      !trace.some((x) =>
        ["read_receipt", "backfill", "close_outbox"].includes(x.kind) &&
        x.token === foreign
      ),
    );
    assert(
      !trace.some((x) =>
        x.kind === "supabase_mirror_messages" && x.tokens.includes(foreign)
      ),
    );
  }
});

test("a blocked owned native thread never reports or closes its foreign mirror alias", async () => {
  const f = fixture();
  const foreign = f.bdThreads[1].thread_token;
  f.appThreads[0].bd_thread_token = foreign;
  f.blocks.push({
    member_a_bd_user_id: ids[0],
    member_b_bd_user_id: "200001",
    blocked_by_bd_user_id: ids[0],
    created_at: cutoff,
    notice: "Conversation blocked",
  });
  const result = await f.invoke(ids[0], "list", {
    thread_token: f.appThreads[0].thread_token,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.selected_thread_reported, true);
  assert(
    !f.trace.some((x) =>
      ["read_receipt", "backfill", "close_outbox"].includes(x.kind) &&
      x.token === foreign
    ),
  );
  assert(
    !f.reports.some((row) =>
      [row.thread_token, row.bd_thread_token].includes(foreign)
    ),
  );
  assert(
    !f.trace.some((x) =>
      x.kind === "supabase_mirror_messages" && x.tokens.includes(foreign)
    ),
  );
});

for (const action of ["send", "report"]) {
  test(`${action} rejects an owned native thread with a foreign mirror link before writes`, async () => {
    const f = fixture();
    const foreign = f.bdThreads[1].thread_token;
    f.appThreads[0].bd_thread_token = foreign;
    const result = await f.invoke(ids[0], action, {
      thread_token: f.appThreads[0].thread_token,
      message: "Synthetic message that must not be delivered",
      client_message_id: "foreign-alias-no-send",
    });
    assert.equal(result.status, 404, JSON.stringify(result.body));
    assertNoMessageAccess(f.trace);
    assert.equal(f.reports.length, 0);
    assert.equal(f.messages.length, 10);
  });
}

test("a self-owned native thread is readable by its sole participant", async () => {
  const f = fixture();
  f.appThreads[0].member_b_bd_user_id = ids[0];
  f.messages[0].sender_bd_user_id = ids[0];
  for (const action of ["list", "read"]) {
    const result = await f.invoke(ids[0], action, {
      thread_token: f.appThreads[0].thread_token,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.messages.length, 1);
    assert.equal(result.body.messages[0].is_mine, true);
  }
});

for (const type of ["app", "bd"]) {
  test(`explicit selection of an older owned ${type} thread beyond the first50 remains accessible and honors reports`, async () => {
    const f = fixture();
    const collection = type === "app" ? f.appThreads : f.bdThreads;
    const template = { ...collection[0] };
    let selected;
    for (let i = 0; i < 55; i++) {
      const thread = {
        ...template,
        thread_token: type === "app"
          ? `app:${(1000 + i).toString(16).padStart(32, "0")}`
          : `older-synthetic-thread-${i}`,
      };
      collection.push(thread);
      selected = thread;
    }
    const token = selected.thread_token;
    if (type === "app") {
      f.messages.push({
        ...f.messages[0],
        id: "older-app",
        thread_token: token,
      });
      f.messages.push({
        ...f.messages[0],
        id: "newer-app",
        thread_token: token,
        created_at: after,
      });
    } else {
      f.bdMessages.push({
        ...f.bdMessages[0],
        message_id: "older-bd",
        thread_token: token,
      });
      f.bdMessages.push({
        ...f.bdMessages[0],
        message_id: "newer-bd",
        thread_token: token,
        bd_created_at: after,
      });
    }
    f.reports.push({
      thread_token: token,
      status: "reported",
      reported_at: cutoff,
      notice: "Conversation reported",
    });
    const result = await f.invoke(ids[0], "list", { thread_token: token });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.selected_thread_token, token);
    assert.equal(result.body.selected_thread_reported, true);
    assert.equal(result.body.messages.length, 1);
    assert.equal(result.body.messages[0].thread_token, token);
    assert.equal(result.body.messages[0].created_at, before);
  });
}

for (const type of ["app", "bd"]) {
  for (const block of [false, true]) {
    test(`${type} ${block ? "blocked pair" : "existing report"} preserves history cutoff and prevents new sends, including an older selected conversation`, async () => {
      const f = fixture();
      const i = 0;
      const thread = type === "app" ? f.appThreads[i] : f.bdThreads[i];
      const token = thread.thread_token;
      f.hiddenRosterTokens.add(f.bdThreads[i].thread_token);
      if (type === "app") {
        f.messages.push({
          ...f.messages[i],
          id: "after-app",
          message_content: "After cutoff",
          created_at: after,
        });
      } else {
        f.bdMessages.push({
          ...f.bdMessages[i],
          message_id: "after-bd",
          message_token: "after-token",
          message_content: "After cutoff",
          bd_created_at: after,
        });
      }
      if (block) {
        f.blocks.push({
          member_a_bd_user_id: ids[i],
          member_b_bd_user_id: String(200001 + i),
          blocked_by_bd_user_id: ids[i],
          created_at: cutoff,
          notice: "Conversation blocked",
        });
      } else {
        f.reports.push({
          thread_token: token,
          status: "reported",
          reported_at: cutoff,
          notice: "Conversation reported",
        });
      }
      const result = await f.invoke(ids[i], "list", { thread_token: token });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.selected_thread_reported, true);
      assert.equal(result.body.messages.length, 1);
      assert.equal(result.body.messages[0].created_at, before);
      const summary = result.body.threads.find((row) => row.token === token);
      assert.equal(summary.closed, true);
      assert.equal(summary.unread_count, 0);
      const count = f.messages.length;
      const sent = await f.invoke(ids[i], "send", {
        thread_token: token,
        message: "This must be rejected",
        client_message_id: "no-write-after-report",
      });
      assert.equal(sent.status, 423, JSON.stringify(sent.body));
      assert.equal(f.messages.length, count);
    });
  }
}
