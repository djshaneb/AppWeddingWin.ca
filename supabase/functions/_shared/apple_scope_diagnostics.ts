/** Untrusted, privacy-safe client telemetry. Never use this as identity proof. */
export function normalizeAppleScopeDiagnostics(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const supported = input.diagnosticVersion === 1;
  const flag = (key: string): boolean | null =>
    supported && typeof input[key] === "boolean" ? input[key] as boolean : null;
  return {
    diagnosticVersion: supported ? 1 : null,
    requestedEmail: flag("requestedEmail"),
    requestedName: flag("requestedName"),
    authorizedEmail: flag("authorizedEmail"),
    authorizedName: flag("authorizedName"),
    credentialEmailPresent: flag("credentialEmailPresent"),
  };
}
