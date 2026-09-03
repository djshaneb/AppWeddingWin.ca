const syncSourceUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
const migrationUrl = new URL(
  "../../migrations/20260830100000_add_vendor_winner_verification.sql",
  import.meta.url,
);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function includesIgnoringWhitespace(source: string, fragment: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
  return normalize(source).includes(normalize(fragment));
}

function sourceSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `${startMarker} is missing`);
  const end = source.indexOf(endMarker, start);
  assert(end > start, `${endMarker} is missing after ${startMarker}`);
  return source.slice(start, end);
}

function sqlFunctionBody(sql: string, name: string) {
  const marker = `create or replace function public.${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${name} is missing`);
  const tail = sql.slice(start);
  const end = tail.indexOf("\n$$;");
  assert(end >= 0, `${name} is not terminated`);
  return tail.slice(0, end + 4);
}

function sqlParameterNames(sql: string, name: string) {
  const marker = `create or replace function public.${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${name} is missing`);
  const open = sql.indexOf("(", start + marker.length);
  const returnsAt = sql.toLowerCase().indexOf("\nreturns ", open);
  const close = sql.lastIndexOf(")", returnsAt);
  assert(
    open >= 0 && returnsAt > open && close > open,
    `${name} has an invalid signature`,
  );
  return sql.slice(open + 1, close).split(",").map((parameter) =>
    parameter.trim().split(/\s+/)[0]
  );
}

Deno.test("vendor draw responses use an explicit DTO and never expose answer secrets", async () => {
  for (const sourceUrl of syncSourceUrls) {
    const source = await Deno.readTextFile(sourceUrl);
    const visibleDto = sourceSection(
      source,
      "function vendorVisibleDraw(",
      "function csvCell(",
    );
    const dashboard = sourceSection(
      source,
      "async function getVendorRaffleDashboard(",
      "async function loadQrDrawEmailSigningKey",
    );
    const drawLoader = sourceSection(
      source,
      "async function loadVendorDrawRows(",
      "async function loadVendorSelectionStateRows",
    );

    for (
      const required of [
        "draws: draws.map((draw) =>",
        "vendorVisibleDraw(draw, isolatedFixture, suppressOutboundEmail)",
        "draw: vendorVisibleDraw(",
        'skill_question_prompt: status === "potential"',
        "winner_name: draw.winner_name",
        "winner_email: draw.winner_email",
        "winner_phone: draw.winner_phone",
        "winner_wedding_date: draw.winner_wedding_date",
      ]
    ) {
      assert(
        source.includes(required),
        `${sourceUrl.pathname} is missing ${required}`,
      );
    }
    assert(
      !visibleDto.includes("mayExposeWinner") &&
        !visibleDto.includes("skill_question_salt") &&
        !visibleDto.includes("skill_question_answer_hash"),
      `${sourceUrl.pathname} vendor DTO must return selected-person contact without exposing answer secrets`,
    );
    assert(
      drawLoader.includes('.eq("event_key", eventKey)') &&
        drawLoader.includes('.eq("vendor_bingo_id", vendorId)') &&
        drawLoader.includes('.eq("vendor_bd_user_id", vendorBdUserId)') &&
        dashboard.includes("loadVendorDrawRows(") &&
        dashboard.includes("String(vendor.user_id || vendor.id)") &&
        dashboard.includes("entries: []") &&
        dashboard.includes("map((draw) =>") &&
        dashboard.includes(
          "vendorVisibleDraw(draw, isolatedFixture, suppressOutboundEmail)",
        ),
      `${sourceUrl.pathname} must scope selected-person contact to the authenticated vendor and event without returning the entrant list`,
    );
    assert(
      !/\bdraw:\s*(?:existingDraw|draw(?:\s+as\s+RaffleDraw)?)(?=\s*[,}\n])/
        .test(source),
      `${sourceUrl.pathname} must not place a raw draw row in a JSON response`,
    );
    assert(
      (source.match(/skill_question_salt/g) || []).length === 1 &&
        (source.match(/skill_question_answer_hash/g) || []).length === 1 &&
        source.includes("skill_question_salt: skillChallenge.salt") &&
        source.includes(
          "skill_question_answer_hash: skillChallenge.answerHash",
        ),
      `${sourceUrl.pathname} may persist answer secrets but must not otherwise copy them`,
    );
  }
});

Deno.test("website and iOS show selected-person contact for every draw status", async () => {
  const website = await Deno.readTextFile(
    new URL(
      "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js",
      import.meta.url,
    ),
  );
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    !/contact details withheld/i.test(website) &&
      website.includes("['Name', draw.winner_name]") &&
      website.includes("['Email', draw.winner_email]") &&
      website.includes("['Phone', draw.winner_phone]") &&
      website.includes("['Wedding date', draw.winner_wedding_date]") &&
      website.includes(
        "accepted this vendor\\u2019s draw and wedding-related marketing terms",
      ) &&
      website.includes("Honour unsubscribe requests"),
    "website must show every selected-person contact field with the recorded named-vendor marketing scope",
  );
  assert(
    !/contact details withheld/i.test(app) &&
      app.includes("winner_phone?: string") &&
      app.includes("winner_wedding_date?: string") &&
      app.includes("Email: {draw.winner_email}") &&
      app.includes("Phone: {draw.winner_phone}") &&
      app.includes("Wedding date: {draw.winner_wedding_date}") &&
      includesIgnoringWhitespace(
        app,
        "accepted this vendor’s draw and wedding-related marketing terms",
      ) &&
      app.includes("Honour unsubscribe requests"),
    "iOS must show every selected-person contact field with the recorded named-vendor marketing scope",
  );
});

Deno.test("vendor review endpoint binds every decision to the authenticated vendor", async () => {
  for (const sourceUrl of syncSourceUrls) {
    const source = await Deno.readTextFile(sourceUrl);
    for (
      const required of [
        'import { parseWinnerVerificationEvidence } from "../_shared/qr_bingo_winner_evidence.ts"',
        'action === "vendor_raffle_review"',
        '.eq("event_key", eventKey)',
        '.eq("vendor_bingo_id", vendor.id)',
        '.eq("vendor_bd_user_id", String(vendor.user_id || user?.user_id || ""))',
        "body.eligibility_confirmed !== true",
        "body.rules_release_confirmed !== true",
        "!cleanText(body.skill_question_answer, 80)",
        "parseWinnerVerificationEvidence(body.review_notes)",
        'winnerEvidence?.normalized || ""',
        "!notes",
        '"review_qr_bingo_potential_winner_by_vendor"',
        "p_event_key: eventKey",
        "p_vendor_bingo_id: vendor.id",
        'p_vendor_bd_user_id: String(vendor.user_id || user?.user_id || "")',
        "p_rules_release_confirmed: body.rules_release_confirmed === true",
      ]
    ) {
      assert(
        source.includes(required),
        `${sourceUrl.pathname} is missing ${required}`,
      );
    }
  }
});

Deno.test("winner review migration verifies ownership, answer, release, and evidence atomically", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const review = sqlFunctionBody(
    sql,
    "review_qr_bingo_potential_winner_by_vendor",
  );
  const parameters = sqlParameterNames(
    sql,
    "review_qr_bingo_potential_winner_by_vendor",
  );

  assert(
    JSON.stringify(parameters) === JSON.stringify([
      "p_draw_id",
      "p_event_key",
      "p_vendor_bingo_id",
      "p_vendor_bd_user_id",
      "p_decision",
      "p_eligibility_confirmed",
      "p_skill_question_answer",
      "p_rules_release_confirmed",
      "p_reviewed_by",
      "p_notes",
    ]),
    `vendor-review RPC signature changed unexpectedly: ${
      parameters.join(", ")
    }`,
  );
  for (
    const required of [
      "skill_question_prompt text not null",
      "skill_question_salt text not null",
      "skill_question_answer_hash text not null",
      "winner_rules_confirmed_at timestamptz",
      "qr_bingo_verified_winner_release_evidence_required",
      "where selection_status = 'verified'",
      "and vendor_email_sent_at is null",
      "and couple_email_sent_at is null",
      "set selection_status = 'potential'",
    ]
  ) {
    assert(
      sql.includes(required),
      `vendor-review migration is missing ${required}`,
    );
  }
  for (
    const required of [
      "coalesce(auth.role(), '') <> 'service_role'",
      "and event_key = btrim(coalesce(p_event_key, ''))",
      "and vendor_bingo_id = btrim(coalesce(p_vendor_bingo_id, ''))",
      "and vendor_bd_user_id = btrim(coalesce(p_vendor_bd_user_id, ''))",
      "for update;",
      "not p_eligibility_confirmed or not p_rules_release_confirmed",
      "or nullif(btrim(p_notes), '') is null",
      "extensions.digest",
      "The skill-testing answer is incorrect.",
      "winner_rules_confirmed_at = now()",
      "verification_notes = btrim(p_notes)",
    ]
  ) {
    assert(
      review.includes(required),
      `vendor-review RPC is missing ${required}`,
    );
  }

  const compact = sql.replace(/\s+/g, " ");
  assert(
    compact.includes(
      "revoke execute on function public.review_qr_bingo_potential_winner( uuid, text, boolean, boolean, text, text ) from service_role;",
    ),
    "the caller-supplied legacy verification shortcut must be revoked from service_role",
  );
  assert(
    compact.includes(
      "revoke all on function public.review_qr_bingo_potential_winner_by_vendor( uuid, text, text, text, text, boolean, text, boolean, text, text ) from public, anon, authenticated;",
    ) && compact.includes(
      "grant execute on function public.review_qr_bingo_potential_winner_by_vendor( uuid, text, text, text, text, boolean, text, boolean, text, text ) to service_role;",
    ),
    "the exact ten-argument vendor-review signature must be service-role only",
  );
});

Deno.test("email claims require verified release evidence under one exclusive row lock", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const compact = sql.replace(/\s+/g, " ");
  for (
    const [wrapperName, underlyingName] of [
      [
        "claim_verified_qr_bingo_draw_email_delivery",
        "claim_qr_bingo_draw_email_delivery",
      ],
      [
        "claim_verified_qr_bingo_test_draw_email_delivery",
        "claim_qr_bingo_test_draw_email_delivery",
      ],
    ] as const
  ) {
    const parameters = sqlParameterNames(sql, wrapperName);
    const body = sqlFunctionBody(sql, wrapperName);
    assert(
      JSON.stringify(parameters) ===
        JSON.stringify(["p_draw_id", "p_channel", "p_lease_seconds"]),
      `${wrapperName} must retain the exact three-argument claim signature`,
    );
    for (
      const required of [
        "selection_status <> 'verified'",
        "winner_rules_confirmed_at is null",
        "nullif(btrim(current_draw.verification_notes), '') is null",
        "for update;",
        `return public.${underlyingName}(p_draw_id, p_channel, p_lease_seconds);`,
      ]
    ) {
      assert(body.includes(required), `${wrapperName} is missing ${required}`);
    }
    assert(
      !body.includes("for share;"),
      `${wrapperName} must not take an upgrade-prone shared lock before the underlying claim`,
    );
    assert(
      compact.includes(
        `revoke all on function public.${underlyingName}(uuid, text, integer) from service_role;`,
      ) && compact.includes(
        `revoke all on function public.${wrapperName}(uuid, text, integer) from public, anon, authenticated, service_role;`,
      ) && compact.includes(
        `grant execute on function public.${wrapperName}(uuid, text, integer) to service_role;`,
      ),
      `${wrapperName} must be the only service-role claim entrypoint`,
    );
  }
});
