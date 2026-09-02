import { parseWinnerVerificationEvidence } from "./qr_bingo_winner_evidence.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("winner evidence accepts the exact required structure and normalizes it", () => {
  const parsed = parseWinnerVerificationEvidence(
    "Date: 2026-08-30\r\nMethod: Video  call\r\nReference: Call log 10:42 EDT",
  );
  assert(parsed?.date === "2026-08-30", "date must be preserved");
  assert(parsed?.method === "Video call", "method spaces must be normalized");
  assert(
    parsed?.reference === "Call log 10:42 EDT",
    "reference must be preserved",
  );
  assert(
    parsed?.normalized ===
      "Date: 2026-08-30\nMethod: Video call\nReference: Call log 10:42 EDT",
    "stored evidence must have a canonical three-line shape",
  );
});

Deno.test("winner evidence permits one bounded optional additional-notes line", () => {
  const parsed = parseWinnerVerificationEvidence(
    "Date: 2024-02-29\nMethod: In person\nReference: Signed release file WW-42\nAdditional notes: Confirmed at the booth office",
  );
  assert(
    parsed?.additionalNotes === "Confirmed at the booth office",
    "optional notes must survive",
  );
  assert(
    parsed?.normalized.endsWith(
      "Additional notes: Confirmed at the booth office",
    ),
    "optional notes must retain their explicit label",
  );
});

Deno.test("winner evidence rejects invalid dates, missing labels, and extra lines", () => {
  for (
    const invalid of [
      "Date: 2026-02-29\nMethod: Phone\nReference: Call log",
      "Date: 2026-08-30\nMethod: \nReference: Call log",
      "Date: 2026-08-30\nMethod: Phone\nReference: ",
      "2026-08-30\nMethod: Phone\nReference: Call log",
      "Date: 2026-08-30\nMethod: Phone\nReference: Call log\nUnlabelled extra line",
    ]
  ) {
    assert(
      parseWinnerVerificationEvidence(invalid) === null,
      `must reject: ${invalid}`,
    );
  }
});

Deno.test("winner evidence rejects markup, controls, and oversized fields", () => {
  for (
    const invalid of [
      "Date: 2026-08-30\nMethod: <script>alert(1)</script>\nReference: Call log",
      "Date: 2026-08-30\nMethod: Phone\nReference: Private\u0000record",
      `Date: 2026-08-30\nMethod: ${"m".repeat(301)}\nReference: Call log`,
      `Date: 2026-08-30\nMethod: Phone\nReference: ${"r".repeat(301)}`,
      `Date: 2026-08-30\nMethod: Phone\nReference: Call log\nAdditional notes: ${
        "n".repeat(401)
      }`,
    ]
  ) {
    assert(
      parseWinnerVerificationEvidence(invalid) === null,
      "unsafe or oversized evidence must be rejected",
    );
  }
});
