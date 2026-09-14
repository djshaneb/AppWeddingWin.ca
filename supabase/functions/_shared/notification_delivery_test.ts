import {
  classifyExpoReceipt,
  classifyExpoTicket,
  requestExpoPush,
  requestExpoReceipt,
} from "./notification_delivery.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("accepted Expo ticket preserves its receipt identity", () => {
  equal(
    classifyExpoTicket(200, { data: [{ status: "ok", id: "ticket-1" }] }, null),
    { status: "ticketed", ticketId: "ticket-1" },
  );
});

for (
  const [label, status, body] of [
    ["missing ticket", 200, {}],
    ["invalid JSON", 200, null],
    ["empty ticket id", 200, { data: [{ status: "ok", id: "" }] }],
    ["extra ticket", 200, {
      data: [{ status: "ok", id: "a" }, { status: "ok", id: "b" }],
    }],
    ["server failure", 503, {}],
    ["request timeout", 408, {}],
  ] as const
) {
  Deno.test(`${label} cannot cause automatic duplicate resend`, () => {
    equal(classifyExpoTicket(status, body, null).status, "ambiguous");
  });
}

Deno.test("explicit rate rejection retries with Retry-After", () => {
  equal(classifyExpoTicket(429, {}, "90"), {
    status: "retry",
    errorCode: "ExpoHttp429",
    retryAfterMs: 90_000,
  });
  equal(
    classifyExpoTicket(200, {
      data: [{ status: "error", details: { error: "MessageRateExceeded" } }],
    }, null),
    { status: "retry", errorCode: "MessageRateExceeded" },
  );
});

Deno.test("dead token and invalid credentials fail rather than retry forever", () => {
  equal(
    classifyExpoTicket(200, {
      data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
    }, null),
    { status: "failed", errorCode: "DeviceNotRegistered" },
  );
  equal(classifyExpoTicket(401, {}, null), {
    status: "failed",
    errorCode: "ExpoHttp401",
  });
});

Deno.test("missing and malformed receipts retain accepted ticket without resending", () => {
  for (
    const body of [{}, { data: {} }, { data: { t: null } }, {
      data: { t: { status: "unknown" } },
    }]
  ) {
    equal(classifyExpoReceipt(200, body, "t", null), {
      status: "ticketed",
      ticketId: "t",
      errorCode: "ExpoReceiptPending",
    });
  }
});

Deno.test("receipt outcomes distinguish provider acceptance from rejection", () => {
  equal(
    classifyExpoReceipt(200, { data: { t: { status: "ok" } } }, "t", null),
    { status: "delivered", ticketId: "t" },
  );
  equal(
    classifyExpoReceipt(
      200,
      {
        data: {
          t: { status: "error", details: { error: "DeviceNotRegistered" } },
        },
      },
      "t",
      null,
    ),
    { status: "failed", errorCode: "DeviceNotRegistered" },
  );
});

Deno.test("failed receipt query can be repeated without becoming a send retry", () => {
  equal(classifyExpoReceipt(503, {}, "t", "120"), {
    status: "ticketed",
    ticketId: "t",
    errorCode: "ExpoReceiptHttp503",
    retryAfterMs: 120_000,
  });
});

Deno.test("one-device transport sends exactly one request with the supplied destination", async () => {
  const requests: { url: string; body: unknown }[] = [];
  const fake: typeof fetch = (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: [{ status: "ok", id: "accepted" }] }),
        { status: 200 },
      ),
    );
  };
  const payload = {
    to: "fixture-token",
    data: { screen: "chat", event_id: "fixture-event" },
  };
  equal(await requestExpoPush(payload, {}, fake), {
    status: "ticketed",
    ticketId: "accepted",
  });
  equal(requests, [{
    url: "https://exp.host/--/api/v2/push/send",
    body: [payload],
  }]);
});

Deno.test("network failure is attempted once and remains ambiguous", async () => {
  let attempts = 0;
  const fake: typeof fetch = () => {
    attempts += 1;
    return Promise.reject(new Error("network failed"));
  };
  equal(await requestExpoPush({}, {}, fake), {
    status: "ambiguous",
    errorCode: "ExpoRequestAmbiguous",
  });
  equal(attempts, 1);
});

Deno.test("receipt network failure retains the ticket and never hits send endpoint", async () => {
  const urls: string[] = [];
  const fake: typeof fetch = (input) => {
    urls.push(String(input));
    return Promise.reject(new Error("offline"));
  };
  equal(await requestExpoReceipt("accepted", {}, fake), {
    status: "ticketed",
    ticketId: "accepted",
    errorCode: "ExpoReceiptRequestUnavailable",
  });
  equal(urls, ["https://exp.host/--/api/v2/push/getReceipts"]);
});
