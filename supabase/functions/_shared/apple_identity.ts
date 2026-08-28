export function verifiedAppleEmail(claimsEmail: unknown, suppliedEmail: unknown): string {
  const verified = typeof claimsEmail === "string" ? claimsEmail.trim() : "";
  const supplied = typeof suppliedEmail === "string" ? suppliedEmail.trim() : "";

  if (verified && supplied && verified.toLowerCase() !== supplied.toLowerCase()) {
    throw new Error("Apple sign-in email did not match the verified identity token.");
  }

  // Never use the browser/native body as an identity attribute. Apple signs the
  // email in the ID token; an existing apple_sub mapping can still sign in when
  // Apple legitimately omits email, while a first-time account fails closed.
  return verified;
}
