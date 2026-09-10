import { normalizeContactEmail } from "./contact_email.ts";

export class QrAdminContactError extends Error {
  constructor(
    message: string,
    public status = 422,
    public code = "contact_invalid",
    public current_version?: number,
  ) {
    super(message);
  }
}

const ACTIONS = ["contact_add", "contact_remove", "contact_restore"] as const;
type Action = typeof ACTIONS[number];
const COMMON = [
  "action",
  "dataset",
  "event_key",
  "couple_id",
  "expected_version",
  "request_id",
  "operator_identity",
];
const ADD = [
  "name",
  "email",
  "phone",
  "wedding_date",
  "wedding_venue",
  "verified_couple",
];

function text(value: unknown, minimum: number, maximum: number, label: string) {
  if (typeof value !== "string" || /[<>\u0000-\u001f\u007f]/.test(value)) {
    throw new QrAdminContactError(`Enter a valid ${label}.`);
  }
  const result = value.trim().replace(/ +/g, " ");
  if (result.length < minimum || result.length > maximum) {
    throw new QrAdminContactError(`Enter a valid ${label}.`);
  }
  return result;
}

export function parseQrAdminContactMutation(body: Record<string, unknown>) {
  const action = body.action as Action;
  if (!ACTIONS.includes(action) || body.dataset !== "contacts") {
    throw new QrAdminContactError("Choose a contact-list action.");
  }
  const allowed = action === "contact_add" ? [...COMMON, ...ADD] : COMMON;
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new QrAdminContactError("Unexpected contact-list fields.");
  }
  const event_key = text(body.event_key, 1, 100, "event");
  const couple_id = text(body.couple_id, 1, 18, "couple member ID");
  const request_id = text(body.request_id, 36, 36, "request ID").toLowerCase();
  const operator_identity = text(
    body.operator_identity,
    3,
    160,
    "operator name",
  );
  const expected_version = body.expected_version;
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event_key) ||
    !/^[1-9][0-9]{0,17}$/.test(couple_id) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(request_id) ||
    typeof expected_version !== "number" ||
    !Number.isSafeInteger(expected_version) ||
    (action === "contact_add" ? expected_version !== 0 : expected_version < 1)
  ) throw new QrAdminContactError("Reload the contact list and try again.");

  const result = {
    action,
    event_key,
    couple_id,
    request_id,
    operator_identity,
    expected_version,
    name: "",
    email: "",
    phone: "",
    wedding_date: "",
    wedding_venue: "",
    verified_couple: null as Record<string, unknown> | null,
  };
  if (action !== "contact_add") return result;
  // This proof is constructed by the authenticated PHP bridge from BD's
  // users_data row, never accepted from browser form fields. HMAC verification
  // of the complete body must precede this parser in the Edge entrypoint.
  const proof = body.verified_couple;
  if (
    !proof || typeof proof !== "object" || Array.isArray(proof) ||
    Object.keys(proof).sort().join(",") !== "active,id,subscription_id" ||
    (proof as Record<string, unknown>).id !== couple_id ||
    (proof as Record<string, unknown>).subscription_id !== "18" ||
    (proof as Record<string, unknown>).active !== "2"
  ) {
    throw new QrAdminContactError(
      "Choose an active Couples account.",
      422,
      "couple_not_verified",
    );
  }
  result.verified_couple = proof as Record<string, unknown>;
  result.name = text(body.name, 1, 160, "couple name");
  if (
    ["couple", "weddingwin", "weddingwin couple"].includes(
      result.name.toLowerCase(),
    )
  ) {
    throw new QrAdminContactError("Enter the couple's names.");
  }
  try {
    if (
      typeof body.email !== "string" ||
      /[\u0000-\u001f\u007f,;]/.test(body.email)
    ) throw new Error();
    result.email = normalizeContactEmail(body.email);
    if (result.email.endsWith("@privaterelay.appleid.com")) throw new Error();
  } catch {
    throw new QrAdminContactError(
      "Enter a direct contact email, not an Apple relay address.",
    );
  }
  result.phone = text(body.phone, 1, 80, "phone number");
  if (!/^[0-9]{7,15}$/.test(result.phone.replace(/\D/g, ""))) {
    throw new QrAdminContactError("Enter a valid phone number.");
  }
  result.wedding_date = text(body.wedding_date, 0, 10, "wedding date");
  if (result.wedding_date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result.wedding_date);
    const date = match ? new Date(`${result.wedding_date}T00:00:00Z`) : null;
    if (
      !match || Number(match[1]) < 1900 || !date ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== result.wedding_date
    ) {
      throw new QrAdminContactError("Choose a real wedding date.");
    }
  }
  result.wedding_venue = text(body.wedding_venue, 0, 200, "wedding venue");
  if (result.wedding_venue && !result.wedding_date) {
    throw new QrAdminContactError(
      "Choose a wedding date before adding a venue.",
    );
  }
  return result;
}

export async function handleQrAdminContactMutation(
  db: any,
  body: Record<string, unknown>,
) {
  const input = parseQrAdminContactMutation(body);
  const { data, error } = await db.rpc("manage_qr_bingo_admin_contact", {
    p_action: input.action,
    p_event_key: input.event_key,
    p_couple_id: input.couple_id,
    p_expected_version: input.expected_version,
    p_request_id: input.request_id,
    p_operator_identity: input.operator_identity,
    p_contact: input.action === "contact_add"
      ? {
        name: input.name,
        email: input.email,
        phone: input.phone,
        wedding_date: input.wedding_date,
        wedding_venue: input.wedding_venue,
      }
      : {},
    p_verified_couple: input.verified_couple,
  });
  if (error) {
    if (error.code === "42501") {
      throw new QrAdminContactError(
        "This member can no longer be added.",
        403,
        "member_unavailable",
      );
    }
    if (["22023", "23514", "22007", "22008"].includes(error.code)) {
      throw new QrAdminContactError("Check the contact details and try again.");
    }
    throw new QrAdminContactError(
      "The contact list could not be updated. Refresh and try again.",
      503,
      "contact_update_unavailable",
    );
  }
  if (!data || data.ok !== true) {
    const messages: Record<string, string> = {
      contact_exists: "This couple is already on the contact list.",
      contact_removed: "This contact was removed. Use Restore instead.",
      contact_conflict: "This contact changed. Reload the list and try again.",
      request_conflict:
        "This request ID was already used for a different change.",
      contact_not_found:
        "This contact is no longer available. Reload the list.",
      event_unavailable: "Choose an existing wedding-show event.",
      contact_state_conflict:
        "The contact's list status changed. Reload and try again.",
    };
    const code = typeof data?.code === "string"
      ? data.code
      : "contact_update_unavailable";
    throw new QrAdminContactError(
      messages[code] || "The contact list could not be updated.",
      code === "contact_not_found"
        ? 404
        : code === "event_unavailable"
        ? 422
        : messages[code]
        ? 409
        : 503,
      code,
      Number.isSafeInteger(data?.current_version)
        ? data.current_version
        : undefined,
    );
  }
  if (
    data.action !== input.action || data.dataset !== "contacts" ||
    data.event_key !== input.event_key || data.couple_id !== input.couple_id ||
    data.request_id !== input.request_id ||
    !Number.isSafeInteger(data.version) ||
    data.version !== input.expected_version + 1 ||
    data.removed !== (input.action === "contact_remove") ||
    typeof data.replayed !== "boolean"
  ) {
    throw new QrAdminContactError(
      "The contact update could not be confirmed. Reload the list.",
      503,
      "contact_result_unconfirmed",
    );
  }
  return {
    ...data,
    message: input.action === "contact_add"
      ? "Contact added."
      : input.action === "contact_remove"
      ? "Contact removed from this list. It can be restored."
      : "Contact restored to this list.",
  };
}
