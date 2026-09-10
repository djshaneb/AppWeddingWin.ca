// Actual orchestration, in-memory I/O only: no credentials, network or emails.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const endpoints = ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"];
const original = {
  id: "offline",
  event_key: "offline",
  vendor_bingo_id: "901",
  vendor_bd_user_id: "901",
  couple_bd_user_id: "701",
  vendor_name: "Test Vendor",
  winner_name: "Alex and Sam",
  winner_email: "couple@example.test",
  winner_phone: "5550101001",
  prize_title: "OLD TITLE",
  prize_description: "OLD DESCRIPTION",
  selection_status: "verified",
  eligibility_verified_at: "2026-01-01",
  winner_rules_confirmed_at: "2026-01-01",
  verification_notes: "TEST ONLY",
  verified_at: "2026-01-01",
};
const current = {
  prize_title: "Updated package",
  prize_description: "Updated photography discount",
  prize_approx_value_cad: 275.50,
  vendor_offer_version: "2026-09-07T00:00:00Z",
};
async function harness(endpoint: string, options: Record<string, any> = {}) {
  const source = await Deno.readTextFile(
    new URL(`../${endpoint}/index.ts`, import.meta.url),
  );
  const begin = source.indexOf("async function sendDrawEmails("),
    end = source.indexOf("async function drawWinner(", begin);
  assert(begin > 0 && end > begin, "Actual send code must exist");
  const transport: any[] = [],
    claims: any[] = [],
    finalized: any[] = [],
    updates: any[] = [];
  const deps = {
    hasQrBingoSkillVerification: () => true,
    hasQrBingoVendorSkillAttestation: () => true,
    qrDrawEmailsEnabled: () => true,
    isolatedEmailTestRecipient: () =>
      options.fixture?.outbound_recipient_email || null,
    isEmailTestFixture: (fixture: any) =>
      Boolean(fixture?.event_key?.startsWith("email-test-")),
    qrBingoConfig: () => ({
      send_vendor_email: true,
      send_couple_email: true,
      revision: 1,
      email_delivery_mode: "production_verified_fulfillment",
      vendor_email_subject: "Vendor",
      couple_email_subject: "Couple",
    }),
    qrContactEmail: (v: unknown) => String(v || "").trim(),
    cleanText: (v: unknown, n = 1000) => String(v ?? "").trim().slice(0, n),
    absoluteWeddingWinUrl: () => "",
    claimDrawEmailDelivery: async (_id: string, channel: string) => {
      claims.push(channel);
      return {
        channel,
        status: options.status?.[channel] || "claimed",
        delivery_key: "offline:" + channel,
        claim_token: "offline",
        prize_snapshot: Object.hasOwn(options, "snapshot")
          ? options.snapshot
          : current,
      };
    },
    finalizeDrawEmailDelivery: async (
      claim: any,
      outcome: string,
      error: string,
    ) => {
      finalized.push({ channel: claim.channel, outcome, error });
    },
    sendWebsiteDrawEmails: async (payload: any) => {
      transport.push(payload);
      if (options.throw) throw new Error("Offline uncertain transport");
      return options.response ||
        {
          vendor: { sent: true, error: "" },
          couple: { sent: true, error: "" },
        };
    },
    requireAdmin: () => ({
      from: () => ({
        update: (patch: any) => ({
          eq: async () => {
            updates.push(patch);
            return { error: null };
          },
        }),
      }),
    }),
  };
  const mod = await import(
    `data:application/typescript,${
      encodeURIComponent(
        `type BdRow=any;type RaffleDraw=any;type QrVendor=any;type IsolatedRaffleFixture=any;type DrawEmailClaim=any;type DrawEmailChannel=any;export default function(deps:any){const {${
          Object.keys(deps).join(",")
        }}=deps;${source.slice(begin, end)}return sendDrawEmails;}`,
      )
    }`
  );
  const send = mod.default(deps);
  return {
    send: (draw: any = { ...original }) =>
      send(
        { email: "vendor@example.test" },
        draw,
        {},
        undefined,
        options.fixture,
      ),
    transport,
    claims,
    finalized,
    updates,
  };
}
for (const endpoint of endpoints) {
  Deno.test(`${endpoint}: isolated vendor copies require opt-in and both recipients stay exact through partial retries`, async () => {
    const fixture = {
      id: "00000000-0000-4000-8000-000000000009",
      event_key: "email-test-offline",
      vendor_bingo_id: original.vendor_bingo_id,
      vendor_bd_user_id: original.vendor_bd_user_id,
      couple_bd_user_id: original.couple_bd_user_id,
      outbound_recipient_email: original.winner_email,
      send_vendor_email: false,
      send_couple_email: true,
    };
    const draw = { ...original, event_key: fixture.event_key };
    const legacy = await harness(endpoint, { fixture });
    await legacy.send(draw);
    assert(
      legacy.claims.join(",") === "couple",
      "Legacy fixtures remain couple-only",
    );
    assert(
      legacy.transport[0].send_vendor === "0",
      "Legacy vendor copy stays disabled",
    );
    assert(
      legacy.transport[0].email_test_vendor_copy === "0",
      "No opt-in marker on legacy test",
    );
    for (const sent of ["", "vendor", "couple"]) {
      const h = await harness(endpoint, {
        fixture: { ...fixture, send_vendor_email: true },
      });
      const next = {
        ...draw,
        ...(sent ? { [sent + "_email_sent_at"]: "2026-01-01" } : {}),
      };
      await h.send(next);
      const payload = h.transport[0];
      assert(
        payload.vendor_to === fixture.outbound_recipient_email &&
          payload.couple_to === fixture.outbound_recipient_email,
        "Both copies must use exact allowlisted recipient, never vendor account address",
      );
      assert(
        payload.email_test_vendor_copy === "1",
        "Signed payload carries explicit fixture opt-in",
      );
      assert(
        payload.send_vendor === (sent === "vendor" ? "0" : "1") &&
          payload.send_couple === (sent === "couple" ? "0" : "1"),
        "Partial retry sends only unsent channel",
      );
      assert(!h.claims.includes(sent), "Already sent channel is not reclaimed");
    }
  });
  Deno.test(`${endpoint}: edited prize snapshot, not selected entry, is used in both emails`, async () => {
    const h = await harness(endpoint);
    const before = JSON.stringify(original);
    assert((await h.send()).complete, "Send completes");
    const p = h.transport[0];
    assert(
      p.prize_description === current.prize_description &&
        p.prize_approx_value_cad === String(current.prize_approx_value_cad),
      "Structured signed prize fields come from the claimed current snapshot",
    );
    for (
      const v of [
        "Updated package",
        "Updated photography discount",
        "$275.50 CAD",
      ]
    ) assert(p.vendor_text.includes(v), "Vendor receives " + v);
    for (const v of ["Updated photography discount", "$275.50 CAD"]) {
      assert(p.couple_text.includes(v), "Couple receives " + v);
    }
    assert(
      !JSON.stringify(p).includes("OLD TITLE") &&
        !JSON.stringify(p).includes("OLD DESCRIPTION"),
      "Old prize not sent",
    );
    assert(JSON.stringify(original) === before, "Evidence unchanged");
    assert(
      h.finalized.every((x) => x.outcome === "sent"),
      "Both claims finalized",
    );
  });
  Deno.test(`${endpoint}: missing claim-time prize fails before transport`, async () => {
    const h = await harness(endpoint, { snapshot: null });
    let failed = false;
    try {
      await h.send();
    } catch {
      failed = true;
    }
    assert(
      failed && h.transport.length === 0,
      "Missing snapshot rejects before mail",
    );
    assert(
      h.finalized.length === 2 &&
        h.finalized.every((x) => x.outcome === "retryable_failure"),
      "Claims released as definite no-send",
    );
  });
  Deno.test(`${endpoint}: already-sent notices never claim or resend`, async () => {
    const h = await harness(endpoint);
    const r = await h.send({
      ...original,
      vendor_email_sent_at: "2026-09-07",
      couple_email_sent_at: "2026-09-07",
    });
    assert(
      r.complete && h.claims.length === 0 && h.transport.length === 0,
      "Already sent exits without side effects",
    );
  });
  Deno.test(`${endpoint}: busy or ambiguous ledger cannot send duplicate mail`, async () => {
    for (const status of ["busy", "ambiguous", "sent"]) {
      const h = await harness(endpoint, {
        status: { vendor: status, couple: status },
      });
      await h.send();
      assert(
        h.transport.length === 0 && h.finalized.length === 0,
        "No resend or ledger overwrite for " + status,
      );
    }
  });
  Deno.test(`${endpoint}: definite no-send retries updated prize; uncertain transport stays ambiguous`, async () => {
    const opts: any = {
      response: {
        vendor: { sent: false, error: "Offline rejection" },
        couple: { sent: false, error: "Offline rejection" },
      },
    };
    const h = await harness(endpoint, opts);
    assert(!(await h.send()).complete, "Not marked sent");
    assert(
      h.finalized.every((x) => x.outcome === "retryable_failure"),
      "Definite no-send releases claims",
    );
    opts.response = undefined;
    opts.snapshot = {
      ...current,
      prize_title: "Retry package",
      prize_description: "Retry description",
      prize_approx_value_cad: 500,
      vendor_offer_version: "2026-09-07T01:00:00Z",
    };
    await h.send();
    assert(
      h.transport[1].vendor_text.includes("Retry package") &&
        h.transport[1].couple_text.includes("$500.00 CAD"),
      "Retry uses new snapshot",
    );
    const ambiguous = await harness(endpoint, { throw: true });
    await ambiguous.send();
    assert(
      ambiguous.finalized.every((x) => x.outcome === "ambiguous"),
      "Uncertain transport stays locked",
    );
  });
}
