import {
  hasQrBingoSkillVerification,
  hasQrBingoVendorSkillAttestation,
  QR_BINGO_EXTERNAL_SKILL_ATTESTATION,
} from "./qr_bingo_winner_verification.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
const fixture = {
  vendor_bd_user_id: "707",
  verified_by: "vendor:707:Fictional vendor",
  verification_notes: "Date: 2026-09-05\nMethod: In person\nReference: QA-1",
  winner_rules_confirmed_at: "2026-09-05T13:00:00Z",
  skill_question_verified_at: null,
  skill_question_vendor_attested_at: "2026-09-05T13:00:00Z",
  skill_question_vendor_attested_by: "vendor:707:Fictional vendor",
  skill_question_vendor_attestation: QR_BINGO_EXTERNAL_SKILL_ATTESTATION,
};
const migrationUrl = new URL(
  "../../migrations/20260905130000_add_vendor_external_skill_attestation.sql", import.meta.url,
);
const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
function between(source: string, start: string, end: string) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing source section ${start}`);
  return source.slice(from, to);
}

Deno.test("external skill proof is a vendor attestation, never a platform answer timestamp", () => {
  const before = JSON.stringify(fixture);
  assert(hasQrBingoVendorSkillAttestation(fixture), "complete attestation must pass");
  assert(hasQrBingoSkillVerification(fixture), "external proof must satisfy completion");
  assert(fixture.skill_question_verified_at === null, "no fake platform timestamp");
  assert(JSON.stringify(fixture) === before, "proof checks must not mutate evidence");
});

Deno.test("partial, forged or unrelated vendor attestations fail closed", () => {
  const mutations = [
    { vendor_bd_user_id: "708" }, { vendor_bd_user_id: "0707" },
    { verified_by: "vendor:708:Someone else" },
    { skill_question_vendor_attested_by: "vendor:707:" },
    { skill_question_vendor_attested_by: "admin:707:Fictional vendor" },
    { skill_question_vendor_attested_at: null },
    { skill_question_vendor_attested_at: "not-a-time" },
    { skill_question_vendor_attestation: "true" },
    { skill_question_vendor_attestation: "" },
    { winner_rules_confirmed_at: null },
    { verification_notes: "   " },
  ];
  for (const mutation of mutations) {
    assert(!hasQrBingoSkillVerification({ ...fixture, ...mutation }),
      `Incomplete evidence must fail: ${JSON.stringify(mutation)}`);
  }
  assert(!hasQrBingoSkillVerification({ skill_question_verified_at: true }),
    "truthy boolean is not a timestamp");
  assert(!hasQrBingoSkillVerification({}), "missing proof must fail");
});

Deno.test("historical platform answer proofs remain valid and distinguishable", () => {
  const legacy = { skill_question_verified_at: "2026-08-30T12:00:00Z" };
  assert(hasQrBingoSkillVerification(legacy), "preserve historical platform verification");
  assert(!hasQrBingoVendorSkillAttestation(legacy), "do not relabel old proof as vendor attestation");
});

Deno.test("new RPC binds exact vendor, pending selection, current rules and genuine evidence under locks", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const rpc = between(sql,
    "create or replace function public.attest_qr_bingo_potential_winner_by_vendor(",
    "revoke all on function public.attest_qr_bingo_potential_winner_by_vendor(");
  for (const fragment of [
    "coalesce(auth.role(), '') <> 'service_role'",
    "p_decision is distinct from 'verified'",
    "p_vendor_bingo_id is distinct from p_vendor_bd_user_id",
    "starts_with(p_reviewed_by, 'vendor:' || p_vendor_bd_user_id || ':')",
    "p_eligibility_confirmed is distinct from true",
    "p_skill_testing_completed_externally is distinct from true",
    "p_rules_release_confirmed is distinct from true",
    "not public.qr_bingo_winner_evidence_valid(p_notes)",
    "for share", "for update",
    "where id = p_draw_id and event_key = btrim(coalesce(p_event_key, ''))",
    "and vendor_bingo_id = p_vendor_bingo_id",
    "and vendor_bd_user_id = p_vendor_bd_user_id",
    "reviewed.selection_status <> 'potential'",
    "reviewed.rules_version is distinct from current_config.rules_version",
    "reviewed.official_rules_url is distinct from current_config.official_rules_url",
    "fixture.enabled and fixture.expires_at > clock_timestamp()",
    "participant.couple_bd_user_id = reviewed.couple_bd_user_id",
    "skill_question_vendor_attested_at = attested_at",
    "skill_question_vendor_attested_by = p_reviewed_by",
    "verification_notes = p_notes",
  ]) assert(rpc.includes(fragment), `External RPC must retain ${fragment}`);
  assert(!/skill_question_verified_at\s*=/.test(rpc), "never stamp platform answer verification");
  assert(!/skill_question_(?:prompt|salt|answer_hash)\s*=/.test(rpc), "never erase old question/answer proof");
  assert(!/email_sent_at\s*=|qr_bingo_draw_email_deliveries/.test(rpc), "review never sends or claims email");
  assert(sql.includes(") from public, anon, authenticated, service_role;") &&
    sql.includes(") to service_role;"), "new RPC must remain service-only");
  const evidenceHelper = between(sql,
    "create or replace function public.qr_bingo_winner_evidence_valid(",
    "revoke all on function public.qr_bingo_winner_evidence_valid(");
  assert(evidenceHelper.includes("length(evidence[2]) > 300") &&
    evidenceHelper.includes("length(evidence[3]) > 300") &&
    evidenceHelper.includes("length(evidence[4]) > 400"),
    "PostgreSQL field bounds must be explicit, not unsupported >255 regex quantifiers");
  const pattern = between(evidenceHelper, "evidence := regexp_match(p_notes,", "if evidence is null");
  assert(!pattern.includes("{1,300}") && !pattern.includes("{1,400}"),
    "PostgreSQL ARE rejects repetition bounds above255");
});

Deno.test("all SQL completion boundaries share the same complete-proof alternative without bulk rewrites", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  for (const signature of [
    "public.enforce_qr_bingo_draw_verification()",
    "public.claim_qr_bingo_draw_email_delivery(uuid,text,integer)",
    "public.claim_qr_bingo_test_draw_email_delivery(uuid,text,integer)",
    "public.finalize_qr_bingo_draw_email_delivery(text,uuid,text,text,text)",
    "public.reconcile_qr_bingo_draw_email_delivery(text,text,text,text)",
  ]) assert(sql.includes(signature), `${signature} must support truthful external proof`);
  for (const fragment of [
    "(p_draw).skill_question_verified_at is not null",
    "(p_draw).skill_question_vendor_attested_by = (p_draw).verified_by",
    "(p_draw).winner_rules_confirmed_at is not null",
    "nullif(btrim((p_draw).verification_notes), '') is not null",
    QR_BINGO_EXTERNAL_SKILL_ATTESTATION,
    "pg_get_functiondef(target.signature::regprocedure)",
    "old_count = target.expected_count and new_count = 0",
    "old_count = 0 and new_count = target.expected_count",
    "execute replace(definition, old_guard, new_guard)",
    "raise exception 'Unexpected QR Bingo verification guard in %'",
  ]) assert(sql.includes(fragment), `Migration must contain ${fragment}`);
  assert(!/disable trigger|delete from|truncate|drop column/i.test(sql),
    "migration must not discard evidence or disable protection");
  assert((sql.match(/update public\.qr_bingo_raffle_draws/g) || []).length === 1,
    "only the new scoped RPC may update a selection; no historical backfill");
  assert(!/skill_testing_question_required\s*=\s*false|exclude_previous_winners\s*=|max_winners\s*=/.test(sql),
    "prize policy and immutable offer terms must remain unchanged");
});

Deno.test("guard substitution preserves every other byte of prior function bodies", async () => {
  const priorSql = await Promise.all([
    "20260828162602_add_qr_bingo_official_rules_audit.sql",
    "20260829194500_harden_qr_bingo_transactions.sql",
    "20260830024500_create_isolated_qr_bingo_email_test_fixtures.sql",
  ].map((name) => Deno.readTextFile(new URL(`../../migrations/${name}`, import.meta.url))));
  const cases: [number, string, string, number][] = [
    [0, "enforce_qr_bingo_draw_verification", "new", 2],
    [1, "claim_qr_bingo_draw_email_delivery", "current_draw", 1],
    [2, "claim_qr_bingo_test_draw_email_delivery", "current_draw", 1],
    [1, "finalize_qr_bingo_draw_email_delivery", "current_draw", 1],
    [1, "reconcile_qr_bingo_draw_email_delivery", "current_draw", 1],
  ];
  for (const [index, name, row, count] of cases) {
    const original = between(priorSql[index], `create or replace function public.${name}(`, "\n$$;");
    const oldGuard = `${row}.skill_question_verified_at is null`;
    const newGuard = `not public.qr_bingo_skill_verification_complete(${row})`;
    assert(original.split(oldGuard).length - 1 === count, `${name}: expected guard count`);
    const updated = original.replaceAll(oldGuard, newGuard);
    assert(updated.replaceAll(newGuard, oldGuard) === original,
      `${name}: ownership, recipients, leases and history must remain byte-for-byte intact`);
    assert(!updated.includes(oldGuard), `${name}: no unreachable external completion path`);
  }
});

Deno.test("both Edge endpoints require explicit external mode and preserve old-client answer review", async () => {
  for (const url of endpointUrls) {
    const source = await Deno.readTextFile(url);
    const review = between(source, "async function reviewPotentialWinner(", "async function sendVerifiedWinnerNotice(");
    for (const fragment of [
      'typeof body.skill_testing_completed_externally !== "boolean"',
      'const externalVerification = decision === "verified"',
      "body.skill_testing_completed_externally === true",
      "parseWinnerVerificationEvidence(body.review_notes)",
      "body.eligibility_confirmed !== true",
      "body.rules_release_confirmed !== true",
      '(!externalVerification && !cleanText(body.skill_question_answer, 80))',
      '? "attest_qr_bingo_potential_winner_by_vendor"',
      ': "review_qr_bingo_potential_winner_by_vendor"',
      "p_skill_testing_completed_externally: true",
      'p_skill_question_answer: cleanText(body.skill_question_answer, 80)',
    ]) assert(review.includes(fragment), `${url.pathname}: ${fragment}`);
    assert(!review.includes("sendDrawEmails(") && !review.includes("claimDrawEmailDelivery("),
      "review remains separate from mail");
    assert(source.includes("!hasQrBingoSkillVerification(draw)") &&
      source.includes("!hasQrBingoSkillVerification(ownedDraw)"),
      "both transport and pre-send controls require valid completion evidence");
    const dto = between(source, "function vendorVisibleDraw(", "function csvCell(");
    assert(dto.includes("skill_question_vendor_attested_at: draw.skill_question_vendor_attested_at") &&
      dto.includes('"vendor_attestation"') && dto.includes('"platform_answer"'),
      "DTO distinguishes vendor attestation from historical platform proof");
    assert(!dto.includes("skill_question_salt") && !dto.includes("skill_question_answer_hash"),
      "secret answers remain private");
    assert(source.includes("Wedding Win recorded your attestation and did not check the answer."),
      "external notice must not claim Wedding Win checked an answer");
  }
});
