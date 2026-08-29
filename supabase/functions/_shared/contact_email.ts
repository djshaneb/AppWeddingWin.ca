export type ContactEmailOptions = {
  allowEmpty?: boolean;
};

/**
 * Normalize an address used for account and contact email delivery.
 *
 * Apple private relay addresses are intentionally accepted. WeddingWin must
 * configure its outbound senders with Apple's Private Email Relay service so
 * those messages reach the user's Apple-managed inbox.
 */
export function normalizeContactEmail(
  value: unknown,
  options: ContactEmailOptions = {},
) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) {
    if (options.allowEmpty) return "";
    throw new Error("Enter a valid email address.");
  }
  if (
    email.length > 254 ||
    /[<>\s]/.test(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}
