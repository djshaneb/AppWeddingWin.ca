import { normalizeAppleScopeDiagnostics } from "./apple_scope_diagnostics.ts";

function same(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Scope diagnostic normalization mismatch");
}
const unknown = {
  diagnosticVersion: null, requestedEmail: null, requestedName: null,
  authorizedEmail: null, authorizedName: null, credentialEmailPresent: null,
};

Deno.test("Apple client scope telemetry treats missing and unsupported bridge data as unknown", () => {
  for (const value of [null, undefined, [], {}, "private", { diagnosticVersion: 2, requestedEmail: true }]) {
    same(normalizeAppleScopeDiagnostics(value), unknown);
  }
});

Deno.test("Apple client scope telemetry preserves boolean values only and discards personal fields", () => {
  const result = normalizeAppleScopeDiagnostics({
    diagnosticVersion: 1, requestedEmail: true, requestedName: false,
    authorizedEmail: "private@example.invalid", authorizedName: 1,
    credentialEmailPresent: false, id_token: "private", user: "private",
  });
  same(result, { ...unknown, diagnosticVersion: 1, requestedEmail: true, requestedName: false, credentialEmailPresent: false });
  if (JSON.stringify(result).includes("private")) throw new Error("Private value leaked into diagnostic");
});
